/**
 * query_parser.ts — Deterministic query-to-feature parser
 *
 * Architecture: Config-driven rule engine. 80% of queries never touch LLM.
 * Adding a new pattern = one line in CATEGORY_RULES / MODIFIER_RULES / PARAM_RULES.
 *
 * Flow: query → category match → modifier apply → param extract → result
 * If no category matched → needsLLM=true → LLM handles fuzzy case
 */

// ── Types ──────────────────────────────────────────────────

export interface ParseResult {
  features: string[];           // final tag list
  exclude_tags: string[];       // tags to exclude from product matching (e.g., ['隔离','kVrms'])
  category_hint: string;        // for LLM fallback / display
  explanation: string;          // human-readable
  confidence: 'high' | 'medium' | 'low';
  needsLLM: boolean;            // true if parser couldn't resolve
  residualQuery: string;        // parts not understood (for LLM)
  // ── 约束化输出(用于硬过滤+降级排序; 当前仅以太网场景消费) ──
  must: string[];               // 硬约束: 品类/规格/物理层, 不满足应出局
  nice: string[];               // 软约束: 等级/特性, 满足更好(用于排序)
  mustMeta: MustConstraint[];   // must 的维度标注(用于维度感知降级)
  sortKey?: SortIntent;         // 排序意图(高/低 + 参数), 排序层读 _params_numeric 数值排序
  // ── 意图分类(2026-06-12) ──
  //   'spec_search'(默认): 按品类/参数找料, 走 parser+约束层
  //   'cross_ref': 竞品型号反查国产替代料, 走"可替代产品"字段确定性反查
  intent: 'spec_search' | 'cross_ref';
  crossRefTarget?: string;      // intent=cross_ref 时, 用户输入的竞品型号(规范化大写, 如 'ISO7721')
}

// 排序意图 — "高PSRR/低噪声/大电流" 这类程度修饰查询的语义.
//   布尔标签(高PSRR)只能"命中/不命中", 无法表达"PSRR 70 应排在 63 前面".
//   SortIntent 让排序层去读 _params_numeric 对应字段做真·数值排序.
//   paramKeys: 候选数值字段名子串(同一参数有多个列名时全列, 排序层取产品里命中的任一列的最大/小值)
//   direction: 'high'=值越大越好(降序), 'low'=值越小越好(升序)
//   require:   true=查询本身就在筛该参数(如"高PSRR"), 无该参数数值的产品应被过滤掉(FAE确认)
export interface SortIntent {
  param: string;        // 参数显示名(如 'PSRR')
  paramKeys: string[];  // _params_numeric 字段名候选子串(小写)
  direction: 'high' | 'low';
  require: boolean;
  label: string;        // 展示用话术(如 '按 PSRR 从高到低')
}

// must 约束的维度模型 — 决定降级时的放松优先级与匹配语义
//   category: 品类(交换机/运放/LDO等), 绝不放松(缺=错品类)
//   media:    物理层介质(TX/T1/FX), 硬约束(物理层错=不能用)
//   spec:     规格(端口/通道/电压/电流/速率), 可就近妥协; downgradable=向下兼容(N口可被≥N满足)
//   grade:    等级(车规/工业级), 可放松
export type ConstraintDimension = 'category' | 'media' | 'spec' | 'grade';
export interface MustConstraint {
  tag: string;
  dimension: ConstraintDimension;
  family?: string;              // spec 族名(如 '通道'/'端口'/'Vin'), 用于同族就近
  value?: number;               // spec 数值(如 5口的5), 用于向下兼容比较
  downgradable?: boolean;       // true=该spec可向下兼容(端口/通道: 要N口, ≥N也可)
}

// ── Rule Types ─────────────────────────────────────────────

interface CategoryRule {
  pattern: RegExp;
  tag: string;
  priority: number;
  category_hint: string;
  /** 'subordinate': this tag can be a feature of another category.
   *  When a subordinate matches but a primary also matches, the primary wins
   *  and the subordinate tag becomes a modifier (nice/must). */
  role?: 'subordinate';
}

interface ModifierRule {
  pattern: RegExp;
  action: 'add-tag' | 'strip-pattern';
  tag?: string;
  stripPattern?: RegExp;
  /** Tags to exclude from product matching (used by frontend filter) */
  excludeTags?: string[];
}

interface ParamRule {
  pattern: RegExp;
  extract: (m: RegExpMatchArray) => string[];
}

// ═══════════════════════════════════════════════════════════
//  CATEGORY RULES
// ═══════════════════════════════════════════════════════════

const CATEGORY_RULES: CategoryRule[] = [
  // Interface (compound patterns first — isolation compounds)
  { pattern: /集成隔离电源.*can|can.*集成隔离电源/i, tag: '集成隔离电源的隔离CAN', priority: 112, category_hint: '隔离接口' },
  { pattern: /集成隔离电源.*485|集成隔离电源.*rs-?485|485.*集成隔离电源|rs-?485.*集成隔离电源/i, tag: '集成隔离电源的隔离RS485', priority: 112, category_hint: '隔离接口' },
  { pattern: /隔离.*485|485.*隔离|隔离.*rs-?485|rs-?485.*隔离|isolat.*485|485.*isolat|isolat.*rs-?485/i, tag: '隔离RS485', priority: 110, category_hint: '隔离接口' },
  { pattern: /隔离.*232|232.*隔离|隔离.*rs-?232|rs-?232.*隔离|isolat.*232|232.*isolat|isolat.*rs-?232/i, tag: '隔离RS-232', priority: 110, category_hint: '隔离接口' },
  { pattern: /隔离.*can|can.*隔离|isolat.*can|can.*isolat/i, tag: '隔离CAN', priority: 110, category_hint: '隔离接口' },
  { pattern: /隔离.*i2c|i2c.*隔离|隔离.*i²c|isolat.*i2c|i2c.*isolat/i, tag: '隔离I2C', priority: 110, category_hint: '隔离接口' },
  { pattern: /隔离.*adc|adc.*隔离/i, tag: '隔离ADC', priority: 110, category_hint: '数据转换' },
  { pattern: /隔离栅极驱动|隔离.*栅极.*驱动|栅极.*隔离.*驱动/i, tag: '隔离栅极驱动', priority: 109, category_hint: '驱动' },
  { pattern: /非隔离栅极驱动|非隔离.*栅极.*驱动/i, tag: '非隔离栅极驱动', priority: 111, category_hint: '驱动' },
  { pattern: /隔离放大器|隔离.*放大|隔离.*运放|运放.*隔离|隔离.*调制/i, tag: '隔离放大器', priority: 108, category_hint: '隔离放大器' },
  { pattern: /隔离电源/i, tag: '隔离电源', priority: 108, category_hint: '隔离电源' },
  { pattern: /隔离.*电流传感|电流传感.*隔离/i, tag: '电流传感器', priority: 108, category_hint: '传感器' },

  // Standard interface
  { pattern: /485|rs-?485/i, tag: 'RS-485', priority: 90, category_hint: '接口' },
  { pattern: /232|rs-?232/i, tag: 'RS-232', priority: 90, category_hint: '接口' },
  { pattern: /\bcan[ -]?fd\b|can\s*fd/i, tag: 'CAN-FD', priority: 90, category_hint: '接口' },
  { pattern: /\bcan\b(?!\s*fd|[a-z])/i, tag: 'CAN-FD', priority: 85, category_hint: '接口' },
  { pattern: /\blin\b/i, tag: 'LIN', priority: 85, category_hint: '接口' },
  { pattern: /mlvds/i, tag: 'MLVDS', priority: 85, category_hint: '接口' },
  { pattern: /i2c|i²c/i, tag: 'I2C', priority: 85, category_hint: '接口' },
  { pattern: /\bsbc\b/i, tag: 'SBC', priority: 85, category_hint: '接口' },
  { pattern: /系统基础芯片/i, tag: 'SBC', priority: 87, category_hint: '接口' },

  // Isolation
  { pattern: /数字隔离器|数字隔离/i, tag: '数字隔离器', priority: 85, category_hint: '隔离' },
  { pattern: /隔离/i, tag: '隔离', priority: 75, category_hint: '隔离' },
  { pattern: /栅极驱动|栅极.*驱动|驱动.*栅极/i, tag: '栅极驱动', priority: 80, category_hint: '驱动' },

  // Power
  { pattern: /\bldo\b|低压差|线性稳压/i, tag: 'LDO', priority: 85, category_hint: '电源' },
  { pattern: /\bdcdc\b|dc[ -]?dc|降压(?:器|.*变换)|升压(?:器|.*变换)|buck|boost/i, tag: 'DCDC', priority: 85, category_hint: '电源' },
  { pattern: /降压|buck/i, tag: '降压', priority: 80, category_hint: '电源' },
  { pattern: /升压|boost/i, tag: '升压', priority: 80, category_hint: '电源' },
  { pattern: /电源芯片/i, tag: '电源', priority: 83, category_hint: '电源' },
  { pattern: /低边驱动|低边开关|low[ -]?side\s*driv/i, tag: '低边驱动', priority: 85, category_hint: '驱动' },
  { pattern: /电子保险丝|efuse|e[ -]?fuse/i, tag: '电子保险丝', priority: 85, category_hint: '电源保护' },
  { pattern: /理想二极管|oring|or[ -]?ing|理想.*二极/i, tag: '理想二极管', priority: 85, category_hint: '电源保护' },
  { pattern: /高边开关|high[ -]?side[ -]?switch/i, tag: '高边开关', priority: 88, category_hint: '驱动' },
  { pattern: /高边驱动|high[ -]?side[ -]?driv/i, tag: '高边驱动', priority: 87, category_hint: '驱动' },
  { pattern: /负载开关|load[ -]?switch/i, tag: '负载开关', priority: 85, category_hint: '开关' },
  { pattern: /电源时序|电源.*时序|sequenc/i, tag: '电源时序', priority: 85, category_hint: '电源管理' },
  { pattern: /线性充电|电池充电|charger/i, tag: '线性充电', priority: 85, category_hint: '电池管理' },
  { pattern: /电池监控|电池.*监控|fuel[ -]?gauge/i, tag: '电池监控', priority: 85, category_hint: '电池管理' },

  // Signal chain
  { pattern: /仪表放大|仪表.*运放|in[ -]?amp/i, tag: '仪表放大器', priority: 90, category_hint: '放大器' },
  { pattern: /零漂.*运放|零漂.*放大|零漂移.*运放/i, tag: '零漂运算放大器', priority: 92, category_hint: '放大器' },
  { pattern: /高压.*运放|高压.*放大/i, tag: '高压运算放大器', priority: 92, category_hint: '放大器' },
  { pattern: /低压.*运放|低压.*放大/i, tag: '低压运算放大器', priority: 92, category_hint: '放大器' },
  { pattern: /差动放大/i, tag: '差动放大器', priority: 92, category_hint: '放大器' },
  { pattern: /对数放大/i, tag: '对数放大器', priority: 92, category_hint: '放大器' },
  { pattern: /运放|运算放大|op[ -]?amp|operational/i, tag: '运放', priority: 80, category_hint: '放大器' },
  { pattern: /放大器/i, tag: '放大器', priority: 78, category_hint: '放大器' },
  { pattern: /比较器|comparator/i, tag: '比较器', priority: 85, category_hint: '比较器' },
  { pattern: /\badc\b|模数转换/i, tag: 'ADC', priority: 85, category_hint: '数据转换' },
  { pattern: /\bdac\b|数模转换/i, tag: 'DAC', priority: 85, category_hint: '数据转换' },
  { pattern: /并联型电压基准|shunt\s+voltage\s+reference/i, tag: '并联型电压基准', priority: 90, category_hint: '电压基准' },
  { pattern: /串联型电压基准|series\s+voltage\s+reference/i, tag: '串联型电压基准', priority: 90, category_hint: '电压基准' },
  // subordinate: 当query同时命中放大器品类时，电压基准让位给放大器
  // priority 必须高于所有 primary 品类规则，确保先于 primary 被扫描、进入 pending 状态。
  { pattern: /电压基准|基准电压|vref|reference/i, tag: '电压基准', priority: 115, category_hint: '电压基准', role: 'subordinate' },
  // Sensor prio=87 beats generic I²C/SPI protocol rules (85), preventing I2C from hijacking
  // the category_hint when the user is clearly searching for a sensor (2026-06-24).
  { pattern: /电流传感|current[ -]?sens|current[ -]?shunt/i, tag: '电流传感器', priority: 87, category_hint: '传感器' },
  { pattern: /温度传感|temp[ -]?sens/i, tag: '温度传感器', priority: 87, category_hint: '传感器' },
  { pattern: /位置传感|position[ -]?sens/i, tag: '位置传感器', priority: 87, category_hint: '传感器' },
  { pattern: /线性位置传感|linear[ -]?position/i, tag: '线性位置传感器', priority: 88, category_hint: '传感器' },
  { pattern: /速度传感|speed[ -]?sens/i, tag: '速度传感器', priority: 87, category_hint: '传感器' },
  { pattern: /霍尔.*角度.*编码器|角度.*霍尔.*编码器|hall.*angle.*encoder/i, tag: '霍尔角度编码器', priority: 89, category_hint: '传感器' },
  { pattern: /磁阻.*角度.*编码器|角度.*磁阻.*编码器|tmr.*angle|magnetoresistive.*encoder/i, tag: '磁阻角度编码器', priority: 89, category_hint: '传感器' },
  { pattern: /霍尔.*(?:开关|锁存器)|hall.*(?:switch|latch)/i, tag: '霍尔开关/锁存器', priority: 88, category_hint: '传感器' },
  { pattern: /磁阻.*(?:开关|锁存器)|tmr.*(?:switch|latch)|amr.*(?:switch|latch)/i, tag: '磁阻开关/锁存器', priority: 88, category_hint: '传感器' },

  // Switch / Mux
  { pattern: /模拟开关|analog[ -]?switch|analog[ -]?mux|切.*开关|开关.*切/i, tag: '模拟开关', priority: 85, category_hint: '开关' },
  { pattern: /高速.*复用|高速.*解复用|高速数据复用/i, tag: '高速数据复用器', priority: 85, category_hint: '开关' },

  // Motor / Level shift
  { pattern: /马达驱动|电机驱动|motor[ -]?driv/i, tag: '马达驱动', priority: 85, category_hint: '驱动' },
  { pattern: /电平转换|level[ -]?shift|电压转换|voltage[ -]?translat/i, tag: '电平转换', priority: 85, category_hint: '电平转换' },

  // Other
  { pattern: /复位芯片|reset[ -]?ic|看门狗|watchdog/i, tag: '复位芯片', priority: 85, category_hint: '复位' },
  { pattern: /\bbms\b|电池保护|battery[ -]?protect/i, tag: 'BMS', priority: 85, category_hint: '电池管理' },
  { pattern: /逻辑门|与门|或门|非门|and[ -]?gate|or[ -]?gate|logic[ -]?gate/i, tag: '逻辑门', priority: 85, category_hint: '逻辑' },
  { pattern: /\bmcu\b|\bdsp\b|微控制器|单片机|cortex[ -]?m|arm[ -]?cortex/i, tag: 'MCU/DSP', priority: 85, category_hint: 'MCU/DSP' },
  { pattern: /匹配电阻|电阻网络|resistor[ -]?network/i, tag: '匹配电阻', priority: 85, category_hint: '电阻' },
  { pattern: /视频滤波|video[ -]?filter/i, tag: '视频滤波', priority: 85, category_hint: '视频' },
  { pattern: /传感器接口|sensor[ -]?interface/i, tag: '传感器接口', priority: 85, category_hint: '传感器' },
  { pattern: /mems.*麦克|pdm.*麦克|硅麦/i, tag: '传感器接口', priority: 87, category_hint: '传感器' },
  { pattern: /mems.*压力|压力.*mems|压力传感器/i, tag: '压力传感器', priority: 87, category_hint: '传感器' },
  { pattern: /音频总线|audio[ -]?bus/i, tag: '音频总线', priority: 85, category_hint: '音频' },
  { pattern: /emi.*滤波|共模.*滤波|emi[ -]?filter/i, tag: 'EMI滤波器', priority: 85, category_hint: '滤波器' },
  { pattern: /io.*扩展|io.*expander|gpio.*扩展/i, tag: 'IO扩展器', priority: 85, category_hint: 'IO' },
  { pattern: /2\.5g/i, tag: '2.5G', priority: 76, category_hint: '以太网' },
  { pattern: /千兆|ge[ -]?phy|1000base/i, tag: '千兆', priority: 75, category_hint: '以太网' },
  { pattern: /百兆|fe[ -]?phy|100base|100fx/i, tag: '百兆', priority: 74, category_hint: '以太网' },
  // 以太网子品类(优先于泛以太网): 交换机/网卡是独立子品类, 产品_features有对应标签
  { pattern: /固态继电器|solid[ -]?state[ -]?relay|ssr\b/i, tag: '固态继电器', priority: 86, category_hint: '固态继电器' },
  { pattern: /poe|以太网供电|power[ -]?over[ -]?ethernet/i, tag: '以太网供电', priority: 75, category_hint: '以太网' },
  { pattern: /交换机|交换芯片|交换|switch/i, tag: '交换机', priority: 73, category_hint: '以太网' },
  { pattern: /网卡|网络适配器|nic\b/i, tag: '网卡', priority: 72, category_hint: '以太网' },
  { pattern: /t1[ -]?phy|sgmii|rgmii|qsgmii|以太网|phy.*接口/i, tag: '以太网', priority: 70, category_hint: '以太网' },
];
// Exported for route.ts to classify LLM category tags correctly
export const CATEGORY_TAG_NAMES = new Set(CATEGORY_RULES.map(r => r.tag));
// tag → category_hint mapping (highest priority wins). Used for dynamic umbrella removal.
export const CATEGORY_HINT_MAP: Record<string, string> = {};
for (const r of [...CATEGORY_RULES].sort((a, b) => b.priority - a.priority)) {
  if (!CATEGORY_HINT_MAP[r.tag]) CATEGORY_HINT_MAP[r.tag] = r.category_hint;
}


// ═══════════════════════════════════════════════════════════
//  MODIFIER RULES
// ═══════════════════════════════════════════════════════════

const MODIFIER_RULES: ModifierRule[] = [
  { pattern: /非隔离|不隔离|无隔离/i, action: 'strip-pattern',
    stripPattern: /隔离|kVrms|5kVrms|3kVrms|隔离栅极驱动|隔离电源|隔离放大器|隔离I2C|隔离CAN|隔离RS485/,
    excludeTags: ['隔离', '5kVrms隔离', '3kVrms隔离', '隔离栅极驱动', '隔离电源', '隔离放大器', '隔离I2C', '隔离CAN', '隔离RS485'] },
  { pattern: /车规|车载|车用|aec[ -]?q100|汽车级|汽车规格/i, action: 'add-tag', tag: '车规AEC-Q100' },
  { pattern: /局部网络唤醒|局部联网|selective[ -]?wake|partial[ -]?networking/i, action: 'add-tag', tag: '局部网络唤醒' },
  { pattern: /唤醒|wake[ -]?up/i, action: 'add-tag', tag: '唤醒' },
  { pattern: /待机|standby/i, action: 'add-tag', tag: '待机模式' },
  { pattern: /pgood|power[ -]?good|pg\\b|电源好/i, action: 'add-tag', tag: 'PGOOD' },
  { pattern: /使能|enable(\\s*pin)?|en\\b/i, action: 'add-tag', tag: '使能' },
  // ── FAE-level: descriptive features that imply capability ──
  { pattern: /可调输出|adjustable[ -]?output|输出电压.*可调/i, action: 'add-tag', tag: '可调输出' },
  { pattern: /软启动|soft[ -]?start/i, action: 'add-tag', tag: '软启动' },
  { pattern: /同步整流|synchronous[ -]?rectif/i, action: 'add-tag', tag: '同步整流' },
  { pattern: /扩频|spread[ -]?spectrum|展频/i, action: 'add-tag', tag: '扩频' },
  { pattern: /外部.*(?:同步|时钟)|external[ -]?(?:sync|clock)|ext[ -]?clk/i, action: 'add-tag', tag: '外部同步' },
  { pattern: /推挽输出|push[ -]?pull|开漏输出|open[ -]?drain/i, action: 'add-tag', tag: '推挽/开漏' },
  { pattern: /工业级|工业/i, action: 'add-tag', tag: '工业级' },
  { pattern: /消费级|消费类/i, action: 'add-tag', tag: '消费级' },
  { pattern: /半双工/i, action: 'add-tag', tag: '半双工' },
  { pattern: /全双工/i, action: 'add-tag', tag: '全双工' },
  { pattern: /精密|高精度|低失调|低漂移|(?:offset.*?(\d+\.?\d*\s*[uμmμMm]?\s*v)|(\d+\.?\d*\s*[uμmμMm]?\s*v).*?offset)/i, action: 'add-tag', tag: '精密(≤1mV)' },
  { pattern: /低噪声|低噪音|low[ -]?noise/i, action: 'add-tag', tag: '低噪声' },
  { pattern: /轨到轨|rail[ -]?to[ -]?rail/i, action: 'add-tag', tag: '轨到轨' },
  { pattern: /高psrr|高电源抑制/i, action: 'add-tag', tag: '高PSRR' },
  { pattern: /低功耗唤醒/i, action: 'add-tag', tag: '低功耗唤醒' },
  { pattern: /特定帧唤醒|partial[ -]?networking/i, action: 'add-tag', tag: '特定帧唤醒' },
  { pattern: /高速|高速率/i, action: 'add-tag', tag: '高速(≥50MHz)' },
  { pattern: /pin[ -]?to[ -]?pin|兼容/i, action: 'add-tag', tag: 'Pin-to-Pin兼容' },
  // SIC CAN
  { pattern: /\bsic\b/i, action: 'add-tag', tag: 'SIC' },
  // Vos ≤1mV explicit
  { pattern: /1\s*mv|1\s*毫伏|≤\s*1\s*mv|<\s*1\s*mv|小于\s*1\s*mv|以下.*offset|offset.*小于|offset.*以下|offset.*≤.*1/i, action: 'add-tag', tag: 'Vos_<=1mV' },
  // 非管理型 switch
  { pattern: /非管理型|非管理|unmanaged/i, action: 'add-tag', tag: '非管理型' },
  // 霍尔 sensor
  { pattern: /霍尔|hall/i, action: 'add-tag', tag: '霍尔' },
  // 网络接口类型
  // 介质接口(线路侧): tx=100Base-TX双绞线铜口, fx=光纤, t1=单对线车载. 区别于MAC侧RGMII/SGMII(FAE铁律)
  { pattern: /\btx\b|100base-?tx|双绞线|铜口/i, action: 'add-tag', tag: '100Base-TX' },
  { pattern: /\bfx\b|100fx|光口|光纤/i, action: 'add-tag', tag: '100FX' },
  { pattern: /\bt1\b|100base-?t1|1000base-?t1|单对线|single[ -]?pair/i, action: 'add-tag', tag: 'T1-PHY' },
  { pattern: /rgmii/i, action: 'add-tag', tag: 'RGMII' },
  { pattern: /sgmii/i, action: 'add-tag', tag: 'SGMII' },
  { pattern: /qsgmii/i, action: 'add-tag', tag: 'QSGMII' },
];

// ═══════════════════════════════════════════════════════════
//  SORT RULES — 程度修饰词 → 数值排序意图
// ═══════════════════════════════════════════════════════════
// "高PSRR/低噪声/大电流" 不是布尔标签, 而是"按某数值列排序"的意图.
// 第一条命中即生效(单一排序键). require=true 时无该参数数值的产品被过滤(查啥就得有啥).
// paramKeys 是 _params_numeric 字段名的小写子串候选, 排序层对产品命中的任一字段取
// 该方向的最优值(high→max, low→min)参与排序.
//
// ★ 品类感知(2026-06-11推广): 同一修饰词在不同品类指向不同字段(高速→运放=GBW/ADC=采样率/接口=数据率;
//   大电流→LDO=mA级/DCDC=A级/栅极驱动=峰值A). 故每条规则可声明 categories 门控:
//   - categories 省略 = 通用规则(任何品类都可触发, 如"大电流"靠 max_output_current 子串跨品类通用)
//   - categories 非空 = 仅当 parser 解析出的 features 含其中任一品类标签时才激活
//   这样"低压差dcdc"不会误触发(dropout 是 LDO 专属), 避免 require 模式把无该字段的品类全过滤成空.
interface SortRule {
  pattern: RegExp;
  intent: SortIntent;
  categories?: string[];   // 门控品类标签; 省略=通用
}
const SORT_RULES: SortRule[] = [
  // ── LDO 专属 ──
  // PSRR: 越高越好. "高psr"(单r)/"高psrr"(双r)/"高电源抑制" 都命中
  { pattern: /高\s*psrr?|psrr?\s*高|高电源抑制|电源抑制比?高|高纹波抑制/i, categories: ['LDO'],
    intent: { param: 'PSRR', paramKeys: ['psrr'], direction: 'high', require: true, label: '按 PSRR 从高到低' } },
  // 压差 Dropout: 越低越好 (LDO 专属术语)
  { pattern: /低压差|压差低|低\s*dropout|dropout\s*低/i, categories: ['LDO'],
    intent: { param: 'Dropout', paramKeys: ['dropout'], direction: 'low', require: true, label: '按压差 Dropout 从低到高' } },

  // ── 运放/比较器 专属 ──
  // GBW 带宽: 越高越好 ("高带宽/高GBW/高速运放")
  { pattern: /高\s*带宽|高\s*gbw|带宽高|高\s*增益带宽/i, categories: ['运放'],
    intent: { param: 'GBW', paramKeys: ['gbw', 'gbp'], direction: 'high', require: true, label: '按带宽 GBW 从高到低' } },
  // Vos 失调电压: 越低越好 ("低失调/低Vos/高精度")
  { pattern: /低\s*失调|失调低|低\s*vos|高精度|精密|offset|vos|失调(?:电压)?.*?(?:≤|<=|<|小于|低于|以下|以内|不大于|不超过)?\s*\d+\.?\d*\s*(?:m\s*v|μ\s*v|u\s*v)/i, categories: ['运放', '比较器'],
    intent: { param: 'Vos', paramKeys: ['vos'], direction: 'low', require: true, label: '按失调电压 Vos 从低到高' } },
  // 传播延迟: 越低越好 (比较器/栅极驱动 "低延迟/高速比较器")
  { pattern: /低\s*延迟|延迟低|低\s*delay|快速响应|高速/i, categories: ['比较器', '栅极驱动', '隔离栅极驱动'],
    intent: { param: '传播延迟', paramKeys: ['propagation_delay', '延迟匹配', 'delay'], direction: 'low', require: true, label: '按传播延迟从低到高' } },

  // ── 数据转换 (ADC/DAC) 专属 ──
  // 采样率/吞吐: 越高越好 ("高采样率/高速ADC")
  { pattern: /高\s*采样|采样率高|高\s*速率|高\s*吞吐|高速/i, categories: ['ADC', 'DAC'],
    intent: { param: '采样率', paramKeys: ['throughput', 'msps', 'sample'], direction: 'high', require: true, label: '按采样率从高到低' } },

  // ── 接口 (RS485/RS232/CAN/LIN) 专属 ──
  // 数据速率: 越高越好 ("高速率/高波特")
  { pattern: /高\s*速率|速率高|高\s*波特|高\s*data\s*rate|高速/i, categories: ['RS-485', 'RS-232', 'CAN-FD', 'LIN'],
    intent: { param: '数据速率', paramKeys: ['data_rate', 'max_data_rate', '码流'], direction: 'high', require: true, label: '按数据速率从高到低' } },
  // ESD 防护: 越高越好 ("高ESD/高防护")
  { pattern: /高\s*esd|esd\s*高|高\s*防护|高\s*静电/i, categories: ['RS-485', 'RS-232', 'CAN-FD', 'LIN'],
    intent: { param: 'ESD', paramKeys: ['esd_hbm', 'esd', 'contact'], direction: 'high', require: true, label: '按 ESD 防护从高到低' } },

  // ── 数字隔离器 专属 ──
  // 数据速率(码流): 越高越好 ("高速数字隔离器") — 数字隔离器核心指标, 47/81 有数据速率数值.
  { pattern: /高\s*速率|速率高|高\s*data\s*rate|高速/i, categories: ['数字隔离器'],
    intent: { param: '数据速率', paramKeys: ['data_rate', 'max_data_rate', '码流'], direction: 'high', require: true, label: '按数据速率从高到低' } },

  // ── DCDC 专属 ──
  // 开关频率: 越高越好 ("高频DCDC/高开关频率") — 高频=小电感小体积
  { pattern: /高\s*频|频率高|高\s*开关频率|开关频率高/i, categories: ['DCDC'],
    intent: { param: '开关频率', paramKeys: ['switching_frequency', 'frequency'], direction: 'high', require: true, label: '按开关频率从高到低' } },

  // ── 通用(跨品类, 不门控) ──
  // 静态电流 Iq: 越低越好 (LDO/运放/比较器 都有 iq 字段; "低功耗"排除"低功耗唤醒")
  { pattern: /低\s*iq|iq\s*低|低静态电流|静态电流低|低功耗(?!唤醒)|超?低功耗/i,
    intent: { param: 'Iq', paramKeys: ['iq', '静态功耗', 'idd', 'icc'], direction: 'low', require: true, label: '按静态电流 Iq 从低到高' } },
  // 噪声: 越低越好 (LDO/运放 都有 noise 字段)
  { pattern: /低噪声|低噪音|噪声低|low[ -]?noise|超?低噪/i,
    intent: { param: '噪声', paramKeys: ['noise', '噪声'], direction: 'low', require: true, label: '按噪声从低到高' } },
  // 输出电流: 越大越好 (LDO=mA级 / DCDC=A级 / 栅极驱动=峰值A; max_output_current 子串跨品类通用)
  { pattern: /大\s*电流|电流大|大输出电流|输出电流大|high[ -]?current|大\s*iout|大\s*驱动电流/i,
    intent: { param: '输出电流', paramKeys: ['max_output_current', '输出_电流', 'output_current', '峰值', '峰值电流', '驱动_电流'], direction: 'high', require: true, label: '按输出电流从大到小' } },
];

// ═══════════════════════════════════════════════════════════
//  PARAM RULES
// ═══════════════════════════════════════════════════════════

// 数值→标签字符串(整数去小数, 小数保留): 208→"208", 0.5→"0.5"
function fmtNum(value: number): string {
  return Number.isInteger(value) ? `${value}` : `${parseFloat(value.toFixed(3))}`;
}

function cumulativeThresholds(value: number, thresholds: number[], unit: string): string[] {
  const tags: string[] = [];
  for (const t of thresholds) {
    if (value >= t) tags.push(`${Number.isInteger(t) ? t : t}${unit}`);
  }
  const exactTag = `${Number.isInteger(value) ? value : value}${unit}`;
  if (!tags.includes(exactTag) && value >= thresholds[thresholds.length - 1]) {
    tags.push(exactTag);
  }
  return tags;
}

const PARAM_RULES: ParamRule[] = [
  // ★ 方案甲(2026-06-12): 速率查询发单一真实值标签, 不再梯子展开(cumulativeThresholds).
  //   "50Mbps" → must=[50Mbps] (family=Mbps, downgradable), 产品速率≥50 即满足(constraint-match ≥比较).
  //   旧 cumulativeThresholds 依赖产品侧梯子标签做≥, 现产品侧也改单一真实值, 改由数值比较实现≥.
  { pattern: /(\d+\.?\d*)\s*(G|g)\s*bps/i,
    extract: (m) => [`${fmtNum(parseFloat(m[1]) * 1000)}Mbps`] },
  { pattern: /(\d+\.?\d*)\s*(M|m)\s*bps/i,
    extract: (m) => [`${fmtNum(parseFloat(m[1]))}Mbps`] },
  { pattern: /(\d+\.?\d*)\s*(k|K)\s*bps/i,
    extract: (m) => [`${fmtNum(parseFloat(m[1]) / 1000)}Mbps`] },
  { pattern: /(\d+)\s*(M|兆|m)\s*bps/i,
    extract: (m) => [`${fmtNum(parseInt(m[1]))}Mbps`] },
  // ── 口语化速率: "50 兆"/"50M" ≈ 50Mbps (no explicit 'bps') ──
  // Must come AFTER the bps rules to avoid double-match. Negative-lookahead
  // prevents matching "50mA"/"50mV"/"50MHz" etc.
  { pattern: /(\d+)\s*兆(?!欧|克|瓦|安|伏|赫)/i,
    extract: (m) => [`${fmtNum(parseInt(m[1]))}Mbps`] },
  { pattern: /(\d+)\s*M\b(?!\s*(?:bps|Hz|V|A|Ω|W|F|ohm|[a-z]))/i,
    extract: (m) => [`${fmtNum(parseFloat(m[1]))}Mbps`] },
  { pattern: /(\d+)\s*T\s*(\d+)\s*R/i,
    extract: (m) => [`${m[1]}T${m[2]}R`] },
  { pattern: /(\d+)\s*发\s*(\d+)\s*收/,
    extract: (m) => [`${m[1]}T${m[2]}R`] },
  { pattern: /(\d+\.?\d*)\s*A\b(?!\w)/i,
    extract: (m) => { const a = parseFloat(m[1]); return a >= 0.5 && a <= 100 ? cumulativeThresholds(a, [12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0.5], 'A').map(t => `Iout_${t}`) : []; } },
  { pattern: /(\d+)\s*mA\b/i,
    extract: (m) => { const ma = parseInt(m[1]); return ma <= 10000 && ma >= 50 ? cumulativeThresholds(ma/1000, [12, 10, 8, 7, 6, 5, 4, 3, 2, 1, 0.5], 'A').map(t => `Iout_${t}`) : []; } },
  // Voltage: produces Vin_ tags; engine post-processing converts to Vout_ for LDO/output context
  { pattern: /(\d+\.?\d*)\s*V\b(?!\w)/i,
    extract: (m) => { const v = parseFloat(m[1]); if (v >= 0.5 && v <= 600) { const exact = `Vin_${Number.isInteger(v) ? v : v}V`; const ts = [48, 36, 24, 12, 5, 3.3, 2.5, 1.8, 1.2, 1, 0.8, 0.6]; const cumul = ts.filter(t => v >= t).map(t => `Vin_${Number.isInteger(t)?t:t}V`); return [...new Set([exact, ...cumul])]; } return []; } },
  { pattern: /(\d+)\s*通道/,
    extract: (m) => { const n = parseInt(m[1]); return [32, 16, 8, 4, 2, 1].filter(t => n >= t).map(t => `${t}通道`); } },
  { pattern: /(\d+)\s*路/,
    extract: (m) => { const n = parseInt(m[1]); return [32, 16, 8, 4, 2, 1].filter(t => n >= t).map(t => `${t}通道`); } },
  { pattern: /(\d+)\s*bit\b/i,
    extract: (m) => { const b = parseInt(m[1]); return [24, 20, 18, 16, 14, 12, 10, 8].filter(t => b >= t && t <= 24).map(t => `${t}bit`); } },
  { pattern: /(\d+)\s*:\s*1\b/,
    extract: (m) => [`${m[1]}:1`] },
  { pattern: /(\d+)\s*kVrms|(\d+)\s*kV\s*(隔离|隔离电压)/i,
    extract: (m) => [`${m[1]||m[2]}kVrms隔离`] },
  // 以太网端口数: 精确匹配(用户要5口不接受8口), 单标签 N口. 交换机语境下追加"N口交换机"
  { pattern: /(\d+)\s*口/,
    extract: (m) => [`${m[1]}口`] },
];

// ═══════════════════════════════════════════════════════════
//  PARSER ENGINE
// ═══════════════════════════════════════════════════════════

// ── 竞品型号反查(cross_ref)检测 ────────────────────────────
//   返回规范化型号(大写)表示命中反查意图; 返回 null 表示非反查查询.
//   方案A(2026-06-12): 形似型号一律走确定性反查"可替代产品"字段, 不要求替代词, 零命中诚实降级.
//   原因: 纯输入型号(如"tja9999")时 LLM 会凭训练知识脑补品类推荐(实测把不存在的TJA9999编成
//   "NXP车规CAN收发器"). 走确定性反查切断脑补.
//   不做"自家/竞品"前缀判别: 思瑞浦大量沿用行业通用前缀(LM/TPS/TL), 前缀黑名单会误判
//   (LM2901自家有LM2901A, TPS竞品也有TPS5430). 用户拍板: 反查照做, 结果里标注品牌即可区分.
const REPLACE_INTENT = /替代|替换|代换|pin\s*to\s*pin|pin2pin|p2p|国产化?替代|兼容|对标|平替|替代料|替代品|cross\s*ref|equivalent|drop[\s-]?in/i;
// 品类/参数意图词: 出现这些说明用户想按品类找(如"类似tja1145的CAN收发器"), 尊重品类意图不走反查.
//   仅在"无替代词"时作为闸门; 带替代词时一律反查(替代意图最明确).
const CATEGORY_INTENT = /收发器|运放|放大器|比较器|稳压|LDO|DCDC|转换器|ADC|DAC|基准|隔离器|驱动|传感器|开关|二极管|保险丝|滤波|逻辑|网关|交换机|网卡|PHY|MCU|电源|接口|的[A-Za-z]/i;
// 总线/协议/品类标准名: 形似"字母+数字"但本质是接口品类名, 不是厂商型号(领域知识, 非硬编码).
//   "高速率rs485"里 RS485 是接口标准, 误抽成竞品型号会错误触发反查(2026-06-12 回归 bug).
const PROTOCOL_NAMES = new Set([
  'RS485', 'RS232', 'RS422', 'RS-485', 'RS-232', 'RS-422',
  'I2C', 'I2S', 'SPI', 'CAN', 'CANFD', 'CAN-FD', 'LIN', 'MLVDS', 'LVDS',
  'USB2', 'USB3', 'M2', 'IO500', 'PCIE',
]);
export function detectCrossRef(query: string): string | null {
  // 候选型号片段: 从查询里抽出所有"连续的字母数字(可含-)"片段.
  //   中文连写无空格("iso7721替代"/"INA240替代品"), 必须按非[字母数字-]字符切分.
  //   竞品型号形如 ISO7721 / INA240 / TJA1021 / LM2901 / ADUM1201.
  const fragments = query.toUpperCase().match(/[A-Z][A-Z0-9-]*\d[A-Z0-9-]*/g) || [];
  let competitorPN: string | null = null;
  for (const frag of fragments) {
    if (PROTOCOL_NAMES.has(frag)) continue;   // 接口品类名(RS485等)不是竞品型号
    const letters = (frag.match(/[A-Z]/g) || []).length;
    const hasNumBlock = /\d{3,}/.test(frag);
    if (letters >= 2 && hasNumBlock) { competitorPN = frag; break; }
  }
  if (!competitorPN) return null;
  // 带替代词: 替代意图最明确, 一律反查.
  if (REPLACE_INTENT.test(query)) return competitorPN;
  // 无替代词: 纯型号查询也走反查(切断LLM脑补); 但若用户明确带品类/参数意图词, 尊重品类搜索.
  if (CATEGORY_INTENT.test(query)) return null;
  return competitorPN;
}


export function parseQuery(query: string): ParseResult {
  const features: string[] = [];
  const sources = new Map<string, string>();
  let categoryMatched = false;
  let categoryHint = '';

  // Step 0: 竞品型号反查意图(cross_ref) — 优先于品类匹配.
  //   FAE 高频场景: "有没有 ISO7721 的替换" = 我在用 TI 的 ISO7721, 要国产 pin-to-pin 替代料.
  //   必须在品类匹配前拦截, 否则 ISO7721 会被误解成"找双通道数字隔离器"(LLM 实测如此跑偏).
  //   判据(零假阳性): (1)查询含替代意图词; (2)含一个"竞品型号"——非自家前缀(TP/NS/NSI/YT/SZ)、
  //   形如字母+数字混合(≥2字母≥2数字, 排除纯标签词/纯数字规格). 检索由代码扫"可替代产品"字段确定性产生.
  const crossRef = detectCrossRef(query);
  if (crossRef) {
    return {
      features: [], exclude_tags: [], category_hint: '替代查询',
      explanation: `竞品型号反查: 查找可替代 ${crossRef} 的国产料`,
      confidence: 'high', needsLLM: false, residualQuery: '',
      must: [], nice: [], mustMeta: [], sortKey: undefined,
      intent: 'cross_ref', crossRefTarget: crossRef,
    };
  }

  // Step 1: Category matching (priority order, first match wins)
  // 例外1: 以太网内部速率(千兆/百兆/2.5G)与子品类(交换机/网卡)是正交维度, 允许共存
  // 例外2: SBC(系统基础芯片)是复合品类 — 集成总线收发器(CAN/LIN/RS-485)+LDO+看门狗+SPI.
  //   "集成CAN的SBC" = 品类SBC + 总线维度CAN 两个正交约束, 不是非此即彼.
  //   当 query 含 sbc 时进入复合模式, 允许 SBC 与总线品类标签共存(都进 must).
  const sorted = [...CATEGORY_RULES].sort((a, b) => b.priority - a.priority);
  let ethMatched = false;
  let subordinateTag: string | null = null;
  let subordinateHint: string | null = null;
  const isSbcQuery = /\bsbc\b/i.test(query);
  // SBC 复合模式下可与 SBC 共存的总线维度标签(集成在 SBC 内的总线收发器)
  const SBC_BUS_TAGS = new Set(['CAN-FD', 'LIN', 'RS-485', 'RS-232']);
  let sbcMatched = false;
  const seenHints = new Set<string>(); // dedup: same category_hint → only first match
  for (const rule of sorted) {
    if (rule.pattern.test(query)) {
      // 非隔离 guard: skip isolation compound tags when query explicitly says 非隔离
      if (/非隔离|不隔离|无隔离/i.test(query) && rule.tag.startsWith('隔离')) continue;

      // subordinate: 此类标签可能只是另一品类的特征。记住但不 break，
      // 继续扫描看有无 primary 品类也命中。只有 primary 也命中时才让位。
      if (rule.role === 'subordinate') {
        if (!subordinateTag) {
          subordinateTag = rule.tag;
          subordinateHint = rule.category_hint;
        }
        continue;
      }

      // primary match — if subordinate was pending, add it alongside
      if (subordinateTag && !features.includes(subordinateTag)) {
        features.push(subordinateTag);
        sources.set(subordinateTag, 'modifier');
      }

      // Dedup by category_hint for non-special cases:
      // - Ethernet: multi-dimension coexistence → no dedup
      // - SBC composite: SBC + bus tags coexist → no dedup
      // - Others: same category_hint → skip (first highest-priority match wins)
      const isEthernet = rule.category_hint === '以太网';
      const isSbcComposite = isSbcQuery && (rule.tag === 'SBC' || SBC_BUS_TAGS.has(rule.tag));
      if (!isEthernet && !isSbcComposite && seenHints.has(rule.category_hint)) {
        continue;
      }

      if (!features.includes(rule.tag)) {
        features.push(rule.tag);
        sources.set(rule.tag, 'category');
      }
      if (!categoryHint) categoryHint = rule.category_hint;
      categoryMatched = true;
      if (!isEthernet && !isSbcComposite) {
        seenHints.add(rule.category_hint);
      }
      // 以太网类: 不break, 允许速率+子品类多维共存
      if (isEthernet) {
        ethMatched = true;
        continue;
      }
      if (ethMatched) continue; // 已进入以太网多维匹配, 跳过非以太网规则
      // SBC 复合模式: query含sbc时, SBC品类 与 总线维度(CAN/LIN/RS-485/RS-232) 正交共存
      if (isSbcComposite) {
        sbcMatched = true;
        continue;
      }
      if (sbcMatched && (rule.tag === 'SBC' || SBC_BUS_TAGS.has(rule.tag))) continue;
      // Multi-category coexistence: queries like "mcu with can" span distinct
      // dimension groups (MCU/DSP + CAN-FD). Continue scanning instead of
      // break, so both categories are collected. Same-tag dedup is handled
      // by !features.includes(rule.tag) above.
      continue;
    }
  }

  // no primary matched — fallback to subordinate as standalone
  if (!categoryMatched && subordinateTag) {
    features.push(subordinateTag);
    sources.set(subordinateTag, 'category');
    categoryHint = subordinateHint!;
    categoryMatched = true;
  }

  // ── Post-category: DCDC + 降压/升压 共存 (same as "降压器"/"升压器" → DCDC + sub-type) ──
  // "降压器" → DCDC rule fires (priority 85), but we also need 降压 tag.
  // Conversely, bare "降压" → standalone 降压 rule fires (priority 80), but we also need DCDC parent.
  if ((features.includes('DCDC') || features.includes('降压') || features.includes('升压'))) {
    if (!features.includes('DCDC')) {
      features.push('DCDC');
      sources.set('DCDC', 'category');
    }
    if (/降压|buck/i.test(query) && !features.includes('降压')) {
      features.push('降压');
      sources.set('降压', 'category');
    }
    if (/升压|boost/i.test(query) && !features.includes('升压')) {
      features.push('升压');
      sources.set('升压', 'category');
    }
  }

  // ── Post-category: I2C + IO扩展器 共存 ──
  if (features.includes('I2C') && /io.*扩展|io.*expander|gpio.*扩展/i.test(query) && !features.includes('IO扩展器')) {
    features.push('IO扩展器');
    sources.set('IO扩展器', 'category');
  }

  // ── Compound tag decomposition: 隔离RS485 → RS-485 + 隔离 ──
  // Products carry individual tokens (隔离, RS-485), not compound category tags.
  const COMPOUND_DECOMPOSE: Record<string, string[]> = {
    '隔离RS485': ['RS-485', '隔离'],
    '隔离CAN': ['CAN-FD', '隔离'],
    '隔离I2C': ['I2C', '隔离'],
    '集成隔离电源的隔离CAN': ['隔离电源', 'CAN-FD', '隔离'],
    '集成隔离电源的隔离RS485': ['隔离电源', 'RS-485', '隔离'],
  };
  for (const [compound, parts] of Object.entries(COMPOUND_DECOMPOSE)) {
    if (features.includes(compound)) {
      for (const part of parts) {
        if (!features.includes(part)) {
          features.push(part);
          sources.set(part, 'category');
        }
      }
    }
  }

  // ── Post-category: 八切一 Chinese switch notation (before Chinese numeral normalization) ──
  //   "八切一开关" → extract "8:1" param; Chinese numeral normalization converts 八→8, 一→1 first.
  //   Must run on original query before normalization destroys the pattern.
  const chSwitchMatch = query.match(/([一二三四五六七八九十]+)切([一二三四五六七八九十]+)/);
  if (chSwitchMatch) {
    const cnMap: Record<string, number> = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
    const a = cnMap[chSwitchMatch[1]] || 0;
    const b = cnMap[chSwitchMatch[2]] || 0;
    if (a > 0 && b > 0) {
      const tag = `${a}:${b}`;
      if (!features.includes(tag)) {
        features.push(tag);
        sources.set(tag, 'param');
      }
    }
  }
  // Arabic/mixed digits: "16切一", "16切1", "8切1" → N:M
  const arSwitchMatch = query.match(/(\d+)\s*切\s*([一二三四五六七八九十\d]+)/);
  if (arSwitchMatch) {
    const cnMap2: Record<string, number> = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10 };
    const a = parseInt(arSwitchMatch[1]);
    const bRaw = arSwitchMatch[2];
    const b = /^\d+$/.test(bRaw) ? parseInt(bRaw) : (cnMap2[bRaw] || 0);
    if (a > 0 && b > 0) {
      const tag = `${a}:${b}`;
      if (!features.includes(tag)) {
        features.push(tag);
        sources.set(tag, 'param');
      }
    }
  }

  // Step 2: Modifier rules
  const toStrip = new Set<string>();
  for (const rule of MODIFIER_RULES) {
    if (!rule.pattern.test(query)) continue;
    if (rule.action === 'add-tag' && rule.tag && !features.includes(rule.tag)) {
      features.push(rule.tag);
      sources.set(rule.tag, 'modifier');
    } else if (rule.action === 'strip-pattern' && rule.stripPattern) {
      for (const f of features) {
        if (rule.stripPattern.test(f)) toStrip.add(f);
      }
    }
  }
  // Build exclude_tags from stripped tags + explicit exclude rules
  const exclude_tags: string[] = [];
  for (const tag of toStrip) {
    if (tag.startsWith('非隔离')) continue;
    exclude_tags.push(tag);
    const idx = features.indexOf(tag);
    if (idx !== -1) features.splice(idx, 1);
  }

  // Collect explicit excludeTags from modifier rules
  for (const rule of MODIFIER_RULES) {
    if (!rule.pattern.test(query)) continue;
    if (rule.excludeTags) {
      for (const t of rule.excludeTags) {
        if (!exclude_tags.includes(t)) exclude_tags.push(t);
      }
    }
  }

  // Pre-process: normalize Chinese numerals to digits
  //   ★ 2026-06-12: 复合数处理 十/二十/二十五. 旧逐字替换把"二十"→"210"(二→2,十→10拼接), 是潜在bug,
  //   被旧速率梯子掩盖(210Mbps含20档碰巧命中). 方案甲单值暴露后修复.
  const CN_UNIT: Record<string, number> = {
    '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9
  };
  // 先处理含"十"的复合数: [一-九]?十[一-九]?  → 数值
  let normalizedQuery = query.replace(/([一二两三四五六七八九])?十([一二三四五六七八九])?/g, (_m, tens, ones) => {
    const t = tens ? CN_UNIT[tens] : 1;       // "十"=10, "二十"=20
    const o = ones ? CN_UNIT[ones] : 0;       // "十五"=15, "二十五"=25
    return String(t * 10 + o);
  });
  // 再处理剩余的个位中文数字
  for (const [cn, digit] of Object.entries(CN_UNIT)) {
    normalizedQuery = normalizedQuery.replace(new RegExp(cn, 'g'), String(digit));
  }

  // Step 3: Param extraction
  for (const rule of PARAM_RULES) {
    const matches = [...(normalizedQuery.matchAll(new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g')))];
    for (const match of matches) {
      for (const tag of rule.extract(match)) {
        if (!features.includes(tag)) {
          features.push(tag);
          sources.set(tag, 'param');
        }
      }
    }
  }

  // ── Post-param: Vin/Vout direction correction for "X转Y" / "X输入Y输出" patterns ──
  let stepResolved = false;
  const stepMatch = normalizedQuery.match(/(\d+\.?\d*)\s*V\s*(?:转|到|→|至|输入[^输]*输出)\s*(\d+\.?\d*)\s*V/i);
  if (stepMatch) {
    stepResolved = true;
    const outV = parseFloat(stepMatch[2]);
    const voutTag = `Vout_${Number.isInteger(outV) ? outV : outV}V`;
    if (!features.includes(voutTag)) {
      features.push(voutTag);
      sources.set(voutTag, 'param');
    }
  }
  // Also handle "输出 X V" and "X V输出" in DCDC/non-LDO context
  const outVoltMatch = normalizedQuery.match(/输出\s*(\d+\.?\d*)\s*V/i);
  const revOutMatch = normalizedQuery.match(/(\d+\.?\d*)\s*V\s*输出/i);
  const outVoltValue = (outVoltMatch || revOutMatch) ? parseFloat((outVoltMatch || revOutMatch)![1]) : null;
  if (outVoltValue !== null && !stepResolved) {
    stepResolved = true;  // prevent subsequent LDO Vin→Vout from double-converting
    const voutTag = `Vout_${Number.isInteger(outVoltValue) ? outVoltValue : outVoltValue}V`;
    if (!features.includes(voutTag)) {
      features.push(voutTag);
      sources.set(voutTag, 'param');
    }
    // Strip all Vin tags ≤ outV (cascade from threshold expansion of output voltage)
    for (let i = features.length - 1; i >= 0; i--) {
      const m = features[i].match(/^Vin_(\d+\.?\d*)V$/);
      if (m && parseFloat(m[1]) <= outVoltValue) features.splice(i, 1);
    }
  }

  // ── Post-param: Vin → Vout conversion for LDO/output voltage context ──
  const isDcdcContext = features.includes('DCDC') || features.includes('降压') || features.includes('升压');
  if (!stepResolved && !isDcdcContext && /ldo|低压差|线性稳压|输出\s*电压|output\s*voltage|\d+V\s*输出|输出\s*\d+V/i.test(query)) {
    for (let i = features.length - 1; i >= 0; i--) {
      const f = features[i];
      if (f.startsWith('Vin_')) {
        const newTag = f.replace(/^Vin_/, 'Vout_');
        features.splice(i, 1);
        features.push(newTag);
        sources.set(newTag, 'param');
      }
    }
  }

  // ── Universal safety guard: strip param tags that conflict with query ──
  // e.g., "1mv" should not produce "1Mbps" — the 'v' suffix means volts, not bps
  const queryLower = query.toLowerCase();
  
  // Speed guard: if query has digit+M/m followed by non-bps unit char, strip Mbps
  const speedContextMatch = queryLower.match(/(\d+\.?\d*)\s*[mM]([a-z]*)/g);
  if (speedContextMatch) {
    for (const sm of speedContextMatch) {
      const afterM = sm.replace(/[\d.\s]*[mM]/, '');
      // If followed by unit chars that are NOT 'bps' → not speed
      if (afterM && !/^b/i.test(afterM) && /^[a-z]+$/.test(afterM)) {
        // Remove all Mbps tags
        for (let i = features.length - 1; i >= 0; i--) {
          if (features[i].endsWith('Mbps')) {
            features.splice(i, 1);
          }
        }
        break; // one conflict is enough to strip all speed tags
      }
    }
  }
  
  // Step 4: Build explanation
  const catTags = features.filter(f => sources.get(f) === 'category').join(', ');
  const modTags = features.filter(f => sources.get(f) === 'modifier').join(', ');
  const paramTags = features.filter(f => sources.get(f) === 'param').join(', ');
  let explanation = [catTags, modTags, paramTags].filter(Boolean).join('，');
  if (!explanation) explanation = '未匹配到具体品类';

  // ── Redundant tag suppression
  if (features.includes('Vos_<=1mV') && features.includes('精密(≤1mV)')) {
    const idx = features.indexOf('精密(≤1mV)');
    features.splice(idx, 1);
    sources.delete('精密(≤1mV)');
  }
  // 局部网络唤醒/特定帧唤醒 包含 唤醒 语义 → 抑制独立唤醒标签
  if ((features.includes('局部网络唤醒') || features.includes('特定帧唤醒')) && features.includes('唤醒')) {
    const idx = features.indexOf('唤醒');
    features.splice(idx, 1);
    sources.delete('唤醒');
  }

  // ── 派生 must/nice 约束(用于以太网硬过滤+降级排序) ──
  // must = 品类(category) + 规格(param) + 物理层介质(TX/T1/FX 虽是modifier但物理层错=产品错)
  // nice = 其余 modifier(车规/工业级/低功耗/速率修饰等), 满足更好
  //
  // ★累积阈值归约: 通道/Vin/Iout/bit/Mbps 这类参数会扩展成累积列表(4通道→[4,2,1通道]),
  //   语义是"≥N"的向下兼容. must全满足语义下不能要求同时满足全部阈值, 只取最强(数值最大)的一个.
  //   产品侧标签仍保留累积列表(表示其覆盖能力), 查询侧 must 只需验证最高门槛.
  const PHY_MEDIA = new Set(['100Base-TX', '100FX', 'T1-PHY']);

  // Tags that should be elevated to must (grade/spec level modifiers)
  const GRADE_TAGS = new Set(['车规AEC-Q100', '工业级', '消费级']);
  const MUST_MODIFIER_TAGS = new Set(['全双工', '半双工', '轨到轨', 'Vos_<=1mV', '霍尔', '非管理型', '唤醒', '局部网络唤醒', '待机模式', 'PGOOD', '使能', '可调输出', '软启动', '同步整流', '扩频', '外部同步', '推挽/开漏']);

  // 识别参数族 + 提取数值, 用于"同族取最强"
  const paramFamily = (tag: string): { family: string; value: number } | null => {
    let m;
    if ((m = tag.match(/^(\d+)通道$/))) return { family: '通道', value: +m[1] };
    if ((m = tag.match(/^(\d+)bit$/))) return { family: 'bit', value: +m[1] };
    if ((m = tag.match(/^Vin_(\d+\.?\d*)V$/))) return { family: 'Vin', value: +m[1] };
    if ((m = tag.match(/^Vout_(\d+\.?\d*)V$/))) return { family: 'Vout', value: +m[1] };
    if ((m = tag.match(/^Iout_(\d+\.?\d*)A$/))) return { family: 'Iout', value: +m[1] };
    if ((m = tag.match(/^(\d+\.?\d*)Mbps$/))) return { family: 'Mbps', value: +m[1] };
    return null;
  };
  // 每个累积族只保留数值最强的标签进 must, 其余同族标签丢弃(不进must也不进nice, 避免噪声)
  const strongestByFamily = new Map<string, string>();
  for (const f of features) {
    const pf = paramFamily(f);
    if (!pf) continue;
    const cur = strongestByFamily.get(pf.family);
    if (!cur || pf.value > (paramFamily(cur)?.value ?? -Infinity)) {
      strongestByFamily.set(pf.family, f);
    }
  }
  const cumulativeKeep = new Set(strongestByFamily.values());

  const must: string[] = [];
  const nice: string[] = [];
  const mustMeta: MustConstraint[] = [];

  // 维度判定: 端口/通道/速率可向下兼容(要N, ≥N也可); 其他spec就近; 物理层=media; 品类=category
  //   速率(Mbps)纳入向下兼容(2026-06-12 方案甲): 要50Mbps, 产品≥50即满足(高速兼容低速场景).
  const DOWNGRADABLE_FAMILIES = new Set(['端口', '通道', 'Mbps']);
  const portFamily = (tag: string): { family: string; value: number } | null => {
    const m = tag.match(/^(\d+)口$/);
    return m ? { family: '端口', value: +m[1] } : null;
  };

  for (const f of features) {
    const pf = paramFamily(f);
    if (pf) {
      // 累积族: 只有最强的进 must, 其余同族标签跳过
      if (cumulativeKeep.has(f)) {
        must.push(f);
        mustMeta.push({ tag: f, dimension: 'spec', family: pf.family, value: pf.value,
          downgradable: DOWNGRADABLE_FAMILIES.has(pf.family) });
      }
      continue;
    }
    const port = portFamily(f);
    if (port) {
      must.push(f);
      mustMeta.push({ tag: f, dimension: 'spec', family: '端口', value: port.value, downgradable: true });
      continue;
    }
    const src = sources.get(f);
    if (GRADE_TAGS.has(f)) {
      must.push(f);
      mustMeta.push({ tag: f, dimension: 'grade' });
    } else if (f === '电压基准' && src === 'modifier') {
      // subordinate 标签在 compound 模式(src=modifier) → spec 维度, 允许 params_numeric 证据
      must.push(f);
      mustMeta.push({ tag: f, dimension: 'spec' });
    } else if (MUST_MODIFIER_TAGS.has(f)) {
      must.push(f);
      // Vos_<=1mV encodes a numeric spec constraint.  Attach family/value so
      // the constraint layer uses numeric comparison (vosMaxMvOf ≤ value)
      // instead of a literal token match that never succeeds.
      const vosMatch = f.match(/^Vos_<=(\d+\.?\d*)(m?)V?$/i);
      if (vosMatch) {
        const vosVal = parseFloat(vosMatch[1]);
        // Vos tags are always in mV; if the tag says V, convert to mV.
        const vosMv = vosMatch[2] ? vosVal : vosVal;
        mustMeta.push({ tag: f, dimension: 'spec', family: 'Vos', value: vosMv });
      } else {
        mustMeta.push({ tag: f, dimension: 'spec' });
      }
    } else if (PHY_MEDIA.has(f)) {
      must.push(f);
      mustMeta.push({ tag: f, dimension: 'media' });
    } else if (src === 'category') {
      must.push(f);
      mustMeta.push({ tag: f, dimension: 'category' });
    } else if (src === 'param') {
      must.push(f);
      mustMeta.push({ tag: f, dimension: 'spec', family: f });
    } else {
      nice.push(f);
    }
  }

  // ── 派生排序意图 sortKey(高/低 + 参数 → 数值排序) ──
  // 第一条命中即生效(单一排序键, 避免多键冲突). 即使没命中品类也照样解析,
  // 让"高psr"这类纯修饰查询也能带上排序意图.
  // ★ 品类门控: 规则声明 categories 时, 仅当已解析出的 features 含其中任一品类才激活,
  //   防止"低压差dcdc"误触发 LDO 专属的 dropout 排序(require 模式会把 DCDC 全过滤成空).
  let sortKey: SortIntent | undefined;
  for (const r of SORT_RULES) {
    if (!r.pattern.test(query)) continue;
    if (r.categories && r.categories.length > 0) {
      const hit = r.categories.some((c) => features.includes(c));
      if (!hit) continue;  // 品类不匹配, 跳过这条规则
    }
    sortKey = r.intent;
    break;
  }

  // Compute residual (parts of query not consumed)
  let residual = query;
  for (const pat of [...CATEGORY_RULES.map(r => r.pattern), ...MODIFIER_RULES.map(r => r.pattern), ...PARAM_RULES.map(r => r.pattern)]) {
    residual = residual.replace(pat, ' ').replace(/\s+/g, ' ').trim();
  }

  // Cleaned residual: strip noise particles to detect real unconsumed content
  const NOISE_RE = /\b(的|了|吗|个|是|有|我|你|帮|推荐|推荐一|需要|请问|找|一下|款|颗|个|能|可以|有没有|想要|什么|帮忙|求|可否|是否|怎么|如何|哪|几|给|用|做|要|搞|弄|弄个)\b/gi;
  const residualClean = residual.replace(NOISE_RE, '').replace(/\s+/g, ' ').trim();
  // 3+ chars of meaningful residual → parser didn't understand enough → escalate to LLM.
  // (Was 15 — too high. "16切一"=4chars carries real signal but was below old threshold.)
  const hasMeaningful = /[\u4e00-\u9fff\d]/.test(residualClean);
  const residualTooLong = residualClean.length > 3 && hasMeaningful;

  return {
    features,
    exclude_tags,
    category_hint: categoryHint,
    explanation,
    confidence: categoryMatched && !residualTooLong ? 'high' : 'low',
    needsLLM: !categoryMatched || residualTooLong,  // LLM only when parser can't fully digest the query
    residualQuery: residual,
    must,
    nice,
    mustMeta,
    sortKey,
    intent: 'spec_search',
  };
}

import { NextRequest, NextResponse } from "next/server";

import { parseQuery, CATEGORY_HINT_MAP, CATEGORY_TAG_NAMES, type ParseResult, buildPromptTagList } from './query_parser';
import { tagSatisfied } from './constraint-match';
import { findProductByPN, loadAllVendors, loadVendor } from './data-loader';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";

// Category hierarchy: when a subclass tag exists, remove the umbrella parent tag.
// Pattern: "隔离X" → X + 隔离, "子放大器" → 放大器/运放, "子传感器" → 传感器, etc.
// Also covers LLM/parser naming variants (e.g. both 隔离栅极驱动 AND 隔离式栅极驱动器).
const CATEGORY_HIERARCHY: Record<string, string[]> = {
  // ── 放大器族: 子类 → 运放/放大器 ──
  "隔离放大器": ["运放", "放大器", "隔离"],
  "仪表放大器": ["运放", "放大器"],
  "差动放大器": ["运放", "放大器"],
  "对数放大器": ["运放", "放大器"],
  "电流检测放大器": ["运放", "放大器"],
  "高速运算放大器": ["运放", "放大器"],
  "精密运算放大器": ["运放", "放大器"],
  "高压运算放大器": ["运放", "放大器"],
  "低压运算放大器": ["运放", "放大器"],
  "零漂运算放大器": ["运放", "放大器"],
  // ── 隔离接口族: 隔离X → X + 隔离 ──
  "隔离RS485": ["RS-485", "隔离"],
  "隔离RS-232": ["RS-232", "隔离"],
  "隔离CAN": ["CAN-FD", "隔离"],
  "隔离I2C": ["I2C", "隔离"],
  "隔离ADC": ["ADC", "隔离"],
  "集成隔离电源的隔离RS485": ["RS-485", "隔离RS485", "隔离", "集成隔离电源"],
  "集成隔离电源的隔离CAN": ["CAN-FD", "隔离CAN", "隔离", "集成隔离电源"],
  // ── 隔离广义 ──
  "隔离栅极驱动": ["栅极驱动", "驱动", "隔离"],
  "隔离式栅极驱动": ["栅极驱动", "驱动", "隔离"],
  "隔离栅极驱动器": ["栅极驱动器", "栅极驱动", "驱动", "隔离"],
  "隔离式栅极驱动器": ["栅极驱动器", "栅极驱动", "驱动", "隔离"],
  "非隔离栅极驱动器": ["栅极驱动器", "栅极驱动"],
  "非隔离栅极驱动": ["栅极驱动器", "栅极驱动"],
  "非隔离式栅极驱动": ["栅极驱动器", "栅极驱动"],
  "数字隔离器": ["隔离"],
  "隔离电源": ["电源", "隔离"],
  // ── CAN → CAN-FD: 孤立CAN升级为CAN-FD ──
  "CAN-FD": ["CAN"],
  // ── 传感器族: 子类 → 传感器 ──
  "电流传感器": ["传感器"],
  "温度传感器": ["传感器"],
  "压力传感器": ["传感器"],
  "位置传感器": ["传感器"],
  "速度传感器": ["传感器"],
  "线性位置传感器": ["位置传感器", "传感器"],
  "霍尔角度编码器": ["传感器"],
  "磁阻角度编码器": ["传感器"],
  "霍尔开关/锁存器": ["传感器"],
  "磁阻开关/锁存器": ["传感器"],
  // ── 以太网族: 子类 → 以太网 ──
  "交换机": ["以太网"],
  "网卡": ["以太网"],
  "以太网供电": ["以太网"],
  // ── 驱动族: 具体驱动 → 驱动 ──
  "低边驱动": ["驱动"],
  "高边驱动": ["驱动"],
  "马达驱动": ["驱动"],
  // ── 电源族 ──
  "电子保险丝": ["电源保护"],
  "理想二极管": ["电源保护"],
  "LDO": ["电源"],
  "DCDC": ["降压", "升压", "电源"],
  // ── 电池管理族 ──
  "线性充电": ["电池管理"],
  "电池监控": ["电池管理"],
  "BMS": ["电池管理"],
  // ── 开关族 ──
  "负载开关": ["开关"],
  "高边开关": ["开关"],
};

const PROMPT_TAGS = buildPromptTagList();

/** Safely execute a LLM-generated predicate function body. Returns false on any error. */
function safePredicate(fnBody: string, p: Record<string, any>): boolean {
  try {
    return new Function('p', fnBody)(p);
  } catch {
    return false;
  }
}

const SYSTEM_PROMPT = `你是资深半导体应用工程师，精通电源管理、信号链、接口隔离、传感器驱动四大领域。根据用户描述推断芯片品类和关键参数，输出JSON特征标签。

== 可用标签 ==
${PROMPT_TAGS}

== 电源管理 ==
- 理解VIN→VOUT→IOUT的关系。用户说"X转Y"或"X到Y"→X是Vin, Y是Vout
- 降压(step-down/buck)→DCDC; 升压(boost)→DCDC
- DCDC 是降压/升压/反激等拓扑的上位品类标签
- 线性稳压/LDO→LDO; 只说"电源芯片"且电压差小→优先LDO
- 电流单位: 用户说"1A"=1A, "200mA"=0.2A; 注意mA和A不要混淆
- LDO关键指标: 噪声/PSRR; DCDC关键指标: 开关频率/效率
- 理想二极管/ORing控制器→理想二极管; 关注最大电压、导通电阻、反向漏电流
- 电子保险丝/eFuse→电子保险丝; 关注输入电压、限流值、导通电阻
- 电源时序→电源时序; 高边驱动/高边开关→高边驱动
- 只说"Xv, Yv, Za"无品类词→不限定品类(用户可能接受LDO或DCDC)
- ★精确数值标签: 用户给出具体电压/电流数字时，直接生成对应的精确标签(如48v→Vin_48V, 70v→Vin_70V, 12vout→Vout_12V, 1a→Iout_1A)。不要只在静态标签列表里选，实际电压值就是正确的标签。精确值永远放进 features(硬需求)

== 信号链 ==
- 运放: 关注通道数、带宽(GBW)、轨到轨、Vos精度、静态功耗
- 比较器: 关注通道数、传播延迟、开漏/推挽输出
- ADC/DAC: 关注分辨率(bit,输出Xbit标签如12bit/16bit/24bit)、通道数、采样率、接口类型
- 电压基准: 关注输出电压、精度(%或ppm)、温漂
- 仪表放大器→仪表放大器; 差动放大器→差动放大器; 对数放大器→对数放大器
- 匹配电阻/匹配电阻网络/电阻网络→匹配电阻
- 传感器接口→传感器接口; 视频滤波/视频滤波器→视频滤波; 音频线路驱动→音频功放
- "精度高"→精密(≤1mV); "带宽XXMHz"→不强制品类(可能是运放/比较器/放大器)
- ★品类层级: 隔离放大器/仪表放大器/差动放大器/对数放大器 都是放大器的子类。用户说"隔离电压的运放"→ primary_category=隔离放大器, 不要同时输出运放标签(隔离放大器已包含运放含义)

== 接口与隔离 ==
- CAN→CAN-FD; LIN→LIN; RS-232/485→对应标签; SBC→SBC
- RS-232/485的收发数: X发Y收→输出XTYR格式标签(如3T5R即3发5收, 2T2R, 1T1R)
- RS-485的工作模式: 半双工→输出半双工标签; 全双工→输出全双工标签
- 数字隔离器: 关注通道数(F/R)、数据速率(Mbps)、隔离电压(kVrms)、CMTI
- 以太网: 百兆/千兆/2.5G + 接口(RGMII/SGMII/QSGMII) + 端口数
- 以太网介质接口(线路侧, 区别于MAC侧RGMII/SGMII): "tx接口/TX/100Base-TX/双绞线/铜口/百兆电口"→100Base-TX; "fx/光口/光纤/100FX"→100FX。注意tx指线路介质100Base-TX, 不是MAC侧的RGMII/SGMII, 不要混淆
- T1单对线: 100Base-T1/1000Base-T1→T1-PHY
- 隔离产品: 用户说"隔离"不加kV→用通用"隔离"标签; 明确说5kV/3kV才加对应kVrms
- 非隔离/不隔离→不加隔离标签
- TVS/ESD保护器件→输出TVS/ESD标签, 不输出CAN-FD(CAN是应用场景非品类)

== 传感器与驱动 ==
- 栅极驱动: 隔离/非隔离、通道数、峰值驱动电流(A)
- 非隔离栅极驱动→非隔离栅极驱动; 隔离栅极驱动→隔离栅极驱动
- 马达驱动: 峰值电流、通道数、微步进
- 温度传感器: 精度(°C)、接口(I2C/模拟)、分辨率
- 传感器按手册子表优先：线性位置传感器、霍尔角度编码器、磁阻角度编码器、霍尔开关/锁存器、磁阻开关/锁存器不要硬归并；用户明确说“磁阻角度编码器”时输出磁阻角度编码器，明确说“霍尔角度编码器”时输出霍尔角度编码器；泛“位置传感器”才输出位置传感器
- 霍尔/磁阻是传感器技术路线：用户说“霍尔电流传感器”→电流传感器+霍尔；“磁阻电流传感器”→电流传感器+磁阻；不要把霍尔/磁阻扩到无证据的马达驱动
- 电流传感器: 隔离/非隔离、量程、精度
- 线性充电→线性充电; 电池充电→线性充电; 高边驱动/高边开关→高边驱动
- EMI滤波器/共模滤波器→EMI滤波器

== 电池管理(BMS) ==
- BMS/电池保护/电池管理→BMS
- 用户说\"X节\"→节数(X=1/2/3/4...16)，输出BMS标签
- 次级保护/二级保护→BMS
- 电池均衡→BMS; 单体保护→BMS
- BMS芯片关键指标: 节数、保护功能(过充/过放/过流/短路)、检测方式(MOS/Rsense)

== 逻辑与电平 ==
- 与门/或门/非门/逻辑门/逻辑芯片→逻辑门; 关注通道数
- 自动方向/电平转换/电压转换→电平转换
- TTL/CMOS兼容→电平转换

== 高速数据 ==
- 复用器/解复用器/Mux/DeMux→高速数据复用器
- MLVDS→MLVDS; 音频总线→音频总线

== Few-shot 示例 ==
Q: CAN FD 车规 低功耗唤醒
A: {"features":["CAN-FD","低功耗唤醒"],"nice_features":["车规AEC-Q100"],"vendor":null,"category_hint":"接口","explanation":"CAN FD收发器，硬需求=支持低功耗唤醒；车规是偏好","confidence":"high"}

Q: 隔离 RS-485 高速
A: {"features":["隔离","RS-485","20Mbps"],"nice_features":[],"vendor":null,"category_hint":"隔离接口","explanation":"隔离RS-485收发器，硬需求=隔离+20Mbps高速","confidence":"high"}

Q: RS-232 5发3收
A: {"features":["RS-232","3T5R"],"nice_features":[],"vendor":null,"category_hint":"接口","explanation":"RS-232收发器，3路发送5路接收","confidence":"high"}

Q: 隔离 485 高速 半双工
A: {"features":["隔离","RS-485","20Mbps","半双工"],"nice_features":[],"vendor":null,"category_hint":"隔离接口","explanation":"隔离RS-485收发器，硬需求=隔离+高速+半双工","confidence":"high"}

Q: LDO 5V 1A
A: {"features":["LDO","Vout_5V","Iout_1A"],"nice_features":[],"vendor":null,"category_hint":"电源","explanation":"LDO线性稳压器，硬需求=5V输出1A","confidence":"high"}

Q: 48v转12v 1a 最大输入支持70v
A: {"features":["DCDC","Vin_70V","Vout_12V","Iout_1A"],"nice_features":[],"vendor":null,"category_hint":"电源","explanation":"降压DCDC，硬需求=输入耐压70V输出12V/1A","confidence":"high"}

Q: BMS 3节 电池保护
A: {"features":["BMS"],"nice_features":[],"vendor":null,"category_hint":"电池管理","explanation":"3节电池保护BMS芯片","confidence":"high"}

Q: 非隔离栅极驱动
A: {"features":["非隔离栅极驱动"],"nice_features":[],"vendor":null,"category_hint":"驱动","explanation":"非隔离栅极驱动芯片","confidence":"high"}

Q: 模拟开关 8通道
A: {"features":["模拟开关","8通道"],"nice_features":[],"vendor":null,"category_hint":"接口","explanation":"8通道模拟开关","confidence":"high"}

Q: 理想二极管 12V
A: {"features":["理想二极管","Vin_12V"],"nice_features":[],"vendor":null,"category_hint":"电源","explanation":"理想二极管ORing控制器，12V输入","confidence":"high"}

Q: 电子保险丝 高压
A: {"features":["电子保险丝","高压(≥30V)"],"nice_features":[],"vendor":null,"category_hint":"电源","explanation":"高压电子保险丝eFuse","confidence":"high"}

Q: 直流马达驱动
A: {"features":["马达驱动"],"nice_features":[],"vendor":null,"category_hint":"驱动","explanation":"直流马达驱动芯片","confidence":"high"}

Q: can-fd 带特定帧唤醒
A: {"features":["CAN-FD","特定帧唤醒"],"nice_features":[],"vendor":null,"category_hint":"接口","explanation":"CAN FD收发器，硬需求=支持特定帧唤醒功能","confidence":"high"}

Q: 车规百兆phy tx接口
A: {"features":["百兆","100Base-TX"],"nice_features":["车规AEC-Q100"],"vendor":null,"category_hint":"以太网","explanation":"百兆以太网PHY，硬需求=百兆+TX铜口；车规是偏好","confidence":"high"}

Q: 千兆phy 光口
A: {"features":["千兆","100FX"],"nice_features":[],"vendor":null,"category_hint":"以太网","explanation":"千兆以太网PHY，光口对应光纤介质","confidence":"high"}

Q: 隔离电压的运放有吗
A: {"features":["隔离放大器"],"nice_features":[],"vendor":null,"category_hint":"放大器","explanation":"隔离放大器就是隔离型的运放，不需要额外的运放或隔离标签","confidence":"high"}

Q: 有没有电流传感器 m7内核的mcu 支持can
A: {"features":["电流传感器","MCU/DSP","CAN-FD"],"nice_features":[],"vendor":null,"category_hint":"传感器","explanation":"用户同时在找电流传感器和带CAN的M7 MCU","confidence":"medium"}

Q: rs485 dfn封装
A: {"features":["RS-485"],"nice_features":["DFN封装"],"constraint_predicates":{"DFN封装":"return /Package\\s*[:：]\\s*[^|]*DFN/i.test(p._params || '')"},"vendor":null,"category_hint":"接口","explanation":"RS-485收发器，DFN封装从_params的Package字段匹配","confidence":"high"}

Q: DCDC sop8封装
A: {"features":["DCDC"],"nice_features":["SOP8封装"],"constraint_predicates":{"SOP8封装":"return /Package\\s*[:：]\\s*[^|]*SOP-?8/i.test(p._params || '')"},"vendor":null,"category_hint":"电源","explanation":"DCDC电源芯片，SOP8封装从_params的Package字段匹配","confidence":"high"}

Q: LDO msl1
A: {"features":["LDO"],"nice_features":["MSL1"],"constraint_predicates":{"MSL1":"return /MSL\\s*[:：]\\s*1\\b/i.test(p._params || '')"},"vendor":null,"category_hint":"电源","explanation":"LDO稳压器，MSL 1级防潮，从_params的MSL字段匹配","confidence":"high"}

Q: 运放 工业级温度
A: {"features":["运放"],"nice_features":["工业级"],"constraint_predicates":{"工业级":"return /Rating\\s*[:：]\\s*Industrial/i.test(p._params || '')"},"vendor":null,"category_hint":"放大器","explanation":"运放，偏好工业级温度范围，从_params的Rating字段匹配","confidence":"high"}

== 约束谓词(constraint_predicates) ==
当 nice_features 中的标签需要结构化的参数匹配（不只是简单 token），在 constraint_predicates 中提供 JavaScript 谓词函数体。
产品 p 的字段: p._params("Key:Val|Key:Val"格式), p._section(品类), p._features(token), p._detail_intro, p._detail_features
谓词用 RegExp 匹配 _params 中对应的 Key 字段即可。不提供的 nice_feature 回退到文本匹配。

== features vs nice_features 判定规则 ==
放入 features (硬需求—缺了就不是用户要的东西):
- 品类标签(隔离CAN, LDO, DCDC, 运放, 隔离放大器, 栅极驱动...)
- 具体功能特性(特定帧唤醒, 低功耗唤醒, 隔离, 半双工, 全双工, 轨到轨...)
- 精确数值参数(Vin_12V, Iout_1A, Vout_3.3V, 20Mbps, 8通道, 16:1...)
- 接口协议(RS-485, I2C, CAN-FD, LIN, SGMII, 100Base-TX...)

放入 nice_features (软偏好—满足更好但不满足也能接受):
- 质量/可靠性等级(车规AEC-Q100, 工业级, 消费级)
- 纯性能修饰(低噪声, 高PSRR, 高速(≥50MHz))
- 速度描述词当品类已明确时(千兆→以太网已有, 百兆→以太网已有。例外: 用户只说\"千兆phy\"无其他约束时千兆进features)
- 封装/MSL/温度范围等(用户明确指定时放入nice_features，系统自动根据实际数据匹配决定是否升级为硬约束)

如果拿不准，优先放 features。

== 意图识别(intent) ==
- 默认 intent="spec_search"(按品类/参数找料)。
- 仅当用户明确在"用某竞品型号找国产替代/pin-to-pin/兼容料"时 intent="cross_ref", 并把竞品型号填入 cross_ref_target(大写)。例: "把我现在用的那颗TI双通道隔离换成国产"→intent="cross_ref"(若有明确型号则填, 没有则留空走品类搜索)。
- 注意: 大多数"型号+替代"查询已被规则层拦截, LLM 只需兜底口语化、没明说型号的模糊表达。拿不准就用 spec_search, 不要乱标 cross_ref。

仅输出JSON: {"primary_category":"","features":[],"nice_features":[],"constraint_predicates":{},"vendor":null,"category_hint":"","explanation":"","confidence":"high|medium|low","intent":"spec_search|cross_ref","cross_ref_target":""}`;

export async function POST(req: NextRequest) {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  const t0 = Date.now();
  let parsed: ParseResult | undefined;
  let tParse = 0, tLlm = 0;
  let query = '';
  try {
    const body = await req.json();
    query = body.query;
    const vendor = body.vendor || null;
    if (!query || !DEEPSEEK_API_KEY) {
      return NextResponse.json({ features: [], vendor: null, category_hint: null, explanation: "LLM未配置", confidence: "low", suggestions: [] });
    }

    // PN detection: use pn_lookup index (65KB) instead of loading all 5.7MB
    try {
      const match = findProductByPN(query);
      if (match) {
        return NextResponse.json({ features: [], vendor: null, category_hint: null, explanation: "PN exact match", confidence: "high", suggestions: [] });
      }
    } catch {} // If data file missing, fall through to LLM

    // ── Deterministic query parser (bypass LLM for resolved queries) ──
    parsed = parseQuery(query);
    tParse = Date.now() - t0;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let llmResult: any;
    let llmCalled = false;
    let llmSucceeded = false;
    let llmRawFeatures: string[] = [];
    let llmError = '';
    if (!parsed.needsLLM) {
      // Parser confident: skip LLM entirely
      llmResult = { features: parsed.features, exclude_tags: parsed.exclude_tags, vendor: vendor || null, category_hint: parsed.category_hint, explanation: parsed.explanation, confidence: parsed.confidence, suggestions: [] };
    } else {
      // Parser not confident: use LLM with parser context
      const llmQuery = parsed.residualQuery ? `${query}

[Parser已识别: ${parsed.features.join(', ') || '无'}]` : query;

      // Promise.race timeout — never discard parser features on LLM failure
      const fallbackResult = {
        features: parsed.features,
        exclude_tags: parsed.exclude_tags,
        vendor: vendor || null,
        category_hint: parsed.category_hint,
        explanation: parsed.explanation,
        confidence: 'low',
        suggestions: []
      };
      llmCalled = true;
      try {
      const response = await Promise.race([
        fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
          body: JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: llmQuery }], temperature: 0.1, max_tokens: 300 }),
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), 12000))
      ]);
      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`LLM HTTP ${response.status}: ${errBody.slice(0, 200)}`);
      }
      const data = await response.json();
      const llmContent = data.choices?.[0]?.message?.content || "";
      const jsonMatch = llmContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('LLM bad JSON');
      llmResult = JSON.parse(jsonMatch[0]);
      llmRawFeatures = [...(llmResult.features || [])];
      llmSucceeded = true;
      // Merge parser features (parser is authoritative for deterministic matches)
      if (parsed.features.length > 0) {
        llmResult.features = [...new Set([...parsed.features, ...(llmResult.features || [])])];
      }
      // Merge exclude_tags from parser
      if (parsed.exclude_tags && parsed.exclude_tags.length > 0) {
        llmResult.exclude_tags = parsed.exclude_tags;
      }
      } catch (e) {
        llmError = e instanceof Error ? e.message : String(e);
        // LLM timeout/error → fallback to parser output, never discard features
        llmResult = fallbackResult;
      }
    }
    clearTimeout(timeout);
    tLlm = Date.now() - t0 - tParse;

    // Resolve category hierarchy: when a subclass is present, remove umbrella parent.
    // Runs for BOTH paths (parser-only and LLM) to ensure consistency.
    if (llmResult.features && llmResult.features.length > 0) {
      const featureSet = new Set(llmResult.features);
      for (const [subclass, parents] of Object.entries(CATEGORY_HIERARCHY)) {
        if (featureSet.has(subclass)) {
          for (const parent of parents) {
            featureSet.delete(parent);
          }
        }
      }
      llmResult.features = [...featureSet];
    }

    const result = llmResult;
    // Store LLM-generated constraint predicates for downstream matching
    result._predicates = (llmResult.constraint_predicates || {}) as Record<string, string>;
    delete (result as any).constraint_predicates; // move to internal key
    result.suggestions = [];
    result._debug = { requestId, timings: { parse: tParse, llm: tLlm }, llmCalled, llmSucceeded, llmError, llmRawFeatures, parserFeatures: parsed.features, residualQuery: parsed.residualQuery || '' };
    // ── LLM-driven must/nice assembly ──
    // Parser's must + mustMeta are the authoritative structured output.
    // LLM's nice_features tells us which tags to relax from must to nice.
    // LLM's features add tags the parser missed.
    const llmNiceTags = new Set((llmResult.nice_features || []) as string[]);
    const llmWasUsed = parsed.needsLLM;

    if (parsed.must && parsed.must.length > 0) {
      // Start with parser's must (already filtered: strongestByFamily, category, etc.)
      result.must = [...parsed.must];
      result.mustMeta = [...(parsed.mustMeta || [])];

      // Remove tags that LLM classifies as nice (but keep in nice array)
      if (llmWasUsed && llmNiceTags.size > 0) {
        for (let i = result.must.length - 1; i >= 0; i--) {
          if (llmNiceTags.has(result.must[i])) {
            if (!result.nice) result.nice = [];
            result.nice.push(result.must[i]);
            result.must.splice(i, 1);
            if (result.mustMeta) result.mustMeta.splice(i, 1);
          }
        }
      }

      // Add LLM features that parser didn't produce → default to must (unless in llmNiceTags)
      const parserKnown = new Set([...parsed.must, ...(parsed.nice || [])]);
      for (const f of result.features) {
        if (parserKnown.has(f) || result.must.includes(f)) continue;
        // Skip cascade Vin/Iout/通道/口/Vout tags (weaker than parser's strongest)
        const maxVin = Math.max(...result.must
          .filter((s: string) => /^Vin_(\d+\.?\d*)V$/.test(s))
          .map((s: string) => parseFloat(s.match(/^Vin_(\d+\.?\d*)V$/)![1])), 0);
        const maxIout = Math.max(...result.must
          .filter((s: string) => /^Iout_(\d+\.?\d*)A$/.test(s))
          .map((s: string) => parseFloat(s.match(/^Iout_(\d+\.?\d*)A$/)![1])), 0);
        const maxChan = Math.max(...result.must
          .filter((s: string) => /^(\d+)通道$/.test(s))
          .map((s: string) => parseInt(s.match(/^(\d+)通道$/)![1])), 0);
        const maxPort = Math.max(...result.must
          .filter((s: string) => /^(\d+)口$/.test(s))
          .map((s: string) => parseInt(s.match(/^(\d+)口$/)![1])), 0);
        const maxVout = Math.max(...result.must
          .filter((s: string) => /^Vout_(\d+\.?\d*)V$/.test(s))
          .map((s: string) => parseFloat(s.match(/^Vout_(\d+\.?\d*)V$/)![1])), 0);
        const vinM = f.match(/^Vin_(\d+\.?\d*)V$/);
        const ioutM = f.match(/^Iout_(\d+\.?\d*)A$/);
        const chanM = f.match(/^(\d+)通道$/);
        const portM = f.match(/^(\d+)口$/);
        const voutM = f.match(/^Vout_(\d+\.?\d*)V$/);
        if (vinM && parseFloat(vinM[1]) < maxVin) continue;
        if (ioutM && parseFloat(ioutM[1]) < maxIout) continue;
        if (chanM && parseInt(chanM[1]) < maxChan) continue;
        if (portM && parseInt(portM[1]) < maxPort) continue;
        if (voutM && parseFloat(voutM[1]) < maxVout) continue;
        if (llmNiceTags.has(f)) {
          if (!result.nice) result.nice = [];
          result.nice.push(f);
        } else {
          result.must.push(f);
          if (result.mustMeta) {
            const vFM = f.match(/^Vout_(\d+\.?\d*)V$/);
            const iFM = f.match(/^Iout_(\d+\.?\d*)A$/);
            const vinFM = f.match(/^Vin_(\d+\.?\d*)V$/);
            if (vFM) result.mustMeta.push({ tag: f, dimension: 'spec', family: 'Vout', value: parseFloat(vFM[1]) });
            else if (iFM) result.mustMeta.push({ tag: f, dimension: 'spec', family: 'Iout', value: parseFloat(iFM[1]) });
            else if (vinFM) result.mustMeta.push({ tag: f, dimension: 'spec', family: 'Vin', value: parseFloat(vinFM[1]) });
            else result.mustMeta.push({ tag: f, dimension: CATEGORY_TAG_NAMES.has(f) ? 'category' : 'spec' });
          }
        }
      }
      // Carry forward LLM nice_features that parser didn't produce — these were previously
      // dropped. LLM's nice classification is respected (they stay in nice), but the tags
      // must reach the data-driven promotion step below rather than being silently discarded.
      for (const f of (llmResult.nice_features || [])) {
        if (!parserKnown.has(f) && !result.features.includes(f)) {
          if (!result.nice) result.nice = [];
          if (!result.nice.includes(f)) result.nice.push(f);
        }
      }
      result.nice = [...new Set([...(result.nice || []), ...(parsed.nice || [])])];
      result.category_hint = result.category_hint || parsed.category_hint;
    } else {
      // No parser must — use LLM features with LLM classification
      const llmNice = (llmResult.nice_features || []) as string[];
      const niceSet = new Set(llmNice);
      result.must = result.features.filter((f: string) => typeof f === 'string' && !niceSet.has(f));
      result.nice = llmNice;
      result.mustMeta = result.must.map((f: string) => ({ tag: f, dimension: 'spec' }));
    }
    // Apply category hierarchy to must tags (resolve subclass/parent conflicts)
    if (result.must && result.must.length > 0) {
      const mustSet = new Set(result.must);
      for (const [subclass, parents] of Object.entries(CATEGORY_HIERARCHY)) {
        if (mustSet.has(subclass)) {
          for (const parent of parents) {
            mustSet.delete(parent);
          }
        }
      }
      result.must = [...mustSet];
      if (result.mustMeta) {
        result.mustMeta = result.mustMeta.filter((m: any) => result.must.includes(m.tag));
      }
    }
    // Dynamic umbrella removal: if must has tag A (hint=X) AND tag X, remove X.
    // e.g. "DCDC"(hint="电源") + "电源" → remove "电源"
    // Derived from CATEGORY_RULES category_hint, no manual mapping needed.
    if (result.must && result.must.length > 0) {
      const mustSet = new Set(result.must);
      let changed = false;
      for (const tag of result.must) {
        const hint = CATEGORY_HINT_MAP[tag];
        if (hint && hint !== tag && mustSet.has(hint)) {
          mustSet.delete(hint);
          changed = true;
        }
      }
      if (changed) {
        result.must = [...mustSet];
        if (result.mustMeta) {
          result.mustMeta = result.mustMeta.filter((m: any) => result.must.includes(m.tag));
        }
      }
    }
    // ── 透传排序意图 sortKey(高/低 + 参数 → 数值排序) ──
    // 独立于 must: 排序意图对所有品类有效(高PSRR的LDO / 大电流的DCDC等), 不门控以太网.
    if (parsed.sortKey) {
      result.sortKey = parsed.sortKey;
    }
    // ── 透传意图分类(2026-06-12): cross_ref 竞品反查由前端用 crossRefSearch 确定性检索"可替代产品"字段 ──
    // 优先级: 规则层(parsed)识别的 cross_ref 最权威; 规则未识别时采纳 LLM 兜底判断.
    if (parsed.intent === 'cross_ref' && parsed.crossRefTarget) {
      result.intent = 'cross_ref';
      result.crossRefTarget = parsed.crossRefTarget;
    } else if (result._llmCrossRef) {
      result.intent = 'cross_ref';
      result.crossRefTarget = result._llmCrossRef;
    } else {
      result.intent = 'spec_search';
    }
    const fixConf = () => { if (result.confidence === "medium") result.confidence = "high"; };

    // Post-process: channel count
    const chM = query.match(/(\d+)\s*[通道路]/);
    if (chM) { const t = chM[1] + "通道"; if (!result.features.includes(t)) { result.features.push(t); fixConf(); } }

    // Post-process: current
    // ※ parser 的 PARAM_RULES(A/mA 规则)已正确生成 Iout_ 累积标签并透传进 must。
    //   产品侧也是 Iout_ 累积标签(6A产品含 Iout_0.5A~Iout_6A)。token 匹配天然实现
    //   "≥阈值"语义: 查6A → 6A及更大电流器件命中, 1A器件无 Iout_6A token 出局。
    //   旧的硬编码阶梯 [1,2,3,5,10] post-process 已删除(会把 6A 误映射成 5A,
    //   且产品侧无 plain "NA" 标签使 else 分支无效)。排序由 sortKey 处理。
    const bigCurrent = /(?:大|高)(?:电流|驱动|功率|输出)/.test(query) || /电流.{0,3}(?:大|高)/.test(query);

    // Post-process: "大电流" without explicit number → add minimum current tag
    if (bigCurrent && !result.features.some((f: string) => /^\d+A$/.test(f) || f.startsWith("Iout_"))) {
      const isGate = result.features.some((f: string) => /栅极驱动|隔离栅极驱动|马达驱动/.test(f));
      const isPower = result.features.some((f: string) => /DCDC|LDO|电源|降压|升压/.test(f));
      if (isGate) { result.features.push("5A"); fixConf(); }
      else if (isPower) { result.features.push("Iout_2A"); fixConf(); }
    }

    // Post-process: 高速 fix for RS-485 context
    if (result.features.includes("高速(≥50MHz)") && (result.features.includes("RS-485") || result.features.includes("RS-232"))) {
      result.features = result.features.filter((f: string) => f !== "高速(≥50MHz)");
      for (const mbps of ["50Mbps", "20Mbps", "10Mbps", "5Mbps"]) { if (!result.features.includes(mbps)) { result.features.push(mbps); break; } }
      fixConf();
    }

    // Post-process: isolated RS-485 max = 20Mbps. Cap any higher rate.
    if (result.features.includes("隔离") && result.features.includes("RS-485")) {
      const highRates = result.features.filter((f: string) => {
        const m = f.match(/^(\d+)Mbps$/); return m && parseInt(m[1]) > 20;
      });
      if (highRates.length > 0) {
        result.features = result.features.filter((f: string) => !highRates.includes(f));
        if (!result.features.includes("20Mbps")) result.features.push("20Mbps");
        fixConf();
      }
    }

    // Post-process: RS-485/232 mutual exclusion — keep only the one matching query
    if (result.features.includes("RS-485") && result.features.includes("RS-232")) {
      if (/232|rs-?232/i.test(query)) result.features = result.features.filter((f: string) => f !== "RS-485");
      else result.features = result.features.filter((f: string) => f !== "RS-232");
      fixConf();
    }

    // Post-process: strip noise Vin/Vout from LLM (keeping only reasonable values)
    {
      const bad = result.features.filter((f: string) => 
        (/^Vin_\d+\.?\d*V$/.test(f) && parseFloat(f.match(/\d+\.?\d*/)![0]) > 100) ||
        (/^Vout_\d+\.?\d*V$/.test(f) && parseFloat(f.match(/\d+\.?\d*/)![0]) > 60)
      );
      if (bad.length) { result.features = result.features.filter((f: string) => !bad.includes(f)); }
    }

    // Post-process: strip redundant 高压/高耐压 when Vin ≤ 30V already specified
    {
      const maxVin = Math.max(...result.features
        .filter((f: string) => /^Vin_(\d+\.?\d*)V$/.test(f))
        .map((f: string) => parseFloat(f.match(/^Vin_(\d+\.?\d*)V$/)![1])), 0);
      const hasLowVoltageContext = maxVin > 0 && maxVin <= 30;
      const hasNoVinButAutomotive = maxVin === 0 && /车规|汽车|车载|12V/.test(query);
      if (hasLowVoltageContext || hasNoVinButAutomotive) {
        result.features = result.features.filter((f: string) => f !== "高压(≥30V)" && f !== "高耐压");
        if (result.must) result.must = result.must.filter((f: string) => f !== "高压(≥30V)" && f !== "高耐压");
      }
    }

    // Post-process: strip non-standard Mbps (only 1/2/5/8/10/20/50/100/150/200 allowed)
    {
      const badRate = result.features.filter((f: string) => 
        /^\d+[kKMG]?(?:bps|Baud)$/.test(f) && !/^(1|2|5|8|10|20|50|100|150|200)Mbps$/.test(f)
      );
      if (badRate.length) { result.features = result.features.filter((f: string) => !badRate.includes(f)); fixConf(); }
    }

    // Post-process: force RS-232 when query clearly says 232
    if (/232|rs-?232/i.test(query) && !result.features.includes("RS-232")) {
      result.features = result.features.filter((f: string) => f !== "RS-485");
      if (!result.features.includes("RS-232")) result.features.push("RS-232");
      fixConf();
    }

    // Post-process: X发Y收 → XTYR tag (safety net for LLM)
    const txrMatch = query.match(/(\d+)\s*发\s*(\d+)\s*收/);
    if (txrMatch) {
      const txrTag = txrMatch[1] + 'T' + txrMatch[2] + 'R';
      if (!result.features.includes(txrTag)) {
        result.features = result.features.filter((f: string) => !/\d+T\d+R/.test(f));
        result.features.push(txrTag);
      }
    }

    // Post-process: XA / X安 → Iout_XA
    const ampMatch = query.match(/(\d+\.?\d*)\s*[Aa安]/);
    if (ampMatch) {
      const ampTag = 'Iout_' + ampMatch[1] + 'A';
      result.features = result.features.filter((f: string) => !f.endsWith('A') || f.startsWith('Iout_'));
      if (!result.features.includes(ampTag)) {
        result.features.push(ampTag);
        // Also add cumulative lower tags
        const val = parseFloat(ampMatch[1]);
        [0.5,1,2,3,4,5,6,7,8,10,12,15,20].forEach(v => {
          if (v <= val) result.features.push('Iout_' + (v === Math.floor(v) ? v : v) + 'A');
        });
      }
    }

    // Cleanup: convert bare "XA" in features to "Iout_XA"
    result.features = result.features.map((f: string) => {
      const m = f.match(/^(\d+\.?\d*)\s*[Aa]$/);
      return m ? 'Iout_' + m[1] + 'A' : f;
    });

    // Post-process: price-only intent should not hallucinate technical tags
    if (/便宜|廉价|低价|省钱/.test(query)) {
      result.features = [];
      result.confidence = 'low';
      result.explanation = '价格导向不是稳定参数约束，建议改用品类+关键参数搜索';
    }

    // Post-process: 半双工/全双工 from query
    if (/半双工/.test(query) && !result.features.includes('半双工') && !/非隔离/.test(query)) {
      result.features = result.features.filter((f: string) => f !== '全双工');
      result.features.push('半双工');
    }
    if (/全双工/.test(query) && !result.features.includes('全双工')) {
      result.features = result.features.filter((f: string) => f !== '半双工');
      result.features.push('全双工');
    }

    // Post-process: force new category tags from query keywords
    const forceCat: Record<string, string> = {
      "仪表放大": "仪表放大器", "差动放大": "差动放大器", "对数放大": "对数放大器",
      "匹配电阻": "匹配电阻", "电阻网络": "匹配电阻",
      "视频滤波": "视频滤波", "音频线路": "音频功放", "音频驱动": "音频功放",
      "线性充电": "线性充电", "高边驱动": "高边驱动", "高边开关": "高边驱动",
      "电子保险丝": "电子保险丝", "efuse": "电子保险丝",
      "电源时序": "电源时序", "逻辑门": "逻辑门", "与门": "逻辑门",
      "BMS": "BMS", "电池保护": "BMS", "电池管理": "BMS", "电池均衡": "BMS",
      "磁阻角度编码器": "磁阻角度编码器", "霍尔角度编码器": "霍尔角度编码器", "线性位置传感器": "线性位置传感器",
      "磁阻开关": "磁阻开关/锁存器", "霍尔开关": "霍尔开关/锁存器",
    };
    for (const [keyword, tag] of Object.entries(forceCat)) {
      if (query.includes(keyword) && !result.features.includes(tag)) {
        result.features.push(tag);
        fixConf();
        break;
      }
    }

    // Post-process: 非隔离 / 不隔离 → strip isolation tags + handle gate drivers
    if (/非隔离|不隔离|无隔离/.test(query)) {
      // 1. Strip isolation-related tags
      result.features = result.features.filter((f: string) =>
        !f.includes('kVrms') && f !== '隔离' && f !== '隔离放大器' &&
        f !== '隔离栅极驱动' && f !== '隔离电源' && f !== '隔离RS485' &&
        f !== '隔离CAN' && f !== '隔离I2C' &&
        !f.startsWith('5kVrms') && !f.startsWith('3kVrms')
      );
      // 2. 非隔离栅极驱动保持独立 canonical；不能折叠成父类“栅极驱动”，否则前端会把互斥子品类又混回去。
      if (/栅极|驱动/.test(query) && !result.features.includes("非隔离栅极驱动")) {
        if (!result.features.includes("栅极驱动")) result.features.push("栅极驱动");
      }
      // 3. Universal fallback: ensure category tag wasn't lost by LLM
      //    「非隔离 X」→ X must be present even if LLM forgot
      const CATEGORY_TAGS = ['RS-485','RS-232','CAN-FD','LIN','I2C','隔离I2C','隔离CAN','隔离RS485','集成隔离电源的隔离CAN','集成隔离电源的隔离RS485','栅极驱动','非隔离栅极驱动',
        '隔离栅极驱动','电流传感器','运放','放大器','隔离放大器',
        '模拟开关','电平转换','马达驱动','DCDC','LDO',
        'ADC','DAC','比较器','电压基准','数字隔离器'];
      const hasCategoryTag = result.features.some((f: string) => CATEGORY_TAGS.includes(f));
      if (!hasCategoryTag) {
        if (/485|rs-?485/i.test(query)) result.features.push('RS-485');
        else if (/232|rs-?232/i.test(query)) result.features.push('RS-232');
        else if (/can|can[ -]?fd/i.test(query)) result.features.push('CAN-FD');
        else if (/i2c|i²c/i.test(query)) result.features.push('I2C');
        else if (/电流传感/i.test(query)) result.features.push('电流传感器');
        else if (/运放|运算放大/i.test(query)) result.features.push('运放');
        else if (/模拟开关/i.test(query)) result.features.push('模拟开关');
        else if (/马达驱动|电机驱动/i.test(query)) result.features.push('马达驱动');
        else if (/电平转换/i.test(query)) result.features.push('电平转换');
        else if (/栅极|驱动/.test(query)) result.features.push('栅极驱动');
        fixConf();
      }
      fixConf();
    }

    // Post-process: TVS/ESD/保护 → strip CAN-FD + strip noise tags
    if (/(?:TVS|ESD|tvs|esd|保护|防护|防雷|防静电)/.test(query)) {
      result.features = result.features.filter((f: string) =>
        f !== "CAN-FD" && f !== "CAN" && f !== "高耐压"
      );
      if (!result.features.includes("TVS/ESD")) result.features.push("TVS/ESD");
      fixConf();
    }

    // Post-process: BMS/电池 query → strip TVS/ESD (LLM confusion)
    if (/BMS|电池保护|电池管理|电池均衡|电池监控/.test(query)) {
      result.features = result.features.filter((f: string) => f !== "TVS/ESD");
    }

    // Post-process: strip noise tags (descriptive words, not real product tags)
    result.features = result.features.filter((f: string) =>
      !["低压", "直流", "ESD保护"].includes(f)
    );

    // ═══ Whitelist filter: strip any tag not in valid vocabulary ═══
    const VALID_TAGS = new Set([
      "低功耗(≤50µA)","低功耗唤醒","CAN-FD","特定帧唤醒","VIO","高耐压","LIN",
      "轨到轨","高速(≥50MHz)","中速(≥10MHz)","超低功耗(≤1µA)","精密(≤1mV)","车规AEC-Q100","高压(≥30V)",
      "工业级","消费级","千兆","2.5G","百兆","100FX","100Base-TX","T1-PHY","SGMII","RGMII","QSGMII","交换机","网卡",
      "以太网","以太网供电","Pin-to-Pin兼容","5kVrms隔离","3kVrms隔离","隔离电源","隔离CAN","隔离RS485","集成隔离电源的隔离CAN","集成隔离电源的隔离RS485","隔离I2C","I2C","RS-485","RS-232","MLVDS",
      "LDO","DCDC","ADC","DAC","比较器","电压基准","运放","放大器","隔离放大器","栅极驱动","非隔离栅极驱动",
      "隔离栅极驱动","数字隔离器","复位芯片","IO扩展","模拟开关","负载开关","马达驱动","隔离","电流传感器",
      "温度传感器","压力传感器","位置传感器","速度传感器","降压","升压","SBC","电平转换","PMIC","DrMOS","LED驱动","MCU/DSP","低导通电阻","理想二极管",
      "串联型电压基准","并联型电压基准","直流马达驱动","步进马达驱动",
      "TVS/ESD","EMI滤波器","BMS","电子保险丝","电源时序","视频滤波","音频功放","音频总线","匹配电阻",
      "逻辑门","电池监控","传感器接口","仪表放大器","差动放大器","对数放大器","线性充电","高边驱动",
      "低边驱动","氮化镓功率芯片","零漂运算放大器","高压运算放大器","低压运算放大器","隔离ADC",
      "高速数据复用器","电压基准放大器","半双工","全双工","非管理型","低噪声","高PSRR","霍尔","磁阻","TMR","AMR","SIC","SiC","低漂移","迟滞","过流保护",
    ]);
    const VALID_PATTERNS = [
      /^Vin_[\d.]+V$/, /^Vout_[\d.]+V$/, /^Iout_[\d.]+A$/,
      /^\d+Mbps$/, /^\d+通道$/, /^\d+T\d+R$/, /^\d+:\d+$/,
      /^\d+口$/, /^\d+口交换机$/, /^\d+bit$/, /^\d+A$/,
    ];
    const strippedTags: string[] = [];
    result.features = result.features.filter((f: string) => {
      if (VALID_TAGS.has(f)) return true;
      if (VALID_PATTERNS.some(p => p.test(f))) return true;
      strippedTags.push(f);
      return false;
    });
    if (strippedTags.length > 0) {
      console.log(`[whitelist] stripped: ${strippedTags.join(", ")}`);
    }

    // Post-process: ideal diode with low Vin → strip 高压(≥30V)
    if (result.features.includes("理想二极管")) {
      const voltages = [...query.matchAll(/(\d+\.?\d*)\s*v/gi)].map(m => parseFloat(m[1]));
      if (voltages.length > 0 && voltages.every((v: number) => v < 30)) {
        result.features = result.features.filter((f: string) => f !== "高压(≥30V)");
      }
    }

    // Post-process: LDO/DCDC voltage tags — run unconditionally
    // Voltage extraction: only add standard Vin(5/12/24) and Vout(3.3/5/12)
    {
      const voltages = [...query.matchAll(/(\d+\.?\d*)\s*v/gi)].map(m => parseFloat(m[1]));
      const stdVin = [5, 12, 24];
      const stdVout = [3.3, 5, 12];
      if (voltages.length >= 1 && !result.features.some((f: string) => f.startsWith("Vin_"))) {
        const v = voltages[0];
        const closest = stdVin.filter(s => s >= v)[0];
        if (closest) {
          const tag = `Vin_${closest}V`;
          if (!result.features.includes(tag)) { result.features.push(tag); fixConf(); }
        }
      }
      if (voltages.length >= 2 && !result.features.some((f: string) => f.startsWith("Vout_"))) {
        const v = voltages[1];
        const closest = stdVout.filter(s => s >= v)[0];
        if (closest) {
          const tag = `Vout_${closest}V`.replace(/\.0V/, "V");
          if (!result.features.includes(tag)) { result.features.push(tag); fixConf(); }
        }
      }
    }

    // Post-process: ADC/DAC: extract bit count from query
    if ((result.features.includes("ADC") || result.features.includes("DAC")) && !result.features.some((f: string) => /^\d+bit$/.test(f))) {
      const bm = query.match(/(\d+)\s*(?:bit|位)/i);
      if (bm) { result.features.push(bm[1] + "bit"); fixConf(); }
    }

    // Post-process: fix common LLM tag mistakes
    if (result.features.includes("低功耗") && !result.features.includes("低功耗(≤50µA)")) {
      result.features = result.features.filter((f: string) => f !== "低功耗");
      if (!result.features.includes("低功耗(≤50µA)")) result.features.push("低功耗(≤50µA)");
      fixConf();
    }

    // Post-process: infer missing category from feature patterns
    // "100Mbps 隔离" — LLM may output "百兆" instead of "100Mbps" for isolators (run BEFORE Ethernet check)
    if (result.features.includes("百兆") && result.features.includes("隔离") && !result.features.includes("数字隔离器")) {
      result.features = result.features.filter((f: string) => f !== "百兆");
      if (!result.features.includes("100Mbps")) result.features.push("100Mbps");
      if (!result.features.includes("数字隔离器")) result.features.push("数字隔离器");
      fixConf();
    }
    // "5口 千兆" → switch. "千兆" alone → don't force (could be PHY or switch)
    if (result.features.some((f: string) => /^\d+口$/.test(f)) && !result.features.includes("交换机") && !result.features.includes("PHY")) {
      result.features = result.features.filter((f: string) => !/^\d+口$/.test(f));
      result.features.push("交换机");
      fixConf();
    }
    // "2.5V 精度" → voltage reference: Vout not Vin
    if (result.features.includes("电压基准") && result.features.some((f: string) => f.startsWith("Vin_"))) {
      result.features = result.features.filter((f: string) => !f.startsWith("Vin_"));
      if (query.match(/(\d+\.?\d*)\s*v/i)) {
        const voutTag = `Vout_${query.match(/(\d+\.?\d*)\s*v/i)![1]}V`;
        if (!result.features.includes(voutTag)) result.features.push(voutTag);
      }
      fixConf();
    }

    // Post-process: 隔离 → add generic tag (but NOT when user says 非隔离)
    if (/隔离/.test(query) && !/非隔离|不隔离|无隔离/.test(query) && !result.features.includes("隔离") && !result.features.some((f: string) => f.includes("kVrms"))) {
      result.features.push("隔离"); fixConf();
    }

    // Suggestion generation
    // Vendor-split loading: if vendor filter set, load only matching vendor(s); else load all
      const effectiveVendor = result.vendor || vendor || null;
      const all: { pn: string; ft: string; params: string; detailIntro: string; detailFeatures: string; _section: string; _features: string }[] = [];
      const vendors = loadAllVendors();
      for (const v of vendors) {
        if (!v.products || !v.products.length) continue;
        const vendorGroup = ['3peak-analog', '3peak-auto'].includes(v.slug) ? '3peak' : v.slug;
        if (effectiveVendor && vendorGroup !== effectiveVendor && v.slug !== effectiveVendor) continue;
        for (const p of v.products as any[]) {
          all.push({
            pn: p.part_number,
            ft: (p._features || "").toLowerCase(),
            params: (p._params || ""),
            detailIntro: (p._detail_intro || ""),
            detailFeatures: (p._detail_features || ""),
            _section: (p._section || "").toLowerCase(),
            _features: (p._features || "").toLowerCase(),
          });
        }
      }

      // Data-driven must promotion: nice tags that match real product data → must.
      // Priority: LLM-generated constraint predicate → text-based fallback.
      const parserMustSet = new Set([...(parsed.must || [])]);
      const parserNiceSet = new Set([...(parsed.nice || [])]);
      const llmOnlyNice = (result.nice || []).filter((t: string) => !parserMustSet.has(t) && !parserNiceSet.has(t));

      if (llmOnlyNice.length > 0) {
        const predicates = (result._predicates || {}) as Record<string, string>;
        const dataTexts = all.map(p =>
          [p._section, p.ft, p.params, p.detailIntro, p.detailFeatures]
            .filter(Boolean).join(' ').toLowerCase()
        );
        const promoted: string[] = [];
        const stillNice: string[] = [];

        for (const tag of llmOnlyNice) {
          let hasMatch: boolean;
          const pred = predicates[tag];
          if (pred) {
            // LLM wrote a predicate — execute on all products (POC)
            hasMatch = all.some(p => safePredicate(pred, {
              _params: p.params || '',
              _section: p._section || '',
              _features: p.ft || '',
              _detail_intro: p.detailIntro || '',
              _detail_features: p.detailFeatures || '',
            }));
          } else {
            // Fallback: text-based matching
            const tagLower = tag.toLowerCase();
            const searchTerm = tagLower.replace(/(?:封装|package)$/i, '').trim();
            hasMatch = searchTerm && dataTexts.some(text => text.includes(searchTerm));
          }
          if (hasMatch) {
            promoted.push(tag);
          } else {
            stillNice.push(tag);
          }
        }

        if (promoted.length > 0) {
          result.must = [...result.must, ...promoted];
          result.mustMeta = [...(result.mustMeta || []), ...promoted.map(t => ({
            tag: t, dimension: 'spec' as const
          }))];
        }
        // Keep unmatched in nice for soft filtering
        result.nice = [...new Set([...(parsed.nice || []), ...stillNice])];
      }

      const features: string[] = result.features || [];
      const requestedTags: string[] = [...new Set([...features, ...(result.nice || []), ...(result.must || [])])];
      const mustMetaByTag = new Map(((result.mustMeta || []) as any[]).map((m) => [m.tag, m]));
      const predicates = (result._predicates || {}) as Record<string, string>;
      const tokenHit = (ft: string, feature: string) => {
        const tokens = ft.split(/\s+/);
        if (tokens.includes(feature.toLowerCase())) return true;
        if (feature.includes("kVrms")) return tokens.some(t => t.includes("kvrms"));
        if (feature === "隔离") return tokens.some(t => t.includes("kvrms") || t === "隔离");
        return false;
      };
      const semanticHit = (p: { ft: string; params?: string; detailIntro?: string; detailFeatures?: string; _section?: string }, feature: string) => {
        // Predicate from LLM takes priority — no hardcoded rule needed
        const pred = predicates[feature];
        if (pred) {
          return safePredicate(pred, {
            _params: p.params || '',
            _section: p._section || '',
            _features: p.ft || '',
            _detail_intro: p.detailIntro || '',
            _detail_features: p.detailFeatures || '',
          });
        }
        const meta = mustMetaByTag.get(feature);
        if (meta) {
          return tagSatisfied({
            _features: p.ft,
            _params: p.params || "",
            _detail_intro: p.detailIntro || "",
            _detail_features: p.detailFeatures || "",
            _section: p._section || "",
          } as any, feature, meta as any);
        }
        // Suggestions are a soft UI aid: only trust explicit feature-token hits here.
        // Do not recommend a "closest" PN merely because prose/params contain a loose word.
        return tokenHit(p.ft, feature);
      };
      if (requestedTags.length < 1) return NextResponse.json(result);
      const exactMatches = all.filter(p => requestedTags.every(f => semanticHit(p, f)));
      const hasHardConstraints = Array.isArray(result.must) && result.must.length > 0;
      if (exactMatches.length > 0 && exactMatches.length <= 10) {
        (result as any).results = exactMatches.map(p => ({ pn: p.pn, vendor: '', tier: 1, hitCount: requestedTags.length, missingTags: [] }));
        return NextResponse.json(result);
      }

      if (exactMatches.length > 10 && exactMatches.length <= 30) {
        (result as any).results = exactMatches.map(p => ({ pn: p.pn, vendor: '', tier: 1, hitCount: requestedTags.length, missingTags: [] }));
        return NextResponse.json(result);
      }

      // 全命中查询只允许"结果太多，建议加参数"，不允许落入"最接近/未完全匹配"话术。
      // needsLLM=true 时放行：parser 未完全理解查询，LLM 可能已补全标签，不应拦截
      if (exactMatches.length > 30 && features.length <= 2 && !parsed.needsLLM) {
        const samplePn = exactMatches.slice(0, 3).map(p => p.pn).join("、");
        result.suggestions.push({ text: `匹配${exactMatches.length}款，建议添加具体参数缩小范围。当前结果含${samplePn}等。`, query, reason: "too_many" });
        return NextResponse.json(result);
      }

      if (exactMatches.length > 0 || hasHardConstraints) return NextResponse.json(result);

      // Score products — isolation priority when user asked for it
      const wantsIso = features.includes("隔离");
      const categoryFeatures = new Set(features.filter(f => 
        !/^\d/.test(f) && !f.includes("通道") && !f.includes("路") && 
        !f.endsWith("A") && !f.endsWith("Mbps") && !f.endsWith("V") &&
        !f.startsWith("Iout_") && !f.startsWith("Vin_") && !f.startsWith("Vout_")
      ));
      const scored = all.map(p => {
        const tokens = p.ft.split(/\s+/);
        const hitTags = features.filter((f) => semanticHit(p, f));
        const s = hitTags.length;
        // Category relevance is only a tie-breaker after a real requested-feature hit.
        // It must never be enough by itself to create a "最接近/推荐" card.
        const catRelevance = tokens.some(t => categoryFeatures.has(t)) ? 0.5 : 0;
        const iso = tokens.some(t => t.includes("kvrms") || t === "隔离");
        return { pn: p.pn, score: s + catRelevance, featureHits: s, hitTags, iso };
      }).filter(p => p.featureHits > 0).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (wantsIso) return (b.iso ? 1 : 0) - (a.iso ? 1 : 0);
        return 0;
      }).slice(0, 10);

      const humanList = (items: string[]) => items.filter(Boolean).join("、");
      const featureCounts = (targets: string[]) => targets.map(tag => ({
        tag,
        count: all.filter(p => semanticHit(p, tag)).length,
      })).filter(x => x.count > 0).sort((a, b) => b.count - a.count);

      if (!scored.length) {
        const missingCategory = features.find(f => !/^\d/.test(f) && !f.endsWith("A") && !f.endsWith("Mbps") && !f.endsWith("V") && !f.startsWith("Iout_") && !f.startsWith("Vin_") && !f.startsWith("Vout_"));
        if (missingCategory === "压力传感器") {
          const related = featureCounts(["位置传感器", "电流传感器", "温度传感器", "速度传感器"]).slice(0, 4);
          const relatedText = related.map(x => `${x.tag}(${x.count}款)`).join("、");
          result.suggestions.push({
            text: relatedText
              ? `目前没有压力传感器产品；现有传感器主要是${relatedText}。如果你其实在找压力信号调理，可再看传感器接口；如果就是要压力传感器，当前库里没有。`
              : "目前没有压力传感器产品，当前库里也没有可替代的近邻品类样本。",
            query,
            reason: "no_match"
          });
        } else {
          result.suggestions.push({ text: `目前没有「${humanList(features)}」相关产品。`, query, reason: "no_match" });
        }
        return NextResponse.json(result);
      }

      const best = scored[0];
      const total = features.length;

      const extractBestParams = (params: string, currentQuery: string): string[] => {
        const hits: string[] = [];
        const pushOnce = (text: string) => {
          if (text && !hits.includes(text)) hits.push(text);
        };
        const paramLines = params.split(" | ");
        for (const line of paramLines) {
          const idx = line.indexOf(":");
          if (idx < 0) continue;
          const key = line.slice(0, idx).trim();
          const val = line.slice(idx + 1).trim();
          if (!key || !val || key.length > 40 || val.length > 40) continue;
          const lowerKey = key.toLowerCase();
          if ((/电流|[aA]|安/.test(currentQuery)) && (lowerKey.includes("current") || lowerKey.includes("peak") || lowerKey.includes("驱动"))) pushOnce(`${key}: ${val}`);
          if ((currentQuery.includes("精度") || currentQuery.includes("误差")) && (lowerKey.includes("精度") || lowerKey.includes("accuracy") || lowerKey.includes("error") || lowerKey.includes("gain") || lowerKey.includes("offset") || lowerKey.includes("线性")) && !lowerKey.includes("temperature") && !lowerKey.includes("temp range")) pushOnce(`${key}: ${val}`);
          if ((currentQuery.includes("通道") || currentQuery.includes("路")) && (lowerKey.includes("channel") || lowerKey.includes("通道") || lowerKey.includes("ch"))) pushOnce(`${key}: ${val}`);
          if ((/速率|速度|[Mm]bps|[Gg]bps|[Kk]bps|高速/.test(currentQuery) || currentQuery.includes("速率")) && (lowerKey.includes("data rate") || lowerKey.includes("speed") || lowerKey.includes("带宽") || lowerKey.includes("速率"))) pushOnce(`${key}: ${val}`);
          if ((currentQuery.includes("隔离") || currentQuery.includes("kV")) && (lowerKey.includes("isolation") || lowerKey.includes("耐压") || lowerKey.includes("vrms"))) pushOnce(`${key}: ${val}`);
          if (hits.length >= 2) return hits.slice(0, 2);
        }
        const allKeys = [
          "output voltage", "vout", "输出电压",
          "output current", "iout", "max output",
          "vin", "input voltage", "输入电压",
          "data rate", "mbps", "speed", "速率",
          "channel", "通道",
          "isolation", "vrms", "耐压",
          "frequency", "freq", "psrr", "noise", "噪声",
          "current", "电流",
        ];
        for (const pref of allKeys) {
          for (const line of paramLines) {
            const idx = line.indexOf(":");
            if (idx < 0) continue;
            const key = line.slice(0, idx).trim();
            const val = line.slice(idx + 1).trim();
            if (!key || !val || key.length > 40 || val.length > 40) continue;
            if (key.toLowerCase().includes(pref.toLowerCase())) pushOnce(`${key}: ${val}`);
            if (hits.length >= 2) return hits.slice(0, 2);
          }
        }
        return hits.slice(0, 2);
      };

      // Rate blocker
      const rateMissing = features.find(f => {
        if (!f.endsWith("Mbps")) return false;
        const withoutRate = features.filter(x => x !== f);
        const nearRateHits = all.filter(p => withoutRate.every(x => semanticHit(p, x)));
        return nearRateHits.length > 0;
      });
      let msg = "";
      if (rateMissing) {
        const rf = features.filter(f => f !== rateMissing);
        let candidates = all.filter(p => rf.every(x => semanticHit(p, x)));
        if (wantsIso) {
          const isoCandidates = candidates.filter(p => p.ft.split(/\s+/).some(t => t.includes("kvrms") || t === "隔离"));
          if (isoCandidates.length > 0) candidates = isoCandidates;
        }
        const rates = new Set<string>();
        for (const c of candidates) {
          for (const t of c.ft.split(/\s+/)) {
            if (t.endsWith("mbps")) rates.add(t.replace(/mbps$/i, "Mbps"));
          }
        }
        const topRates = Array.from(rates).sort((a, b) => parseFloat(b) - parseFloat(a)).slice(0, 1);
        const bestRate = topRates[0];
        const topPnList = bestRate
          ? candidates.filter(p => p.ft.split(/\s+/).includes(bestRate.toLowerCase())).slice(0, 4).map(p => p.pn)
          : candidates.slice(0, 4).map(p => p.pn);
        const matched = rf.filter(f => candidates.some(p => semanticHit(p, f)));
        if (topRates.length) {
          msg = `目前没有${rateMissing}的产品，最高支持${topRates.join("、")}（${topPnList.join("、")}）。它们已满足${humanList(matched)}，缺少的是${rateMissing}`;
        } else if (candidates.length) {
          msg = `目前没有${rateMissing}的产品，最接近的是${topPnList.join("、")}。它们已满足${humanList(matched)}，缺少的是${rateMissing}`;
        }
      }

      if (!msg) {
        const bestFull = all.find(p => p.pn.toLowerCase() === best.pn.toLowerCase());
        const matched = best.hitTags;
        const missing = features.filter(f => !matched.includes(f));
        const bestParams = bestFull?.params ? extractBestParams(bestFull.params, query) : [];
        const paramHint = bestParams.length ? `；${bestParams.join('，')}` : "";
        msg = `最接近「${best.pn}」（匹配${humanList(matched) || `${best.score}/${total}条件`}，缺少${humanList(missing) || '无'}${paramHint}）`;
      }
      if (scored.length > 1 && !rateMissing) msg += `，其次「${scored[1].pn}」`;
      msg += "。是否查看？";
      result.suggestions.push({ text: msg, query, reason: "best_alternative" });

      // Relax one blocker
      for (const f of features.slice(0, 3)) {
        const others = features.filter(x => x !== f);
        const relaxed = all.filter(p => others.every(x => semanticHit(p, x)));
        if (relaxed.length > 0 && relaxed.length <= 10) {
          result.suggestions.push({ text: `去掉「${f}」可匹配：${relaxed.map(p => p.pn).join("、")}。`, query, reason: "relax_blocker" });
          break;
        }
      }
    result._debug.timings = { ...result._debug.timings, total: Date.now() - t0 };
    // Structured log → Vercel Logs dashboard
    console.log(JSON.stringify({
      r: requestId, q: query, t: Date.now() - t0,
      llm: llmSucceeded ? 'ok' : (llmCalled ? `fail:${llmError}` : 'skip'),
      features: result.features?.length, must: result.must?.length,
      suggestions: result.suggestions?.length,
    }));
    return NextResponse.json(result);
  } catch (e: any) {
    console.log(JSON.stringify({ r: requestId, q: query || '?', t: Date.now() - t0, error: e.message }));
    const debug = { requestId, timings: { total: Date.now() - t0 }, llmCalled: parsed?.needsLLM ?? false, error: e.message };
    if (e.name === "AbortError") return NextResponse.json({ features: [], vendor: null, category_hint: null, explanation: "LLM超时", confidence: "low", suggestions: [], _debug: debug });
    return NextResponse.json({ error: e.message, features: [], vendor: null, category_hint: null, explanation: "", confidence: "low", suggestions: [], _debug: debug });
  }
}

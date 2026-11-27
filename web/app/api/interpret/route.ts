import { selectionModelUsage } from '../../../lib/selection-model-usage';
import {incompatibleCatalogPackages} from './catalog-row-checks';
import {competitorIntent,runCompetitorReplacement} from './competitor-replacement';
import {compareReplacement,replacementReference} from './replacement-pilot';
import {matchingVendorSlugs} from './candidate-coverage';
import {deepSeekRequestOptions} from '../../../lib/deepseek-policy';
import {matchesMainDeviceIdentity,primaryDeviceTags} from './resource-context';
import { mergeModelFeatures, isPackageTag } from './query-specs';
import { NextRequest, NextResponse } from "next/server";

import { parseQuery, hasReplacementIntent, CATEGORY_HINT_MAP, CATEGORY_TAG_NAMES, getAllKnownTags, type ParseResult, buildPromptTagList } from './query_parser';
import { evaluateRequirement } from './selection-spec';
import { partialCanProtocolCandidate, applyConstraints, scoreByConstraints, tagSatisfied, type MustConstraint } from './constraint-match';
import { semanticRulesForTag } from '@/lib/semantic-evidence';
import { findProductByPN, loadAllVendors, loadVendor, getIndex, getCurrentReleaseId, isRuntimeReleaseCompatible } from './data-loader';
import { parseParameterRules, matchesParameterRule } from './parameter-rules';
import { validateModelCoverage } from './query-coverage';
import { catalogAssessment } from './selection-assessment';
import { loadWikiDocuments } from '../wiki-search/source-loader';
import { matchesExplicitExclusion } from './exclusion-match';
import { searchWikiDocuments } from '../wiki-search/retrieval';
import { addWikiContextToLLMQuery } from '../wiki-search/llm-context';
import { needsPlanWithoutModel, searchWholeQuery, unavailableWholeQuery } from './whole-query-search';
// A machine may inherit a model key for unrelated tasks. Require an explicit
// selection-search switch before any request can leave this service.
const DEEPSEEK_API_KEY = process.env.WHOLE_QUERY_MODEL_ENABLED === '1'
  ? process.env.DEEPSEEK_API_KEY || "" : "";

export async function GET() {
  return NextResponse.json({ modelAvailable: Boolean(DEEPSEEK_API_KEY), model:deepSeekRequestOptions().model, thinking:deepSeekRequestOptions().thinking.type },
    { headers: { 'Cache-Control': 'no-store' } });
}

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
  "线性电流传感器": ["电流传感器", "传感器"],
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
  "DCDC": ["电源"],
  "降压": ["DCDC", "电源"],
  "升压": ["DCDC", "电源"],
  // ── 电池管理族 ──
  "线性充电": ["电池管理"],
  "电池监控": ["电池管理"],
  "BMS": ["电池管理"],
  // ── 开关族 ──
  "负载开关": ["开关"],
  "高边开关": ["开关"],
};

const PROMPT_TAGS = buildPromptTagList();

/** Remove umbrella parent tags when subclass exists. e.g. "隔离栅极驱动" → delete "驱动"+"隔离". */
function resolveHierarchy(tags: string[]): string[] {
  const set = new Set(tags);
  for (const [subclass, parents] of Object.entries(CATEGORY_HIERARCHY)) {
    if (set.has(subclass)) for (const p of parents) set.delete(p);
  }
  return [...set];
}

/** Remove umbrella hints via CATEGORY_HINT_MAP. e.g. DCDC(hint="电源")+电源 → remove 电源. */
function resolveDynamicUmbrella(tags: string[]): string[] {
  const set = new Set(tags);
  for (const tag of tags) {
    const hint = CATEGORY_HINT_MAP[tag];
    if (hint && hint !== tag && set.has(hint)) set.delete(hint);
  }
  return [...set];
}

/** Filter mustMeta to only contain entries for tags still in must. */
function syncMustMeta(meta: any[] | undefined, must: string[]): any[] | undefined {
  if (!meta) return meta;
  return meta.filter((m: any) => must.includes(m.tag));
}

const SYSTEM_PROMPT = `你是资深半导体应用工程师，精通电源管理、信号链、接口隔离、传感器驱动四大领域。根据用户描述推断芯片品类和关键参数，输出JSON特征标签。

== 可用标签 ==
${PROMPT_TAGS}

== 电源管理 ==
- 理解VIN→VOUT→IOUT的关系。用户说"X转Y"或"X到Y"→X是Vin, Y是Vout
- 降压(step-down/buck)→DCDC; 升压(boost)→DCDC
- DCDC 是降压/升压/反激等拓扑的上位品类标签
- 线性稳压/LDO→LDO；只说“电源芯片”时不要猜测拓扑
- 电流单位: 用户说"1A"=1A, "200mA"=0.2A; 注意mA和A不要混淆
- LDO关键指标: 噪声/PSRR; DCDC关键指标: 开关频率/效率
- 理想二极管/ORing控制器→理想二极管; 关注最大电压、导通电阻、反向漏电流
- 电子保险丝/eFuse→电子保险丝; 关注输入电压、限流值、导通电阻
- 电源时序→电源时序; 高边驱动/高边开关→高边驱动
- 只说"Xv, Yv, Za"无品类词→不限定品类(用户可能接受LDO或DCDC)
- 精确数值必须先确认参数角色与比较关系。裸写“40V”不能猜输入或输出，应请求澄清；已由规则识别的数值不可改写。

== 信号链 ==
- 运放: 关注通道数、带宽(GBW)、轨到轨、Vos精度、静态功耗
- 比较器: 关注通道数、传播延迟、开漏/推挽输出
- ADC/DAC: 关注分辨率(bit,输出Xbit标签如12bit/16bit/24bit)、通道数、采样率、接口类型
- 电压基准: 关注输出电压、精度(%或ppm)、温漂
- 仪表放大器→仪表放大器; 差动放大器→差动放大器; 对数放大器→对数放大器
- 匹配电阻/匹配电阻网络/电阻网络→匹配电阻
- 传感器接口→传感器接口; 视频滤波/视频滤波器→视频滤波; 音频线路驱动→音频功放
- “精度高”说明需要关注相应精度指标，未给数值或口径时不能编造阈值；“带宽XXMHz”不强制品类
- ★品类层级: 隔离放大器/仪表放大器/差动放大器/对数放大器 都是放大器的子类。用户说"隔离电压的运放"→ primary_category=隔离放大器, 不要同时输出运放标签(隔离放大器已包含运放含义)

== 接口与隔离 ==
- CAN 与 CAN-FD 是不同要求。只说 CAN 时不能加 CAN-FD；LIN→LIN；RS-232/485→对应标签；SBC→SBC
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
A: {"features":["CAN-FD","低功耗唤醒","车规AEC-Q100"],"nice_features":[],"vendor":null,"category_hint":"接口","explanation":"明确的 CAN-FD、车规和低功耗唤醒均为要求","confidence":"high"}

Q: 隔离 RS-485 高速
A: {"features":["隔离","RS-485"],"nice_features":[],"vendor":null,"category_hint":"隔离接口","explanation":"高速是相对要求；没有给速率或比较基准，不得擅自设为20Mbps","confidence":"medium"}

Q: RS-232 5发3收
A: {"features":["RS-232","5T3R"],"nice_features":[],"vendor":null,"category_hint":"接口","explanation":"RS-232收发器，5路发送3路接收","confidence":"high"}

Q: 隔离 485 高速 半双工
A: {"features":["隔离","RS-485","半双工"],"nice_features":[],"vendor":null,"category_hint":"隔离接口","explanation":"保留高速诉求供证据比较；未指定数值速率","confidence":"medium"}

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
A: {"features":["电子保险丝"],"nice_features":[],"vendor":null,"category_hint":"电源","explanation":"高压诉求没有给数值边界，需保留为待比较的语义","confidence":"medium"}

Q: 直流马达驱动
A: {"features":["马达驱动"],"nice_features":[],"vendor":null,"category_hint":"驱动","explanation":"直流马达驱动芯片","confidence":"high"}

Q: can-fd 带特定帧唤醒
A: {"features":["CAN-FD","特定帧唤醒"],"nice_features":[],"vendor":null,"category_hint":"接口","explanation":"CAN FD收发器，硬需求=支持特定帧唤醒功能","confidence":"high"}

Q: 车规百兆phy tx接口
A: {"features":["百兆","100Base-TX","车规AEC-Q100"],"nice_features":[],"vendor":null,"category_hint":"以太网","explanation":"百兆、铜口与明确的车规均为要求","confidence":"high"}

Q: 千兆phy 光口
A: {"features":["千兆"],"nice_features":[],"vendor":null,"category_hint":"以太网","explanation":"光口是介质要求，但100FX仅表示百兆光纤，不可拿它证明千兆光口","confidence":"medium"}

Q: 隔离电压的运放有吗
A: {"features":["隔离放大器"],"nice_features":[],"vendor":null,"category_hint":"放大器","explanation":"隔离放大器就是隔离型的运放，不需要额外的运放或隔离标签","confidence":"high"}

Q: 有没有电流传感器 m7内核的mcu 支持can
A: {"features":[],"nice_features":[],"vendor":null,"category_hint":"","explanation":"这是电流传感器与带CAN的M7 MCU两个选型对象，不能合并为一个型号的条件；CAN也不等于CAN-FD","confidence":"low"}

Q: rs485 dfn封装
A: {"features":["RS-485"],"nice_features":["DFN封装"],"parameter_rules":{"DFN封装": {"field": "Package", "operator": "contains", "value": "DFN"}},"vendor":null,"category_hint":"接口","explanation":"RS-485收发器，DFN封装从_params的Package字段匹配","confidence":"high"}

Q: DCDC sop8封装
A: {"features":["DCDC"],"nice_features":["SOP8封装"],"parameter_rules":{"SOP8封装": {"field": "Package", "operator": "token", "value": "SOP8"}},"vendor":null,"category_hint":"电源","explanation":"DCDC电源芯片，SOP8封装从_params的Package字段匹配","confidence":"high"}

Q: LDO msl1
A: {"features":["LDO"],"nice_features":["MSL1"],"parameter_rules":{"MSL1": {"field": "MSL", "operator": "equals", "value": "1"}},"vendor":null,"category_hint":"电源","explanation":"LDO稳压器，MSL 1级防潮，从_params的MSL字段匹配","confidence":"high"}

Q: 运放 工业级温度
A: {"features":["运放"],"nice_features":["工业级"],"parameter_rules":{"工业级": {"field": "Rating", "operator": "equals", "value": "Industrial"}},"vendor":null,"category_hint":"放大器","explanation":"运放，偏好工业级温度范围，从_params的Rating字段匹配","confidence":"high"}

== 参数规则(parameter_rules) ==
当 nice_features 需要匹配结构化参数时，提供 JSON 规则：{标签:{"field":"参数键名","operator":"equals|token|contains","value":"匹配值"}}。
仅匹配产品 _params 中对应键的值。equals 是完整值相等；token 是独立型号/封装标记相等；contains 是字面子串包含。
匹配忽略大小写、空格及连字符；例如 SOP-8 与 SOP8 等价。禁止输出 JavaScript、正则表达式或函数。
规则仅用于 nice_features 的标签；未提供规则时回退到文本匹配。

== features vs nice_features 判定规则 ==
放入 features (硬需求—缺了就不是用户要的东西):
- 品类标签(隔离CAN, LDO, DCDC, 运放, 隔离放大器, 栅极驱动...)
- 具体功能特性(特定帧唤醒, 低功耗唤醒, 隔离, 半双工, 全双工, 轨到轨...)
- 精确数值参数(Vin_12V, Iout_1A, Vout_3.3V, 20Mbps, 8通道, 16:1...)
- 接口协议(RS-485, I2C, CAN-FD, LIN, SGMII, 100Base-TX...)

放入 nice_features (软偏好—满足更好但不满足也能接受):
- 仅在用户明确说“最好/优先”等偏好时，质量/可靠性等级才是软偏好
- 纯性能修饰(低噪声, 高PSRR, 高速(≥50MHz))
- 速度描述词当品类已明确时(千兆→以太网已有, 百兆→以太网已有。例外: 用户只说\"千兆phy\"无其他约束时千兆进features)
- 用户明确指定的车规、封装、温度范围是硬要求；只有“最好/优先”等措辞才是偏好。库存是否命中不能改变强弱。

如果拿不准，优先放 features。

== 意图识别(intent) ==
- 默认 intent="spec_search"(按品类/参数找料)。
- 仅当用户明确在"用某竞品型号找国产替代/pin-to-pin/兼容料"时 intent="cross_ref", 并把竞品型号填入 cross_ref_target(大写)。例: "把我现在用的那颗TI双通道隔离换成国产"→intent="cross_ref"(若有明确型号则填, 没有则留空走品类搜索)。
- 注意: 大多数"型号+替代"查询已被规则层拦截, LLM 只需兜底口语化、没明说型号的模糊表达。拿不准就用 spec_search, 不要乱标 cross_ref。

对用户消息中[待处理片段]逐项输出 coverage，包含 fragmentId、原文 source 和 outcome。可输出三种 outcome：requirements（能提炼成可筛选条件）、context（这是应用/用途/产品子类/端口角色等语义，暂不能安全映射成现有参数或标签）、clarification（语义本身仍有歧义）。context 必须附 interpretation（简明说明语义）和 evidenceRequired:true；这表示保留语义供检索并要求逐型号资料核验，绝不把它当作已满足条件。requirements 下每项可为 {kind:"tag",tag,strength,source} 或 {kind:"parameter",field,operator,values,unit,strength,source}。values 使用 unit 表示的数值，例如原文“输出电流100mA”填写 field:iout、operator:gte、values:[100]、unit:"mA"。source 必须与原查询的起止位置逐字对应；无法判断时返回 clarification；规则已识别的条件不再提出。
仅输出JSON: {"primary_category":"","features":[],"nice_features":[],"parameter_rules":{},"coverage":[],"vendor":null,"category_hint":"","explanation":"","confidence":"high|medium|low","intent":"spec_search|cross_ref","cross_ref_target":""}`;

export async function POST(req: NextRequest) {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  const t0 = Date.now();
  let parsed: ParseResult | undefined;
  let tParse = 0, tLlm = 0;
  let query = '';
  try {
    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "请求必须是合法 JSON" }, { status: 400 });
    }
    if (!body || typeof body.query !== 'string' || !body.query.trim() || body.query.length > 500) {
      return NextResponse.json({ error: "query 必须是 1–500 字符的字符串" }, { status: 400 });
    }
    query = body.query.trim();
    // Only an explicit submitted search can use the configured key. Typing is
    // client-only; formal searches never downgrade into legacy rule matching.
    const requestOrigin = req.headers.get('origin');
    const localOnly = process.env.LOCAL_MODEL_TESTING_ONLY === '1';
    const localTestOrigin = process.env.LOCAL_MODEL_TEST_ORIGIN || 'http://127.0.0.1:3228';
    const localModelAllowed = !localOnly || (requestOrigin === localTestOrigin
      && req.headers.get('host') === new URL(localTestOrigin).host);
    const requestModelKey = body.modelConsent === true && localModelAllowed ? DEEPSEEK_API_KEY : '';
    const releaseId = body.releaseId ?? getCurrentReleaseId();
    if (typeof releaseId !== 'string' || !/^[0-9a-f]{64}$/.test(releaseId)) {
      return NextResponse.json({ error: '无效数据版本' }, { status: 400 });
    }
    if (!isRuntimeReleaseCompatible(releaseId)) {
      return NextResponse.json({ error: '数据版本与当前服务不一致，请刷新页面' }, { status: 409 });
    }
    let releaseIndex;
    try { releaseIndex = getIndex(releaseId); } catch {
      return NextResponse.json({ error: '数据版本不可用，请刷新页面' }, { status: 409 });
    }
    const vendor = body.vendor ?? null;
    if (vendor !== null && (typeof vendor !== 'string' || !matchingVendorSlugs(Object.keys(releaseIndex.vendors),vendor).length)) {
      return NextResponse.json({ error: "未知厂商" }, { status: 400 });
    }

    if(body.semanticPlan===true&&/替换|替掉|直换|替代/.test(query)){
      const reason=incompatibleCatalogPackages(query,loadAllVendors(releaseId).flatMap(v=>v.products.map(p=>({...p,__vendor:v.slug}))));
      if(reason)return NextResponse.json({features:[],must:[],results:[],suggestions:[],vendor,category_hint:null,explanation:reason,constraintBanner:reason,confidence:'high',_debug:{requestId,llmCalled:false,reason:'catalog_package_conflict'}});
    }
    const replacement = body.semanticPlan === true ? replacementReference(query) : undefined;
    if (replacement) {
      const rows = loadAllVendors(releaseId).flatMap(group => group.products
        .filter(product => product._selection_status !== 'identity_unverified')
        .map(product => ({vendor:group.slug,pn:String(product.part_number)})));
      return NextResponse.json({features:[],must:[],results:[],suggestions:[],vendor,category_hint:null,
        explanation:'原厂规格对照',confidence:'medium',
        replacementPilot:compareReplacement(query,replacement,rows,vendor),
        _debug:{requestId,llmCalled:false,reason:'reviewed_replacement_profile'}});
    }

    const competitor = body.semanticPlan === true ? competitorIntent(query) : undefined;
    if (competitor?.manufacturer) {
      return NextResponse.json(await runCompetitorReplacement(query,competitor,releaseId,vendor,requestModelKey,req.signal));
    }

    // PN detection: use pn_lookup index (65KB) instead of loading all 5.7MB
    try {
      const match = findProductByPN(query, releaseId);
      if (match) {
        return NextResponse.json({ features: [], vendor: null, category_hint: null, explanation: "PN exact match", confidence: "high", suggestions: [], _debug: { requestId, timings: { total: Date.now() - t0 }, llmCalled: false, reason: 'pn_exact_match' } });
      }
    } catch {} // If data file missing, fall through to LLM

    // A known PN followed by requirements asks about that model, not for a
    // competitor replacement. Strip the PN before parsing so the qualifier
    // remains a hard requirement and cannot be discarded by cross-ref routing.
    let modelAnchor: { pn: string; vendor: string } | null = null;
    let interpretationQuery = query;
    if (!hasReplacementIntent(query)) {
      const knownModels = [...query.matchAll(/[A-Za-z][A-Za-z0-9-]*\d[A-Za-z0-9-]*/g)]
        .map(match => {
          const found = findProductByPN(match[0], releaseId);
          return found ? { match, found } : null;
        }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      if (knownModels.length === 1) {
        const { match, found } = knownModels[0];
        const qualifier = `${query.slice(0, match.index)} ${query.slice(match.index! + match[0].length)}`
          .replace(/是否|是不是|能否|可否|吗|呢|[?？]/g, ' ').trim();
        if (qualifier) {
          modelAnchor = { pn: String(found.product.part_number), vendor: found.vendor };
          interpretationQuery = qualifier;
        }
      }
    }

    // Every consented natural-language task uses the whole-question FAE path.
    // Bare exact PN lookup above stays local; replacement/compatibility wording
    // and named-model qualifiers must not bypass understanding.
    if (body.semanticPlan === true) {
      if (requestModelKey) {
        return NextResponse.json(await searchWholeQuery(query, releaseId, vendor, requestModelKey, fetch, req.signal));
      }
      const unavailable=unavailableWholeQuery(query);
      return NextResponse.json({...unavailable,
        constraintBanner: !localModelAllowed ? '当前访问来源未获准调用模型，本次未执行需求理解或型号推荐。'
          : !DEEPSEEK_API_KEY ? '模型服务尚未配置，本次未执行需求理解或型号推荐，请联系管理员后重试。'
          : '请点击搜索提交完整需求；本次尚未调用模型，未执行型号推荐。',
        _debug:{...unavailable._debug,reason:!localModelAllowed?'model_origin_blocked':!DEEPSEEK_API_KEY?'model_not_configured':'search_not_submitted'}});
    }

    // ── Deterministic query parser (bypass LLM for resolved queries) ──
    parsed = parseQuery(interpretationQuery);
    if (modelAnchor && parsed.features.length && !parsed.residualQuery && parsed.intent !== 'cross_ref') {
      parsed.needsLLM = false;
      parsed.confidence = 'high';
    }
    tParse = Date.now() - t0;

    let llmResult: any;
    const fallbackUsage = selectionModelUsage(fetch, { releaseId });
    let llmCalled = false;
    let llmSucceeded = false;
    let llmRawFeatures: string[] = [];
    let llmError = parsed.needsLLM && !requestModelKey ? 'LLM 未配置或本次未确认发送' : '';
    const awaitingModelConsent=Boolean(DEEPSEEK_API_KEY)&&localModelAllowed&&body.modelConsent!==true;
    if (!parsed.needsLLM || !requestModelKey) {
      // Deterministic search stays available without an API key.
      llmResult = { features: parsed.features, exclude_tags: parsed.exclude_tags, vendor: vendor || null, category_hint: parsed.category_hint, explanation: parsed.explanation, confidence: parsed.confidence, suggestions: [] };
    } else {
      // Parser not confident: use LLM with parser context
      let llmQuery = parsed.residualQuery ? `${query}

[Parser已识别: ${parsed.features.join(', ') || '无'}]\n[待处理片段: ${JSON.stringify(parsed.querySpec?.fragments?.filter(f => f.state === 'needs_model') || [])}]` : query;
      try {
        const wikiContext = searchWikiDocuments(query, loadWikiDocuments(releaseId), 3);
        llmQuery = addWikiContextToLLMQuery(llmQuery, wikiContext);
      } catch (wikiError) {
        // Wiki context is optional; a retrieval failure must not change parser or evidence gates.
        console.warn(`[wiki-context] skipped for ${requestId}:`, wikiError);
      }

      // Abort covers both response headers and body; failures retain parser features.
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
      const response = await fallbackUsage.fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${requestModelKey}` },
          signal: AbortSignal.timeout(12000),
          body: JSON.stringify({ ...deepSeekRequestOptions(), messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: llmQuery }], temperature: 0.1, max_tokens: 500 }),
        });
      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`LLM HTTP ${response.status}: ${errBody.slice(0, 200)}`);
      }
      const data = await response.json();
      const llmContent = data.choices?.[0]?.message?.content || "";
      const jsonMatch = llmContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('LLM bad JSON');
      llmResult = JSON.parse(jsonMatch[0]);
      if (!llmResult || !Array.isArray(llmResult.features) || !llmResult.features.every((f: unknown) => typeof f === 'string')) {
        throw new Error('LLM invalid features');
      }
      if (llmResult.nice_features !== undefined && (!Array.isArray(llmResult.nice_features) || !llmResult.nice_features.every((f: unknown) => typeof f === 'string'))) {
        throw new Error('LLM invalid nice_features');
      }
      llmRawFeatures = [...llmResult.features];
      llmSucceeded = true;
      // Merge parser features (parser is authoritative for deterministic matches)
      if (parsed.features.length > 0) {
        llmResult.features = mergeModelFeatures(parsed.features, llmResult.features || []);
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
    tLlm = Date.now() - t0 - tParse;

    // Resolve category hierarchy: when a subclass is present, remove umbrella parent.
    if (llmResult.features && llmResult.features.length > 0) {
      llmResult.features = resolveHierarchy(llmResult.features);
    }

    const result = llmResult;
    result.querySpec = parsed.querySpec;
    const parameterRules = parseParameterRules(llmResult.parameter_rules, llmResult.nice_features || []);
    delete result.parameter_rules;
    delete result.constraint_predicates; // Ignore legacy executable model output.
    result.suggestions = [];
    result.modelConsentRequired=awaitingModelConsent;
    result._debug = { requestId, timings: { parse: tParse, llm: tLlm }, llmCalled, llmSucceeded, llmError, llmRawFeatures, ...(llmCalled ? { modelUsage: fallbackUsage.snapshot() } : {}), parserFeatures: parsed.features, residualQuery: parsed.residualQuery || '' };
    // ── LLM-driven must/nice assembly ──
    // Parser's must + mustMeta are the authoritative structured output.
    // LLM nice_features only classify additions; explicit parser constraints stay hard.
    // LLM's features add tags the parser missed.
    const llmNiceTags = new Set((llmResult.nice_features || []) as string[]);

    if (parsed.must && parsed.must.length > 0) {
      // Start with parser's must (already filtered: strongestByFamily, category, etc.)
      result.must = [...parsed.must];
      result.mustMeta = [...(parsed.mustMeta || [])];

      // Explicit parser constraints remain hard; preferences are parsed from user wording.
      // Add LLM features that parser didn't produce → default to must (unless in llmNiceTags)
      // Parser features include cumulative helper tags (e.g. 16bit also emits
      // 14bit/12bit). They are already represented by the strongest parser must
      // and must not be re-added as independent model requirements.
      const parserKnown = new Set([...parsed.features, ...parsed.must, ...(parsed.nice || [])]);
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
      // remain available for ranking without being promoted based on inventory.
      for (const f of (llmResult.nice_features || [])) {
        if (!parserKnown.has(f) && !result.features.includes(f)) {
          if (!result.nice) result.nice = [];
          if (!result.nice.includes(f)) result.nice.push(f);
        }
      }
      result.nice = [...new Set([...(result.nice || []), ...(parsed.nice || [])])].filter(f => !result.must.includes(f));
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
      result.must = resolveHierarchy(result.must);
      // Dynamic umbrella removal via CATEGORY_HINT_MAP
      result.must = resolveDynamicUmbrella(result.must);
      result.mustMeta = syncMustMeta(result.mustMeta, result.must);
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

    // Qualitative current and speed stay qualitative until the request supplies
    // a number and a role. Product evidence and ranking may compare them later.
    // A category-specific default threshold would silently rewrite the request.

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

    // Post-process: XA / X安 → Iout_XA
    const ampMatch = interpretationQuery.match(/(\d+\.?\d*)\s*[Aa安]/);
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
      // 3. Universal fallback: category tag not lost — use parser's tag registry
      if (!result.features.some((f: string) => CATEGORY_TAG_NAMES.has(f))) {
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
    if (/(?:TVS|ESD|保护|防护|防雷|防静电)/i.test(query) && !parsed.mustMeta.some(m => m.dimension === 'category' && m.tag !== 'TVS/ESD')) {
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
    // Tags auto-derived from parser rules; supplemental list covers prompt-only terms.
    const KNOWN_TAGS = getAllKnownTags();
    for (const t of ['千兆','2.5G','百兆','100FX','100Base-TX','1000BASE-T','T1-PHY','SGMII','RGMII','QSGMII',
      '交换机','网卡','以太网','以太网供电','隔离电源','隔离CAN','隔离RS485','集成隔离电源的隔离CAN',
      '集成隔离电源的隔离RS485','隔离I2C','I2C','隔离ADC','5kVrms隔离','3kVrms隔离',
      '高压(≥30V)','低功耗(≤50µA)','超低功耗(≤1µA)','中速(≥10MHz)','高速(≥50MHz)',
      'VIO','高耐压','低导通电阻','MCU/DSP','PMIC','DrMOS','LED驱动','TVS/ESD','EMI滤波器',
      'SIC','SiC','TMR','AMR','低漂移','迟滞','过流保护','氮化镓功率芯片','复位芯片',
      '直流马达驱动','步进马达驱动','串联型电压基准','并联型电压基准','电压基准放大器',
      '高速数据复用器','隔离栅极驱动器','隔离式栅极驱动器','隔离式栅极驱动',
      '非隔离栅极驱动器','非隔离式栅极驱动','零漂运算放大器','高压运算放大器','低压运算放大器',
    ]) KNOWN_TAGS.add(t);
    const VALID_PATTERNS = [
      /^Vin_[\d.]+V$/, /^Vout_[\d.]+V$/, /^Iout_[\d.]+A$/,
      /^\d+Mbps$/, /^\d+通道$/, /^\d+T\d+R$/, /^\d+:\d+$/,
      /^\d+口$/, /^\d+口交换机$/, /^\d+bit$/, /^\d+A$/,
    ];
    const strippedTags: string[] = [];
    result.features = result.features.filter((f: string) => {
      if (parsed?.querySpec?.requirements.some(r => r.tag === f) || KNOWN_TAGS.has(f) || isPackageTag(f)) return true;
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

    // Restore deterministic parameter requirements after legacy/model post-processing.
    // Ambiguous voltage roles remain questions; a model cannot choose a role for the user.
    if (parsed.needsLLM && parsed.residualQuery && parsed.querySpec) {
      const fragments = parsed.querySpec.fragments?.filter(f => f.state === 'needs_model') || [];
      const coverage = validateModelCoverage(query, fragments, llmSucceeded ? llmResult.coverage : null,
        llmRawFeatures, KNOWN_TAGS, new Set(parsed.must));
      for (const fragment of coverage.covered) fragment.state = 'resolved';
      parsed.querySpec.semanticContexts = coverage.contexts;
      result._debug.coverage = { total: fragments.length, accepted: coverage.covered.length, pending: coverage.unresolved.length };
      const acceptedTags = new Set(coverage.requirements.map(r => r.tag));
      // A residual fragment can add search constraints only through validated,
      // exact-source coverage. If the model omits coverage, keep parser facts and
      // leave the fragment pending; otherwise an unsupported paraphrase (for
      // example, “信号调理芯片” -> “传感器接口”) could distort candidate ranking.
      const unreferenced = new Set(llmRawFeatures.filter(t => !parsed?.features.includes(t) && !acceptedTags.has(t)));
      result.features = result.features.filter((t: string) => !unreferenced.has(t));
      result.must = result.must.filter((t: string) => !unreferenced.has(t));
      result.nice = result.nice.filter((t: string) => !unreferenced.has(t));
      for (const requirement of coverage.requirements) {
        parsed.querySpec.requirements.push(requirement);
        const target = requirement.strength === 'must' ? result.must : result.nice;
        if (requirement.strength === 'must') result.nice = result.nice.filter((t: string) => t !== requirement.tag);
        else result.must = result.must.filter((t: string) => t !== requirement.tag);
        if (!target.includes(requirement.tag)) target.push(requirement.tag);
        if (!result.features.includes(requirement.tag)) result.features.push(requirement.tag);
        if (requirement.strength === 'must') {
          result.mustMeta = result.mustMeta || [];
          if (!result.mustMeta.some((meta: { tag: string }) => meta.tag === requirement.tag)) {
            result.mustMeta.push({ tag: requirement.tag, dimension: CATEGORY_TAG_NAMES.has(requirement.tag) ? 'category' : 'spec', requirement });
          }
        }
      }
      for (const fragment of coverage.unresolved) {
        const modelUnavailable = Boolean(llmError)&&!awaitingModelConsent;
        const reason = awaitingModelConsent
          ? '完整工程理解尚未执行；请点击搜索并确认本次发送。当前仅为本地目录初筛，这段条件尚未应用，不能判断满足。'
          : modelUnavailable
          ? '查询模型服务暂不可用，尚未理解这段内容，因此没有把它应用为筛选条件。当前候选只按已识别条件过滤，建议稍后重试。'
          : `尚未逐项核验的要求：${fragment.source.text}。请补充参数名称或条件；当前候选仅供参考`;
        parsed.querySpec.unresolved.push({ source: fragment.source, reason,
          kind: awaitingModelConsent?'model_pending':modelUnavailable ? 'model_unavailable' : 'clarification' });
      }
      for (const context of coverage.contexts) {
        const reason = `语义已理解为“${context.interpretation}”；仍需逐型号来源资料证明该候选符合此意图。当前候选仅供参考。`;
        parsed.querySpec.unresolved.push({ source: context.source, reason, kind: 'evidence', interpretation: context.interpretation });
      }
      if ((coverage.unresolved.length || coverage.contexts.length) && !llmError) {
        const pending = [...coverage.unresolved, ...coverage.contexts.map(context => ({ source: context.source }))];
        const source = pending[0].source;
        const reason = `仍有 ${pending.length} 段语义或型号证据待核验`;
        parsed.querySpec.requirements.push({ id: 'unresolved-residual', tag: '待确认：剩余要求', kind: 'unresolved', strength: 'must', source, reason });
      }
    }
    const authoritative = parsed.querySpec?.requirements.filter(r => r.kind !== 'tag') || [];
    const owns = new Set(authoritative.map(r => r.field));
    const authoritativeTags = new Set(authoritative.map(r => r.tag));
    const competing = (tag: string) => !authoritativeTags.has(tag) && (
      (/^Vin_|^Vout_/.test(tag) && (owns.has('vin') || owns.has('vout') || !!parsed?.querySpec?.unresolved.length)) ||
      (/^Iout_/.test(tag) && owns.has('iout')) ||
      (/Mbps$/.test(tag) && owns.has('dataRate')) ||
      (/kVrms/.test(tag) && owns.has('isolation'))
    );
    result.features = result.features.filter((t: string) => !competing(t));
    result.must = (result.must || []).filter((t: string) => !competing(t));
    result.nice = (result.nice || []).filter((t: string) => !competing(t));
    for (const requirement of authoritative) {
      const target = requirement.strength === 'must' ? result.must : result.nice;
      if (!target.includes(requirement.tag)) target.push(requirement.tag);
      if (!result.features.includes(requirement.tag)) result.features.push(requirement.tag);
      delete parameterRules[requirement.tag];
    }
    result.mustMeta = syncMustMeta([
      ...(result.mustMeta || []).filter((m: any) => !authoritativeTags.has(m.tag)),
      ...authoritative.filter(r => r.strength === 'must').map(requirement => ({
        ...(parsed?.mustMeta || []).find(m => m.tag === requirement.tag),
        tag: requirement.tag, dimension: 'spec', requirement,
      })),
    ], result.must);
    if (parsed.querySpec?.unresolved.length) result.confidence = 'low';

    // Suggestion generation
    // Vendor-split loading: if vendor filter set, load only matching vendor(s); else load all
      const effectiveVendor = vendor || result.vendor || null;
      const all: { pn: string; params: string; _section: string; _params_numeric: Record<string, unknown>; _reviewed_fact_sources?: unknown; _source_facts?: unknown; _orderable_configurations?: unknown; _adjustable_orderables?: unknown; _configuration_options?: unknown; _conditional_rate_resolution?: unknown; _operating_facts?: unknown; _topology_source?: unknown; _resolution_source?: unknown; _detail_adc_resolution_source?: unknown; _manual_adjudications?: unknown; _published_corrections?: unknown; _withdrawn_reviewed_fields?: string[]; vendor: string }[] = [];
      const vendors = matchingVendorSlugs(Object.keys(releaseIndex.vendors),effectiveVendor).map(slug=>loadVendor(slug,releaseId));
      for (const v of vendors) {
        if (!v.products || !v.products.length) continue;
        for (const p of v.products as any[]) {
          if (p._selection_status === 'identity_unverified') continue;
          if (modelAnchor && (v.slug !== modelAnchor.vendor || p.part_number !== modelAnchor.pn)) continue;
          if (matchesExplicitExclusion({ ...p, __vendor: v.slug }, result.exclude_tags || [])) continue;
          const mainCategories=primaryDeviceTags((result.must||result.features||[]).filter((tag:string)=>CATEGORY_TAG_NAMES.has(tag)),result.mustMeta);
          if(!modelAnchor&&!matchesMainDeviceIdentity(p,mainCategories))continue;
          all.push({
            pn: p.part_number,
            vendor: v.slug,
            _params_numeric: p._params_numeric || {},
            _reviewed_fact_sources: p._reviewed_fact_sources,
            _source_facts: p._source_facts,
            _orderable_configurations: p._orderable_configurations,
            _adjustable_orderables: p._adjustable_orderables,
            _configuration_options: p._configuration_options,
            _conditional_rate_resolution: p._conditional_rate_resolution,
            _operating_facts: p._operating_facts,
            _withdrawn_reviewed_fields: p._withdrawn_reviewed_fields,
            _topology_source: p._topology_source,
            _resolution_source: p._resolution_source,
            _detail_adc_resolution_source: p._detail_adc_resolution_source,
            _manual_adjudications: p._manual_adjudications,
            _published_corrections: p._published_corrections,
            params: (p._params || ""),
            _section: (p._section || "").toLowerCase(),
          });
        }
      }

      // Hardness comes from the request, never from whether inventory happens to match.

      const features: string[] = result.features || [];
      const requestedTags: string[] = [...new Set([...features, ...(result.nice || []), ...(result.must || [])])];
      const mustMetaByTag = new Map(((result.mustMeta || []) as any[]).map((m) => [m.tag, m]));
      const semanticHit = (p: typeof all[number], feature: string) => {
        const rule = parameterRules[feature];
        if (rule) return matchesParameterRule(rule, p.params || '');
        const meta = mustMetaByTag.get(feature);
        const semanticRule = semanticRulesForTag(feature).find(rule => rule.dimension !== 'category' && rule.dimension !== 'grade');
        // Suggestions are source-backed candidates. Old feature tags and shared
        // family prose cannot turn a loose phrase into a model-level hit.
        return tagSatisfied({
          ...p, __vendor: p.vendor, _features: '', _params: p.params || '',
          _detail_intro: '', _detail_features: '',
        } as any, feature, (meta || (semanticRule ? { tag: feature, dimension: semanticRule.dimension } : undefined)) as any);
      };
      if (requestedTags.length < 1) { result._debug.timings.total = Date.now() - t0; return NextResponse.json(result); }
      // Set total timing once; all early returns below inherit it
      result._debug.timings.total = Date.now() - t0;
      const exactTags: string[] = result.must?.length ? result.must : requestedTags;
      const hasHardConstraints = Array.isArray(result.must) && result.must.length > 0;
      const catalogProducts = all.map(p => ({
        ...p, part_number: p.pn, __vendor: p.vendor,
        _features: '', _params: p.params, _params_numeric: p._params_numeric,
        _reviewed_fact_sources: p._reviewed_fact_sources, _source_facts: p._source_facts,
        _orderable_configurations: p._orderable_configurations,
        _adjustable_orderables: p._adjustable_orderables,
        _configuration_options: p._configuration_options,
        _conditional_rate_resolution: p._conditional_rate_resolution,
        _operating_facts: p._operating_facts,
        _withdrawn_reviewed_fields: p._withdrawn_reviewed_fields,
        _topology_source: p._topology_source,
        _resolution_source: p._resolution_source,
        _detail_adc_resolution_source: p._detail_adc_resolution_source,
        _manual_adjudications: p._manual_adjudications,
        _published_corrections: p._published_corrections,
        _detail_intro: '', _detail_features: '',
      }));
      const constraintScores = hasHardConstraints ? scoreByConstraints(catalogProducts, exactTags, result.nice || [], result.mustMeta, query) : [];
      if (modelAnchor && constraintScores.length === 1) {
        const checked = constraintScores[0];
        (result as any).modelCheck = {
          pn: modelAnchor.pn, vendor: modelAnchor.vendor,
          status: checked.fullMatch ? 'matched' : checked.mustUnknown.length ? 'unknown' : 'unmatched',
          matched: checked.mustHit, unmatched: checked.mustMiss.filter(tag => !checked.mustUnknown.includes(tag)),
          unknown: checked.mustUnknown, sourceEvidence: checked.sourceEvidence,
        };
      }
      const exactScores = constraintScores.filter(s => s.fullMatch);
      if (!exactScores.length && exactTags.some(tag => /^VCC[AB]_\d/.test(tag))) {
        const categories = ((result.mustMeta || []) as MustConstraint[])
          .filter(meta => meta.dimension === 'category').map(meta => meta.tag);
        (result as any).excludedByOperating = constraintScores.filter(s =>
          s.assessment.namedRailStatus === 'outside_documented_bounds'
          && categories.every(tag => s.mustHit.includes(tag)))
          .slice(0, 3).map(s => ({ pn: s.product.part_number, vendor: s.product.__vendor,
            assessment: s.assessment }));
      }
      const exactMatches = hasHardConstraints
        ? exactScores.map(s => ({
            pn: s.product.part_number, vendor: s.product.__vendor,
            tier: 1, hitCount: s.mustHit.length, missingTags: [],
            parameterChecks: s.parameterChecks, sourceEvidence: s.sourceEvidence, score: s.score, assessment: s.assessment,
            mustHit: s.mustHit, niceHit: s.niceHit,
            downgradeHits: s.downgradeHits,
          }))
        : all.filter(p => !p._withdrawn_reviewed_fields?.length && exactTags.every(f => semanticHit(p, f))).map(p => ({
            pn: p.pn, vendor: p.vendor, tier: 1, hitCount: exactTags.length,
            missingTags: [], parameterChecks: Object.fromEntries(authoritative
              .filter(r => r.strength === 'must').map(r =>
                [r.tag, evaluateRequirement({ _params: p.params, _params_numeric: p._params_numeric }, r)])),
            score: exactTags.length * 10, mustHit: exactTags, niceHit: [], assessment: catalogAssessment(true), sourceEvidence: {},
            downgradeHits: {},
          }));
      const unresolvedIntent = Boolean(parsed.querySpec?.unresolved.length);
      const exactMatchResults = unresolvedIntent
        ? exactMatches.slice(0, 10).map(item => ({ ...item, tier: 2 }))
        : exactMatches;
      if (unresolvedIntent && exactMatches.length) {
        (result as any).constraintBanner = '以下候选只满足已识别条件；尚未理解或核验的查询片段不参与筛选，不能视为完整匹配。';
      }
      if (exactMatches.length > 0 && exactMatches.length <= 10) {
        (result as any).results = exactMatchResults;
        return NextResponse.json(result);
      }

      if (exactMatches.length > 10 && exactMatches.length <= 30) {
        (result as any).results = exactMatchResults;
        return NextResponse.json(result);
      }

      // 全命中查询只允许"结果太多，建议加参数"，不允许落入"最接近/未完全匹配"话术。
      // needsLLM=true 时放行：parser 未完全理解查询，LLM 可能已补全标签，不应拦截
      if (exactMatches.length > 30 && features.length <= 2 && !parsed.needsLLM) {
        // The browser projection omits reviewed/quarantined fact metadata.
        // Return canonical rows even for broad queries; never ask it to rescore.
        (result as any).results = exactMatchResults;
        (result as any).totalMatches = exactMatches.length;
        const samplePn = exactMatches.slice(0, 3).map(p => p.pn).join("、");
        result.suggestions.push({ text: `匹配${exactMatches.length}款，建议添加具体参数缩小范围。当前结果含${samplePn}等。`, query, reason: "too_many" });
        return NextResponse.json(result);
      }

      if (exactMatches.length > 0) {
        (result as any).results = exactMatchResults;
        return NextResponse.json(result);
      }
      if (hasHardConstraints) {
        if (modelAnchor && constraintScores.length === 1) {
          const checked = constraintScores[0];
          const status = checked.mustUnknown.length ? 'unknown' : 'unmatched';
          (result as any).constraintBanner = status === 'unknown'
            ? `已定位 ${modelAnchor.pn}；部分要求缺少该型号的明确资料，不能判为满足。`
            : `已定位 ${modelAnchor.pn}；该型号不满足所列要求。`;
          (result as any).results = [{
            pn: modelAnchor.pn, vendor: modelAnchor.vendor, tier: 2,
            hitCount: checked.mustHit.length, missingTags: checked.mustMiss,
            mustUnknown: checked.mustUnknown, parameterChecks: checked.parameterChecks,
            sourceEvidence: checked.sourceEvidence, score: checked.score,
            assessment: checked.assessment, mustHit: checked.mustHit,
            niceHit: checked.niceHit, downgradeHits: checked.downgradeHits,
          }];
          return NextResponse.json(result);
        }
        // Never reintroduce a documented numeric mismatch through the nearby-products lane.
        const eligibleScores=constraintScores.filter(row=>!Object.values(row.parameterChecks).some(check=>check.status==='unmatched'));
        const reviewed = applyConstraints(eligibleScores.map(row=>row.product), exactTags, result.nice || [], result.mustMeta, undefined, query);
        // A requested output-current floor is a hard operating limit. When no
        // full match exists, generic category-nearby products with unknown
        // current must not be presented as alternatives (for example 1 A
        // buck regulators beside a 10 A request). Exact named-model checks
        // above still report the requested model with its failing status.
        const requiredCurrentTags = exactTags.filter(tag => /^Iout_\d+(?:\.\d+)?A$/.test(tag));
        const hardTags = ((result.mustMeta || []) as MustConstraint[])
          .filter(meta => meta.dimension === 'category' || meta.dimension === 'media')
          .map(meta => meta.tag);
        const protocolLeads=eligibleScores.filter(partialCanProtocolCandidate);
        const reviewedItems = protocolLeads.length ? protocolLeads.sort((a,b)=>b.score-a.score).slice(0,8) : requiredCurrentTags.length
          ? eligibleScores.filter(item => requiredCurrentTags.every(tag => item.mustHit.includes(tag))
              && hardTags.every(tag => item.mustHit.includes(tag)))
            .sort((a, b) => a.mustMiss.length - b.mustMiss.length || b.score - a.score)
            .slice(0, 8)
          : reviewed.items.filter(row=>!authoritative.some(r=>r.field==='dataRate'&&r.strength==='must'&&/至少|不低于|不少于|≥|>=/i.test(r.source?.text||'')) ||
              Object.values(row.parameterChecks).some(check=>check.status==='matched'));
        (result as any).constraintBanner = protocolLeads.length ? 'CAN 收发器速率已有证据；CAN FD 协议支持仍需逐型号核验。' : !reviewedItems.length && !requiredCurrentTags.length ? '当前目录缺少满足必要数值条件的已核验候选。' : requiredCurrentTags.length && !reviewedItems.length
          ? `本次已收录目录中未找到逐型号证据同时证明所需品类与输出电流达到${requiredCurrentTags.map(tag =>
              tag.replace(/^Iout_/, '')).join('、')}的参考料；低电流或电流未知的型号不作为满足项展示。`
          : requiredCurrentTags.length
            ? `找到 ${reviewedItems.length} 款具备所需品类和输出电流证据的参考料；其他要求尚未全部核验，请逐项查看。`
            : reviewed.banner;
        (result as any).results = reviewedItems.map(item => ({
          pn: item.product.part_number, vendor: item.product.__vendor, tier: protocolLeads.length ? 2 : reviewed.tier,
          hitCount: item.mustHit.length, missingTags: item.mustMiss, mustUnknown: item.mustUnknown,
          parameterChecks: item.parameterChecks, sourceEvidence: item.sourceEvidence,
          score: item.score, assessment: item.assessment, mustHit: item.mustHit, niceHit: item.niceHit,
          downgradeHits: item.downgradeHits,
        }));
        return NextResponse.json(result);
      }

      // Score products — isolation priority when user asked for it
      const wantsIso = features.includes("隔离");
      const categoryFeatures = new Set(features.filter(f => 
        !/^\d/.test(f) && !f.includes("通道") && !f.includes("路") && 
        !f.endsWith("A") && !f.endsWith("Mbps") && !f.endsWith("V") &&
        !f.startsWith("Iout_") && !f.startsWith("Vin_") && !f.startsWith("Vout_")
      ));
      const scored = all.map(p => {
        const hitTags = features.filter((f) => semanticHit(p, f));
        const s = hitTags.length;
        // Category relevance is only a tie-breaker after a real requested-feature hit.
        // It must never be enough by itself to create a "最接近/推荐" card.
        const catRelevance = [...categoryFeatures].some(t => p._section.includes(t.toLowerCase())) ? 0.5 : 0;
        const iso = p._section.includes('隔离');
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

/** Extract up to 2 most relevant param key:value pairs for suggestion display. */
function extractBestParams(params: string, query: string): string[] {
  const hits: string[] = [];
  const pushOnce = (text: string) => { if (text && !hits.includes(text)) hits.push(text); };
  const paramLines = params.split(" | ");
        for (const line of paramLines) {
          const idx = line.indexOf(":");
          if (idx < 0) continue;
          const key = line.slice(0, idx).trim();
          const val = line.slice(idx + 1).trim();
          if (!key || !val || key.length > 40 || val.length > 40) continue;
          const lowerKey = key.toLowerCase();
          if ((/电流|[aA]|安/.test(query)) && (lowerKey.includes("current") || lowerKey.includes("peak") || lowerKey.includes("驱动"))) pushOnce(`${key}: ${val}`);
          if ((query.includes("精度") || query.includes("误差")) && (lowerKey.includes("精度") || lowerKey.includes("accuracy") || lowerKey.includes("error") || lowerKey.includes("gain") || lowerKey.includes("offset") || lowerKey.includes("线性")) && !lowerKey.includes("temperature") && !lowerKey.includes("temp range")) pushOnce(`${key}: ${val}`);
          if ((query.includes("通道") || query.includes("路")) && (lowerKey.includes("channel") || lowerKey.includes("通道") || lowerKey.includes("ch"))) pushOnce(`${key}: ${val}`);
          if ((/速率|速度|[Mm]bps|[Gg]bps|[Kk]bps|高速/.test(query) || query.includes("速率")) && (lowerKey.includes("data rate") || lowerKey.includes("speed") || lowerKey.includes("带宽") || lowerKey.includes("速率"))) pushOnce(`${key}: ${val}`);
          if ((query.includes("隔离") || query.includes("kV")) && (lowerKey.includes("isolation") || lowerKey.includes("耐压") || lowerKey.includes("vrms"))) pushOnce(`${key}: ${val}`);
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
          const isoCandidates = candidates.filter(p => p._section.includes('隔离'));
          if (isoCandidates.length > 0) candidates = isoCandidates;
        }
        const topPnList = candidates.slice(0, 4).map(p => p.pn);
        const matched = rf.filter(f => candidates.some(p => semanticHit(p, f)));
        if (candidates.length) {
          msg = `目前没有来源确认满足${rateMissing}的产品；可核对${topPnList.join("、")}的逐型号速率参数。已找到${humanList(matched)}，${rateMissing}仍需确认`;
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

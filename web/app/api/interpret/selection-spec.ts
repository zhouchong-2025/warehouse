import {catalogDeviceFamilies,isLevelTranslatorDescription} from './device-identity';
import { SPOKEN_UNITS, spokenMeasurements, spokenNumber } from './spoken-measurements';
/** Shared query requirements and parameter facts. No browser/server dependencies. */
import { sourceFactsForProduct, sourceForObservedField, sourceReference, type VerifiedSource } from './source-facts';
import { isMcuProduct } from './resource-context';
import { reviewedAdjustableOrderables, reviewedOrderableConfigurations } from './selection-assessment';
export type ParameterId = 'vin' | 'vcca' | 'vccb' | 'transientVin' | 'vout' | 'iout' | 'switchingFrequency' | 'iq' | 'gbw' | 'bandwidth' | 'vos' | 'dataRate' | 'sampleRate' | 'adcInputChannels' | 'channelCount' | 'portCount' | 'channelDirections' | 'cpuClock' | 'flash' | 'ram' | 'canFdChannels' | 'pwmChannels' | 'canChannels' | 'uartChannels' | 'pwmOutputs' | 'sleepCurrent' | 'temperatureMax' | 'temperatureRange' | 'temperatureAccuracy' | 'packagePins' | 'isolation' | 'isolationWithstand' | 'cmtiMin' | 'uvloThreshold' | 'currentRange' | 'magneticSensitivity' | 'commonModeVoltage' | 'gain' | 'propagationDelay' | 'accuracy';
export type Comparison = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'covers' | 'between';
export type MatchStatus = 'matched' | 'unmatched' | 'unknown';
export interface QuerySource { text: string; start: number; end: number; origin: 'rule' | 'model' | 'legacy'; }
export interface Requirement {
  engineeringRequirementId?:string;
  id: string;
  tag: string;
  kind: 'parameter' | 'tag' | 'unresolved';
  field?: ParameterId;
  operator?: Comparison;
  values?: number[];
  unit?: string;
  testMethod?: 'UL1577';
  strength: 'must' | 'nice';
  source: QuerySource | null;
  reason?: string;
  derivation?: {kind:'relative_tolerance'|'absolute_tolerance'|'symmetric_range';expression:string;computedValues:number[]};
}
export interface QuerySpec {
  version: 1;
  text: string;
  requirements: Requirement[];
  unresolved: { engineeringRequirementId?:string; source: QuerySource; reason: string; kind?: 'clarification' | 'evidence' | 'model_unavailable' | 'model_pending'; interpretation?: string }[];
  originalText?: string;
  inputNormalization?: string;
  semanticContexts?: { source: QuerySource; interpretation: string; verification: 'product_evidence_required' }[];
  fragments?: import('./query-coverage').QueryFragment[];
}
interface ParameterDefinition {
  label: string;
  unit: string;
  aliases: RegExp;
  query: string;
  defaultOperator: Comparison;
}
export const PARAMETERS: Record<ParameterId, ParameterDefinition> = {
  vin: { label: '输入电压', unit: 'V', aliases: /^(?:(?:minimum|maximum|min|max)?inputvoltage|recommendedvm|supplyvoltage|vin|vcc|vdd|(?:最小|最大)?输入电压|供电电压|工作电压)/i, query: '输入(?:电压)?|供电(?:电压)?|vin|input(?:\\s+voltage)?', defaultOperator: 'covers' },
  vcca: { label: 'VCCA', unit: 'V', aliases: /^vcca/i, query: '\\bVCCA\\b|A侧(?:供电|电源)(?:电压)?', defaultOperator: 'covers' },
  vccb: { label: 'VCCB', unit: 'V', aliases: /^vccb/i, query: '\\bVCCB\\b|B侧(?:供电|电源)(?:电压)?', defaultOperator: 'covers' },
  transientVin: { label: '输入瞬态耐压', unit: 'V', aliases: /^(?:输入瞬态耐压|瞬态输入耐压|inputtransientvoltage|transientinputvoltage)/i, query: '输入瞬态耐压|瞬态输入耐压|输入瞬态|transient\\s+input\\s+voltage', defaultOperator: 'gte' },
  vout: { label: '输出电压', unit: 'V', aliases: /^(?:outputvoltage|outputv$|vout|输出电压)/i, query: '输出电压|vout|output\\s+voltage|输出(?=\\s*[:：=]?\\s*[-+±\\d])', defaultOperator: 'eq' },
  iout: { label: '输出电流', unit: 'A', aliases: /^(?:(?:max(?:imum)?)?outputcurrent|iout|(?:最大)?输出电流)/i, query: '输出电流|负载电流|iout|output\\s+current', defaultOperator: 'gte' },
  switchingFrequency: { label: '开关频率', unit: 'Hz', aliases: /^(?:switchingfrequency|开关频率)/i, query: '开关频率|switching\\s+frequency', defaultOperator: 'gte' },
  iq: { label: '静态电流', unit: 'A', aliases: /^(?:iq|quiescentcurrent|静态电流|静态功耗)/i, query: '静态电流|静态功耗|iq|quiescent\\s+current', defaultOperator: 'lte' },
  gbw: { label: '增益带宽', unit: 'Hz', aliases: /^(?:gbw|gbp|gainbandwidth|增益带宽)/i, query: 'gbw|gbp|增益带宽(?:积)?', defaultOperator: 'gte' },
  bandwidth: { label: '带宽', unit: 'Hz', aliases: /^(?:bandwidth|带宽)/i, query: '带宽|bandwidth', defaultOperator: 'gte' },
  vos: { label: '失调电压', unit: 'V', aliases: /^(?:vos|inputoffsetvoltage|offsetvoltage|输入失调电压|失调电压)/i, query: '输入失调电压|失调电压|失调|vos|offset\\s+voltage', defaultOperator: 'lte' },
  dataRate: { label: '数据速率', unit: 'bps', aliases: /^(?:(?:max(?:imum)?)?datarate|(?:最大)?数据速率|最高速率|最大工作速率|(?:最大)?速率|(?:最大)?码流)/i, query: '数据速率|速率|码流|data\\s*rate', defaultOperator: 'gte' },
  sampleRate: { label: '采样率', unit: 'sps', aliases: /^(?:throughputrate|samplingfrequency|samplingrate|samplerate|采样频率|采样率|吞吐率)/i, query: '采样频率|采样率|吞吐率|sampling\\s+frequency|throughput\\s+rate|sampl(?:e|ing)\\s+rate', defaultOperator: 'gte' },
  adcInputChannels: { label: 'ADC 输入通道', unit: '通道', aliases: /^(?:adcinputchannels|输入通道数量)/i, query: '输入通道(?:数|数量)?|adc\\s+input\\s+channels?', defaultOperator: 'gte' },
  portCount: { label: '端口数', unit: '通道', aliases: /^(?:portcount|numberofports|端口数|端口数量)$/i, query: '端口数|端口数量|port\\s*count', defaultOperator: 'eq' },
  channelCount: { label: '通道数', unit: '通道', aliases: /^(?:numberofchannels?|channelcount|通道数|通道数量)$/i, query: '通道数|number\\s+of\\s+channels?', defaultOperator: 'eq' },
  channelDirections: { label: '正反向通道', unit: '路', aliases: /^(?:正向\/反向通道|正向反向通道)$/i, query: '正向\/反向通道', defaultOperator: 'eq' },
  cpuClock: { label: '主频', unit: 'Hz', aliases: /^(?:cpu(?:clock|frequency|freq)|主频|cpu主频)/i, query: 'cpu\\s*(?:主频|clock|frequency)|主频', defaultOperator: 'gte' },
  flash: { label: 'Flash', unit: 'KB', aliases: /^(?:flash|程序存储)/i, query: 'flash|程序存储', defaultOperator: 'gte' },
  ram: { label: 'RAM', unit: 'KB', aliases: /^(?:ram|运行内存)/i, query: 'ram|运行内存', defaultOperator: 'gte' },
  canFdChannels: { label: 'CAN FD 路数', unit: '路', aliases: /^(?:canfdchannels|canfd路数)/i, query: 'can[ -]?fd(?:路数)?', defaultOperator: 'gte' },
  canChannels: { label: 'CAN控制器路数', unit: '路', aliases: /^(?:cancontrollers?|canchannels|can路数|can控制器数量)$/i, query: 'CAN控制器路数', defaultOperator: 'gte' },
  uartChannels: { label: 'UART路数', unit: '路', aliases: /^(?:uart(?:channels?|count)?|uart路数|串口数量)$/i, query: 'UART路数', defaultOperator: 'gte' },
  pwmOutputs: { label: 'PWM输出路数', unit: '路', aliases: /^(?:pwmoutputs?|pwmoutputchannels|pwm输出路数)$/i, query: 'PWM输出路数', defaultOperator: 'gte' },
  sleepCurrent: { label: '休眠电流', unit: 'A', aliases: /^(?:sleepcurrent|休眠电流|睡眠电流)/i, query: '休眠电流|睡眠电流', defaultOperator: 'lte' },
  pwmChannels: { label: 'ePWM 路数', unit: '路', aliases: /^(?:epwmchannels|epwm路数)/i, query: '(?:e?pwm)(?:路数)?', defaultOperator: 'gte' },
  temperatureMax: { label: '工作温度上限', unit: '°C', aliases: /^(?:temp\(?ta\)?|工作温度上限)/i, query: '工作温度(?:上限)?|最高工作温度', defaultOperator: 'gte' },
  temperatureRange: { label: '工作温度范围', unit: '°C', aliases: /^(?:工作环境温度|工作温度范围|operatingtemperature|ambienttemperature)/i, query: '工业温度|工作温度范围|工作环境温度', defaultOperator: 'covers' },
  temperatureAccuracy: { label: '温度测量精度', unit: '°C', aliases: /^最高精度$/i, query: '精度|accuracy', defaultOperator: 'lte' },
  packagePins: { label: '封装引脚数', unit: '引脚', aliases: /^(?:packagepins|封装引脚数)/i, query: '封装(?:引脚数)?|引脚数', defaultOperator: 'lte' },
  isolationWithstand: { label: '隔离耐压（耐压测试）', unit: 'Vrms', aliases: /^(?:withstandisolationvoltage|isolationwithstand|visowithstand|隔离耐压|绝缘耐压|介电强度|耐压测试)/i, query: '隔离耐压|绝缘耐压|耐压测试|withstand(?:\\s+isolation)?(?:\\s+voltage)?|\\bVISO\\b', defaultOperator: 'gte' },
  isolation: { label: '隔离电压', unit: 'Vrms', aliases: /^(?:isolationvoltage|isolationrating|isolation|iso额定值|隔离电压)/i, query: '隔离电压|isolation(?:\\s+voltage)?', defaultOperator: 'gte' },
  cmtiMin: { label: 'CMTI 最小保证值', unit: 'kV/us', aliases: /^(?:cmti|共模瞬变抗扰度)/i, query: 'CMTI|共模瞬变抗扰度', defaultOperator: 'gte' },
  uvloThreshold: { label: 'VCC UVLO 阈值', unit: 'V', aliases: /^(?:vccuvlo|uvlo阈值|欠压锁定阈值)/i, query: 'UVLO|欠压锁定阈值', defaultOperator: 'eq' },
  currentRange: { label: '电流量程', unit: 'A', aliases: /^(?:currentrange|measurementrange|电流范围|电流量程|测量范围)/i, query: '电流量程|量程|测量范围|current\\s+range', defaultOperator: 'covers' },
  magneticSensitivity: { label: '磁灵敏度', unit: 'mV/Gs', aliases: /^(?:灵敏度(?:mv\/gs)?|sensitivity(?:mv\/gs)?)/i, query: '灵敏度|sensitivity', defaultOperator: 'eq' },
  commonModeVoltage: { label: '输入共模电压', unit: 'V', aliases: /^(?:inputcommonmodevoltage|commonmodevoltage|输入共模电压|共模电压范围|共模电压)/i, query: '输入共模电压|共模电压|common[ -]?mode\\s+voltage', defaultOperator: 'gte' },
  gain: { label: '增益', unit: 'V/V', aliases: /^(?:gain(?:option|seting|setting)?|增益|可编程增益)/i, query: '(?<!带宽)增益|(?<!bandwidth)gain', defaultOperator: 'eq' },
  propagationDelay: { label: '传播延迟', unit: 's', aliases: /^(?:propagationdelay|传播延迟时间|传播延迟)/i, query: '传播延迟|propagation\\s+delay', defaultOperator: 'lte' },
  accuracy: { label: '误差', unit: '%', aliases: /^(?:accuracy|gainerror|totalerror|精度|总误差|增益误差)/i, query: '精度|误差|accuracy|error', defaultOperator: 'lte' },
};
const UNIT_TABLE: Record<string, [string, number]> = {
  V: ['V', 1], mV: ['V', 1e-3], uV: ['V', 1e-6], μV: ['V', 1e-6], kV: ['V', 1e3],
  A: ['A', 1], mA: ['A', 1e-3], uA: ['A', 1e-6], μA: ['A', 1e-6], nA: ['A', 1e-9], pA: ['A', 1e-12],
  Hz: ['Hz', 1], kHz: ['Hz', 1e3], MHz: ['Hz', 1e6], GHz: ['Hz', 1e9],
  bps: ['bps', 1], kbps: ['bps', 1e3], Mbps: ['bps', 1e6], Gbps: ['bps', 1e9],
  Vrms: ['Vrms', 1], kVrms: ['Vrms', 1e3],
  s: ['s', 1], ms: ['s', 1e-3], us: ['s', 1e-6], μs: ['s', 1e-6], ns: ['s', 1e-9], ps: ['s', 1e-12],
  sps: ['sps', 1], ksps: ['sps', 1e3], Msps: ['sps', 1e6], Gsps: ['sps', 1e9],
  KB: ['KB', 1], MB: ['KB', 1024],
  路: ['路', 1],
  通道: ['通道', 1],
  '°C': ['°C', 1], '℃': ['°C', 1], 摄氏度: ['°C', 1], 度: ['°C', 1], 引脚: ['引脚', 1],
  'nV/√Hz': ['V/√Hz', 1e-9], 'nV/rtHz': ['V/√Hz', 1e-9], 'nV/srHz': ['V/√Hz', 1e-9], 'uV/√Hz': ['V/√Hz', 1e-6], 'μV/√Hz': ['V/√Hz', 1e-6], 'V/√Hz': ['V/√Hz', 1],
  '%': ['%', 1], ppm: ['%', 1e-4], dB: ['dB', 1],
  'V/V': ['V/V', 1],
  'mV/Gs': ['mV/Gs', 1], 'V/Gs': ['mV/Gs', 1000],
  'Ω': ['Ω', 1], 'mΩ': ['Ω', 1e-3], 'kΩ': ['Ω', 1e3], 'MΩ': ['Ω', 1e6],
};
export function unitInfo(raw: string): [string, number] | null {
  const unit = raw.replace(/µ/g, 'μ').replace(/\s/g, '');
  if (UNIT_TABLE[unit]) return UNIT_TABLE[unit];
  if (SPOKEN_UNITS[unit]) return SPOKEN_UNITS[unit];
  // Base-unit typography may vary; SI prefix case must not change magnitude.
  const prefix=(v:string)=>v.length>1&&/^[munpμkKMG]/.test(v)?(v[0]==='K'?'k':v[0]):'';
  const alias = Object.keys(UNIT_TABLE).find(key => key.toLowerCase() === unit.toLowerCase()
    && prefix(key)===prefix(unit)&&(!['KB','MB'].includes(key)||!unit.endsWith('b')));
  return alias ? UNIT_TABLE[alias] : null;
}
export function toCanonical(value: number, unit: string, expected?: string): number | null {
  const info = unitInfo(unit);
  // “路” and “通道” are count-unit aliases. The model-authored field still
  // determines what is counted (ADC inputs, controllers, ports, etc.).
  const sameDimension=info&&(!expected||info[0]===expected
    ||['路','通道'].includes(info[0])&&['路','通道'].includes(expected));
  return info && sameDimension && Number.isFinite(value) ? Number((value * info[1]).toPrecision(12)) : null;
}
/** Field-aware unit conversion shared by intent binding, plan checks and
 * evidence coverage. Sampling Hz and slew kV/us are not global unit aliases. */
export function measurementForField(field:ParameterId,value:number,unit:string):number|null{
 if(!Number.isFinite(value))return null;
 if(field==='dataRate'&&/^[MG]$/i.test(unit))return toCanonical(value,unit.toUpperCase()+'bps','bps');
 if(['channelCount','portCount'].includes(field)&&['口','端口','个','路'].includes(unit))return value;
 if(field==='sampleRate'&&/^[kMG]?Hz$/.test(unit))return toCanonical(value,unit,'Hz');
 if(['canChannels','uartChannels','pwmOutputs','pwmChannels','canFdChannels'].includes(field)&&['路','通道','个'].includes(unit))return value;
 if(field==='cmtiMin'&&/^kV\s*\/\s*(?:u|μ|µ)s$/i.test(unit))return value;
 return toCanonical(value,unit,PARAMETERS[field].unit);
}
const NUMBER = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?';
const UNIT = '(?:[nuμµ]?V\\/(?:√Hz|rtHz|srHz)|[kMm]?Ω|kVrms|Vrms|[kMG]?sps|[kMG]?bps|[kMG]?Hz|[KM]B|[munpμµ]?A|mV\/Gs|V\/Gs|V\/V|[kmuμµ]?V|[muμµn]?s|%|ppm|路(?!由|径)|通道|摄氏度|°C|℃|度|引脚)';
/** Shared source measurements for model-plan coverage and unit checks. */
export function sourceMeasurements(text: string, interpretedField?: string) {
  if(/[\u202A-\u202E\u2066-\u2069]/.test(text))return [];
  const sourceNumber = NUMBER.replace(/\[-\+\]/g, '[-+−]');
  const numberValue = (raw:string)=>Number(raw.replace(/−/g,'-'));
  const units = `(?:kV\\s*\\/\\s*[uμµ]s|[pnumμµ]?F|${UNIT})`;
  // Decimal commas, fractions and split numeric groups need interpretation;
  // a suffix alone must not be accepted as their complete value.
  const fragment=(at:number)=>/(?:\d[.,]\s*|\d\s*[\/∕⁄×*·]\s*|\d\s+|\d\s*(?:\^|\*\*)\s*|[\d.⁻⁺√])$/u.test(text.slice(0,at));
  let measurements = [...text.matchAll(new RegExp(`(${sourceNumber})\\s*(${units})(?=$|[^A-Za-z0-9])`, 'gi'))]
    .filter(match=>!fragment(match.index!))
    .map(match => ({ value: numberValue(match[1]), unit: match[2], text: match[0],
      start: match.index!, end: match.index! + match[0].length }));
  const range = new RegExp(`(${sourceNumber})\\s*(${UNIT})?\\s*(?:~|～|–|至|到|to|-)\\s*(${sourceNumber})\\s*(${UNIT})(?=$|[^A-Za-z0-9])`, 'gi');
  for (const m of text.matchAll(range)) {
    if(fragment(m.index!))continue;
    const start=m.index!,end=start+m[0].length;
    // The separator in 3-5V is not a negative sign on the upper endpoint.
    measurements=measurements.filter(x=>x.start<start||x.start>=end);
    const rightStart=start+m[0].lastIndexOf(m[3]);
    measurements.push({value:numberValue(m[1]),unit:m[2]||m[4],text:m[1],start,end:start+m[1].length});
    measurements.push({value:numberValue(m[3]),unit:m[4],text:text.slice(rightStart,end),start:rightStart,end});
  }
  const digits: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const count = (value: string): number | null => {
    if (/^\d+$/.test(value)) return Number(value);
    if (digits[value]) return digits[value];
    if (!/^[一二三四五六七八九]?十[一二三四五六七八九]?$/.test(value)) return null;
    const [tens, ones] = value.split('十'); return (tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0);
  };
  for (const m of text.matchAll(/(?<![一二两三四五六七八九十百])([一二两三四五六七八九十]{1,3})\s*(路(?!由|径)|通道)/g)) {
    const value = count(m[1]);
    if (value !== null) measurements.push({ value, unit: m[2], text: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  for (const m of text.matchAll(/(?<![\d一二两三四五六七八九十百])(\d+|[一二两三四五六七八九十]{1,3})\s*(?:路|通道|个|x)?\s*(?:UART|PWM|CAN(?:[ -]?FD)?|SPI|I2C)(?=$|[^A-Za-z])/gi)) {
    const value = count(m[1]);
    if (value !== null && !measurements.some(x => x.start === m.index)) measurements.push({ value, unit: '路', text: m[0], start: m.index!, end: m.index! + m[0].length });
  }
  // Chinese Ethernet speed names are dimensioned terms; do not read resistance, storage or RF units as rates.
  const namedEthernetRates:Record<string,number>={'十兆':10,'百兆':100,'千兆':1000,'万兆':10000};
  for(const m of text.matchAll(/(?<![零〇一二两三四五六七八九十百千万点\d])(十兆|百兆|千兆|万兆)(?=$|[\s，,；;。？！?]|以太网|网卡|交换机|PHY\b|电口|网口|网络|速率|车载(?=\s*(?:PHY\b|以太网|网络|电口|网口)))/gi)){
    if(/^(?:欧|Ω|瓦|W|字节|B|Hz|赫)/i.test(text.slice(m.index!+m[0].length).trimStart()))continue;
    measurements.push({value:namedEthernetRates[m[1]],unit:'Mbps',text:m[0],start:m.index!,end:m.index!+m[0].length});
  }
  // Bare spoken “100兆” has no unique dimension by itself. Only a model-authored
  // dataRate field permits this mechanical scale conversion; no category/operator
  // is inferred here. Explicit resistance/storage/RF suffixes remain ineligible.
  if(interpretedField==='dataRate')for(const m of text.matchAll(/(?<![\w.一二两三四五六七八九十百])([零〇一二两三四五六七八九十百千万点]+|\d+(?:\.\d+)?)\s*兆(?=$|[\s，,；;。？！?]|(?:的)?(?:以太网|网口|电口|网络|速率|PHY\b))/gi)){
    if(fragment(m.index!)||/^(?:欧|Ω|瓦|W|字节|B|Hz|赫|像素|采样|sps)/i.test(text.slice(m.index!+m[0].length).trimStart()))continue;
    const rate = spokenNumber(m[1]);
    if (rate !== null && !measurements.some(row => row.start === m.index && row.unit === 'Mbps')) measurements.push({value:rate,unit:'Mbps',text:m[0],start:m.index!,end:m.index!+m[0].length});
  }
  // Frequency-prefix shorthand is dimension-bound, not a global “兆 = MHz” alias.
  // A source may name the frequency role, or the model may bind a standalone scalar.
  const frequencyFields=['gbw','bandwidth','switchingFrequency','cpuClock'];
  const frequencyRole=/(?:带宽(?:积)?|频率|频点|时钟|GBW\b|GBP\b|bandwidth\b|frequency\b|clock\b)/i;
  const explicitFrequencyRole=/(?:频率|频点|时钟|增益带宽|GBW\b|GBP\b|frequency\b|clock\b)/i;
  const otherDimension=/(?:网络|网口|吞吐|网速|以太网|内存|存储|像素)/i;
  const trailingFrequencyRole=new RegExp('^\\s*(?:以上|以下|以内|及以上|及以下)?\\s*(?:的\\s*)?('+frequencyRole.source+')','i');
  const precedingFrequencyRole=new RegExp(frequencyRole.source+'[^\\d]*$','i');
  for(const m of text.matchAll(/(?<![\w.一二两三四五六七八九十百])(\d+(?:\.\d+)?)\s*(兆|[kKMG])/g)){
    const prefix=text.slice(0,m.index!).split(/[，,；;。？！?]/).pop()||'';
    const remainder=text.slice(m.index!+m[0].length);
    const suffix=remainder.split(/[，,；;。？！?]/)[0];
    const trailingRole=suffix.match(trailingFrequencyRole)?.[1]||'';
    if(!trailingRole&&!/^(?:$|[\s，,；;。？！?])/.test(remainder))continue;
    const precedingRole=prefix.match(precedingFrequencyRole)?.[0]||'';
    const namedRole=(precedingRole||trailingRole)&&!otherDimension.test(prefix+suffix);
    const frequencyContext=frequencyFields.includes(interpretedField||'')||explicitFrequencyRole.test(precedingRole+trailingRole)
      ||/运放|放大器|滤波器|amplifier|opamp/i.test(text);
    const scalarOnly=text.trim()===m[0].trim();
    if(fragment(m.index!)||!(namedRole&&frequencyContext)&&!(frequencyFields.includes(interpretedField||'')&&scalarOnly)
      ||/^\s*(?:欧|Ω|瓦|W|字节|B(?!andwidth\b)|Hz|赫|像素|采样|sps|bps)/i.test(suffix))continue;
    if(!measurements.some(r=>r.start===m.index!))measurements.push({value:Number(m[1]),unit:m[2]==='兆'?'MHz':m[2].replace('K','k')+'Hz',text:m[0],start:m.index!,end:m.index!+m[0].length});
  }
  for(const m of text.matchAll(/(?<![\d.零一二两三四五六七八九十百])(\d+|[一二两三四五六七八九十]+)个(?=(?:独立)?(?:千兆|百兆|万兆)?(?:网口|以太网端口))/g)){
    const value=spokenNumber(m[1]);
    if(value!==null&&!measurements.some(x=>x.start===m.index))measurements.push({value,unit:'口',text:m[0],start:m.index!,end:m.index!+m[0].length});
  }
  for(const m of text.matchAll(/([单双])通道/g)){
    measurements.push({value:m[1]==='单'?1:2,unit:'通道',text:m[0],start:m.index!,end:m.index!+m[0].length});
  }
  // Ethernet shorthand is a rate only next to a wired-link role, never a mobile generation or memory unit.
  for(const m of text.matchAll(/(?<![\w.])(\d+(?:\.\d+)?)\s*([MG])\s*(?=电口|网口|以太网|PHY\b|Ethernet\b)/gi)){
    measurements.push({value:Number(m[1]),unit:m[2].toUpperCase()+'bps',text:m[0],start:m.index!,end:m.index!+m[0].length});
  }
  for(const m of text.matchAll(/(?<![\w一二两三四五六七八九十])(?:单|双|[一二两三四五六七八九十]{1,3}|\d+)\s*(?:端口|口)(?=$|[^A-Za-z])/g)){
    const numeral=m[0].replace(/\s*(?:端口|口)$/,'').trim();
    const value=numeral==='单'?1:numeral==='双'?2:count(numeral);
    if(value!==null)measurements.push({value,unit:'通道',text:m[0],start:m.index!,end:m.index!+m[0].length});
  }
  // Preserve original offsets and spelling. This only bridges spoken numerals/units;
  // model-authored roles and comparison semantics remain independently validated.
  for(const spoken of spokenMeasurements(text)){
    // A spoken sign owns the entire numeric span (零下40℃ includes 40℃).
    if(/^零[上下]/.test(spoken.text))measurements=measurements.filter(m=>!(m.start>=spoken.start&&m.end<=spoken.end));
    if(!measurements.some(m=>m.start===spoken.start&&m.end===spoken.end))measurements.push(spoken);
  }
  return measurements.sort((a, b) => a.start - b.start);
}
const RANGE_SEPARATOR = '(?:\\s*(?:~|～|–|至|到|-)\\s*|\\s+to\\s+)';
const MEASUREMENT = `(?:±\\s*)?${NUMBER}\\s*(?:${UNIT})?(?:${RANGE_SEPARATOR}${NUMBER}\\s*(?:${UNIT})?)?`;
const OP = '(?:不(?:能|得)(?:超过|高于|大于|低于|小于)|起码|至少|不低于|不少于|不小于|大于等于|大于|高于|超过|不超过|不高于|不大于|小于等于|小于|低于|最大|最小|>=|<=|>|<|≥|≤|=)?';
const normalizeKey = (text: string) => text.replace(/[\s_()（）]/g, '').toLowerCase();
export function parameterForHeader(header: string): ParameterId | null {
  if (/绝对最大|absolute|surge|esd|ripple|drift|漂移|共模瞬态|common.mode.transient/i.test(header)) return null;
  if (/瞬态|transient/i.test(header) && !/输入瞬态耐压|瞬态输入耐压|inputtransientvoltage|transientinputvoltage/i.test(normalizeKey(header))) return null;
  if (/gainerror|增益误差|gainbandwidth|增益带宽/i.test(normalizeKey(header))) return /gainbandwidth|增益带宽/i.test(normalizeKey(header)) ? 'gbw' : null;
  const key = normalizeKey(header);
  // A multi-rail device needs a named supply role. Do not turn either rail
  // into a generic Vin fact or merge their limits into a false range.
  if (/^vcc(?:a|b)/.test(key)) return null;
  return (Object.keys(PARAMETERS) as ParameterId[]).find(field => PARAMETERS[field].aliases.test(key)) || null;
}
function headerUnit(header: string): string | null {
  for (const match of header.matchAll(/[（(]([^）)]+)[）)]/g)) {
    const value = match[1].split(',')[0].trim();
    if (unitInfo(value)) return value;
  }
  return null;
}
interface Measurement { shape: 'scalar' | 'range' | 'set'; values: number[]; }
function measurement(raw: string, expected: string, defaultUnit?: string | null): Measurement | null {
  const text = raw.trim().replace(/µ/g, 'μ');
  const unitMatches = [...text.matchAll(new RegExp(`(?<![A-Za-z])${UNIT}(?![A-Za-z])`, 'gi'))];
  const units = unitMatches.map(m => m[0]);
  const unit = units.at(-1) || defaultUnit;
  const unitCompatible = (rawUnit: string) => {
    const info = unitInfo(rawUnit);
    // Isolation tables sometimes abbreviate kVrms as kV in the column header.
    // Scope that convention to the isolation field; ordinary voltage fields
    // must continue to treat kV as volts, not Vrms.
    return Boolean(info && (info[0] === expected || (expected === 'sps' && info[0] === 'Hz')
      || (expected === 'Vrms' && info[0] === 'V' && /^kV$/i.test(rawUnit))));
  };
  if (!unit || !unitCompatible(unit)) return null;
  const fixed = /^(?:fixed(?:\s+output)?|固定(?:输出)?|可选)/i.test(text);
  const stripped = text.replace(/^(?:fixed(?:\s+output)?|固定(?:输出)?|可选|adjustable|可调(?:输出)?)\s*[:：]?\s*/i, '').replace(/^[（(]|[）)]$/g, '');
  // Reject prose and conditional/multi-variant fragments instead of taking their first number.
  const clean = stripped.replace(new RegExp(`(?<![A-Za-z])${UNIT}(?![A-Za-z])`, 'gi'), '').trim();
  if (!/^[\d.\s+±~,，、/～–\-toe至到]+$/i.test(clean)) return null;
  const range = clean.match(new RegExp(`^(${NUMBER})${RANGE_SEPARATOR}(${NUMBER})$`, 'i'));
  let shape: Measurement['shape'] = 'scalar', values: number[];
  if (/^±/.test(clean)) { const n = Number(clean.replace(/^±\s*/, '')); values = [-n, n]; shape = 'range'; }
  else if (range) { values = [Number(range[1]), Number(range[2])]; shape = 'range'; }
  else if (fixed || /[,，、/]/.test(clean)) {
    const parts = clean.split(/[,，、/]/).map(x => x.trim());
    if (parts.some(part => !part)) return null; // "/" and empty option cells are missing data, not 0.
    values = parts.map(Number);
    shape = 'set';
  }
  else { values = [Number(clean)]; }
  if (values.some(n => !Number.isFinite(n))) return null;
  const converted = values.map((n, i) => {
    const selectedUnit = units.length === values.length ? units[i] : unit;
    const info = unitInfo(selectedUnit);
    if (expected === 'Vrms' && /^kV$/i.test(selectedUnit)) return Number((n * 1e3).toPrecision(12));
    if (expected === 'sps' && info?.[0] === 'Hz') return Number((n * info[1]).toPrecision(12));
    return toCanonical(n, selectedUnit, expected);
  });
  if (converted.some(v => v == null)) return null;
  const normalized = converted as number[];
  if (shape === 'range' && normalized[0] > normalized[1]) return null;
  return { shape, values: normalized };
}
export interface ParameterFact extends Measurement {
  field: ParameterId;
  unit: string;
  statistic: 'min' | 'max' | 'typical' | 'unspecified';
  source: { field: string; raw: string; kind: 'table' | 'numeric'; verified?: VerifiedSource };
}
export interface FactProduct { part_number?: string; _orderable_configurations?: unknown;
  _adjustable_orderables?: unknown; _params?: string; _params_numeric?: Record<string, unknown>; [key: string]: unknown; }
/** Count explicitly additive switch ports; multiplexed interface names count once. */
export function switchPortCount(description:string):number|null{
  const text=description.replace(/[（(].*$/,'').replace(/\s*(?:工业级|傻瓜|Dumb|lite management|云管交换机).*$/i,'').trim();
  const parts=text.split('+');let total=0;
  for(const part of parts){
    const m=part.trim().match(/^(?:(\d+)\s*\*?\s*)?(?:FE|GE|2\.5G|5G|10G|G|RGMII|SGMII|USXGMII|XFI|Fiber|Serdes)(?:\/(?:RGMII|SGMII|USXGMII|XFI|Serdes))?(?:\s+combo)?$/i);
    if(!m)return null;total+=m[1]?Number(m[1]):1;
  }
  return total>0?total:null;
}
/** In a translator's own intrinsic description, bus bit-width is lane count,
 * not ADC resolution, MCU word size or an integrated peripheral's capability. */
export function translatorChannelCount(description:string):number|null{
 if(!isLevelTranslatorDescription(description)||/\d+\s*(?:\/|~|至|to|-)\s*\d+\s*[- ]?bits?\b/i.test(description))return null;
 const values=[...new Set([...description.matchAll(/\b(\d+)\s*[- ]?bits?\b/gi)].map(m=>Number(m[1])))];
 return values.length===1&&Number.isSafeInteger(values[0])&&values[0]>0?values[0]:null;
}
/** Table values take precedence; detail prose and feature thresholds are not model-specific facts. */
export function readParameterFacts(product: FactProduct): ParameterFact[] {
  const facts: ParameterFact[] = [];
  const tableFields = new Set<ParameterId>();
  const append = (field: ParameterId, header: string, parsed: Measurement, raw: string, kind: 'table' | 'numeric') => {
    const statistic = /typ(?:ical)?|典型/i.test(header) ? 'typical' : /max|最大/i.test(header) ? 'max' : /min|最小/i.test(header) ? 'min' : 'unspecified';
    const verified = kind === 'table' ? sourceForObservedField(product, header, raw) : null;
    facts.push({ field, ...parsed, unit: PARAMETERS[field].unit, statistic, source: { field: header, raw, kind, ...(verified ? { verified } : {}) } });
    if(field==='channelCount'&&header==='端口'&&verified)facts.push({field:'portCount',...parsed,unit:'通道',statistic,source:{field:header,raw,kind,verified}});
  };
  for (const entry of (product._params || '').split('|')) {
    const colon = entry.search(/[:：]/);
    if (colon < 0) continue;
    const header = entry.slice(0, colon).trim(), raw = entry.slice(colon + 1).trim();
    if(/交换机|switch/i.test(String(product._section||''))&&header==='简介'&&sourceForObservedField(product,header,raw)){
      const count=switchPortCount(raw);
      if(count!==null){append('portCount',header,{shape:'scalar',values:[count]},raw,'table');tableFields.add('portCount');}
    }
    if(/PHY/i.test(raw)&&header==='简介'&&sourceForObservedField(product,header,raw)){
      const descriptionSource=sourceForObservedField(product,header,raw);
      if(descriptionSource&&/^单口\s*PHY$/i.test(descriptionSource.originalHeader)){
        append('channelCount',header,{shape:'scalar',values:[1]},raw,'table');
        facts.push({field:'portCount',shape:'scalar',values:[1],unit:'通道',statistic:'unspecified',source:{field:header,raw,kind:'table',verified:descriptionSource}});
      }
      const ethernetStandard=raw.match(/^(?:PHY\s+)?(10|100|1000)\s*BASE[- ]?(?:T1L|T1S|TX|T1|TE|T|FX)\b/i);
      if(ethernetStandard&&!tableFields.has('dataRate')){append('dataRate',header,{shape:'scalar',values:[Number(ethernetStandard[1])*1e6]},raw,'table');tableFields.add('dataRate');}
      const speed=raw.match(/^(?:[单双一二四八\d]+口)?(百兆|千兆|GE|FE)\s*PHY\b/i);
      if(speed&&!tableFields.has('dataRate')){append('dataRate',header,{shape:'scalar',values:[['百兆','FE'].includes(speed[1].toUpperCase())?1e8:1e9]},raw,'table');tableFields.add('dataRate');}
    }
    // A PHY port cell such as 2.5GE or 4*2.5GE carries link rate and port multiplicity.
    // Preserve the exact Wiki-bound cell as evidence; MAC SerDes rates do not supply copper-link facts.
    if(/PHY|网卡|以太网控制器/i.test(String(product._section||''))&&/^端口$/.test(header)&&sourceForObservedField(product,header,raw)){
      const combo=raw.match(/^(\d+)\s*[*×]\s*SGMII\s*\/\s*(\d+)\s*GE$/i);
      const portValue=combo&&combo[1]===combo[2]?combo[2]+'GE':raw;
      const legacy=portValue.match(/^(?:(\d+)\s*[*×]?\s*)?(GE|FE)$/i);
      if(legacy){append('channelCount',header,{shape:'scalar',values:[legacy[1]?Number(legacy[1]):1]},raw,'table');
        append('dataRate',header,{shape:'scalar',values:[legacy[2].toUpperCase()==='GE'?1e9:1e8]},raw,'table');
        tableFields.add('channelCount');tableFields.add('dataRate');continue;}
      const ports=raw.match(/^(?:(\d+)\s*[*×]\s*)?(2\.5|5|10)GE$/i);
      if(ports){
        const count=ports[1]?Number(ports[1]):1;
        if(count>0){append('channelCount',header,{shape:'scalar',values:[count]},raw,'table');
          append('dataRate',header,{shape:'scalar',values:[Number(ports[2])*1e9]},raw,'table');
          tableFields.add('channelCount');tableFields.add('dataRate');continue;}
      }
    }
    // The MCU guide combines two independent capacities in one cell. Never
    // interpret "1MB/516KB" as an unordered set for either memory role.
    if (/^flash\s*\/\s*ram$/i.test(header)) {
      tableFields.add('flash'); tableFields.add('ram');
      const parts = raw.match(/^\s*(\d+(?:\.\d+)?)\s*(MB|KB)\s*\/\s*(\d+(?:\.\d+)?)\s*(MB|KB)\s*$/i);
      if (parts) for (const [field, value, unit] of [['flash', parts[1], parts[2]], ['ram', parts[3], parts[4]]] as [ParameterId, string, string][]) {
        const canonical = toCanonical(Number(value), unit, 'KB');
        if (canonical != null) append(field, header, { shape: 'scalar', values: [canonical] }, raw, 'table');
      }
      continue;
    }
    if (/^can\s*\/\s*can-fd$/i.test(header)) {
      tableFields.add('canFdChannels'); tableFields.add('canChannels');
      const counts = raw.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
      if (counts) {
        append('canChannels', header, { shape: 'scalar', values: [Number(counts[1])] }, raw, 'table');
        append('canFdChannels', header, { shape: 'scalar', values: [Number(counts[2])] }, raw, 'table');
      }
      continue;
    }
    if (/^epwm\s*\/\s*hrpwm$/i.test(header)) {
      tableFields.add('pwmChannels');
      const counts = raw.match(/^\s*(\d+)\s*\/\s*\d+\s*$/);
      if (counts) append('pwmChannels', header, { shape: 'scalar', values: [Number(counts[1])] }, raw, 'table');
      continue;
    }
    if (/^temp\s*\(ta\)$/i.test(header)) {
      tableFields.add('temperatureMax');
      const choices = raw.match(/^\s*(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*)\s*°\s*C\s*$/i);
      if (choices) {
        const values = choices[1].split('/').map(Number);
        append('temperatureMax', header, { shape: values.length > 1 ? 'set' : 'scalar', values }, raw, 'table');
      }
      continue;
    }
    if (/ADC/i.test(String(product._section || '')) && /^(?:Number of Channels|输入通道\s*数量)$/i.test(header)) {
      tableFields.add('adcInputChannels');
      if (/^\d+$/.test(raw)) append('adcInputChannels', header, { shape: 'scalar', values: [Number(raw)] }, raw, 'table');
      continue;
    }
    if (/^cpu\*?$/i.test(header)) {
      tableFields.add('cpuClock');
      const clock = raw.match(/@\s*(\d+(?:\.\d+)?)\s*(MHz|GHz|kHz)/i);
      if (clock) {
        const canonical = toCanonical(Number(clock[1]), clock[2], 'Hz');
        if (canonical != null) append('cpuClock', header, { shape: 'scalar', values: [canonical] }, raw, 'table');
      }
      continue;
    }
    const isTemperatureSensor = /温度传感器/i.test(String(product._section || ''));
    const field = isTemperatureSensor && /^最高精度$/i.test(header) ? 'temperatureAccuracy' : parameterForHeader(header);
    if (!field) continue;
    tableFields.add(field);
    // Current-sensor tables may list several selectable ranges in one cell
    // (for example "±30、30、±50、50"). Only signed entries prove a
    // bipolar measurement range; unsigned entries are separate unipolar
    // options and must not be treated as ± values.
    if (field === 'currentRange') {
      const source = sourceForObservedField(product, header, raw);
      const options = raw.split(/[,，、]/).map(value => value.trim()).filter(Boolean);
      const ranges = options.flatMap(option => {
        const symmetric = option.match(/^±\s*(\d+(?:\.\d+)?)\s*(?:A)?$/i);
        if (symmetric) return [[-Number(symmetric[1]), Number(symmetric[1])]];
        const interval = option.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:~|～|–|至|到|-)\s*([+-]?\d+(?:\.\d+)?)\s*(?:A)?$/i);
        return interval ? [[Number(interval[1]), Number(interval[2])]] : [];
      });
      for (const values of ranges) {
        if (values.every(Number.isFinite) && values[0] <= values[1]) facts.push({ field, shape: 'range', values,
          unit: PARAMETERS[field].unit, statistic: 'unspecified',
          source: { field: header, raw, kind: 'table', ...(source ? { verified: source } : {}) } });
      }
      if (ranges.length) continue;
    }
    // Some vendor tables abbreviate a frequency with a prefix while the
    // column header supplies the dimension (e.g. 240K under "Bandwidth (Hz)",
    // or 100k~1MHz in a switching-frequency cell).
    if (['bandwidth', 'gbw', 'switchingFrequency', 'sampleRate'].includes(field)
      && (/^(?:Hz|KHz)$/i.test(headerUnit(header) || '')
        || /^\s*\d+(?:\.\d+)?\s*[kMG]\s*(?:Hz)?\s*(?:~|～|–|至|到|-)\s*\d+(?:\.\d+)?\s*[kMG]\s*(?:Hz)?\s*$/i.test(raw))) {
      const multiplier = (prefix: string) => ({ k: 1e3, m: 1e6, g: 1e9 } as Record<string, number>)[prefix.toLowerCase()];
      const abbreviatedRange = raw.match(/^\s*(\d+(?:\.\d+)?)\s*([kMG])\s*(?:Hz)?\s*(?:~|～|–|至|到|-)\s*(\d+(?:\.\d+)?)\s*([kMG])\s*(?:Hz)?\s*$/i);
      if (abbreviatedRange) {
        append(field, header, { shape: 'range', values: [
          Number(abbreviatedRange[1]) * multiplier(abbreviatedRange[2]),
          Number(abbreviatedRange[3]) * multiplier(abbreviatedRange[4]),
        ] }, raw, 'table');
        continue;
      }
      const optionText = raw.replace(/\s*(?:可选|optional)\s*$/i, '').trim();
      const options = optionText.split(/[,，、]/).map(value => value.trim());
      const abbreviated = options.map(option => option.match(/^(\d+(?:\.\d+)?)\s*([kMG])\s*(?:Hz)?$/i));
      if (abbreviated.every(Boolean)) {
        const values = abbreviated.map(match => Number(match![1]) * multiplier(match![2]));
        append(field, header, { shape: values.length > 1 ? 'set' : 'scalar', values }, raw, 'table');
        continue;
      }
    }
    if (field === 'gain') {
      const options = raw.match(/^\s*G\s*=\s*(\d+(?:\.\d+)?(?:\s*[,，、]\s*\d+(?:\.\d+)?)*)\s*$/i);
      if (options) {
        const values = options[1].split(/[,，、]/).map(value => Number(value.trim()));
        append(field, header, { shape: values.length > 1 ? 'set' : 'scalar', values }, raw, 'table');
        continue;
      }
    }
    if (field === 'iout' && /^\s*\d+(?:\.\d+)?\s*[munpμµ]?A\s*\/\s*CH\s*$/i.test(raw)) {
      const singleChannel = (product._params || '').split('|').some(cell =>
        /^\s*通道\s*数目\s*[:：]\s*1\s*CH\s*$/i.test(cell));
      if (singleChannel) {
        const match = raw.match(/^\s*(\d+(?:\.\d+)?)\s*([munpμµ]?A)\s*\/\s*CH\s*$/i)!;
        const current = toCanonical(Number(match[1]), match[2], 'A');
        if (current != null) append(field, header, { shape: 'scalar', values: [current] }, raw, 'table');
      }
      continue;
    }
    if(field==='vin' && /^(?:供电电压|Supply Voltage)$/i.test(header) && /^\d+(?:\.\d+)?V(?:\s*\/\s*\d+(?:\.\d+)?V)+$/i.test(raw)){
      append(field,header,{shape:'set',values:raw.split('/').map(v=>parseFloat(v))},raw,'table');
      continue;
    }
    const canonicalSupply = field === 'vin' && !sourceFactsForProduct(product).some(f => f.field === 'recommended_supply_voltage' && f.rating === 'operating')
      && sourceFactsForProduct(product).some(f => ['supply_voltage','供电电压'].includes(f.field)
      && f.publishedHeader === header && f.publishedValue === raw);
    const implicitUnit = canonicalSupply ? 'V' : field === 'gain' ? 'V/V' : ['channelCount','portCount'].includes(field) ? '通道'
      : field === 'commonModeVoltage' && String(product._section || '') === 'RS-485 收发器' && header === '共模电压范围' ? 'V' : null;
    const parsed = measurement(raw, PARAMETERS[field].unit, headerUnit(header) || implicitUnit);
    if (parsed) {
      append(field, header, parsed, raw, 'table');
      if (field === 'temperatureRange' && parsed.shape === 'range') {
        tableFields.add('temperatureMax');
        append('temperatureMax', header, { shape: 'scalar', values: [parsed.values[1]] }, raw, 'table');
      }
    }
  }
  if(catalogDeviceFamilies(product).includes('levelShift')){
    for(const f of sourceFactsForProduct(product).filter(f=>f.scope==='self'&&/^(?:产品描述|Description|Product Family|Device Type|器件类型)$/i.test(f.publishedHeader||''))){
      const count=translatorChannelCount(f.publishedValue||'');if(count===null)continue;
      facts.push({field:'channelCount',shape:'scalar',values:[count],unit:'通道',statistic:'unspecified',
        source:{field:f.publishedHeader!,raw:f.publishedValue!,kind:'table',verified:f.source}});
    }
  }
  // The automotive selection guide puts its catalog capacity summary in a
  // description cell ("42V/300mA ..."), not in dedicated numeric columns.
  // Only a Wiki-bound cell may supply these two catalog limits. The voltage
  // is an upper limit; it cannot by itself prove a complete working Vin range.
  if (/^(?:高压|低压)ldo$/i.test(String(product._section || ''))) {
    const description = (product._params || '').split('|').map(cell => cell.trim())
      .find(cell => cell.startsWith('产品描述: '))?.slice('产品描述: '.length);
    const source = description ? sourceForObservedField(product, '产品描述', description) : null;
    if (source?.document === '思瑞浦-汽车产品选型册_2026.pdf') {
      const summary = description!.match(/^(\d+(?:\.\d+)?)\s*V\s*[/,]\s*(\d+(?:\.\d+)?)\s*(m?A)\b/i);
      if (summary) {
        const inputV = Number(summary[1]);
        const currentA = toCanonical(Number(summary[2]), summary[3], 'A');
        const evidence = { field: '产品描述', raw: description!, kind: 'table' as const, verified: source };
        facts.push({ field: 'vin', shape: 'scalar', values: [inputV], unit: 'V',
          statistic: 'max', source: evidence });
        if (currentA != null) facts.push({ field: 'iout', shape: 'scalar', values: [currentA],
          unit: 'A', statistic: 'max', source: evidence });
      }
    }
  }
  for (const [header, item] of Object.entries(product._params_numeric || {})) {
    const field = /温度传感器/i.test(String(product._section || '')) && /^最高精度$/i.test(header)
      ? 'temperatureAccuracy' : parameterForHeader(header);
    if (!field || tableFields.has(field) || !item || typeof item !== 'object') continue;
    const value = item as { value?: number; min?: number; max?: number; unit?: string; raw?: string };
    if (!value.unit) continue;
    const parsed = value.raw ? measurement(value.raw, PARAMETERS[field].unit, value.unit) : null;
    if (parsed) { append(field, header, parsed, value.raw!, 'numeric'); continue; }
    // Non-numeric raw content is evidence of unresolved conditions, not permission to use a derived scalar.
    if (value.raw) continue;
    const values = typeof value.value === 'number' ? [value.value] : typeof value.min === 'number' && typeof value.max === 'number' ? [value.min, value.max] : [];
    const converted = values.map(n => toCanonical(n, value.unit!, PARAMETERS[field].unit));
    if (!converted.length || converted.some(v => v == null)) continue;
    append(field, header, { shape: values.length === 2 ? 'range' : 'scalar', values: converted as number[] }, String(value.value ?? `${value.min}~${value.max}`), 'numeric');
  }
  // UL1577 VISO is a dielectric withstand test rating. It is source-only
  // evidence from the Fact Store, kept distinct from the selection guide's
  // ambiguously named “隔离电压” column.
  for (const sourceFact of sourceFactsForProduct(product).filter(f =>
    f.field === 'isolation_withstand_vrms' && f.rating === 'test_rating'
    && typeof f.normalizedValue === 'number')) {
    facts.push({ field: 'isolationWithstand', shape: 'scalar',
      values: [sourceFact.normalizedValue as number], unit: 'Vrms', statistic: 'unspecified',
      source: { field: sourceFact.evidence.originalHeader,
        raw: `${sourceFact.evidence.originalValue} (${sourceFact.evidence.condition || 'UL1577 test rating'})`,
        kind: 'table', verified: sourceReference(sourceFact) } });
  }
  // Use the exact catalog-model row for CMTI/UVLO. A family introduction or
  // an unlabeled CMTI figure cannot establish a guaranteed minimum.
  for (const sourceFact of sourceFactsForProduct(product).filter(f =>
    f.scope === 'self' && (f.field === 'cmti_min_kv_per_us' || f.field === 'vcc_uvlo_threshold_v'))) {
    const value = Number(sourceFact.evidence.originalValue);
    if (!Number.isFinite(value)) continue;
    const field: ParameterId = sourceFact.field === 'cmti_min_kv_per_us' ? 'cmtiMin' : 'uvloThreshold';
    facts.push({ field, shape: 'scalar', values: [value], unit: PARAMETERS[field].unit,
      statistic: field === 'cmtiMin' && /\bmin\b|最小/i.test(sourceFact.evidence.originalHeader) ? 'min' : 'unspecified',
      source: { field: sourceFact.evidence.originalHeader, raw: sourceFact.evidence.originalValue,
        kind: 'table', verified: sourceReference(sourceFact) } });
  }
  // The NSE425X guide states transient Vin on the family page rather than in
  // each model row. The source reader admits it only while that model's own
  // working-input row still matches the inspected PDF.
  if (!tableFields.has('transientVin')) {
    for (const source of sourceFactsForProduct(product).filter(f => f.field === 'vin_transient' && f.rating === 'transient')) {
      const value = source.evidence.originalValue.match(/(?:高达|up to)\s*(\d+(?:\.\d+)?)\s*V/i);
      if (!value) continue;
      facts.push({
        field: 'transientVin', shape: 'scalar', values: [Number(value[1])], unit: 'V', statistic: 'max',
        source: { field: source.evidence.originalHeader, raw: source.evidence.originalValue,
          kind: 'table', verified: sourceReference(source) },
      });
    }
  }
  return facts;
}
export interface RequirementResult { status: MatchStatus; reason: string; evidence: ParameterFact[]; }
// Each listed ordering option must satisfy the same relation as the original request.
function compareOrderingOptions(options: number[], requirement: Requirement): MatchStatus {
  const [low, high] = requirement.values!;
  const decisions = options.map(value => {
    switch (requirement.operator) {
      case 'gt': return value > low;
      case 'gte': return value >= low;
      case 'lt': return value < low;
      case 'lte': return value <= low;
      case 'eq': return value === low;
      case 'between': return high === undefined || low > high ? null : low <= value && value <= high;
      default: return null;
    }
  });
  return decisions.every(d => d === true) ? 'matched' : decisions.every(d => d === false) ? 'unmatched' : 'unknown';
}
export function evaluateRequirement(product: FactProduct, requirement: Requirement): RequirementResult {
  if (requirement.kind !== 'parameter' || !requirement.field || !requirement.values?.length) return { status: 'unknown', reason: requirement.reason || '需求尚未明确', evidence: [] };
  const field = requirement.field;
  const conditionalRate = product._conditional_rate_resolution as { status?: unknown; header?: unknown } | undefined;
  if (field === 'dataRate' && conditionalRate?.status === 'orderable_specific_only'
      && conditionalRate.header === '最大码流 (Mbps)') {
    return { status: 'unknown', reason: '该家族不同订购料号的数据速率不同，须指定完整料号和封装', evidence: [] };
  }
  if (field === 'vcca' || field === 'vccb') return { status: 'unknown', reason: '双电源轨必须按已审阅的联合工作条件检查', evidence: [] };
  if (field === 'channelDirections') {
    const cell = (product._params || '').match(/(?:^|\|)\s*正向\s*\/\s*反向通道\s*[:：]\s*([^|]+)/i)?.[1];
    const pairs = [...(cell || '').matchAll(/(\d+)\s*\/\s*(\d+)/g)].map(match => [Number(match[1]), Number(match[2])]);
    if (!pairs.length) return { status: 'unknown', reason: '缺少可核验的正反向通道配置', evidence: [] };
    const evidence: ParameterFact[] = [{ field, shape: pairs.length > 1 ? 'set' : 'scalar', values: pairs.flat(), unit: '路', statistic: 'unspecified', source: { field: '正向/反向通道', raw: cell!.trim(), kind: 'table' } }];
    const decisions = pairs.map(pair => pair[0] === requirement.values![0] && pair[1] === requirement.values![1]);
    return { status: decisions.every(Boolean) ? 'matched' : decisions.every(value => !value) ? 'unmatched' : 'unknown',
      reason: decisions.includes(true) && decisions.includes(false) ? '同一系列有不同方向配置，需核对具体订购型号' : '按正向/反向成对字段判断', evidence };
  }
  let allFacts = readParameterFacts(product).filter(f => f.field === field
    && (!isMcuProduct(product) || !['canChannels', 'uartChannels', 'pwmOutputs', 'sleepCurrent'].includes(field) || Boolean(f.source.verified))
    && (field !== 'cmtiMin' && field !== 'uvloThreshold' || Boolean(f.source.verified)));
  if(field==='channelCount'&&allFacts.some(f=>f.source.verified)){
    allFacts=allFacts.filter(f=>f.source.verified);
    const fixed=allFacts.filter(f=>f.shape==='scalar');
    if(new Set(fixed.flatMap(f=>f.values)).size>1)return {status:'unknown',reason:'该型号通道数的原表字段与描述存在冲突，需核对适用范围',evidence:allFacts};
  }
  if (field === 'sleepCurrent' && isMcuProduct(product)) return { status: 'unknown',
    reason: '休眠电流需按同一低功耗模式、供电、温度、保留外设及唤醒源组合核对', evidence: allFacts };
  if (field === 'temperatureRange' && !allFacts.length) {
    const maxima = readParameterFacts(product).filter(f => f.field === 'temperatureMax' && f.source.verified && /Ta|环境|ambient/i.test(f.source.field));
    if (maxima.length && maxima.every(f => f.values.every(v => v < Math.max(...requirement.values!)))) {
      return { status: 'unmatched', reason: '已核验环境温度上限低于所需工作范围上限', evidence: maxima };
    }
  }
  if (field === 'canChannels' && allFacts.some(f => f.values[0] === 0)
    && readParameterFacts(product).some(f => f.field === 'canFdChannels' && f.values[0] > 0 && f.source.verified)) {
    return { status: 'unknown', reason: '普通CAN列为0但有CAN-FD控制器；经典CAN协议兼容性及可用路数需规格书核验', evidence: allFacts };
  }
  if (field === 'cmtiMin') {
    const guaranteed = allFacts.filter(f => f.statistic === 'min' && f.source.verified);
    if (!guaranteed.length) return { status: 'unknown', reason: '缺少该型号 CMTI 最小保证值；典型值或未标口径不能证明下限', evidence: allFacts };
    const target = requirement.values[0];
    const compareMinimum = (value:number) => {
      if (requirement.operator === 'gt') return value > target;
      if (requirement.operator === 'lt') return value < target;
      if (requirement.operator === 'lte') return value <= target;
      if (requirement.operator === 'eq') return value === target;
      if (requirement.operator === 'between') return requirement.values!.length === 2 && value >= target && value <= requirement.values![1];
      return value >= target;
    };
    const decisions = guaranteed.map(f => compareMinimum(f.values[0]));
    return { status: decisions.every(Boolean) ? 'matched' : decisions.some(Boolean) ? 'unknown' : 'unmatched',
      reason: '按该型号原表 CMTI (Min) 比较', evidence: guaranteed };
  }
  const all = requirement.testMethod
    ? allFacts.filter(f => new RegExp(`\\b${requirement.testMethod}\\b`, 'i').test(f.source.raw))
    : allFacts;
  if (requirement.testMethod && !all.length) {
    return { status: 'unknown', reason: `缺少 ${requirement.testMethod} 标准对应的型号级耐压测试证据`, evidence: [] };
  }
  if (field === 'packagePins') {
    const cell = (product._params || '').match(/(?:^|\|)\s*Pack\s*[:：]\s*([^|]+)/i)?.[1];
    const values = cell?.match(/\d{2,3}/g)?.map(Number) || [];
    if (!cell || !values.length || !cell.split(/[,，]/).every(option => /^\s*(?:(?:\(H\)|H)?LQFP|QFN)\s*-?\s*\d{2,3}(?:\s*\/\s*\d{2,3})*\s*$/i.test(option))) return { status: 'unknown', reason: '缺少可核验的型号封装引脚数', evidence: [] };
    const evidence: ParameterFact[] = [{ field, shape: values.length > 1 ? 'set' : 'scalar', values, unit: '引脚', statistic: 'unspecified', source: { field: 'Pack', raw: cell.trim(), kind: 'table' } }];
    const status = compareOrderingOptions(values, requirement);
    return { status, reason: status === 'unknown' ? '同一系列列有多个封装选项，缺少具体订购型号对应关系' : '按原表封装引脚数判断', evidence };
  }
  if (field === 'vout' && requirement.operator === 'eq') {
    const configs = reviewedOrderableConfigurations(product).filter(config => config.source.outputEvidence);
    if (!configs.length && Array.isArray(product._orderable_configurations)
      && product._orderable_configurations.some(config => config?.source?.outputEvidence)) {
      return { status: 'unknown', reason: '已收录订购配置的输出档位依据未通过核验', evidence: [] };
    }
    if (configs.length) {
      const matched = configs.filter(config => requirement.values!.some(value => Math.abs(value - config.outputVoltageV) < 1e-9));
      const evidence: ParameterFact[] = matched.map(config => ({ field, shape: 'scalar', values: [config.outputVoltageV],
        unit: 'V', statistic: 'unspecified', source: { field: 'Output Voltage', raw: config.source.outputEvidence!.originalValue,
          kind: 'table', verified: { factId: config.source.factId, document: config.source.document,
            documentSha256: config.source.documentSha256, factsSha256: config.source.factsSha256,
            page: config.source.outputEvidence!.physicalPage, locator: config.source.outputEvidence!.partNumber,
            originalHeader: 'Output Voltage', originalValue: config.source.outputEvidence!.originalValue,
            scope: 'catalog_model', rating: 'orderable_configuration' } } }));
      const adjustable = reviewedAdjustableOrderables(product).some(config => requirement.values!.some(value =>
        value >= config.adjustableRangeV.min && value <= config.adjustableRangeV.max));
      return { status: matched.length ? 'matched' : adjustable ? 'unknown' : 'unmatched',
        reason: matched.length ? '规格书订购型号对应的固定输出电压'
          : adjustable ? '存在可调订购版本，输出设定和应用条件仍需核验' : '已核订购型号均无所需固定输出电压', evidence };
    }
  }
  // A typical value or lower bound cannot prove an upper limit. Typical supplies
  // also cannot establish a complete operating input range.
  const facts = requirement.operator === 'lte' || requirement.operator === 'lt'
    ? all.filter(f => f.statistic !== 'typical' && f.statistic !== 'min')
    : field === 'vin' ? all.filter(f => f.statistic !== 'typical') : all;
  if (!facts.length) return { status: 'unknown', reason: all.length ? '只有典型值或不适用的界限，缺少所需范围或上限' : `缺少可核验的${PARAMETERS[field].label}`, evidence: all };
  if (field==='iq'&&['lte','lt'].includes(requirement.operator || '')&&!facts.some(f=>f.statistic==='max'||f.shape==='range')) {
    return {status:'unknown',reason:'目录静态电流有参考值，但未标明最大值或完整范围，不能保证满足上限',evidence:all};
  }
  if (field === 'vin' && requirement.operator === 'covers' && facts.every(f => f.shape === 'scalar' && f.statistic === 'unspecified' && f.source.field === '供电电压')
    && (requirement.values.length !== 1 || facts.some(f => f.values[0] !== requirement.values![0]))) {
    return {status:'unknown',reason:'原表只有未标最小/最大口径的单个供电电压值，不能证明完整工作输入范围，也不能据此断言其他电压不支持',evidence:facts};
  }
  if (field === 'propagationDelay' && !facts.some(f => f.statistic === 'max')) {
    return { status: 'unknown', reason: '传播延迟缺少最大值保证及测试条件', evidence: facts };
  }
  if (field === 'temperatureMax' && facts.some(f => f.shape === 'set')) {
    return { status: compareOrderingOptions(facts.flatMap(f => f.values), requirement),
      reason: '原表列出多个温度档，需确认具体订购型号与封装组合', evidence: facts };
  }
  if (requirement.operator === 'between') {
    const [low, high] = requirement.values;
    if (requirement.values.length !== 2 || low > high) return { status: 'unknown', reason: '容量区间无效', evidence: [] };
    const outcomes = facts.flatMap(f => f.shape === 'range' ? [null] : f.values.map(v => v >= low && v <= high));
    return { status: outcomes.length && outcomes.every(x => x === true) ? 'matched'
      : outcomes.length && outcomes.every(x => x === false) ? 'unmatched' : 'unknown', reason: '按容量是否落入用户上下限区间判断；多个订购档位需分别核验', evidence: facts };
  }
  const wanted = requirement.values;
  const epsilon = Number.EPSILON * Math.max(...wanted.map(Math.abs)) * 4;
  const compare = (fact: Measurement): boolean => {
    const low = Math.min(...fact.values), high = Math.max(...fact.values);
    if (requirement.operator === 'gte') return high + epsilon >= wanted[0];
    if (requirement.operator === 'gt') return high > wanted[0] + epsilon;
    if (requirement.operator === 'lte') return Math.max(...fact.values.map(Math.abs)) <= Math.abs(wanted[0]) + epsilon;
    if (requirement.operator === 'lt') return Math.max(...fact.values.map(Math.abs)) < Math.abs(wanted[0]) - epsilon;
    if (fact.shape === 'range') return wanted.every(v => low - epsilon <= v && v <= high + epsilon);
    if (requirement.operator === 'covers' && wanted.length > 1) return false;
    return wanted.every(v => fact.values.some(n => Math.abs(n - v) <= epsilon));
  };
  if (field === 'currentRange' && requirement.operator === 'covers') {
    // Range options in a model row are alternatives, not simultaneous facts.
    // A single explicit option that covers the requested bipolar span is a
    // usable candidate; a different unsigned/signed option must not veto it.
    const decisions = facts.map(compare);
    return { status: decisions.some(Boolean) ? 'matched' : decisions.every(value => !value) ? 'unmatched' : 'unknown',
      reason: decisions.some(Boolean) ? '至少一个已列电流量程档位覆盖目标范围' : '按型号列出的电流量程档位判断', evidence: facts };
  }
  if (field === 'vin') {
    if(facts.every(f=>f.shape==='set') && requirement.operator==='covers' && wanted.length===1){
      const listed=facts.every(f=>f.values.includes(wanted[0]));
      return {status:listed?'matched':'unknown',reason:listed?'原表明确列有该供电工作点':'所需工作点未在离散供电选项中列明',evidence:facts};
    }
    const ranges = facts.filter(f => f.shape === 'range');
    const lows = [...facts.filter(f => f.statistic === 'min' && f.shape === 'scalar').map(f => f.values[0]), ...ranges.map(f => f.values[0])];
    const highs = [...facts.filter(f => f.statistic === 'max' && f.shape === 'scalar').map(f => f.values[0]), ...ranges.map(f => f.values[1])];
    const conflict = (values: number[]) => values.some(value => Math.abs(value - values[0]) > epsilon);
    if (conflict(lows) || conflict(highs) || (lows.length && highs.length && lows[0] > highs[0])) {
      return { status: 'unknown', reason: '工作输入范围证据冲突或适用条件不同', evidence: facts };
    }
    // Some catalog tables state a single rated working supply (for example,
    // "工作电压(V): 5"). That can confirm a request for that exact supply,
    // but it must not be treated as a full operating range.
    if (!lows.length && !highs.length && facts.every(f => f.shape === 'scalar' && f.statistic === 'unspecified')) {
      const decisions = facts.map(f => f.values[0] === wanted[0]);
      return { status: decisions.every(Boolean) ? 'matched' : decisions.every(v => !v) ? 'unmatched' : 'unknown',
        reason: decisions.every(Boolean) ? '按原表标注的额定工作电压判断' : '单一额定工作电压与目标不一致或存在差异', evidence: facts };
    }
    if (!lows.length || !highs.length) {
      const outsideKnownLimit = wanted.some(value =>
        (lows.length && value < lows[0] - epsilon)
        || (highs.length && value > highs[0] + epsilon));
      return { status: outsideKnownLimit ? 'unmatched' : 'unknown',
        reason: outsideKnownLimit ? '超出已列输入边界' : '缺少完整工作输入范围', evidence: facts };
    }
    if (facts.some(f => f.shape !== 'range' && !(f.shape === 'scalar' && (f.statistic === 'min' || f.statistic === 'max')))) {
      return { status: 'unknown', reason: '存在未明确适用条件的输入电压档位', evidence: facts };
    }
    return { status: compare({ shape: 'range', values: [lows[0], highs[0]] }) ? 'matched' : 'unmatched', reason: '按一致的工作输入范围判断', evidence: facts };
  }
  if (field === 'commonModeVoltage' && (requirement.operator === 'gt' || requirement.operator === 'gte')) {
    const ceilings = facts.flatMap(f => f.shape === 'range' ? [f.values[1]]
      : f.statistic === 'max' ? f.values : []);
    if (!ceilings.length) return { status: 'unknown', reason: '缺少输入共模电压工作上限', evidence: facts };
    if (ceilings.some(value => Math.abs(value - ceilings[0]) > epsilon)) {
      return { status: 'unknown', reason: '输入共模电压上限证据冲突', evidence: facts };
    }
    return { status: requirement.operator === 'gt' ? ceilings[0] > wanted[0] + epsilon ? 'matched' : 'unmatched'
      : ceilings[0] + epsilon >= wanted[0] ? 'matched' : 'unmatched',
      reason: '按输入共模电压工作上限判断', evidence: facts };
  }
  if (field === 'switchingFrequency' && (requirement.operator === 'gt' || requirement.operator === 'gte') && facts.some(f => f.shape === 'range')) {
    const outcomes = facts.map(f => f.shape !== 'range' ? compare(f)
      : (requirement.operator === 'gt' ? Math.min(...f.values) > wanted[0] + epsilon : Math.min(...f.values) + epsilon >= wanted[0]) ? true
        : (requirement.operator === 'gt' ? Math.max(...f.values) <= wanted[0] + epsilon : Math.max(...f.values) + epsilon < wanted[0]) ? false : null);
    if (outcomes.includes(null) || outcomes.includes(true) && outcomes.includes(false)) return { status: 'unknown', reason: '开关频率范围跨越目标值，需确认可用配置及订购型号', evidence: facts };
    return { status: outcomes.every(Boolean) ? 'matched' : 'unmatched', reason: '按开关频率下限判断', evidence: facts };
  }
  // A frequency option or gain option belongs to an orderable variant. A mixed
  // set cannot certify one unspecified ordering code.
  if ((field === 'switchingFrequency' || field === 'bandwidth' || field === 'sampleRate' || field === 'gain' || field === 'magneticSensitivity') && facts.some(f => f.shape === 'set')) {
    const decisions = facts.flatMap(f => f.values.map(value => compare({ shape: 'scalar', values: [value] })));
    return { status: decisions.every(Boolean) ? 'matched' : decisions.every(v => !v) ? 'unmatched' : 'unknown',
      reason: '存在多个配置档位，需核对具体订购型号', evidence: facts };
  }
  const decisions = facts.map(compare);
  return { status: decisions.every(Boolean) ? 'matched' : decisions.every(v => !v) ? 'unmatched' : 'unknown', reason: decisions.some(Boolean) && decisions.some(v => !v) ? '参数证据冲突或适用条件不同' : '按型号参数与单位判断', evidence: facts };
}
export function requirementTag(field: ParameterId, op: Comparison, values: number[]): string {
  const v = values[0];
  if (field === 'channelDirections') return `${values[0]}正${values[1]}反`;
  if (values.length === 1) {
    if (field === 'vin' && op === 'covers') return `Vin_${v}V`;
    if ((field === 'vcca' || field === 'vccb') && op === 'covers') return `${field.toUpperCase()}_${v}V`;
    if (field === 'vout' && op === 'eq') return `Vout_${v}V`;
    if (field === 'iout' && ['gt', 'gte'].includes(op)) return `Iout_${v}A`;
    if (field === 'dataRate' && ['gt', 'gte'].includes(op)) return `${v / 1e6}Mbps`;
    if (field === 'isolation' && op === 'gte') return `${v / 1000}kVrms隔离`;
    if (field === 'isolationWithstand' && op === 'gte') return `${v / 1000}kVrms隔离耐压`;
  }
  const symbol = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', covers: '覆盖', between: '介于' }[op];
  return `${PARAMETERS[field].label}${symbol}${values.join('~')}${PARAMETERS[field].unit}`;
}
export function parseParameterRequirements(query: string): { requirements: Requirement[]; unresolved: QuerySpec['unresolved']; consumed: QuerySource[] } {
  const candidates: { field: ParameterId; match: { 0: string; index?: number }; value: string; op: string }[] = [];
  // Share the spoken quantity reader with model validation. Bind only a
  // nearby explicit parameter name and preserve the customer's original span.
  const converterRating = /dc[ -]?dc|buck|降压变换器/i.test(query)
    && !/瞬态|浪涌|绝对最大|开关管|抛负载|隔离耐压/i.test(query);
  for (const quantity of spokenMeasurements(query)) {
    const before = query.slice(0, quantity.start);
    const powerConverter = /dc[ -]?dc|buck|降压变换器|LDO|稳压器/i.test(query);
    const names = ['输出电流','负载电流','输入电压','输出电压','增益带宽积','带宽','最高工作温度','传播延迟'];
    if (converterRating) names.push('(?:最高)?耐压');
    if (powerConverter) names.push('负载(?:这边|端|侧)');
    const role = before.match(new RegExp(`(${names.join('|')})\\s*(?:[:：]|需要|要|得有|能到)?\\s*(${OP})\\s*(?:得能带|能带|要到|到)?\\s*$`));
    if (!role) continue;
    let field: ParameterId;
    if (role[1] === '最高工作温度') field = 'temperatureMax';
    else if (role[1] === '传播延迟') field = 'propagationDelay';
    else if (/带宽/.test(role[1])) {
      const gainBandwidth = role[1] === '增益带宽积' || /运放|运算放大器|opamp/i.test(query) && !/闭环|小信号|大信号|闭路|closed.loop|full.power/i.test(query);
      field = gainBandwidth ? 'gbw' : 'bandwidth';
    } else if (/电流|负载/.test(role[1])) field = 'iout';
    else field = role[1] === '输出电压' ? 'vout' : 'vin';
    const value = measurementForField(field, quantity.value, quantity.unit);
    if (value === null) continue;
    const match = {0: query.slice(role.index!, quantity.end), index: role.index};
    candidates.push({field, match, op: role[2] || (/耐压/.test(role[1]) ? '至少' : ''), value: String(value) + PARAMETERS[field].unit});
  }
  const isTemperatureAccuracyQuery = /温度传感器|temperature\s+sensor/i.test(query);
  for (const [field, def] of Object.entries(PARAMETERS) as [ParameterId, ParameterDefinition][]) {
    if (field === 'temperatureAccuracy' && !isTemperatureAccuracyQuery) continue;
    const prefix = new RegExp(`(?:${def.query})\\s*[:：]?\\s*(${OP})\\s*(${MEASUREMENT})`, 'gi');
    const suffix = new RegExp(`(${OP})\\s*(${MEASUREMENT})\\s*(?:${def.query})`, 'gi');
    for (const re of [prefix, suffix]) for (const match of query.matchAll(re)) candidates.push({ field: field==='bandwidth' && /运放|运算放大器|opamp/i.test(query) && !/闭环|小信号|大信号|闭路|closed.loop|full.power/i.test(query) ? 'gbw' : field, match, op: match[1], value: match[2] });
  }
  if(/PHY|物理层/i.test(query))for(const match of query.matchAll(new RegExp(`(${OP})\\s*(单口|双口|(?:[一二两三四五六七八九十]{1,3}|\\d+)\\s*(?:端口|口))`,'g'))){
    const count=sourceMeasurements(match[2]).find(m=>m.unit==='通道');
    if(count)candidates.push({field:'portCount',match,op:match[1],value:`${count.value}通道`});
  }
  // Spoken Chinese often writes signed sensor range as “量程正负 100A”.
  // Keep the original span for evidence while normalizing only its value.
  for (const match of query.matchAll(/(?:电流量程|量程|测量范围)\s*(?:正负|±)\s*(\d+(?:\.\d+)?)\s*(m?A)\b/gi)) {
    candidates.push({ field: 'currentRange', match, op: '', value: `±${match[1]}${match[2]}` });
  }
  // For a current-sensor query, a signed ampere value is a measurement range
  // even when an engineer omits the word “量程” (for example “±50A sensor”).
  if (/(?:电流传感器|current\s+sensor)/i.test(query)) {
    for (const match of query.matchAll(/(?:正负|±)\s*(\d+(?:\.\d+)?)\s*(m?A)\b/gi)) {
      candidates.push({ field: 'currentRange', match, op: '', value: `±${match[1]}${match[2]}` });
    }
  }
  for (const match of query.matchAll(/(?:工作温度|最高工作温度)\s*到\s*(\d+(?:\.\d+)?)\s*(度|°C)/gi)) {
    candidates.push({ field: 'temperatureMax', match, op: '至少', value: `${match[1]}${match[2]}` });
  }
  // “输入最高 60V” describes the upper end of the requested operating
  // input range. Keep the whole phrase as evidence so it is not left behind
  // as an unparsed modifier plus a legacy Vin tag.
  for (const match of query.matchAll(/(?:输入最高|最高输入(?:电压)?|最大输入(?:电压)?)\s*(\d+(?:\.\d+)?)\s*V\b/gi)) {
    candidates.push({ field: 'vin', match, op: '', value: `${match[1]}V` });
  }
  for (const match of query.matchAll(/(?:至少|不低于|不少于)?\s*(\d+)\s*(?:个|路)?\s*输入通道/gi)) {
    candidates.push({ field: 'adcInputChannels', match, op: /至少|不低于|不少于/.test(match[0]) ? '至少' : '', value: `${match[1]}通道` });
  }
  for (const match of query.matchAll(/(\d+(?:\.\d+)?)\s*V\s*(?:瞬态耐受|瞬态耐压|瞬态输入耐压)/gi)) {
    candidates.push({ field: 'transientVin', match, op: '至少', value: `${match[1]}V` });
  }
  for (const match of query.matchAll(/(\d+(?:\.\d+)?)\s*V\s*(?:电源\s*)?(?:正常|持续|连续|工作)?\s*输入/gi)) {
    candidates.push({ field: 'vin', match, op: '', value: `${match[1]}V` });
  }
  for (const match of query.matchAll(/(?:输出(?:电流)?|负载电流)\s*(?:至少|不低于|≥|>=)?\s*(\d+(?:\.\d+)?)\s*(m?A)\b/gi)) {
    candidates.push({ field: 'iout', match, op: /至少|不低于|≥|>=/.test(match[0]) ? '至少' : '', value: `${match[1]}${match[2]}` });
  }
  if (converterRating) {
    for (const match of query.matchAll(/(?:^|[，,。；;]\s*)(?:最高)?耐压\s*(\d+(?:\.\d+)?)\s*V\b/gi)) {
      candidates.push({field:'vin',match,op:'至少',value:match[1]+'V'});
    }
  }
  if (/LDO|DCDC|稳压|regulator/i.test(query) && !/栅极驱动|gate\s+driver/i.test(query)) {
    for (const match of query.matchAll(new RegExp(`电流\\s*(${OP})\\s*(${NUMBER}\\s*[muμµ]?A\\b)`, 'gi'))) {
      candidates.push({ field: 'iout', match, op: match[1], value: match[2] });
    }
  }
  for (const match of query.matchAll(/(?:增益|gain)\s*(\d+(?:\.\d+)?)(?!\s*(?:%|dB|MHz|kHz|Hz))/gi)) {
    candidates.push({ field: 'gain', match, op: '=', value: `${match[1]}V/V` });
  }
  for (const match of query.matchAll(/双通道|双路比较器|双路运放/gi)) {
    candidates.push({ field: 'channelCount', match, op: '=', value: '2通道' });
  }
  // In a single op-amp or level-translator request a bare channel count
  // describes the device. Keep counts for peripherals, rails or signals scoped.
  if (/运放|运算放大器|电平转换|电平移位|level[ -]?shift/i.test(query)) {
    for (const match of query.matchAll(/(?:^|[，,。；;]\s*)([一二两三四五六七八九十]+|\d+)\s*(?:路|通道)(?=\s*(?:车规|工规|运放|运算放大器|电平转换|电平移位|的\s*level[ -]?shift|[，,。；;]|$))/g)) {
      const value=sourceMeasurements(match[0]).find(m=>['路','通道'].includes(m.unit));
      if(value)candidates.push({field:'channelCount',match,op:'=',value:value.value+'通道'});
    }
  }
  for(const match of query.matchAll(/(?:带宽|增益带宽积)\s*(至少|不低于|大于|超过|≤|≥)?\s*(\d+(?:\.\d+)?)\s*(兆赫兹?)/g)){
    candidates.push({field:/运放|运算放大器|opamp/i.test(query)?'gbw':'bandwidth',match,op:match[1]||'',value:match[2]+'MHz'});
  }
  // A device-qualified count can appear mid-sentence (“找个四路的电平转换”).
  // Keep peripheral counts such as “四路输入接运放” out of this rule.
  for (const match of query.matchAll(/(?<![一二两三四五六七八九十百千\d])([一二两三四五六七八九十]+|\d+)\s*(?:路|通道)\s*的\s*(?=(?:车规(?:级)?的?\s*)?(?:运放|运算放大器|电平转换|电平移位|level[ -]?shift))/gi)) {
    const count = spokenNumber(match[1]);
    if (count !== null) candidates.push({field:'channelCount', match, op:'=', value:count+'通道'});
  }
  if (/运放|运算放大器|电平转换|电平移位|level[ -]?shift/i.test(query)) {
    for (const match of query.matchAll(/(?:^|[，,。；;])\s*通道(?:数|数量)?(?:给我来|要|需要)\s*([一二两三四五六七八九十]+|\d+)个(?=$|[，,。；;])/g)) {
      const count = spokenNumber(match[1]);
      if (count !== null) candidates.push({field:'channelCount',match,op:'=',value:count+'通道'});
    }
  }
  {
    const rateRole = /CAN[ -]?FD/i.test(query) ? '(?:数据速率|码流|数据段(?:速率)?)' : '(?:数据速率|码流)';
    for (const match of query.matchAll(new RegExp(`${rateRole}\\s*(?:要|得有)?\\s*(${OP})\\s*(?:得跑|跑到)?\\s*([零〇一二两三四五六七八九十百千万点]+|\\d+(?:\\.\\d+)?)\\s*兆(?=$|[，,；;。？！?\\s])`, 'g'))) {
      const rate = spokenNumber(match[2]);
      if (rate !== null) candidates.push({field:'dataRate',match,op:match[1],value:rate+'Mbps'});
    }
  }
  // Explicit channel-count comparisons are structured numeric requirements;
  // do not leave the comparator as a residual for the semantic model.
  for (const match of query.matchAll(new RegExp(`通道(?:数|数量)?\\s*(${OP})\\s*(\\d+)\\s*(?:个|路|通道)?`, 'gi'))) {
    candidates.push({ field: 'channelCount', match, op: match[1], value: `${match[2]}通道` });
  }
  for (const match of query.matchAll(/(\d+)\s*正\s*(\d+)\s*反|(?:正向\s*)(\d+)\s*(?:路)?\s*(?:反向\s*)(\d+)\s*路?/gi)) {
    candidates.push({ field: 'channelDirections', match, op: '=', value: `${match[1] || match[3]}/${match[2] || match[4]}路` });
  }
  for (const match of query.matchAll(/(?:降压到|降至|稳压到)\s*(\d+(?:\.\d+)?)\s*V/gi)) {
    candidates.push({ field: 'vout', match, op: '=', value: `${match[1]}V` });
  }
  // Unlabelled rate/isolation units are unambiguous. Bare amperes are output capacity only in power/driver queries.
  // Chinese engineering shorthand uses “50兆” or “50M” for 50 Mbps when
  // explicitly attached to data rate / bit-stream wording.
  for (const match of query.matchAll(new RegExp(`(?:数据速率|速率|码流)\\s*(${OP})\\s*(${NUMBER})\\s*(?:兆(?:比特|位)?(?:每秒|/s)?|M(?:bps)?)`, 'gi'))) {
    candidates.push({ field: 'dataRate', match, op: match[1], value: `${match[2]}Mbps` });
  }
  for (const [field, re] of [
    ['dataRate', new RegExp(`(${OP})\\s*(${NUMBER}\\s*[kMG]?bps)`, 'gi')],
    ['isolation', new RegExp(`(${OP})\\s*(${NUMBER}\\s*k?Vrms)`, 'gi')],
    ...(/LDO|DCDC|稳压|regulator/i.test(query) && !/栅极驱动|gate\\s+driver/i.test(query) ? [['iout', new RegExp(`(${OP})\\s*(${NUMBER}\\s*[muμµ]?A\\b)`, 'gi')] as const] : []),
  ] as [ParameterId, RegExp][]) for (const match of query.matchAll(re)) candidates.push({ field, match, op: match[1], value: match[2] });
  candidates.sort((a, b) => a.match.index! - b.match.index! || b.match[0].length - a.match[0].length);
  const requirements: Requirement[] = [], consumed: QuerySource[] = [];
  for (const match of query.matchAll(/(\d+(?:\.\d+)?)\s*V\s*(?:转|到|至|to|→|->)\s*(\d+(?:\.\d+)?)\s*V/gi)) {
    const source: QuerySource = { text: match[0], start: match.index!, end: match.index! + match[0].length, origin: 'rule' };
    for (const [field, value] of [['vin', Number(match[1])], ['vout', Number(match[2])]] as [ParameterId, number][]) {
      const operator = PARAMETERS[field].defaultOperator;
      requirements.push({ id: `q${source.start}-${field}`, tag: requirementTag(field, operator, [value]), kind: 'parameter', field, operator, values: [value], unit: 'V', strength: 'must', source });
    }
    consumed.push(source);
  }
  const standbyLimits=[...query.matchAll(/(?:待机电流|standby\s+current)\s*(?:必须|应当|需要|需|要)?\s*(?:不超过|小于等于|不大于|低于|小于|至多|≤|<=|<|=)?\s*\d+(?:\.\d+)?\s*[munμµ]?A\b/gi)];
  for (const { field, match, value, op } of candidates) {
    if(field==='iout' && standbyLimits.some(m=>match.index! < m.index!+m[0].length && match.index!+match[0].length>m.index!))continue;
    const source: QuerySource = { text: match[0], start: match.index!, end: match.index! + match[0].length, origin: 'rule' };
    if (consumed.some(s => source.start < s.end && source.end > s.start)) continue;
    const parsed = measurement(value, PARAMETERS[field].unit);
    if (!parsed) continue;
    if (field === 'iout' && parsed.values.some(v => Math.abs(v) > 200)) continue;
    let operator: Comparison = /不(?:能|得)?(?:超过|高于|大于)|小于等于|最大|<=|≤/.test(op) ? 'lte'
      : /^(?:小于|低于|<)$/.test(op) ? 'lt'
        : /起码|至少|不(?:能|得)?(?:低于|小于)|不少于|大于等于|最小|>=|≥/.test(op) ? 'gte'
          : /大于|高于|超过|(?<![<])>/.test(op) ? 'gt'
            : op === '=' ? 'eq' : PARAMETERS[field].defaultOperator;
    if (field === 'channelCount' && parsed.values.length === 1) {
      // Channel counts are discrete: “大于 2 通道” means at least 3,
      // while “小于 2 通道” means at most 1.
      if (operator === 'gt') { parsed.values[0] += 1; operator = 'gte'; }
      if (operator === 'lt') { parsed.values[0] -= 1; operator = 'lte'; }
    }
    if (parsed.shape === 'range' && ['vin', 'vout', 'currentRange', 'temperatureRange'].includes(field)) operator = 'covers';
    else if (parsed.shape === 'range' && ['flash', 'ram'].includes(field)) operator = 'between';
    else if (parsed.shape === 'range') parsed.values = [Math.max(...parsed.values.map(Math.abs))];
    const before = query.slice(Math.max(0, source.start - 12), source.start);
    const after = query.slice(source.end, source.end + 8);
    const strength = /(?:最好|优先|偏好|尽量|prefer)\s*$/i.test(before) || /^\s*(?:优先|preferred)/i.test(after) ? 'nice' : 'must';
    const tag = requirementTag(field, operator, parsed.values);
    requirements.push({ id: `q${source.start}-${field}`, tag, kind: 'parameter', field, operator, values: parsed.values, unit: PARAMETERS[field].unit, strength, source });
    consumed.push(source);
  }
  const unresolved: QuerySpec['unresolved'] = standbyLimits.map(m=>({
    source:{text:m[0],start:m.index!,end:m.index!+m[0].length,origin:'rule'},
    kind:'evidence',reason:'需原厂待机模式的电流和工况证据；静态工作电流或关断电流无法证明这一条件。'
  }));
  for (const match of query.matchAll(new RegExp(`${NUMBER}\\s*[muμµ]?V\\b`, 'gi'))) {
    const start = match.index!, end = start + match[0].length;
    if (consumed.some(s => start < s.end && end > s.start)) continue;
    // mV/Gs is a magnetic sensitivity unit, not an unlabelled voltage demand.
    if (/^\s*\/\s*Gs\b/i.test(query.slice(end, end + 8))) continue;
    // An explicit role with an unsupported modifier is unfinished parsing, not role ambiguity.
    if (/(?:输入(?:电压)?|输出(?:电压)?|供电(?:电压)?|失调(?:电压)?|vin|vout|vos|offset(?: voltage)?)\s*[:：]?\s*[^\d\s]{0,3}\s*$/i.test(query.slice(Math.max(0, start - 24), start))) continue;
    // Contexts such as ESD and offset are not silently treated as input/output voltage.
    const source: QuerySource = { text: match[0], start, end, origin: 'rule' };
    unresolved.push({ source, reason: `${match[0]}的参数角色尚不明确，请说明输入、输出或其他电压条件` });
  }
  return { requirements, unresolved, consumed };
}

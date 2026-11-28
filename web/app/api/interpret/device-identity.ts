/** Catalog ontology only: classify the selected chip from its table identity.
 * Never read application prose, feature tokens, part-number prefixes or numbers.
 * An internal peripheral may prove a capability; it cannot change this identity.
 */
type DeviceRecord={_section?:unknown;_params?:unknown;_selection_status?:unknown};
type Family='processor'|'can'|'lin'|'rs485'|'rs232'|'mlvds'|'phy'|'nic'|'switch'|'sbc'|'adc'|'dac'|'opamp'|'currentAmp'|'instrumentAmp'|'comparator'|'digitalIsolation'|'gateDriver'|'motorDriver'|'ldo'|'dcdc'|'reference'|'currentSensor'|'temperatureSensor'|'positionSensor'|'speedSensor'|'pressureSensor'|'sensorInterface'|'currentMonitor'|'analogSwitch'|'levelShift'|'ioExpander'|'reset'|'poe'|'i2cInterface'|'ledDriver'|'battery'|'highSideSwitch';
const families=(...values:Family[])=>values;
/** Intrinsic device descriptions, not application prose or integrated blocks.
 * This semantic alias is independent of a vendor's table heading. */
export function isLevelTranslatorDescription(value:string):boolean{
 const v=value.trim();
 const name=v.match(/\blevel[ -]?shift(?:er|ing)?\b|\b(?:logic[ -]?level|voltage[ -]?level|voltage)\s+translat(?:or|ing transceiver)\b|\btranslating transceiver\b|电平转换器|电平移位器/i);
 if(!name)return false;
 return !/\b(?:includes?|contains?|integrat(?:e[ds]?|ing)|with|for|without|no|not)\b|内置|集成|用于|不支持|不含/i.test(v.slice(0,name.index));
}
const TAG_FAMILIES:Readonly<Record<string,readonly Family[]>>={
 '高边开关':families('highSideSwitch'),
 'MCU/DSP':families('processor'),CAN:families('can'),'CAN-FD':families('can'),'隔离CAN':families('can'),'集成隔离电源的隔离CAN':families('can'),
 LIN:families('lin'),'RS-485':families('rs485'),'隔离RS485':families('rs485'),'集成隔离电源的隔离RS485':families('rs485'),'RS-232':families('rs232'),'隔离RS-232':families('rs232'),MLVDS:families('mlvds'),
 '隔离I2C':families('i2cInterface'),PHY:families('phy'),'T1-PHY':families('phy'),'以太网':families('phy','nic','switch'),SBC:families('sbc'),
 ADC:families('adc'),'隔离ADC':families('adc'),DAC:families('dac'),
 '运放':families('opamp'),'零漂运算放大器':families('opamp'),'高压运算放大器':families('opamp'),'低压运算放大器':families('opamp'),'差动放大器':families('opamp'),'对数放大器':families('opamp'),
 '放大器':families('opamp','currentAmp','instrumentAmp'),'电流检测放大器':families('currentAmp'),'仪表放大器':families('instrumentAmp'),'隔离放大器':families('opamp','currentAmp','instrumentAmp'),
 '比较器':families('comparator'),'数字隔离器':families('digitalIsolation'),
 '栅极驱动':families('gateDriver'),'隔离栅极驱动':families('gateDriver'),'非隔离栅极驱动':families('gateDriver'),
 '马达驱动':families('motorDriver'),'直流马达驱动':families('motorDriver'),'步进马达驱动':families('motorDriver'),
 LDO:families('ldo'),DCDC:families('dcdc'),'降压':families('dcdc'),'升压':families('dcdc'),'隔离电源':families('dcdc'),
 '电压基准':families('reference'),'并联型电压基准':families('reference'),'串联型电压基准':families('reference'),
 '数字功率监测器':families('currentMonitor'),'电流传感器':families('currentSensor'),'线性电流传感器':families('currentSensor'),
 '温度传感器':families('temperatureSensor'),'位置传感器':families('positionSensor'),'线性位置传感器':families('positionSensor'),'霍尔角度编码器':families('positionSensor'),'磁阻角度编码器':families('positionSensor'),
 '速度传感器':families('speedSensor'),'压力传感器':families('pressureSensor','sensorInterface'),'传感器接口':families('sensorInterface'),
 '模拟开关':families('analogSwitch'),'电平转换':families('levelShift'),'IO扩展器':families('ioExpander'),'复位芯片':families('reset'),
};
// More specific table identities precede generic words, e.g. current-sense
// amplifier is neither a current sensor nor a generic operational amplifier.
export function catalogDeviceFamilies(p:DeviceRecord):readonly Family[]{
 const s=String(p._section||'').replace(/\s+/g,'').toLowerCase();
 const cells=String(p._params||'');
 if(/mcu|dsp|微控制器|单片机/.test(s)||/(?:^|\|)\s*集成度\s*[:：]\s*MCU\b/i.test(String(p._params||'')))return families('processor');
 if(/高边开关|high[- ]?side.*switch/.test(s))return families('highSideSwitch');
 if(/交换机|switch/.test(s))return families('switch');
 if(/网卡|ethernetcontroller/.test(s))return families('nic');
 if(/phy|物理层/.test(s))return families('phy');
 if(/sbc|系统基础芯片/.test(s))return families('sbc');
 if(/can.*收发|隔离can/.test(s))return families('can');
 if(/lin.*收发/.test(s))return families('lin');
 if(/485/.test(s))return families('rs485');if(/232/.test(s))return families('rs232');if(/mlvds/.test(s))return families('mlvds');
 if(/模数\/数模/.test(s)){
  const params=String(p._params||'');
  const zero=(kind:string)=>new RegExp(`(?:^|\\|)\\s*${kind}\\s*(?:Input\\s*)?Channels?\\s*[:：]\\s*0\\s*(?=\\||$)`,'i').test(params);
  return [...(!zero('ADC')?families('adc'):[]),...(!zero('DAC')?families('dac'):[])];
 }
 if(/adc|模数转换/.test(s))return families('adc');if(/dac|数模转换/.test(s))return families('dac');
 if(/比较器|comparator/.test(s))return families('comparator');
 if(/电流.*放大器/.test(s))return families('currentAmp');if(/仪表放大/.test(s))return families('instrumentAmp');
 if(/运算放大|运放|放大器|调制器/.test(s))return families('opamp');
 if(/信号调理|磁调理|传感器接口/.test(s))return families('sensorInterface');
 if(/电流传感器/.test(s))return families('currentSensor');
 if(/温度传感|温湿度传感/.test(s))return families('temperatureSensor');
 if(/速度传感/.test(s))return families('speedSensor');if(/位置传感|角度编码器/.test(s))return families('positionSensor');
 if(/压力传感/.test(s))return families('pressureSensor');
 if(/数字式电流|功率检测器/.test(s))return families('currentMonitor');
 if(/数字隔离器/.test(s))return families('digitalIsolation');
 if(/隔离i2c/.test(s))return families('digitalIsolation','i2cInterface');
 if(/i2c.*电平转换/.test(s))return families('levelShift','i2cInterface');
 if(/i2c/.test(s))return families('i2cInterface');
 if(/栅极驱动/.test(s))return families('gateDriver');
 if(/电机.*驱动|马达驱动|电机预驱/.test(s))return families('motorDriver');
 if(/led.*驱动|led矩阵/.test(s))return families('ledDriver');
 if(/电池|\d+节-|bms/.test(s))return families('battery');
 if(/ldo|线性稳压/.test(s))return families('ldo');
 if(/电压基准/.test(s))return families('reference');
 if(/以太网供电/.test(s))return families('poe');
 if(/dc-?dc|降压变换|升压变换|隔离电源|pwm控制器|boost控制器/.test(s))return families('dcdc');
 if(/模拟开关/.test(s))return families('analogSwitch');if(/电平转换/.test(s))return families('levelShift');
 if(/io扩展/.test(s))return families('ioExpander');if(/复位/.test(s))return families('reset');
 // Generic/implementation headings do not establish the class. Read the
 // row's own product noun phrase; known conflicting primary classes above
 // retain precedence so an internal block cannot redefine an MCU/isolator.
 if(isLevelTranslatorDescription(String(p._section||'')))return families('levelShift');
 const descriptions=[...cells.matchAll(/(?:^|\|)\s*(?:产品描述|Description|Product Family|Device Type|器件类型)\s*[:：]\s*([^|]+)/gi)];
 if(descriptions.some(m=>isLevelTranslatorDescription(m[1])))return families('levelShift');
 // TXS/TXB is an intrinsic logic-translation technology family, independent
 // of “自动方向”. It only supplements rows without a descriptive class name.
 if(/(?:^|\|)\s*Technology Family\s*[:：]\s*(?:TXS|TXB)\s*(?:\||$)/i.test(cells))return families('levelShift');
 return [];
}
export function requestedDeviceFamilies(categories:readonly string[]):readonly Family[]{
 // In the existing flat MCU query contract, ADC/CAN tags alongside MCU mean
 // peripheral capabilities. They do not request several independent chips.
 if(categories.includes('MCU/DSP'))return families('processor');
 if(categories.includes('SBC'))return families('sbc');
 return [...new Set(categories.flatMap(t=>TAG_FAMILIES[t]||[]))];
}
export function matchesMainDeviceIdentity(product:DeviceRecord,categories:readonly string[]):boolean{
 if(categories.length&&product._selection_status==='identity_unverified')return false;
 const requested=requestedDeviceFamilies(categories),actual=catalogDeviceFamilies(product);
 if(categories.includes('隔离栅极驱动')&&!categories.includes('非隔离栅极驱动')&&!categories.includes('栅极驱动')&&/非隔离|non[ -]?isolated/i.test(String(product._section||'')))return false;
 if(categories.length&&actual.includes('processor')&&!requested.includes('processor'))return false;
 // Unknown identity is not proof of compatibility, but is not a proven conflict.
 // Existing source/capability checks still decide whether a candidate can match.
 return !requested.length||!actual.length||requested.some(f=>actual.includes(f));
}
export function compatibleMainDeviceCategories(before:readonly string[],after:readonly string[]):boolean{
 const a=requestedDeviceFamilies(before),b=requestedDeviceFamilies(after);
 return !a.length||!b.length||a.some(f=>b.includes(f));
}

/** Capability tags retain their meaning but must not become primary filters. */
export function primaryDeviceTags(tags:readonly string[],meta:readonly {tag:string;dimension:string}[]=[]):string[]{
 return tags.filter(tag=>!meta.some(m=>m.tag===tag&&m.dimension!=='category'));
}

/** A coarse table identity can establish the chip class, never a protocol,
 * subtype, numeric capability or complete requirement. Called only for a main
 * category in the scorer; internal peripheral matching stays separate.
 */
const COARSE_IDENTITY_TAGS=new Set(['数字功率监测器','高边开关','MCU/DSP','CAN','LIN','RS-485','RS-232','MLVDS','SBC','PHY','以太网','ADC','DAC','运放','放大器','比较器','仪表放大器','电流检测放大器','数字隔离器','栅极驱动','马达驱动','LDO','DCDC','电压基准','电流传感器','温度传感器','位置传感器','速度传感器','传感器接口','模拟开关','电平转换','IO扩展器','复位芯片']);
export function catalogProvesPrimaryClass(product:DeviceRecord,tag:string):boolean{
 const section=String(product._section||'');
 if(tag==='降压'||tag==='升压')return catalogDeviceFamilies(product).includes('dcdc')&&(tag==='降压'?/降压|\bbuck\b/i:/升压|\bboost\b/i).test(section)&&!(/升降压|buck[ -]?boost/i.test(section));
 if(tag==='隔离I2C')return /^隔离\s*I2C(?:\s*(?:隔离器|选型表))?$/i.test(section.trim());
 if(tag==='隔离栅极驱动')return catalogDeviceFamilies(product).includes('gateDriver')&&/隔离|isolated/i.test(String(product._section||''))&&!/非隔离|non[ -]?isolated/i.test(String(product._section||''));
 return COARSE_IDENTITY_TAGS.has(tag)&&catalogDeviceFamilies(product).some(f=>(TAG_FAMILIES[tag]||[]).includes(f));
}

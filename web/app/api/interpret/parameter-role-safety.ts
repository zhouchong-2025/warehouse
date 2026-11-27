import { currentPulse } from './current-pulse';
import type { ParameterId } from './selection-spec';
/** Explicit role conflicts are deferred, never converted into a different hard condition. */
export function parameterRoleConflict(field: ParameterId, source: string, query: string, categories: readonly string[] = []): string | null {
  if (field==='currentRange'&&categories.some(tag=>/放大器/.test(tag))&&!categories.some(tag=>/电流传感器/.test(tag))) return '这是测量链路的电流范围，需结合分流阻值、差分输入范围、增益及ADC满量程核验，不能直接当作放大器芯片的电流量程。';
  if (field==='iout'&&currentPulse(source)) return '这是带持续时间的电流工况，需按电流幅值、脉冲时间、占空比和热条件核验，不能当作持续输出额定值。';
  if (field==='switchingFrequency'&&/PWM/i.test(source)&&!/开关频率|switching.frequency/i.test(source)) return '这是外部PWM控制/调制工况，需核对器件允许的PWM频率和最小脉宽，不能用内部开关频率代替。';
  if (field==='vin'&&/共模|common.mode|\bVCM\b/i.test(source)) return '这是信号共模电压，不是器件供电VIN；保留原句按共模工作范围核验。';
  if (field==='vin'&&/输出|vout|output/i.test(source)&&!/输入|vin|input|转|→/i.test(source)) return '输出电压不能作为供电输入筛选。';
  if (field==='iout'&&/量程|检测电流|被测电流|采样电流|shunt|sense.current/i.test(source)) return '这是被测电流或量程，不是芯片输出驱动能力；需按检测链路核验。';
  const driving = categories.some(tag => /马达驱动|电机驱动|栅极驱动/.test(tag)) && !categories.some(tag => /电流.*(?:检测|采样).*放大器/.test(tag));
  if (field==='iout'&&!driving&&/电流检测|电流采样|分流电阻|current.sense/i.test(query)&&!/输出|output|iout/i.test(source)) return '电流检测场景中的负载/分流电流不能当作放大器输出电流；保留检测工况。';
  if (['temperatureRange','temperatureMax'].includes(field)&&/结温|\bTj\b/i.test(source)&&!/环境|ambient|\bTa\b/i.test(source)) return '这是结温要求，不应放入环境工作温度筛选；需按结温及热条件核验。';
  return null;
}

import { catalogDeviceFamilies } from './device-identity';
/** A resource context classifies the requested device, never proves product capabilities. */
export function isMcuResourceContext(source: string): boolean {
  const memory = /(?<![A-Za-z])(?:flash|ram|rom)(?![A-Za-z])|程序存储|闪存/i.test(source);
  const peripherals = [/(?<![A-Za-z])UART(?![A-Za-z])|串口/i, /(?<![A-Za-z])PWM(?![A-Za-z])|定时器/i, /(?<![A-Za-z])CAN(?=[\s\d-]|$)/i]
    .filter(pattern => pattern.test(source)).length;
  return memory && peripherals >= 2;
}
export const MCU_COUNT_ROLES = {
  canChannels: /(?<![A-Za-z])CAN(?=[\s\d.-]|$)|CAN控制器/i,
  canFdChannels: /(?<![A-Za-z])CAN[ -]?FD(?![A-Za-z])/i,
  uartChannels: /(?<![A-Za-z])UART(?![A-Za-z])|串口/i,
  pwmOutputs: /(?<![A-Za-z])PWM(?![A-Za-z])|PWM输出/i,
  pwmChannels: /(?<![A-Za-z])ePWM(?![A-Za-z])/i,
} as const;
export function validResourceCountSource(field: string, source: string): boolean {
  const role = MCU_COUNT_ROLES[field as keyof typeof MCU_COUNT_ROLES];
  if (!role) return true;
  const families = [/(?<![A-Za-z])UART(?![A-Za-z])|串口/i,
    /(?<![A-Za-z])e?PWM(?![A-Za-z])|PWM输出/i, /(?<![A-Za-z])CAN(?=[\s\d.-]|$)/i];
  return role.test(source) && families.filter(p => p.test(source)).length === 1;
}
export function isMcuProduct(product: { _section?: unknown; _params?: unknown }): boolean {
  return catalogDeviceFamilies(product).includes('processor');
}

export { matchesMainDeviceIdentity, primaryDeviceTags } from './device-identity';

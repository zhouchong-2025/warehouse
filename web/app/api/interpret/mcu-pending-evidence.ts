import { sourceFactsForProduct } from './source-facts';
import { isMcuProduct } from './resource-context';
import type { FactProduct } from './selection-spec';
import type { PendingEvidenceCheck } from './pending-evidence';
export function mcuPendingEvidence(product: FactProduct, source: string, role?: string): PendingEvidenceCheck | null {
  if (!isMcuProduct(product)) return null;
  const facts = sourceFactsForProduct(product);
  const base = { source, blocksMatch: !/优先|最好|偏好|不要求|不需要/.test(source), status: 'unknown' as const };
  if (role === 'protocol' || /CAN\s*2\.0/i.test(source)) {
    const rows = facts.filter(f => /CAN|通信接口|通信协议|interfaces/i.test(f.publishedHeader || ''));
    return { ...base, reason: '控制器数量、CAN-FD或FlexCAN名称不能单独证明CAN 2.0B协议及扩展帧支持，需核对该型号手册',
      observed: rows.map(f => `${f.publishedHeader}：${f.publishedValue}`).join('；') || undefined,
      evidence: rows.map(f => f.source), nextStep: '补查控制器协议章节、帧格式和所选封装引脚配置' };
  }
  if (role === 'wake' || /唤醒/.test(source)) return { ...base,
    reason: '需要核对MCU具体唤醒源及在目标休眠模式是否可用；接口器件的低功耗唤醒标签不能代替',
    evidence: [], nextStep: '补查低功耗模式、GPIO/外部中断/CAN/UART等实际唤醒源及保留外设条件' };
  if (role === 'power' || /(?:休眠|睡眠|待机).*电流/.test(source)) return { ...base,
    reason: '低休眠电流尚缺数值上限及同一模式、供电、温度和保留外设条件，不能由“低功耗”标签判定满足',
    evidence: [], nextStep: '先补齐各模式电流表；未量化的“低”保留为待比较诉求，不制造电流阈值' };
  if (role === 'configuration') return { ...base,
    reason: '外设数量分别具备不代表所选封装下可以同时使用，需核对引脚复用和工作模式组合',
    evidence: [], nextStep: '查完整订购型号的引脚表及CAN、UART、PWM同时使用的复用关系' };
  return null;
}

/** Supplemental datasheet evidence uses the same exact-model, published-cell gate.
 * No model names, package aliases or family prose are eligibility rules here.
 */
import { sourceFactsForProduct } from './source-facts';
import { sourceMeasurements, toCanonical, type FactProduct } from './selection-spec';
import type { PendingEvidenceCheck } from './pending-evidence';

export function datasheetPendingEvidence(product: FactProduct, source: string): PendingEvidenceCheck | null {
  const facts = sourceFactsForProduct(product).filter(f => f.scope === 'self');
  const base = { source, blocksMatch: !/优先|最好|偏好|不要求|不需要/.test(source) };
  const range = (raw: string) => {
    const match = raw.match(/^([-+]?\d+(?:\.\d+)?)\s*(?:~|～|to|至)\s*([-+]?\d+(?:\.\d+)?)$/i);
    return match ? [Number(match[1]), Number(match[2])] : null;
  };
  if (/极限耐压|绝对最大/.test(source)) {
    const wanted = sourceMeasurements(source).map(x => toCanonical(x.value, x.unit, 'V'))
      .filter((x): x is number => x !== null);
    const rows = facts.filter(f => f.field === 'absolute_maximum_supply_voltage' && f.rating === 'absolute_maximum');
    const values = rows.map(f => range(f.publishedValue || ''));
    // Only a single lower-bound request can be decided from an absolute maximum.
    // A compound clause, pin ambiguity or conflicting revision needs separate review.
    if (wanted.length === 1 && sourceMeasurements(source).length === 1 && rows.length && values.every(x => x !== null)
      && new Set(values.map(x => JSON.stringify(x))).size === 1
      && !/不超过|以下|小于|低于|不高于|不大于|最多|至多|[<≤]|VCC|VDD|VIN|栅|漏|源极|隔离|信号|控制引脚|输入侧|输出侧/i.test(source)) {
      const max = values[0]![1];
      const strict = /超过|大于|高于|>(?!=)/.test(source) && !/以上|至少|不低于|>=|≥/.test(source);
      const meets = strict ? max > wanted[0] : max >= wanted[0];
      return { ...base, status: meets ? 'supported' : 'contradicted',
        observed: `规格书电源绝对最大额定值：${rows[0].publishedValue}V`,
        reason: `电源绝对最大额定值 ${max}V ${meets ? '达到' : '低于或未达到'}原句要求 ${strict ? '>' : '≥'}${wanted[0]}V；这不代表允许持续工作`,
        evidence: rows.map(f => f.source) };
    }
  }
  const temperatures = sourceMeasurements(source).map(x => toCanonical(x.value, x.unit, '°C'))
    .filter((x): x is number => x !== null);
  if (temperatures.length && /储存|存储|焊接|回流|壳温|\bTc\b|storage|case/i.test(source)) {
    return { ...base, status: 'unknown', attention: 'missing_evidence',
      reason: '该温度角色需要独立来源；环境温度和结温不能代替存储、焊接或壳温额定值', evidence: [] };
  }
  if (temperatures.length === 1 && sourceMeasurements(source).length === 1 && !/热阻|功耗|降额|持续|同时|储存|存储|焊接|回流|壳温|\bTc\b|storage|case|结温.*环境|环境.*结温/i.test(source)) {
    const junction = /结温|\bTj\b/i.test(source);
    const field = junction ? 'junction_temperature' : 'ambient_operating_temperature';
    const rows = facts.filter(f => f.field === field && f.rating === 'operating');
    const values = rows.map(f => range(f.publishedValue || ''));
    if (rows.length && values.every(x => x !== null) && new Set(values.map(x => JSON.stringify(x))).size === 1
      && !/小于|以下|不超过|低于|不高于|不大于|最多|至多|[<≤]/.test(source)) {
      const [min, max] = values[0]!;
      const strict = /超过|大于|高于|>(?!=)/.test(source) && !/以上|至少|不低于|>=|≥/.test(source);
      const meets = temperatures[0] >= min && (strict ? temperatures[0] < max : temperatures[0] <= max);
      return { ...base, status: meets ? 'supported' : 'contradicted',
        observed: `规格书${junction ? '结温 Tj' : '环境温度 Ta'}：${rows[0].publishedValue}℃`,
        reason: `${temperatures[0]}℃${meets ? '在' : '不在'}该${junction ? '结温' : '环境工作温度'}额定范围内；温度单项核验不证明该温度下同时满足输出电流和散热要求`,
        evidence: rows.map(f => f.source) };
    }
  }
  if (/封装|\b(?:SOP|SOIC|QFN|DFN|BGA|LGA)\s*-?\s*\d/i.test(source)) {
    const rows = facts.filter(f => f.field === 'package_dimensions' && f.rating === 'mechanical');
    if (rows.length) return { ...base, status: 'unknown', attention: 'clarification',
      observed: rows.map(f => `${f.publishedHeader}：${f.publishedValue}`).join('；'),
      reason: '已有具体封装尺寸；目标 SOP 等名称未给出统一尺寸基准，不能据名称认定更大、更小或焊盘兼容',
      nextStep: '按目标本体尺寸、含引脚外形或 PCB 焊盘图选定同一比较基准，再比较尺寸上限',
      evidence: rows.map(f => f.source) };
  }
  if (/输入.*电容|电源.*电容|input.*capacit/i.test(source)) {
    const rows = facts.filter(f => f.field === 'recommended_bulk_input_capacitor_options'
      && f.rating === 'application_recommendation');
    if (rows.length) return { ...base, status: 'unknown', attention: 'clarification',
      observed: rows.map(f => `${f.publishedHeader}：${f.publishedValue}`).join('；'),
      reason: '已有原厂输入电容参考选项，但应用推荐值不能证明目标供电、负载、纹波和 EMC 工况均满足限制',
      nextStep: '按实际供电、负载瞬态、纹波与 EMC 条件核对参考电路和输入电容选型',
      evidence: rows.map(f => f.source) };
  }
  return null;
}

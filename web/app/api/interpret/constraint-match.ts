import { catalogProvesPrimaryClass } from './device-identity';
import { isMcuProduct, matchesMainDeviceIdentity } from './resource-context';
import { evaluateRequirement, parseParameterRequirements, readParameterFacts, toCanonical, unitInfo, type Requirement, type RequirementResult } from './selection-spec';
import { catalogAssessment, orderablePackageMatches, reviewedAdjustableOrderables, reviewedOrderableConfigurations,
  type SelectionAssessment } from './selection-assessment';
import { reviewed4T0RSources, reviewedCanFdSource, reviewedDigitalIsolatorSources, reviewedI2cSource, reviewedIsolationSource, reviewedNovosenseGrade, reviewedYutaiEthernetSource, reviewedYutaiGrade, reviewedYutaiSpeedSource, sourceFactsForProduct, railCapabilityEvidence, sourceForObservedField, sourcesForMatchedTag, type VerifiedSource } from './source-facts';
// constraint-match.ts
// must/nice 约束匹配 + 维度感知的三级降级兜底

import { CATEGORY_SYNONYMS, CATEGORY_TAG_NAMES } from './query_parser';
import { isPackageTag, packageMatches } from './query-specs';
import { semanticRulesForTag } from '@/lib/semantic-evidence';
export type ConstraintDimension = 'category' | 'media' | 'spec' | 'grade' | 'technology';
export interface MustConstraint {
  requirement?: Requirement;
  tag: string;
  dimension: ConstraintDimension;
  family?: string;
  value?: number;
  downgradable?: boolean;
}

export type ConstraintProduct = {
  part_number?: string;
  _features?: string;
  _section?: string;
  _params?: string;
  _detail_intro?: string;
  _detail_features?: string;
  _params_numeric?: Record<string, unknown>;
  __vendor?: string;
  __vendorGroup?: string;
  [k: string]: unknown;
};

export interface SortIntent {
  param: string;
  paramKeys: string[];
  direction: 'high' | 'low';
  require: boolean;
  label: string;
}

// ── Sort helpers ──
export function sortValueOf(product: ConstraintProduct, sk: SortIntent): number | null {
  const pn = product._params_numeric;
  if (!pn || typeof pn !== 'object') return null;
  let best: number | null = null;
  for (const [key, val] of Object.entries(pn)) {
    const kl = key.toLowerCase();
    if (!sk.paramKeys.some((pk) => kl.includes(pk))) continue;
    const v = val as { value?: unknown; min?: unknown; max?: unknown; unit?: string } | null;
    let num: number | null = null;
    if (v && typeof v.value === 'number') num = v.value;
    else if (v && typeof v.max === 'number') num = v.max as number;
    if (num == null || Number.isNaN(num)) continue;
    if (!v?.unit || !unitInfo(v.unit)) continue;
    const expected = ({ psrr: 'dB', dropout: 'V', gbw: 'Hz', vos: 'V', '传播延迟': 's', '采样率': 'sps', '数据速率': 'bps', esd: 'V', '开关频率': 'Hz', iq: 'A', '噪声': 'V/√Hz', '输出电流': 'A' } as Record<string, string>)[sk.param.toLowerCase()];
    if (!expected) continue;
    num = toCanonical(num, v.unit, expected);
    if (num == null) continue;
    if (best == null) best = num;
    else best = sk.direction === 'high' ? Math.max(best, num) : Math.min(best, num);
  }
  return best;
}

function compareBySort(a: ConstraintProduct, b: ConstraintProduct, sk: SortIntent): number {
  const va = sortValueOf(a, sk);
  const vb = sortValueOf(b, sk);
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  return sk.direction === 'high' ? vb - va : va - vb;
}

// ── Params text parsing ──
function parseTaggedValues(tokens: string[], prefix: string, suffix: string): number[] {
  const vals: number[] = [];
  for (const tk of tokens) {
    if (tk.startsWith(prefix) && tk.endsWith(suffix)) {
      const n = parseFloat(tk.slice(prefix.length, -suffix.length));
      if (!Number.isNaN(n)) vals.push(n);
    }
  }
  return vals;
}

function normalizeCurrentToA(key: string, v: { value?: unknown; unit?: unknown; raw?: unknown } | null): number | null {
  if (!v || typeof v.value !== 'number' || Number.isNaN(v.value)) return null;
  const unit = String(v.unit || '').toLowerCase();
  const raw = String(v.raw || '').toLowerCase();
  const kl = key.toLowerCase();
  let num = v.value;
  if (unit === 'ma') num /= 1000;
  else if (['μa', 'µa', 'ua'].includes(unit)) num /= 1e6;
  else if (unit === 'na') num /= 1e9;
  else if (unit !== 'a' && (raw.includes('ma') || kl.includes('__ma_'))) num /= 1000;
  return num;
}

// ── Param extractors ──
function portCountOf(product: ConstraintProduct, tokens: string[]): number | null {
  let best: number | null = null;
  for (const tk of tokens) {
    const m = tk.match(/^(\d+)口$/);
    if (m) { const n = parseInt(m[1], 10); best = best == null ? n : Math.max(best, n); }
  }
  const paramsText = String(product._params || '').toLowerCase();
  for (const re of [
    /简介\s*[:：][^|]*?\b(\d+)\s*g(?:e)?\b/gi,
    /端口\s*[:：]\s*(\d+)\s*ge/gi,
    /\b(\d+)\s*ge\b/gi,
    /\b(\d+)\s*ports?\b/gi,
    /端口\s*[:：]\s*(\d+)/gi,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(paramsText)) !== null) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n)) best = best == null ? n : Math.max(best, n);
    }
  }
  return best;
}

function vinRangeOf(product: ConstraintProduct, tokens: string[]): [number, number] | null {
  const pn = product._params_numeric;
  if (pn && typeof pn === 'object') {
    let minVin: number | null = null;
    let maxVin: number | null = null;
    for (const [key, rawVal] of Object.entries(pn)) {
      const kl = key.toLowerCase();
      const v = rawVal as { value?: unknown; is_range?: boolean; min?: number; max?: number } | null;
      if (!v) continue;
      if (/absolute|transient|surge|rating|瞬态|绝对|耐压/.test(kl)) continue;
      if (kl.includes('output') || kl.includes('vout') || kl.includes('输出') || kl.includes('vcc_vee')) continue;
      const isSupplyVin = (
        kl.includes('supply_voltage') || kl.includes('供电电压') || kl.includes('工作电压') ||
        (kl.includes('vcc') && (kl.includes('__v_') || kl.includes('_v_')))
      );
      if (isSupplyVin) {
        if (v.is_range && typeof v.min === 'number' && typeof v.max === 'number') {
          if (minVin == null || v.min < minVin) minVin = v.min;
          if (maxVin == null || v.max > maxVin) maxVin = v.max;
          continue;
        }
        if (typeof v.value === 'number' && !Number.isNaN(v.value)) {
          if (kl.includes('min') || kl.includes('最小')) {
            if (minVin == null || v.value < minVin) minVin = v.value;
          } else if (kl.includes('max') || kl.includes('最大')) {
            if (maxVin == null || v.value > maxVin) maxVin = v.value;
          } else {
            if (minVin == null || v.value < minVin) minVin = v.value;
            if (maxVin == null || v.value > maxVin) maxVin = v.value;
          }
        }
        continue;
      }
      if (typeof v.value !== 'number' || Number.isNaN(v.value)) continue;
      if ((kl.includes('minimum_input') || kl.includes('最小输入')) && (kl.includes('voltage') || kl.includes('电压') || kl.includes('__v_'))) {
        if (minVin == null || v.value < minVin) minVin = v.value;
      } else if ((kl.includes('maximum_input') || kl.includes('最大输入')) && (kl.includes('voltage') || kl.includes('电压') || kl.includes('__v_'))) {
        if (maxVin == null || v.value > maxVin) maxVin = v.value;
      }
    }
    if (minVin != null && maxVin != null) return [Math.min(minVin, maxVin), Math.max(minVin, maxVin)];
    if (minVin != null) return [minVin, Number.POSITIVE_INFINITY];
    if (maxVin != null) return [0, maxVin];
  }
  if (/absolute|transient|瞬态|绝对/.test(JSON.stringify(product._params_numeric || {}))) return null;
  const vals = parseTaggedValues(tokens, 'vin_', 'v');
  if (vals.length >= 2) return [Math.min(...vals), Math.max(...vals)];
  if (vals.length === 1) return [0, vals[0]];
  const paramsText = (product._params || '').toLowerCase();
  const supplyMatch = paramsText.match(/(?:供电电压|supply voltage|vin|vcc)\s*(?:\([^)]*\))?\s*[:：]\s*([\d.]+)\s*(?:to|~|～|\-)\s*([\d.]+)/i);
  if (supplyMatch) {
    const lo = parseFloat(supplyMatch[1]);
    const hi = parseFloat(supplyMatch[2]);
    if (!Number.isNaN(lo) && !Number.isNaN(hi)) return [Math.min(lo, hi), Math.max(lo, hi)];
  }
  return null;
}

function ioutMaxOf(product: ConstraintProduct, tokens: string[]): number | null {
  const pn = product._params_numeric;
  let best: number | null = null;
  if (pn && typeof pn === 'object') {
    for (const [key, rawVal] of Object.entries(pn)) {
      const kl = key.toLowerCase();
      if (!(/output/.test(kl) || kl.includes('输出')) || !(/current/.test(kl) || kl.includes('电流') || kl.includes('__a_') || kl.includes('__ma_'))) continue;
      const num = normalizeCurrentToA(key, rawVal as { value?: unknown; unit?: unknown; raw?: unknown });
      if (num == null) continue;
      best = best == null ? num : Math.max(best, num);
    }
  }
  if (best != null) return best;
  const vals = parseTaggedValues(tokens, 'iout_', 'a');
  if (vals.length > 0) return Math.max(...vals);
  return null;
}

function dataRateMaxMbpsOf(product: ConstraintProduct, tokens: string[]): number | null {
  const conditionalRate = product._conditional_rate_resolution as { status?: unknown; header?: unknown } | undefined;
  if (conditionalRate?.status === 'orderable_specific_only' && conditionalRate.header === '最大码流 (Mbps)') return null;
  let best: number | null = null;
  for (const tk of tokens) {
    const m = tk.match(/^(\d+\.?\d*)mbps$/);
    if (!m) continue;
    const v = parseFloat(m[1]);
    if (!Number.isNaN(v)) best = best == null ? v : Math.max(best, v);
  }
  const pn = product._params_numeric;
  if (pn && typeof pn === 'object') {
    for (const [key, rawVal] of Object.entries(pn)) {
      const kl = key.toLowerCase();
      // Only match data-rate-related keys
      if (!/data_rate|码流|速率|mbps|kbps|gbps/.test(kl)) continue;
      const v = rawVal as { value?: unknown; unit?: unknown; raw?: unknown } | null;
      if (!v || typeof v.value !== 'number') continue;
      const unit = String(v.unit || '').toLowerCase();
      const raw = String(v.raw || '').toLowerCase();
      let num = v.value;
      if (kl.includes('kbps') || unit.includes('kbps') || raw.includes('kbps')) num /= 1000;
      else if (kl.includes('gbps') || unit.includes('gbps') || raw.includes('gbps')) num *= 1000;
      best = best == null ? num : Math.max(best, num);
    }
  }
  return best;
}

function modelDetailAdcBits(product: ConstraintProduct): number | null {
  const source = product._detail_adc_resolution_source as {
    bits?: unknown; model?: unknown; scope?: unknown; documentId?: unknown;
    documentSha256?: unknown; page?: unknown; quote?: unknown; selectionUse?: unknown;
  } | undefined;
  if (!source) return null;
  return product.__vendor === 'novosense' && source.model === product.part_number
    && source.scope === 'self' && source.documentId === 'novosense-selection-guide-202510'
    && typeof source.documentSha256 === 'string' && /^[0-9a-f]{64}$/.test(source.documentSha256)
    && Number.isInteger(source.page) && typeof source.quote === 'string'
    && source.selectionUse === 'adc_resolution'
    && Number.isInteger(source.bits) && Number(source.bits) > 0
    ? Number(source.bits) : null;
}

function bitResolutionOf(product: ConstraintProduct, tokens: string[]): number | null {
  // Source conflicts stay unknown unless a current, document-bound human
  // adjudication explicitly resolves this model's published feature cell.
  const resolutionSource = product._resolution_source as {
    selectionTableConflict?: boolean; documentSha256?: string;
  } | undefined;
  if (resolutionSource?.selectionTableConflict) {
    const decision = ((product._published_corrections || product._manual_adjudications) as Record<string, {
      actor?: string; reviewed?: boolean; documentSha256?: string; confirmedValue?: string;
    }> | undefined)?.['特征'];
    const currentFeature = String(product._params || '').match(/(?:^|\|)\s*特征\s*[:：]\s*([^|]+)/)?.[1] || '';
    const confirmedResolution = decision?.confirmedValue?.match(/(\d+)\s*位\s*ADC/i)?.[1];
    if (!(decision?.reviewed === true || decision?.actor === 'human_user')
        || !resolutionSource.documentSha256
        || decision.documentSha256 !== resolutionSource.documentSha256
        || !confirmedResolution
        || currentFeature.trim() !== decision.confirmedValue?.trim()) return null;
    return Number(confirmedResolution);
  }
  if (product.__vendor === '3peak-analog') {
    const raw = String(product._params || '').match(/(?:^|\|)\s*Resolution\s*[:：]\s*([^|]+)/i)?.[1]?.trim();
    return raw && /^\d+$/.test(raw) && sourceForObservedField(product, 'Resolution', raw)
      ? Number(raw) : null;
  }
  if (product.__vendor === '3peak-auto') {
    if (!/ADC/i.test(product._section || '')) return null;
    const raw = String(product._params || '').match(/(?:^|\|)\s*产品描述\s*[:：]\s*([^|]+)/)?.[1]?.trim();
    const bits = raw?.match(/\b(\d+)\s*bit\b[^|]*\bADC\b/i)?.[1];
    return bits && sourceForObservedField(product, '产品描述', raw!) ? Number(bits) : null;
  }
  if (product.__vendor === 'novosense' && /模数转换器\s*ADC/i.test(product._section || '')) {
    const raw = String(product._params || '').match(/(?:^|\|)\s*特征\s*[:：]\s*([^|]+)/)?.[1]?.trim();
    const bits = raw?.match(/(\d+)\s*位\s*ADC/i)?.[1];
    return bits && sourceForObservedField(product, '特征', raw!) ? Number(bits) : null;
  }
  if (product.__vendor === 'novosense' && /位置传感器专用芯片/.test(product._section || '')) {
    const raw = String(product._params || '').match(/(?:^|\|)\s*分辨率\s*[:：]\s*([^|]+)/)?.[1]?.trim();
    const bits = raw?.match(/^(\d+)\s*位$/)?.[1];
    return bits && sourceForObservedField(product, '分辨率', raw!) ? Number(bits) : null;
  }
  // PWM output width and absolute-angle resolution are separate specifications.
  if (product.__vendor === 'novosense' && /磁阻角度编码器/.test(product._section || '')) return null;
  const detailAdc = modelDetailAdcBits(product);
  if (detailAdc !== null) return detailAdc;
  let best: number | null = null;
  for (const tk of tokens) {
    const m = tk.match(/^(\d+)bit$/);
    if (m) { const n = parseInt(m[1], 10); best = best == null ? n : Math.max(best, n); }
  }
  return best;
}

function channelCountOf(product: ConstraintProduct, tokens: string[]): number | null {
  if (product.__vendor === '3peak-analog') {
    const raw = String(product._params || '').match(/(?:^|\|)\s*Number of Channels\s*[:：]\s*([^|]+)/i)?.[1]?.trim();
    return raw && /^\d+$/.test(raw) && sourceForObservedField(product, 'Number of Channels', raw)
      ? Number(raw) : null;
  }
  if (product.__vendor === 'novosense' && /模数转换器\s*ADC/i.test(product._section || '')) {
    const raw = String(product._params || '').match(/(?:^|\|)\s*输入通道\s*数量\s*[:：]\s*([^|]+)/)?.[1]?.trim();
    return raw && /^\d+$/.test(raw) && sourceForObservedField(product, '输入通道 数量', raw)
      ? Number(raw) : null;
  }
  if (product.__vendor === 'novosense' && /(?:IO\s*扩展器|I2C\s*开关)/i.test(product._section || '')) {
    const match = String(product._params || '').match(/(?:^|\|)\s*(通道数|通道)\s*[:：]\s*([^|]+)/);
    const header = match?.[1];
    const raw = match?.[2]?.trim();
    return header && raw && /^\d+$/.test(raw) && sourceForObservedField(product, header, raw)
      ? Number(raw) : null;
  }
  let best: number | null = null;
  // Extract from _params raw text (precise regex, no false positives from _params_numeric key matching)
  const paramsText = String(product._params || '');
  for (const re of [
    /(number of channels?|channel count|通道数|通道数量|adc input channel|input channel(?:\s+数量)?|参考\s*通道数|输入通道\s*数量)\s*[:：]\s*(\d+)/gi,
    /(\d+)\s*通道/gi,
    /\b(\d+)\s*ch\b/gi,
    // Novosense format: "正向/ 反向通道: 3/1" → total channels = sum of F+R
    /正向\s*\/\s*反向通道\s*[:：]\s*(\d+)\s*\/\s*(\d+)/gi,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(paramsText)) !== null) {
      const n = m.length === 3
        ? parseInt(m[1], 10) + parseInt(m[2], 10)  // F/R pair → total = F + R
        : parseInt(m[m.length - 1], 10);
      if (!Number.isNaN(n)) best = best == null ? n : Math.max(best, n);
    }
  }
  // _features token fallback
  for (const tk of tokens) {
    const m = tk.match(/^(\d+)通道/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) best = best == null ? n : Math.max(best, n);
  }
  return best;
}

function vosMaxMvOf(product: ConstraintProduct): number | null {
  const pn = product._params_numeric;
  if (!pn) return null;
  let best: number | null = null;
  for (const [key, rawVal] of Object.entries(pn)) {
    const kl = key.toLowerCase();
    if (!kl.includes('vos')) continue;
    // Skip drift/tempco keys: dvos_dt, drift, 温漂
    if (kl.includes('drift') || kl.includes('dvos_dt') || kl.includes('dt') || kl.includes('温漂') || kl.includes('温度漂')) continue;
    // Prefer keys with 'max' for max Vos spec
    const v = rawVal as { value?: unknown; max?: number; unit?: string } | null;
    if (!v) continue;
    let num: number | null = null;
    if (typeof v.max === 'number') num = v.max;
    else if (typeof v.value === 'number') num = v.value;
    if (num == null || Number.isNaN(num)) continue;
    // Normalize to mV
    const unit = String(v.unit || '').toLowerCase();
    if (unit === 'μv' || unit === 'uv') num /= 1000;
    if (best == null || num < best) best = num;  // take minimum (best) Vos
  }
  return best;
}

function voutSpecOf(product: ConstraintProduct, tokens: string[]): { values: number[]; range: [number, number] | null } {
  const pn = product._params_numeric;
  if (pn && typeof pn === 'object') {
    let rangeLow: number | null = null;
    let rangeHigh: number | null = null;
    const fixedVals: number[] = [];
    for (const [key, rawVal] of Object.entries(pn)) {
      const kl = key.toLowerCase();
      const hasVoutKey = kl.includes('output_voltage') || kl.includes('vout')
        || (kl.includes('output') && (kl.includes('__v_') || kl.includes('_v_')))
        || (kl.includes('输出') && (kl.includes('__v_') || kl.includes('_v_')) && !kl.includes('侧') && !kl.includes('vcc') && !kl.includes('静') && !kl.includes('电流') && !kl.includes('uvlo'))
        || kl === '输出电压';
      if (!hasVoutKey) continue;
      const v = rawVal as { value?: unknown; is_range?: boolean; min?: number; max?: number } | null;
      if (!v) continue;
      const raw = String((rawVal as { raw?: string }).raw || '');
      if (/(?:fixed|固定|可选)/i.test(raw) && !/(?:adjustable|可调)/i.test(raw)) {
        fixedVals.push(...[...raw.matchAll(/\d+(?:\.\d+)?/g)].map(m => Number(m[0])));
        continue;
      }
      if (v.is_range && typeof v.min === 'number' && typeof v.max === 'number') {
        rangeLow = v.min; rangeHigh = v.max;
      } else if (typeof v.value === 'number') {
        fixedVals.push(v.value);
      }
    }
    if (fixedVals.length > 0) return { values: fixedVals, range: null };
    if (rangeLow != null && rangeHigh != null) return { values: [], range: [rangeLow, rangeHigh] };
  }
  const vals = parseTaggedValues(tokens, 'vout_', 'v');
  if (vals.length > 0) return { values: [...new Set(vals)].sort((a, b) => a - b), range: null };
  // Adjustable output requires a documented range.
  const paramsText = (product._params || '').toLowerCase();
  const adjustable = paramsText.match(/(?:可调输出|adjustable\s*output)\s*[:：(（]?\s*([\d.]+)\s*(?:to|~|～|-)\s*([\d.]+)/i);
  if (adjustable) return { values: [], range: [Number(adjustable[1]), Number(adjustable[2])] };
  return { values: [], range: null };
}

// ── Evidence registry ──
interface EvidenceRule {
  tag: string;
  paramsKey?: string;
  contextSection?: RegExp;
  detailMatch?: RegExp;
}

const EVIDENCE_REGISTRY: EvidenceRule[] = [
  { tag: '电压基准', paramsKey: 'voltage_reference', contextSection: /放大器|运放|比较器/ },
];

function semanticEvidenceMatches(product: ConstraintProduct, tag: string): boolean {
  const rules = semanticRulesForTag(tag);
  if (!rules.length) return false;
  const identities = [product._features, product._section, product._params].map(value => String(value || ''));
  const normalizeContext = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, '');
  const containsLabel = (label: string) => identities.some(identity => {
    if (/^[\x00-\x7f]+$/.test(label)) {
      const words = label.trim().split(/[\s_-]+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return words.length > 0 && new RegExp(`(?:^|[^a-z0-9])${words.join('[\\s_-]*')}(?=$|[^a-z0-9])`, 'i').test(identity);
    }
    return normalizeContext(identity).includes(normalizeContext(label));
  });

  for (const rule of rules) {
    const includes = rule.include || [];
    const excludes = rule.exclude || [];
    if (includes.length && !includes.some(containsLabel)) continue;
    if (excludes.some(containsLabel)) continue;
    const configuredFields = rule.fields.length ? rule.fields : ['_params', '_detail_intro', '_detail_features'];
    // Family prose remains retrieval context, not a per-model selector or
    // ranking signal. Explicitly reviewed model tags may still satisfy soft
    // preferences; hard requirements keep their independent evidence gate.
    const familyScope = (product._detail_source as { scope?: string } | undefined)?.scope === 'family';
    if (familyScope && rule.strength !== 'must'
      && (product._reviewed_feature_tags as string[] | undefined)?.some(value => value.toLowerCase() === tag.toLowerCase())) {
      return true;
    }
    const fields = familyScope
      ? configuredFields.filter(field => field !== '_detail_intro' && field !== '_detail_features')
      : configuredFields;
    const evidenceText = fields.map(field => String(product[field] || '')).join('\n');
    const isNegatedAt = (index: number, matchLength = 0) => {
      const prefix = evidenceText.slice(Math.max(0, index - 32), index);
      const suffix = evidenceText.slice(index + matchLength, index + matchLength + 32);
      return /(?:不支持|无|未集成|不具备|不含|没有|未提供|不带|no|without|not(?:\s+supported)?|does\s+not\s+support)\s*(?:(?:built[ -]?in)\s*)?[:：,，;；-]*\s*$/i.test(prefix)
        || /^\s*(?:(?:is\s+)?not\s+(?:supported|available|integrated|included)|不支持|不具备|未集成|不含|无)/i.test(suffix);
    };
    for (const alias of rule.aliases) {
      const escaped = alias.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!escaped) continue;
      const flexible = escaped.replace(/\\ /g, '[\\s_-]+');
      const pattern = /^[a-z0-9]/i.test(alias)
        ? new RegExp(`\\b${flexible}\\b`, 'i')
        : null;
      const match = pattern ? pattern.exec(evidenceText) : (() => {
        const index = evidenceText.toLowerCase().indexOf(alias.toLowerCase());
        return index < 0 ? null : Object.assign([alias] as unknown as RegExpExecArray, { index });
      })();
      if (match && !isNegatedAt(match.index, alias.length)) return true;
    }
    if (rule.regex) {
      try {
        const regex = new RegExp(rule.regex, 'ig');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(evidenceText)) !== null) {
          if (!isNegatedAt(match.index, match[0].length)) return true;
          if (match[0].length === 0) regex.lastIndex++;
        }
      } catch {
        // Invalid registry rules are surfaced by the registry compiler/tests;
        // a malformed expression must not create a runtime match.
      }
    }
  }
  return false;
}

function isIoExpanderProduct(product: ConstraintProduct, tokens: string[]): boolean {
  const section = String(product._section || '').toLowerCase().replace(/\s+/g, '');
  return tokens.includes('io扩展器') || section.includes('io扩展器') || section.includes('i/o扩展器');
}

function sourced3PeakGrade(product: ConstraintProduct): { rating: 'industrial' | 'automotive' | null; aecQualified: boolean } {
  if (product.__vendor !== '3peak-analog') return { rating: null, aecQualified: false };
  const ratingCell = String(product._params || '').match(/(?:^|\|)\s*Rating\s*[:：]\s*([^|]+)/i)?.[1]?.trim();
  const rating = ratingCell && sourceForObservedField(product, 'Rating', ratingCell)
    ? /^(?:Industrial|Automotive)$/i.test(ratingCell) ? ratingCell.toLowerCase() as 'industrial' | 'automotive' : null
    : null;
  const featuresCell = String(product._params || '').match(/(?:^|\|)\s*Features\s*[:：]\s*([^|]+)/i)?.[1]?.trim();
  const aecQualified = !!featuresCell && /\bAEC\s*[- ]?Q\s*[- ]?100\s+Qualified\b/i.test(featuresCell)
    && !!sourceForObservedField(product, 'Features', featuresCell);
  return { rating, aecQualified };
}


function explicitNegativeCapability(product: ConstraintProduct, tag: string): boolean {
  const label = tag.replace(/[\s_-]/g, '').toLowerCase();
  const hasNegativeCell = String(product._params || '').split('|').some(cell => {
    const at=cell.search(/[:：]/);return at>=0 && cell.slice(0,at).replace(/[\s_-]/g,'').toLowerCase()===label
      && /^(?:no|false|否|不支持)$/i.test(cell.slice(at+1).trim());
  });
  if (!hasNegativeCell) return false;
  return sourceFactsForProduct(product).some(f => String(f.publishedHeader || '').replace(/[\s_-]/g, '').toLowerCase() === label
    && /^(?:no|false|否|不支持)$/i.test(f.publishedValue || ''));
}

export function constraintStatus(product: ConstraintProduct, tag: string, meta?: MustConstraint): 'matched' | 'unmatched' | 'unknown' {
  if(tag==='2.5G'&&/PHY/i.test(String(product._section||''))){
    const rates=readParameterFacts(product).filter(f=>f.field==='dataRate'&&f.source.verified).flatMap(f=>f.values);
    if(rates.length&&Math.max(...rates)<2.5e9)return 'unmatched';
  }
  if (explicitNegativeCapability(product, tag)) return 'unmatched';
  if (tag === '轨到轨') { const rail=railCapabilityEvidence(product,meta?.requirement?.source?.text||tag); if(rail.sources.length||rail.specific)return rail.status; }
  if (meta?.requirement && meta.requirement.kind !== 'tag') return evaluateRequirement(product, meta.requirement).status;
  if (tagSatisfied(product, tag, meta)) return 'matched';
  if (product.__vendor === '3peak-analog' && (tag === '车规AEC-Q100' || tag === '工业级')) {
    return sourced3PeakGrade(product).rating === null ? 'unknown' : 'unmatched';
  }
  if (product.__vendor === 'novosense' && (tag === '车规AEC-Q100' || tag === '工业级')) {
    const grade = reviewedNovosenseGrade(product);
    return grade.industrial.length || grade.automotive.length || grade.aecStatement.length ? 'unmatched' : 'unknown';
  }
  if (product.__vendor === '3peak-auto' && (tag === '车规AEC-Q100' || tag === '工业级')) return 'unknown';
  if (product.__vendor === 'yutai' && (tag === '车规AEC-Q100' || tag === '工业级')) {
    const grade = reviewedYutaiGrade(product);
    return grade.industrial.length || grade.automotive.length || grade.consumer.length || grade.aecStatement.length
      ? 'unmatched' : 'unknown';
  }
  if (tag.toLowerCase() === 'can-fd' && ['3peak-auto', '3peak-analog', 'novosense'].includes(String(product.__vendor || ''))
    && /(?:CAN\s*收发器|隔离CAN|SBC)/i.test(String(product._section || ''))) return 'unknown';
  if (product.__vendor === 'yutai' && tag === '以太网') return 'unknown';
  if (tag === 'I2C' && ((product.__vendor === '3peak-analog'
      && /(?:IO\s*扩展器|电平转换器)/i.test(String(product._section || '')))
      || (product.__vendor === 'novosense' && /IO\s*扩展器/i.test(String(product._section || ''))))) return 'unknown';
  if (tag === '隔离' && ((product.__vendor === 'novosense'
      && /集成式电流传感器/.test(String(product._section || '')))
      || (['3peak-analog', '3peak-auto'].includes(String(product.__vendor || ''))
        && /(?:变换器|马达驱动)/.test(String(product._section || ''))))) return 'unknown';
  if (product.__vendor === 'novosense' && tag === '降压' && product._topology_source) return 'unknown';
  if (product.__vendor === 'yutai' && (tag === '百兆' || tag === '千兆')) return 'unknown';
  if (product.__vendor === '3peak-analog' && tag === 'ADC' && /传感器接口/.test(String(product._section || ''))) return 'unknown';
  if (product.__vendor === 'novosense' && tag === '数字隔离器' && /隔离\s*I2C/i.test(String(product._section || ''))) return 'unknown';
  if (product.__vendor === 'novosense' && tag === 'DCDC' && /位置传感器专用芯片/.test(String(product._section || ''))) {
    const type = String(product._params || '').match(/(?:^|\|)\s*类型\s*[:：]\s*([^|]+)/)?.[1]?.trim();
    return type && sourceForObservedField(product, '类型', type) ? 'unmatched' : 'unknown';
  }
  if (product.__vendor === 'novosense' && tag === '温度传感器' && /温湿度传感器/.test(String(product._section || ''))) return 'unknown';
  if (product.__vendor === '3peak-analog' && tag === '4T0R' && /RS-485\s*收发器/.test(String(product._section || ''))) return 'unknown';
  if ((product._detail_source as { scope?: string } | undefined)?.scope === 'family'
    && (semanticRulesForTag(tag).some(rule => rule.strength === 'must')
      ? semanticEvidenceMatches({ ...product, _detail_source: undefined }, tag)
      : tagSatisfied({ ...product, _detail_source: undefined }, tag, meta))) return 'unknown';
  // Absence of model evidence for a source-backed capability is uncertainty
  // within its declared product class, even after legacy prose is removed.
  if (semanticRulesForTag(tag).some(rule => rule.strength === 'must'
    && rule.storage === 'source_evidence'
    && rule.include.some(label => String(product._section || '').includes(label)))) return 'unknown';
  if (meta?.family === 'bit'
    && (product._resolution_source as { selectionTableConflict?: boolean } | undefined)?.selectionTableConflict) return 'unknown';
  if (meta?.family === 'bit' && bitResolutionOf(product, (product._features || '').toLowerCase().split(/\s+/)) == null) return 'unknown';
  if (meta?.family === '通道' && channelCountOf(product, (product._features || '').toLowerCase().split(/\s+/)) == null) return 'unknown';
  if (tag === 'AEC-Q100符合声明' || tag === 'AEC-Q100认证') return 'unknown';
  if (tag === '车规AEC-Q100' && /mcu|dsp/i.test(product._section || '')
    && /(?:提供工业级和汽车级产品|符合\s*aec\s*[- ]?q\s*[- ]?100\s*grade\s*1\s*设计)/i.test(`${product._detail_intro || ''} ${product._detail_features || ''}`)) {
    return 'unknown';
  }
  if (tag.toLowerCase() === 'can-fd' && /mcu|dsp/i.test(product._section || '')
    && !/(?:^|\|)\s*CAN\s*\/\s*CAN-FD\s*[:：]\s*\d+\s*\/\s*\d+(?=\s*(?:\||$))/i.test(product._params || '')) return 'unknown';
  if (tag.toLowerCase() === 'can' && /mcu|dsp/i.test(product._section || '')
    && !/(?:^|\|)\s*CAN\s*\/\s*CAN-FD\s*[:：]\s*\d+\s*\/\s*\d+(?=\s*(?:\||$))/i.test(product._params || '')) return 'unknown';
  if (tag.toUpperCase() === 'SPI' && /(?:ADC|模数转换器)/i.test(product._section || '')
    && !/(?:^|\|)\s*(?:Digital Interface|数字接口|通信接口)\s*[:：]/i.test(product._params || '')) return 'unknown';
  const tokens = (product._features || '').toLowerCase().split(/\s+/);
  if (isPackageTag(tag) && packageMatches(product._params || '', tag) == null
    && !(product.part_number === 'NSR33xxx' && [
      ...reviewedOrderableConfigurations(product), ...reviewedAdjustableOrderables(product),
    ].some(config => orderablePackageMatches(config, tag)))) return 'unknown';
  if (meta?.family === 'Vin' && vinRangeOf(product, tokens) == null) return 'unknown';
  if (meta?.family === 'Iout' && ioutMaxOf(product, tokens) == null) return 'unknown';
  if (meta?.family === 'Vout') {
    const spec = voutSpecOf(product, tokens);
    if (!spec.values.length && !spec.range) return 'unknown';
  }
  if (meta?.requirement?.kind === 'tag' && meta.requirement.source?.origin === 'model'
    && meta.dimension === 'spec' && !meta.family && !isPackageTag(tag)) {
    return 'unknown';
  }
  return 'unmatched';
}

// ── Core: tagSatisfied ──
export function tagSatisfied(product: ConstraintProduct, tag: string, meta?: MustConstraint): boolean {
  if(tag==='米勒钳位')return sourcesForMatchedTag(product,tag).length>0;
  if(tag==='2.5G'&&/PHY/i.test(String(product._section||''))){
    const rates=readParameterFacts(product).filter(f=>f.field==='dataRate'&&f.source.verified).flatMap(f=>f.values);
    if(rates.length&&Math.max(...rates)<2.5e9)return false;
  }
  if (explicitNegativeCapability(product, tag)) return false;
  // A regulator's internal LDO or an application mention does not make it an LDO product.
  if (tag.toLowerCase() === 'ldo') return product._section
    ? /LDO|线性稳压/i.test(String(product._section))
    : String(product._features || '').split(/\s+/).some(token => token.toLowerCase() === 'ldo');
  if (meta?.requirement && meta.requirement.kind !== 'tag') return evaluateRequirement(product, meta.requirement).status === 'matched';
  if(tag==='工业级'&&sourcesForMatchedTag(product,tag).some(s=>s.originalHeader==='Rating'&&s.originalValue==='Industrial'))return true;
  if (product.__vendor === '3peak-analog' && (tag === '车规AEC-Q100' || tag === '工业级')) {
    const grade = sourced3PeakGrade(product);
    return tag === '工业级' ? grade.rating === 'industrial'
      : grade.rating === 'automotive' || grade.aecQualified;
  }
  if (product.__vendor === 'novosense' && (tag === '车规AEC-Q100' || tag === '工业级')) {
    const grade = reviewedNovosenseGrade(product);
    return tag === '工业级' ? grade.industrial.length > 0
      : grade.automotive.length > 0 || grade.aecStatement.length > 0;
  }
  if (product.__vendor === '3peak-auto' && (tag === '车规AEC-Q100' || tag === '工业级')) return false;
  if (product.__vendor === 'yutai' && (tag === '车规AEC-Q100' || tag === '工业级')) {
    const grade = reviewedYutaiGrade(product);
    return tag === '工业级' ? grade.industrial.length > 0
      : grade.automotive.length > 0 || grade.aecStatement.length > 0;
  }
  if (product.__vendor === 'yutai' && tag === 'AEC-Q100符合声明') {
    return reviewedYutaiGrade(product).aecStatement.length > 0;
  }
  if (tag.toLowerCase() === 'can-fd' && ['3peak-auto', '3peak-analog', 'novosense'].includes(String(product.__vendor || ''))
    && /(?:CAN\s*收发器|隔离CAN|SBC)/i.test(String(product._section || ''))) {
    return reviewedCanFdSource(product) !== null;
  }
  if (product.__vendor === 'yutai' && tag === '以太网') {
    return reviewedYutaiEthernetSource(product) !== null;
  }
  if (product.__vendor === 'novosense' && tag === '降压' && /DC-DC\s*开关变换器/.test(String(product._section || ''))
    && (product._topology_source || sourceFactsForProduct(product).some(fact => fact.field === 'topology'))) {
    return sourceFactsForProduct(product).some(fact => fact.field === 'topology' && fact.publishedFeature === '降压');
  }
  if (product.__vendor === 'yutai' && (tag === '百兆' || tag === '千兆')) {
    return reviewedYutaiSpeedSource(product, tag) !== null;
  }
  if (product.__vendor === '3peak-analog' && tag === 'ADC' && /传感器接口/.test(String(product._section || ''))) {
    const raw = String(product._params || '').match(/(?:^|\|)\s*Description\s*[:：]\s*([^|]+)/i)?.[1]?.trim();
    return !!raw && /\bADC\b/i.test(raw) && !!sourceForObservedField(product, 'Description', raw);
  }
  if (product.__vendor === 'novosense' && tag === '数字隔离器' && /隔离\s*I2C/i.test(String(product._section || ''))) {
    return reviewedDigitalIsolatorSources(product).length === 2;
  }
  if (product.__vendor === 'novosense' && tag === 'DCDC' && /位置传感器专用芯片/.test(String(product._section || ''))) {
    return false;
  }
  if (product.__vendor === 'novosense' && tag === '温度传感器' && /温湿度传感器/.test(String(product._section || ''))) {
    const raw = String(product._params || '').match(/(?:^|\|)\s*产品描述\s*[:：]\s*([^|]+)/)?.[1]?.trim();
    return !!raw && /温湿度传感器/.test(raw) && !!sourceForObservedField(product, '产品描述', raw);
  }
  if (product.__vendor === '3peak-analog' && tag === '4T0R' && /RS-485\s*收发器/.test(String(product._section || ''))) {
    return reviewed4T0RSources(product).length === 2;
  }
  if (tag === 'I2C' && ((product.__vendor === '3peak-analog'
      && /(?:IO\s*扩展器|电平转换器)/i.test(String(product._section || '')))
      || (product.__vendor === 'novosense' && /IO\s*扩展器/i.test(String(product._section || ''))))) {
    return reviewedI2cSource(product) !== null;
  }
  if (tag === '隔离' && ((product.__vendor === 'novosense'
      && /集成式电流传感器/.test(String(product._section || '')))
      || (['3peak-analog', '3peak-auto'].includes(String(product.__vendor || ''))
        && /(?:变换器|马达驱动)/.test(String(product._section || ''))))) {
    return reviewedIsolationSource(product) !== null;
  }
  if (product.__vendor === '3peak-analog' && tag === 'AEC-Q100符合声明') {
    return sourced3PeakGrade(product).aecQualified;
  }
  if (tag === 'AEC-Q100符合声明' || tag === 'AEC-Q100认证') return sourceFactsForProduct(product).some(fact =>
    fact.field === 'grade'
    && /AEC\s*[- ]?\s*Q\s*[- ]?\s*100/i.test(fact.evidence.originalValue)
    && (tag !== 'AEC-Q100认证' || /认证|证书|certified|certificate/i.test(fact.evidence.originalValue)));
  const feats = (product._features || "").toLowerCase();
  const tokens = feats.split(/\s+/).filter(Boolean);
  const t = tag.toLowerCase();
  const paramsText = (product._params || "").toLowerCase();
  const sectionText = (product._section || "").toLowerCase();
  // Family prose describes a series, not an orderable model. Keep it out of
  // every hard-match fallback, including tags absent from the semantic registry.
  const detailTextRaw = (product._detail_source as { scope?: string } | undefined)?.scope === 'family'
    ? ''
    : ((product._detail_intro || "") + " " + (product._detail_features || "")).toLowerCase();
  const allEvidenceText = `${paramsText} ${detailTextRaw} ${sectionText}`;

  // The selection guide uses “隔离电流放大器” as the table category while
  // queries commonly shorten it to “隔离放大器”. Require the category row
  // itself as evidence; a generic amplifier plus an isolation rating is not
  // enough to establish the product class.
  if (t === '隔离放大器' && /隔离.{0,8}(?:电流)?放大器|(?:电流)?放大器.{0,8}隔离/.test(sectionText)) return true;
  if (t === '线性电流传感器' && /线性电流传感器/.test(sectionText)) return true;

  if (t === '高侧电流检测') {
    const featureCell = String(product._params || '').match(/(?:^|\|)\s*Features?\s*[:：]\s*([^|]+)/i)?.[1] || '';
    return /电流信号检测放大器|电流检测放大器|current[ -]?sense/i.test(sectionText)
      && /(?:high[ -]?side.{0,40}current[ -]?sense|current[ -]?sense.{0,40}high[ -]?side|高侧.{0,12}(?:电流检测|电流采样))/.test(featureCell.toLowerCase());
  }
  if (t === '可变增益') {
    const gainOption = String(product._params || '').match(/(?:^|\|)\s*(?:Gain Option|增益选项)\s*[:：]\s*([^|]+)/i)?.[1] || '';
    const featureCell = String(product._params || '').match(/(?:^|\|)\s*Features?\s*[:：]\s*([^|]+)/i)?.[1] || '';
    return /^(?:variable|可变|可编程)$/i.test(gainOption.trim())
      || /variable[ -]?gain|可变增益/i.test(featureCell);
  }
  if (t === '可编程增益') {
    const featureCell = String(product._params || '').match(/(?:^|\|)\s*Features?\s*[:：]\s*([^|]+)/i)?.[1] || '';
    return /programmable[ -]?gain|可编程增益/i.test(featureCell);
  }
  if (t === '超高精度') {
    const featureCell = String(product._params || '').match(/(?:^|\|)\s*Features?\s*[:：]\s*([^|]+)/i)?.[1] || '';
    return /ultra[ -]?precise|超高精度/i.test(featureCell);
  }
  if (t === '低边检测') {
    const featureCell = String(product._params || '').match(/(?:^|\|)\s*Features?\s*[:：]\s*([^|]+)/i)?.[1] || '';
    return /low[ -]?side\s+(?:capable|sensing)|低边(?:电流)?检测|低侧(?:电流)?检测/i.test(featureCell)
      || tokens.includes('低边检测');
  }
  if (t === '集成比较器') {
    const comparatorCell = String(product._params || '').match(/(?:^|\|)\s*(?:Compa\s*rator|Comparator|比较器)\s*[:：]\s*([^|]+)/i)?.[1] || '';
    const featureCell = String(product._params || '').match(/(?:^|\|)\s*Features?\s*[:：]\s*([^|]+)/i)?.[1] || '';
    if (/^(?:0|no|否|无)$/i.test(comparatorCell.trim())) return false;
    return /^(?:1|yes|是|有)$/i.test(comparatorCell.trim())
      || /with comparator|带比较器|集成比较器/i.test(featureCell);
  }
  if (t === 'pwm抑制') {
    const pwmRejection = String(product._params || '').match(/(?:^|\|)\s*PWM\s*Rejection\s*[:：]\s*([^|]+)/i)?.[1] || '';
    return /^(?:yes|是|有|supported)$/i.test(pwmRejection.trim());
  }

  // Comparator output topology is an explicit table field. Keep open-drain
  // and push-pull as separate hard constraints; a combined legacy tag can
  // incorrectly match either output type.
  if (t === '开漏输出' || t === '推挽输出') {
    const outputType = String(product._params || '').match(/(?:^|\|)\s*(?:Output Type|Output type|输出类型)\s*[:：]\s*([^|]+)/i)?.[1] || '';
    const wanted = t === '开漏输出' ? /open[ -]?drain|开漏/i : /push[ -]?pull|推挽/i;
    return wanted.test(outputType) || tokens.includes(t);
  }

  // A current-sense amplifier or power monitor can be used with a sensor, but
  // does not itself satisfy a request for a current sensor. Catalog application
  // text and stale feature tags must not override the product category.
  if (t === '电流传感器' && (
    /电流信号检测放大器|数字式电流\/功率检测器|电流检测放大器|电流功率检测器/.test(sectionText)
    || (sectionText === 'afe' && /current and power monitor/i.test(paramsText))
  )) return false;
  if (t === '电流检测放大器') return /电流(?:信号检测|检测|采样|传感)放大器|current[ -]?sense[ -]?amplifier/i.test(sectionText);
  // Motor subtypes are table categories. Generic feature tokens or application
  // prose cannot turn a stepper row into a DC motor driver, or vice versa.
  if (t === '直流马达驱动') return /直流马达驱动|直流有刷电机驱动/.test(sectionText);
  if (t === '步进马达驱动') return /步进马达驱动|步进电机驱动/.test(sectionText);
  // These are different physical-layer standards; a stale RS-485 token must
  // not turn an MLVDS row into an RS-485 recommendation.
  if (t === 'rs-485' && sectionText.includes('mlvds')) return false;
  if (t === 'adc' && /mcu|dsp/i.test(sectionText)) return /(?:^|\|)\s*ADC\s*[:：]\s*[^|]*\d+\s*bit/i.test(product._params || '');
  if (t === 'adc' && modelDetailAdcBits(product) !== null) return true;
  if (t === 'spi') {
    const interfaceCell = String(product._params || '').match(/(?:^|\|)\s*(?:Digital Interface|数字接口|通信接口)\s*[:：]\s*([^|]+)/i)?.[1] || '';
    return /\bSPI\b/i.test(interfaceCell)
      || (/adc/i.test(sectionText) && /\bSPI\s*接口/i.test(detailTextRaw));
  }
  if (t === 'mcu/dsp') return isMcuProduct(product);
  if (t === '实时控制') return /实时控制\s*mcu\s*\/\s*dsp/.test(sectionText);
  if (t === 'can' && /mcu|dsp/i.test(sectionText)) {
    // The first count is classic CAN; CAN-FD is a separate second count.
    const cell = String(product._params || '').match(/(?:^|\|)\s*CAN\s*\/\s*CAN-FD\s*[:：]\s*([^|]+)/i)?.[1];
    const counts = cell?.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
    return !!counts && Number(counts[1]) > 0;
  }
  if (t === 'can-fd' && /mcu|dsp/i.test(sectionText)) {
    // This table prints "CAN/ CAN-FD" in every row, including 1/0 parts.
    // The second count is the actual CAN FD capability.
    const cell = String(product._params || '').match(/(?:^|\|)\s*CAN\s*\/\s*CAN-FD\s*[:：]\s*([^|]+)/i)?.[1];
    const counts = cell?.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
    return !!counts && Number(counts[2]) > 0;
  }

  if (isPackageTag(tag)) return packageMatches(product._params || '', tag) === true
    || (product.part_number === 'NSR33xxx' && [
      ...reviewedOrderableConfigurations(product), ...reviewedAdjustableOrderables(product),
    ].some(config => orderablePackageMatches(config, tag)));

  // Duplex evidence from params/detail
  if (t === '半双工' || t === '全双工') {
    const hasSerialContext = /rs-?\s*(?:485|232)|隔离\s*rs-?\s*485|485\s*收发器|232\s*收发器/.test(allEvidenceText)
      || tokens.some((tk) => ['rs-485', 'rs-232', '隔离rs485', '集成隔离电源的隔离rs485'].includes(tk));
    if (!hasSerialContext) return tokens.includes(t);
    const paramsHasHalf = /半双工|half[ -]?duplex/.test(paramsText);
    const paramsHasFull = /全双工|full[ -]?duplex/.test(paramsText);
    if (t === '半双工') {
      if (paramsHasFull && !paramsHasHalf) return false;
      return paramsHasHalf || /半双工|half[ -]?duplex/.test(detailTextRaw) || tokens.includes(t);
    }
    if (paramsHasHalf && !paramsHasFull) return false;
    return paramsHasFull || /全双工|full[ -]?duplex/.test(detailTextRaw) || tokens.includes(t);
  }

  if (t === '隔离rs485') {
    return tokens.includes(t) || tokens.includes('集成隔离电源的隔离rs485')
      || /隔离(?:式)?\s*rs-?\s*485|隔离rs485|isolated\s+rs-?485/.test(allEvidenceText);
  }

  // Op-amp rail-to-rail
  if (t === '轨到轨') {
    const rail=railCapabilityEvidence(product,meta?.requirement?.source?.text||tag);
    if(rail.sources.length||rail.specific)return rail.status==='matched';
    return semanticEvidenceMatches(product, t);
  }

  // Ethernet media
  if (t === '同时采样') {
    const configuration = String(product._params || '').match(/(?:^|\|)\s*(?:multichannel configuration|多通道配置|采样方式)\s*[:：]\s*([^|]+)/i)?.[1] || '';
    return /\bsimultaneous\b|同时|同步/i.test(configuration);
  }
  if (t === 'phy') return !/交换机|switch/.test(sectionText)
    && (/phy|物理层/.test(sectionText) || /(?:^|\|)\s*简介\s*[:：]\s*(?:fe|ge|2\.5ge?)\s+phy\b/i.test(product._params || ''));
  if (['rgmii', 'rmii', 'sgmii', 'qsgmii'].includes(t)) {
    const interfaceFields = [...String(product._params || '').matchAll(/(?:^|\|)\s*(?:扩展接口|接口)\s*[:：]\s*([^|]+)/gi)]
      .map(match => match[1].toLowerCase());
    return interfaceFields.some(value => new RegExp(`\\b${t}\\b`, 'i').test(value));
  }
  if (t === '1000base-t') {
    // Exact standard matching: 1000BASE-T1 is not a substitute for 1000BASE-T.
    return /(?:^|[^a-z0-9])1000\s*base\s*-\s*t(?:$|[^a-z0-9])/i.test(allEvidenceText);
  }
  if (t === 't1-phy') return /(?:10|100|1000)base-t1|802\.3bw/.test(paramsText);
  if (t === '100base-tx') {
    if (/(?:10|100|1000)base-t1|802\.3bw/.test(paramsText)) return false;
    return /100base-tx|\bfe\s+phy\b|双绞线/.test(paramsText);
  }
  if (t === '百兆') {
    return /百兆|100base-(?:tx|t1|fx)|\bfe\s+phy\b|\b1fe\b|802\.3bw/.test(paramsText) || tokens.includes(t);
  }
  if (t === '千兆' && /phy|交换机|以太网/i.test(sectionText)) {
    const ports = String(product._params || '').match(/(?:^|\|)\s*端口\s*[:：]\s*([^|]+)/i)?.[1] || '';
    return /\b\d+\s*GE\b/i.test(ports) || tokens.includes(t);
  }

  // SBC compound
  if (tokens.includes('sbc')) {
    if (t === 'can-fd') return /\bcan\b|uja1169|tja1145/.test(paramsText);
    if (t === 'lin') return /\blin\b|tja1028|tlin1028/.test(paramsText);
    if (t === 'rs-485') return /rs-?485|485\s*sbc/.test(paramsText);
    if (t === 'rs-232') return /rs-?232|232\s*sbc/.test(paramsText);
  }

  // DCDC compound: product is DCDC but params define topology (降压/buck, 升压/boost)
  if (tokens.includes('dcdc')) {
    if (t === '降压') return tokens.includes('降压') || /降压|buck|step[ -]?down/i.test(allEvidenceText);
    if (t === '升压') return tokens.includes('升压') || /升压|boost|step[ -]?up/i.test(allEvidenceText);
  }

  // Package/structural constraints are handled by validated parameter_rules in route.ts.
  // See route.ts safePredicate() — no more hardcoded regex here.

  // Downgradable specs
  if (meta?.downgradable && meta.value != null && (meta.family === '端口' || meta.family === '通道')) {
    if (meta.family === '端口') {
      const count = portCountOf(product, tokens);
      return count != null && count >= meta.value;
    }
    const count = channelCountOf(product, tokens);
    return count != null && count >= meta.value;
  }

  if (meta?.value != null && meta.family === 'bit') {
    if (/mcu|dsp/i.test(sectionText)) {
      const adcCell = String(product._params || '').match(/(?:^|\|)\s*ADC\s*[:：]\s*([^|]+)/i)?.[1] || '';
      const resolution = adcCell.match(/(\d+)\s*bit/i);
      return !!resolution && Number(resolution[1]) >= meta.value;
    }
    const bits = bitResolutionOf(product, tokens);
    return bits != null && bits >= meta.value;
  }

  if (meta?.downgradable && meta.value != null && meta.family === 'Mbps') {
    const maxMbps = dataRateMaxMbpsOf(product, tokens);
    return maxMbps != null && maxMbps >= meta.value;
  }

  // Vin
  if (meta?.value != null && meta.family === 'Vin') {
    const rng = vinRangeOf(product, tokens);
    return !!rng && rng[0] <= meta.value && meta.value <= rng[1];
  }

  // Iout
  if (meta?.value != null && meta.family === 'Iout') {
    const maxIout = ioutMaxOf(product, tokens);
    return maxIout != null && maxIout >= meta.value;
  }

  // Vos
  if ((meta?.value != null && meta.family === 'Vos') || (meta?.dimension === 'spec' && /^vos_<=/i.test(tag))) {
    const vosVal = meta?.value ?? (() => {
      const m = tag.match(/^Vos_<=(\d+\.?\d*)(m?)V?$/i);
      return m ? parseFloat(m[1]) : null;
    })();
    if (vosVal != null) {
      const vos = vosMaxMvOf(product);
      return vos != null && vos <= vosVal;
    }
  }

  // Vout
  if (meta?.value != null && meta.family === 'Vout') {
    const spec = voutSpecOf(product, tokens);
    if (spec.values.some((v) => Math.abs(v - meta.value!) < 1e-6)) return true;
    return !!spec.range && spec.range[0] <= meta.value && meta.value <= spec.range[1];
  }

  const portMatch = t.match(/^(\d+)口$/);
  if (portMatch) {
    const n = portMatch[1];
    return portCountOf(product, tokens) === Number(n);
  }

  // Parent→children closure
  const PARENT_CLOSURE: Record<string, string[]> = {
    '栅极驱动': ['隔离栅极驱动', '非隔离栅极驱动'],
    '隔离CAN': ['集成隔离电源的隔离CAN'],
    '电压基准': ['串联型电压基准', '并联型电压基准'],
  };
  const children = PARENT_CLOSURE[t];
  if (children && children.some((child) => tokens.includes(child.toLowerCase()))) return true;

  // Synonym closure (includes compound→constituent reverse mapping for decomposed tags)
  const SYNONYM_CLOSURE: Record<string, string[]> = {
    '运放': ['放大器'],
    // Compound reverse mapping: constituent tag matches products with compound tokens
    'RS-485': ['隔离RS485', '集成隔离电源的隔离RS485'],
    'CAN-FD': ['隔离CAN', '集成隔离电源的隔离CAN'],
    'I2C': ['隔离I2C'],
    '隔离': ['隔离RS485', '隔离CAN', '隔离I2C', '集成隔离电源的隔离CAN', '集成隔离电源的隔离RS485'],
    '隔离电源': ['集成隔离电源的隔离CAN', '集成隔离电源的隔离RS485'],
  };
  const synonyms = SYNONYM_CLOSURE[t];
  if (synonyms && synonyms.some((syn) => tokens.includes(syn.toLowerCase()))) return true;

  // Registry-backed semantic tags are constrained to their declared context
  // and evidence fields, including when a stale canonical token exists.
  const semanticRules = semanticRulesForTag(t);
  if (semanticRules.some(rule => rule.dimension !== 'category' && rule.dimension !== 'grade')) {
    return semanticEvidenceMatches(product, t);
  }

  // Evidence registry
  const canUseEvidence = !meta || (meta.dimension !== 'category' && meta.dimension !== 'grade');
  if (canUseEvidence) {
    const evidenceRule = EVIDENCE_REGISTRY.find((r) => r.tag === t);
    if (evidenceRule) {
      let contextOk = true;
      if (evidenceRule.contextSection) {
        const section = (product._section || '');
        contextOk = evidenceRule.contextSection.test(section);
      }
      if (contextOk) {
        if (evidenceRule.paramsKey) {
          const pn = product._params_numeric;
          if (pn && Object.keys(pn).some((k: string) => k.includes(evidenceRule.paramsKey!))) return true;
        }
        if (evidenceRule.detailMatch) {
          if (evidenceRule.detailMatch.test(detailTextRaw)) return true;
        }
      }
    }
  }

  // Exact token match
  if (tokens.some((tk) => tk === t)) return true;

  // Hard category/grade — but check section/params before rejecting.
  // Products in "集成隔离电源的隔离RS485 选型表" section ARE RS-485 products
  // even if their _features tokens don't include "RS-485" separately.
  // Also normalize hyphens: "RS-485" vs "RS485" in section names.
  if (meta && (meta.dimension === 'category' || meta.dimension === 'grade')) {
    const tNoHyphen = t.replace(/-/g, '');
    if (sectionText.includes(t) || sectionText.includes(tNoHyphen)) return true;
    if (paramsText.includes(t) || paramsText.includes(tNoHyphen)) return true;
    if (feats.includes(t) || feats.includes(tNoHyphen)) return true;
    // Check category synonyms in section/params (e.g. "DCDC" matches "降压"/"buck")
    const syns = CATEGORY_SYNONYMS[t];
    if (syns) {
      for (const syn of syns) {
        if (sectionText.includes(syn) || paramsText.includes(syn) || feats.includes(syn)) return true;
      }
    }
    return false;
  }

  const allowDetailEvidence = !(meta && meta.dimension === 'media');

  // General fallback: search params + detail for evidence
  if (allowDetailEvidence && allEvidenceText.length > 10) {
    if (t.length >= 2 && /[\u4e00-\u9fff]/.test(t)) {
      if (allEvidenceText.includes(t)) return true;
    }
    if (/^[a-z0-9]/i.test(t)) {
      const re = new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\b", "i");
      if (re.test(allEvidenceText)) return true;
    }
  }


  return false;
}

// ── Scoring ──
function exactSpecHit(product: ConstraintProduct, meta: MustConstraint): boolean {
  if (meta.value == null) return false;
  const tokens = (product._features || "").toLowerCase().split(/\s+/);
  if (meta.family === '端口' || meta.family === '通道') {
    if (meta.family === '端口') {
      const count = portCountOf(product, tokens);
      return count === meta.value;
    }
    const count = channelCountOf(product, tokens);
    return count === meta.value;
  }
  if (meta.family === 'Iout' || meta.family === 'Vin') {
    const prefix = meta.family === 'Iout' ? 'iout_' : 'vin_';
    const suffix = meta.family === 'Iout' ? 'a' : 'v';
    let maxVal = -1;
    for (const tk of tokens) {
      if (tk.startsWith(prefix) && tk.endsWith(suffix)) {
        const num = parseFloat(tk.slice(prefix.length, -suffix.length));
        if (!Number.isNaN(num) && num > maxVal) maxVal = num;
      }
    }
    return maxVal === meta.value;
  }
  return false;
}

export type ConstraintScore = {
  product: ConstraintProduct;
  assessment: SelectionAssessment;
  sourceEvidence: Record<string, VerifiedSource[]>;
  mustHit: string[];
  mustMiss: string[];
  mustUnknown: string[];
  parameterChecks: Record<string, RequirementResult>;
  niceHit: string[];
  fullMatch: boolean;
  score: number;
  exactBonus: number;
  missDims: ConstraintDimension[];
  categoryHit: boolean;
  directTokenBonus: number;
  /** Downgrade hits: tag → product's actual value (satisfied via downgrade, not exact match) */
  downgradeHits: Record<string, string>;
};

function alignMeta(must: string[], mustMeta?: MustConstraint[]): MustConstraint[] {
  if (mustMeta && mustMeta.length === must.length) return mustMeta;
  const byTag = new Map((mustMeta || []).map((m) => [m.tag, m]));
  return must.map((t) => byTag.get(t) || { tag: t, dimension: 'category' as ConstraintDimension });
}

/** A protocol tag can cover both the chip class and the protocol. A verified
 * interface rate can identify a research candidate without proving the protocol. */
export function partialCanProtocolCandidate(row:ConstraintScore):boolean {
  return row.mustUnknown.includes('CAN-FD') && /CAN\s*收发器/i.test(String(row.product._section||''))
    && row.mustMiss.every(tag=>row.mustUnknown.includes(tag))
    && Object.values(row.parameterChecks).every(check=>check.status==='matched')
    && Object.values(row.parameterChecks).some(check=>check.status==='matched' &&
      check.evidence.some(f=>f.field==='dataRate'));
}

export function scoreByConstraints(
  products: ConstraintProduct[],
  must: string[],
  nice: string[],
  mustMeta?: MustConstraint[],
  query?: string
): ConstraintScore[] {
  const metas = alignMeta(must, mustMeta);
  const niceRequirements = parseParameterRequirements(query || '').requirements.filter(r => r.strength === 'nice');
  const mainCategories=metas.filter(m=>m.dimension==='category'&&CATEGORY_TAG_NAMES.has(m.tag)).map(m=>m.tag);
  return products.map((product) => {
    const identityMatched=matchesMainDeviceIdentity(product,mainCategories);
    const mustHit: string[] = [];
    const mustMiss: string[] = [];
    const mustUnknown: string[] = [];
    const parameterChecks: Record<string, RequirementResult> = {};
    const missDims: ConstraintDimension[] = [];
    let exactBonus = 0;
    let criticalSpecHit = 0;
    let directTokenBonus = 0;
    const withdrawnFields = product._withdrawn_reviewed_fields;
    const needsFactReview = Array.isArray(withdrawnFields) && withdrawnFields.length > 0;
    const namedRailAssessment = catalogAssessment(true, product, must);
    for (const meta of metas) {
      if (!identityMatched && meta.dimension === 'category') {
        mustMiss.push(meta.tag);missDims.push(meta.dimension);continue;
      }
      if (needsFactReview) {
        mustMiss.push(meta.tag);
        mustUnknown.push(meta.tag);
        missDims.push(meta.dimension);
        if (meta.requirement && meta.requirement.kind !== 'tag') {
          parameterChecks[meta.tag] = { status: 'unknown', reason: '已发布来源撤回，参数需复核', evidence: [] };
        }
        continue;
      }
      if (meta.requirement?.field === 'vcca' || meta.requirement?.field === 'vccb') {
        const status = namedRailAssessment.namedRailStatus === 'inside_documented_bounds' ? 'matched'
          : namedRailAssessment.namedRailStatus === 'outside_documented_bounds' ? 'unmatched' : 'unknown';
        parameterChecks[meta.tag] = { status, reason: status === 'unknown'
          ? '缺少另一条电源轨或完整的已审阅联合工作条件'
          : '按规格书的双电源轨联合工作条件判断', evidence: [] };
        if (status === 'matched') mustHit.push(meta.tag);
        else {
          mustMiss.push(meta.tag);
          if (status === 'unknown') mustUnknown.push(meta.tag);
          missDims.push(meta.dimension);
        }
        continue;
      }
      if (meta.requirement && meta.requirement.kind !== 'tag') parameterChecks[meta.tag] = evaluateRequirement(product, meta.requirement);
      if (meta.dimension === 'category' && catalogProvesPrimaryClass(product,meta.tag) || tagSatisfied(product, meta.tag, meta)) {
        mustHit.push(meta.tag);
        if (exactSpecHit(product, meta)) exactBonus++;
        if (meta.dimension === 'spec' && !meta.downgradable) criticalSpecHit++;
        const feats = (product._features || '').toLowerCase().split(/\s+/);
        if (feats.includes(meta.tag.toLowerCase())) directTokenBonus++;
      } else {
        mustMiss.push(meta.tag);
        if (constraintStatus(product, meta.tag, meta) === 'unknown') mustUnknown.push(meta.tag);
        missDims.push(meta.dimension);
      }
    }
    const niceHit = nice.filter((n) => {
      if (needsFactReview) return false;
      const requirement = niceRequirements.find(r => r.tag === n);
      return tagSatisfied(product, n, requirement ? { tag: n, dimension: 'spec', requirement } : undefined);
    });
    const assessment = catalogAssessment(mustMiss.length === 0, product, must);
    if (mustMiss.length === 0 && assessment.orderableStatus === 'no_listed_configuration') {
      mustMiss.push('已收录订购组合');
      missDims.push('spec');
      assessment.requirementsStatus = 'incomplete';
    }
    if (mustMiss.length === 0 && assessment.orderableStatus === 'unverified'
      && assessment.adjustableOrderables?.length && assessment.orderableCheckedTags?.some(tag => /^Vout_/.test(tag))) {
      mustMiss.push('固定输出订购组合待核');
      mustUnknown.push('固定输出订购组合待核');
      missDims.push('spec');
      assessment.requirementsStatus = 'incomplete';
    }
    if (mustMiss.length === 0 && assessment.orderableStatus === 'unverified'
      && !assessment.adjustableOrderables?.length
      && must.some(tag => /^Vout_\d+(?:\.\d+)?V$/.test(tag))
      && must.some(isPackageTag)) {
      // Independent output and package cells on a catalog row do not establish
      // that one purchasable variant has both properties.
      mustMiss.push('输出电压与封装订购组合待核');
      mustUnknown.push('输出电压与封装订购组合待核');
      missDims.push('spec');
      assessment.requirementsStatus = 'incomplete';
    }
    if (mustMiss.length === 0 && assessment.operatingStatus === 'outside_documented_bounds') {
      mustMiss.push('已核实工作范围');
      missDims.push('spec');
      assessment.requirementsStatus = 'incomplete';
    }
    const fullMatch = identityMatched && mustMiss.length === 0;
    const sourceEvidence = Object.fromEntries([...mustHit, ...niceHit].map(tag => {
      const refs = [...sourcesForMatchedTag(product, tag),
        ...(tag==='轨到轨'?railCapabilityEvidence(product,metas.find(m=>m.tag===tag)?.requirement?.source?.text||tag).sources:[]),
        ...(parameterChecks[tag]?.evidence || []).flatMap(fact => fact.source.verified ? [fact.source.verified] : [])];
      return [tag, [...new Map(refs.map(ref => [ref.factId, ref])).values()]];
    }).filter(([, refs]) => refs.length > 0)) as Record<string, VerifiedSource[]>;
    const categoryHit = identityMatched && metas.some((m) => m.dimension === 'category' && mustHit.includes(m.tag));
    const score = mustHit.length * 10 + (categoryHit ? 5 : 0) + exactBonus * 3 + criticalSpecHit * 2 + directTokenBonus * 5 + niceHit.length;
    // Downgrade detection: satisfied by downgrade but not exact
    const downgradeHits: Record<string, string> = {};
    for (const m of metas) {
      if (!m.downgradable || !m.value || !mustHit.includes(m.tag)) continue;
      const toks = (product._features || '').toLowerCase().split(/\s+/);
      let actual: number | null = null;
      if (m.family === '通道') actual = channelCountOf(product, toks);
      else if (m.family === '端口') actual = portCountOf(product, toks);
      else if (m.family === 'bit') actual = bitResolutionOf(product, toks);
      else if (m.family === 'Mbps') actual = dataRateMaxMbpsOf(product, toks);
      if (actual !== null && actual > m.value) {
        const unit = m.family === '端口' ? '口' : m.family === '通道' ? '通道' : m.family === 'Mbps' ? 'Mbps' : 'bit';
        downgradeHits[m.tag] = `${actual}${unit}`;
      }
    }
    return { product, assessment, sourceEvidence, mustHit, mustMiss, mustUnknown, parameterChecks, niceHit, fullMatch, score, exactBonus, missDims, categoryHit, directTokenBonus, downgradeHits };
  });
}

// ── ApplyConstraints ──
export type ConstraintResult = {
  tier: 1 | 2 | 3;
  banner: string;
  items: ConstraintScore[];
};

const DIM_LABEL: Record<ConstraintDimension, string> = {
  category: '品类', media: '物理层接口', spec: '规格', grade: '等级', technology: '技术路线',
};

function productionStatusRank(product: ConstraintProduct): number {
  const text = String(product._params || '').toLowerCase();
  if (/状态\s*[:：]\s*(?:mp|量产|production)|status\s*[:：]\s*(?:production|active|mp)/i.test(text)) return 3;
  if (/状态\s*[:：]\s*(?:预量产|试产)|pre[-\s]?production/i.test(text)) return 2;
  if (/状态\s*[:：]\s*(?:样品|sample)|sample/i.test(text)) return 1;
  return 0;
}

function productionStatusTieRank(product: ConstraintProduct): number {
  const tokens = String(product._features || '').toLowerCase().split(/\s+/);
  return tokens.includes('sbc') ? productionStatusRank(product) : 0;
}

function diversifyWithinTieGroups(
  items: ConstraintScore[],
  tieKeyOf: (item: ConstraintScore) => string
): ConstraintScore[] {
  if (items.length <= 2) return items;
  const out: ConstraintScore[] = [];
  let i = 0;
  while (i < items.length) {
    const groupKey = tieKeyOf(items[i]);
    let j = i;
    while (j < items.length && tieKeyOf(items[j]) === groupKey) j++;
    const group = items.slice(i, j);
    const vendors = [...new Set(group.map((s) => String(s.product.__vendorGroup || s.product.__vendor || '')))];
    const vendorOrder = [...vendors].sort();
    const buckets = new Map(vendorOrder.map((v) => [v, [] as ConstraintScore[]]));
    const singletons: ConstraintScore[] = [];
    for (const s of group) {
      const bucket = vendorBucketOf(s.product);
      if (bucket && buckets.has(bucket)) buckets.get(bucket)!.push(s);
      else singletons.push(s);
    }
    let singletonIdx = 0;
    while (true) {
      let progressed = false;
      for (const vendor of vendorOrder) {
        const bucketItems = buckets.get(vendor)!;
        if (bucketItems.length === 0) continue;
        out.push(bucketItems.shift()!);
        progressed = true;
        if (singletonIdx < singletons.length) out.push(singletons[singletonIdx++]);
      }
      if (!progressed) break;
    }
    if (singletonIdx < singletons.length) out.push(...singletons.slice(singletonIdx));
    i = j;
  }
  return out;
}

function vendorBucketOf(product: ConstraintProduct): string | null {
  const raw = String(product.__vendorGroup || product.__vendor || '').trim();
  return raw || null;
}

export function applyConstraints(
  products: ConstraintProduct[],
  must: string[],
  nice: string[],
  mustMeta?: MustConstraint[],
  sortKey?: SortIntent,
  query?: string
): ConstraintResult {
  const metas = alignMeta(must, mustMeta);
  const scored = scoreByConstraints(products, must, nice, mustMeta, query);

  const scopedHardTechnologyTags = (() => {
    const catTags = metas.filter((m) => m.dimension === 'category').map((m) => m.tag);
    const techTags = metas.filter((m) => m.dimension === 'technology').map((m) => m.tag);
    if (catTags.includes('马达驱动') && techTags.includes('霍尔')) return ['霍尔'];
    return [] as string[];
  })();
  const hardTags = new Set(metas.filter((m) => m.dimension === 'category' || m.dimension === 'media').map((m) => m.tag));
  scopedHardTechnologyTags.forEach((t) => hardTags.add(t));
  const isHardSatisfied = (s: ConstraintScore) => [...hardTags].every((t) => s.mustHit.includes(t));

  const applySort = (arr: ConstraintScore[]): ConstraintScore[] => {
    if (!sortKey) return arr;
    let pool = arr;
    if (sortKey.require) {
      pool = arr.filter((s) => sortValueOf(s.product, sortKey) != null);
    }
    const sorted = [...pool].sort(
      (a, b) => compareBySort(a.product, b.product, sortKey)
        || b.exactBonus - a.exactBonus || b.niceHit.length - a.niceHit.length || b.score - a.score
    );
    return diversifyWithinTieGroups(sorted, (s) => [
      sortValueOf(s.product, sortKey) ?? 'null',
      s.exactBonus, s.niceHit.length, s.score,
    ].join('|'));
  };

  // tier1
  const full = scored.filter((s) => s.fullMatch);
  if (full.length > 0) {
    const sortedFull = sortKey
      ? applySort(full)
      : diversifyWithinTieGroups(
          [...full].sort((a, b) => {
            const aDowngraded = Object.keys(a.downgradeHits).length > 0 ? 1 : 0;
            const bDowngraded = Object.keys(b.downgradeHits).length > 0 ? 1 : 0;
            return aDowngraded - bDowngraded  // 无降级的排前面
              || b.exactBonus - a.exactBonus
              || b.niceHit.length - a.niceHit.length
              || productionStatusTieRank(b.product) - productionStatusTieRank(a.product)
              || b.score - a.score;
          }),
          (s) => [Object.keys(s.downgradeHits).length, s.exactBonus, s.niceHit.length, productionStatusTieRank(s.product), s.score].join('|')
        );
    if (sortedFull.length > 0) {
      const banner = sortKey ? `共 ${sortedFull.length} 款匹配，${sortKey.label}排序：` : "";
      return { tier: 1, banner, items: sortedFull };
    }
  }

  // tier2: per-product downgradable spec filter
  const hardTagOk = scored.filter((s) => hardTags.size > 0 && isHardSatisfied(s));
  let hardOk = hardTagOk;
  for (const m of metas) {
    if (!m.downgradable || m.value == null) continue;
    if (m.family !== '通道' && m.family !== '端口' && m.family !== 'bit' && m.family !== 'Mbps') continue;
    hardOk = hardOk.filter((s) => {
      const toks = (s.product._features || '').toLowerCase().split(/\s+/);
      let prodVal: number | null = null;
      if (m.family === '端口') prodVal = portCountOf(s.product, toks);
      else if (m.family === '通道') prodVal = channelCountOf(s.product, toks);
      else if (m.family === 'bit') prodVal = bitResolutionOf(s.product, toks);
      else prodVal = dataRateMaxMbpsOf(s.product, toks);
      return prodVal == null || prodVal >= m.value!;
    });
  }
  if (hardTagOk.length > 0 && hardOk.length === 0) {
    const overSpec: string[] = [];
    for (const m of metas) {
      if (!m.downgradable || m.value == null) continue;
      if (m.family !== '通道' && m.family !== '端口' && m.family !== 'bit' && m.family !== 'Mbps') continue;
      const unit = m.family === '端口' ? '口' : m.family === '通道' ? '通道' : m.family === 'bit' ? 'bit' : 'Mbps';
      let maxInStock = 0;
      for (const s of hardTagOk) {
        const toks = (s.product._features || '').toLowerCase().split(/\s+/);
        let n: number | null = null;
        if (m.family === '端口') n = portCountOf(s.product, toks);
        else if (m.family === '通道') n = channelCountOf(s.product, toks);
        else if (m.family === 'bit') n = bitResolutionOf(s.product, toks);
        else n = dataRateMaxMbpsOf(s.product, toks);
        if (n != null) maxInStock = Math.max(maxInStock, n);
      }
      if (maxInStock < m.value) overSpec.push(`${m.tag}（最高${maxInStock}${unit}）`);
    }
    const top = hardTagOk.sort((a,b) => a.mustMiss.length - b.mustMiss.length || b.score - a.score).slice(0, 5);
    return {
      tier: 2,
      banner: overSpec.length
        ? `品类匹配，但${overSpec.join('、')}的产品上限不满足要求。以下 ${top.length} 款最接近能力边界：`
        : `品类匹配但无满足容量要求的产品，以下 ${top.length} 款最接近：`,
      items: top,
    };
  }

  if (hardOk.length > 0) {
    const hardOkProducts = hardOk.map((s) => s.product);
    const overLimit: { family: string; want: number; max: number }[] = [];
    for (const m of metas) {
      if (m.value == null) continue;
      const want = m.value;
      const isCapacitySpec = m.downgradable && (m.family === '端口' || m.family === '通道');
      const isBitSpec = m.family === 'bit';
      if (!isCapacitySpec && !isBitSpec) continue;
      const family = m.family as '端口' | '通道' | 'bit';
      const unit = family === '端口' ? '口' : family === '通道' ? '通道' : 'bit';
      let maxInStock = 0;
      for (const p of hardOkProducts) {
        const toks = (p._features || "").toLowerCase().split(/\s+/);
        if (family === '端口') {
          const n = portCountOf(p, toks);
          if (n != null) maxInStock = Math.max(maxInStock, n);
        } else if (family === '通道') {
          const n = channelCountOf(p, toks);
          if (n != null) maxInStock = Math.max(maxInStock, n);
        } else {
          const n = bitResolutionOf(p, toks);
          if (n != null) maxInStock = Math.max(maxInStock, n);
        }
      }
      if (maxInStock > 0 && maxInStock < want) {
        overLimit.push({ family, want, max: maxInStock });
      }
    }

    if (overLimit.length > 0) {
      const ol = overLimit[0];
      const unit = ol.family === '端口' ? '口' : ol.family === '通道' ? '通道' : 'bit';
      const kept = [...hardTags].join("、");
      const atMax = hardOk
        .filter((s) => {
          const toks = (s.product._features || "").toLowerCase().split(/\s+/);
          if (ol.family === '端口') return portCountOf(s.product, toks) === ol.max;
          if (ol.family === '通道') return channelCountOf(s.product, toks) === ol.max;
          return bitResolutionOf(s.product, toks) === ol.max;
        })
        .sort((a, b) => b.niceHit.length - a.niceHit.length || b.score - a.score)
        .slice(0, 5);
      const banner = `${kept}当前最多 ${ol.max}${unit}（无 ${ol.want}${unit} 产品）。以下是端口数最高的 ${atMax.length} 款；如需更多${unit}请联系 FAE 评估级联方案。`;
      return { tier: 2, banner, items: atMax };
    }

    const definiteMisses = (s: ConstraintScore) => s.mustMiss.length - s.mustUnknown.length;
    const unresolvedEvidence = (s: ConstraintScore) => s.mustUnknown.reduce((count, tag) =>
      count + (s.parameterChecks[tag]?.evidence.length || 0), 0);
    hardOk.sort((a, b) => definiteMisses(a) - definiteMisses(b) || a.mustMiss.length - b.mustMiss.length
      || unresolvedEvidence(b) - unresolvedEvidence(a) || b.exactBonus - a.exactBonus
      || b.niceHit.length - a.niceHit.length || b.score - a.score);
    const top = diversifyWithinTieGroups(hardOk, (s) => [definiteMisses(s), s.mustMiss.length,
      unresolvedEvidence(s), s.exactBonus, s.niceHit.length, s.score].join('|')).slice(0, 8);
    const relaxedDims = [...new Set(top[0].missDims)].map((d) => DIM_LABEL[d]);
    const relaxedTags = [...new Set(top[0].mustMiss)];
    const kept = [...hardTags].join("、");
    const onlyUnknown = relaxedTags.length > 0 && relaxedTags.every(tag => top[0].mustUnknown.includes(tag));
    const banner = relaxedTags.length
      ? onlyUnknown
        ? `没有已核验的完整匹配。${kept}已有证据，${relaxedTags.join("、")}仍需核对具体型号或订购配置；以下 ${top.length} 款仅供复核：`
        : `没有完全匹配的产品。已保证${kept}一致；首项候选缺少${relaxedDims.join("、")}（${relaxedTags.join("、")}）。以下 ${top.length} 款是参考候选，其他未满足条件请逐项查看：`
      : `没有完全匹配的产品，以下 ${top.length} 款是参考候选，请逐项查看未满足条件：`;
    return { tier: 2, banner, items: top };
  }

  if (scopedHardTechnologyTags.length > 0) {
    const catTags = metas.filter((m) => m.dimension === 'category').map((m) => m.tag);
    return {
      tier: 3,
      banner: `没有找到同时具备「${[...catTags, ...scopedHardTechnologyTags].join("、")}」证据的产品。可尝试放宽技术路线或换个品类。`,
      items: [],
    };
  }

  const any = diversifyWithinTieGroups(
    scored.filter((s) => s.mustHit.length > 0).sort((a, b) => b.score - a.score),
    (s) => String(s.score)
  ).slice(0, 5);
  const catTags = metas.filter((m) => m.dimension === 'category').map((m) => m.tag);
  return {
    tier: 3,
    banner: any.length > 0
      ? `没有「${catTags.join("、") || must.join("、")}」品类的完全匹配产品。以下是部分相关的，供参考：`
      : `没有找到「${catTags.join("、") || must.join("、")}」相关产品。可尝试放宽条件或换个说法。`,
    items: any,
  };
}

export function describeMatch(s: ConstraintScore): string {
  const total = s.mustHit.length + s.mustMiss.length;
  const hit = s.mustHit.length ? `满足 ${s.mustHit.length}/${total}：${s.mustHit.join(" ✓ ")} ✓` : `满足 0/${total}`;
  const miss = s.mustMiss.length ? `  ·  缺：${s.mustMiss.join("、")}` : "";
  return hit + miss;
}

// ── Cross-ref ──
export type CrossRefHit = {
  product: ConstraintProduct;
  altField: string;
  matchType: 'exact' | 'series';
};

function extractAltField(product: ConstraintProduct): string {
  const params = (product._params as string) || "";
  for (const seg of params.split("|")) {
    const s = seg.trim();
    if (s.startsWith("可替代产品") || s.startsWith("可替代") || s.startsWith("替代产品")) {
      const idx = s.search(/[:：]/);
      if (idx >= 0) return s.slice(idx + 1).trim();
    }
  }
  return "";
}

export function crossRefSearch(products: ConstraintProduct[], target: string): CrossRefHit[] {
  const tgt = target.toUpperCase().trim();
  if (!tgt) return [];
  const exact: CrossRefHit[] = [];
  const series: CrossRefHit[] = [];
  for (const p of products) {
    const altField = extractAltField(p);
    if (!altField) continue;
    const altTokens = altField.toUpperCase().split(/[/,，、;；\s]+/).map((t) => t.trim()).filter(Boolean);
    let hit: 'exact' | 'series' | null = null;
    for (const at of altTokens) {
      if (at === tgt) { hit = 'exact'; break; }
      if ((at.startsWith(tgt) || tgt.startsWith(at)) && Math.min(at.length, tgt.length) >= 4) {
        hit = 'series';
      }
    }
    if (hit === 'exact') exact.push({ product: p, altField, matchType: 'exact' });
    else if (hit === 'series') series.push({ product: p, altField, matchType: 'series' });
  }
  return [...exact, ...series];
}

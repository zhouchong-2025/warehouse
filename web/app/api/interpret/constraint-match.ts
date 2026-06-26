// constraint-match.ts
// must/nice 约束匹配 + 维度感知的三级降级兜底

export type ConstraintDimension = 'category' | 'media' | 'spec' | 'grade' | 'technology';
export interface MustConstraint {
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
    const v = val as { value?: unknown; min?: unknown; max?: unknown } | null;
    let num: number | null = null;
    if (v && typeof v.value === 'number') num = v.value;
    else if (v && typeof v.max === 'number') num = v.max as number;
    if (num == null || Number.isNaN(num)) continue;
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
  if (unit === 'ma' || raw.includes('ma') || kl.includes('__ma_')) num /= 1000;
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

function bitResolutionOf(product: ConstraintProduct, tokens: string[]): number | null {
  let best: number | null = null;
  for (const tk of tokens) {
    const m = tk.match(/^(\d+)bit$/);
    if (m) { const n = parseInt(m[1], 10); best = best == null ? n : Math.max(best, n); }
  }
  return best;
}

function channelCountOf(product: ConstraintProduct, tokens: string[]): number | null {
  let best: number | null = null;
  // Extract from _params raw text (precise regex, no false positives from _params_numeric key matching)
  const paramsText = String(product._params || '');
  for (const re of [
    /(number of channels?|channel count|通道数|通道数量|adc input channel|input channel(?:\s+数量)?|参考\s*通道数|输入通道\s*数量)\s*[:：]\s*(\d+)/gi,
    /(\d+)\s*通道/gi,
    /\b(\d+)\s*ch\b/gi,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(paramsText)) !== null) {
      const n = parseInt(m[m.length - 1], 10);
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
  // Fallback: "可调输出" / "adjustable output" → treat as wide-range (FAE knows it covers any reasonable Vout)
  const paramsText = (product._params || '').toLowerCase();
  if (/可调输出|adjustable\s*output/i.test(paramsText)) {
    return { values: [], range: [0, 1000] };
  }
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
  { tag: '霍尔', detailMatch: /霍尔|hall[ -]?(effect|sensor|switch|latch)/i },
];

function isIoExpanderProduct(product: ConstraintProduct, tokens: string[]): boolean {
  const section = String(product._section || '').toLowerCase().replace(/\s+/g, '');
  return tokens.includes('io扩展器') || section.includes('io扩展器') || section.includes('i/o扩展器');
}

// ── Core: tagSatisfied ──
export function tagSatisfied(product: ConstraintProduct, tag: string, meta?: MustConstraint): boolean {
  const feats = (product._features || "").toLowerCase();
  const tokens = feats.split(/\s+/).filter(Boolean);
  const t = tag.toLowerCase();
  const paramsText = (product._params || "").toLowerCase();
  const detailTextRaw = ((product._detail_intro || "") + " " + (product._detail_features || "")).toLowerCase();
  const allEvidenceText = `${paramsText} ${detailTextRaw}`;

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
    if (tokens.includes(t) || /\brrio\b|轨到轨/.test(allEvidenceText)) return true;
    const inYes = /rail[-\s]?rail\s*in\s*[:：]\s*(yes|是)/.test(allEvidenceText);
    const outYes = /rail[-\s]?rail\s*out\s*[:：]\s*(yes|是)/.test(allEvidenceText);
    return inYes && outYes;
  }

  // Ethernet media
  if (t === 't1-phy') return /(?:10|100|1000)base-t1|802\.3bw/.test(paramsText);
  if (t === '100base-tx') {
    if (/(?:10|100|1000)base-t1|802\.3bw/.test(paramsText)) return false;
    return /100base-tx|\bfe\s+phy\b|双绞线/.test(paramsText);
  }
  if (t === '百兆') {
    return /百兆|100base-(?:tx|t1|fx)|\bfe\s+phy\b|\b1fe\b|802\.3bw/.test(paramsText) || tokens.includes(t);
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
    return tokens.some((tk) => {
      const m = tk.match(/^(\d+)口/);
      return m !== null && m[1] === n;
    });
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
          const detail = ((product._detail_intro || '') + ' ' + (product._detail_features || '')).toLowerCase();
          if (evidenceRule.detailMatch.test(detail)) return true;
        }
      }
    }
  }

  // Exact token match
  if (tokens.some((tk) => tk === t)) return true;

  // Hard category/grade
  if (meta && (meta.dimension === 'category' || meta.dimension === 'grade')) {
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

  // Semantic aliases
  const evidenceText = allowDetailEvidence ? allEvidenceText : paramsText;
  const SEMANTIC_ALIASES: Record<string, string[]> = {};
  const aliases = SEMANTIC_ALIASES[t];
  if (aliases && evidenceText.length > 5) {
    for (const alias of aliases) {
      if (/^[a-z0-9]/i.test(alias)) {
        const re = new RegExp("\\b" + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\b", "i");
        if (re.test(evidenceText)) return true;
      } else {
        if (evidenceText.includes(alias)) return true;
      }
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
  mustHit: string[];
  mustMiss: string[];
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

export function scoreByConstraints(
  products: ConstraintProduct[],
  must: string[],
  nice: string[],
  mustMeta?: MustConstraint[]
): ConstraintScore[] {
  const metas = alignMeta(must, mustMeta);
  return products.map((product) => {
    const mustHit: string[] = [];
    const mustMiss: string[] = [];
    const missDims: ConstraintDimension[] = [];
    let exactBonus = 0;
    let criticalSpecHit = 0;
    let directTokenBonus = 0;
    for (const meta of metas) {
      if (tagSatisfied(product, meta.tag, meta)) {
        mustHit.push(meta.tag);
        if (exactSpecHit(product, meta)) exactBonus++;
        if (meta.dimension === 'spec' && !meta.downgradable) criticalSpecHit++;
        const feats = (product._features || '').toLowerCase().split(/\s+/);
        if (feats.includes(meta.tag.toLowerCase())) directTokenBonus++;
      } else {
        mustMiss.push(meta.tag);
        missDims.push(meta.dimension);
      }
    }
    const niceHit = nice.filter((n) => tagSatisfied(product, n));
    const fullMatch = mustMiss.length === 0;
    const categoryHit = metas.some((m) => m.dimension === 'category' && mustHit.includes(m.tag));
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
    return { product, mustHit, mustMiss, niceHit, fullMatch, score, exactBonus, missDims, categoryHit, directTokenBonus, downgradeHits };
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
  sortKey?: SortIntent
): ConstraintResult {
  const metas = alignMeta(must, mustMeta);
  const scored = scoreByConstraints(products, must, nice, mustMeta);

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

    hardOk.sort((a, b) => a.mustMiss.length - b.mustMiss.length || b.exactBonus - a.exactBonus || b.niceHit.length - a.niceHit.length || b.score - a.score);
    const top = diversifyWithinTieGroups(hardOk, (s) => [s.mustMiss.length, s.exactBonus, s.niceHit.length, s.score].join('|')).slice(0, 8);
    const relaxedDims = [...new Set(top[0].missDims)].map((d) => DIM_LABEL[d]);
    const relaxedTags = [...new Set(top[0].mustMiss)];
    const kept = [...hardTags].join("、");
    const banner = relaxedTags.length
      ? `没有完全匹配的产品。已保证${kept}一致，放宽了${relaxedDims.join("、")}（${relaxedTags.join("、")}），以下 ${top.length} 款最接近：`
      : `没有完全匹配的产品，以下 ${top.length} 款最接近：`;
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

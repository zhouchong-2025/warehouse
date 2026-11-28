import { PARAMETERS, requirementTag, toCanonical, type Comparison, type ParameterId, type QuerySource, type Requirement } from './selection-spec';

export interface QueryFragment {
  id: string;
  source: QuerySource;
  state: 'resolved' | 'needs_model' | 'needs_user';
  verifiable: boolean;
}

/** Locate parser leftovers in the original request, never in normalized text. */
export function residualFragments(query: string, residual: string): QueryFragment[] {
  if (!residual.trim()) return [];
  const pieces = query.toLocaleLowerCase().includes(residual.toLocaleLowerCase())
    ? [residual] : residual.split(/\s+/).filter(Boolean);
  const fragments: QueryFragment[] = [];
  let cursor = 0;
  for (const piece of pieces) {
    const start = query.toLocaleLowerCase().indexOf(piece.toLocaleLowerCase(), cursor);
    if (start < 0) {
      const source: QuerySource = { text: query, start: 0, end: query.length, origin: 'rule' };
      return [{ id: 'residual-unmapped', source, state: 'needs_model', verifiable: false }];
    }
    const end = start + piece.length;
    const source: QuerySource = { text: query.slice(start, end), start, end, origin: 'rule' };
    const previous = fragments.at(-1);
    const gap = previous ? query.slice(previous.source.end, start) : '';
    if (previous && /^[\s,，、;；:：]*$/.test(gap)) {
      const mergedText = query.slice(previous.source.start, end);
      fragments[fragments.length - 1] = { ...previous,
        id: `residual-${previous.source.start}-${end}`,
        source: { text: mergedText, start: previous.source.start, end, origin: 'rule' } };
    } else {
      fragments.push({ id: `residual-${start}-${end}`, source, state: 'needs_model', verifiable: true });
    }
    cursor = end;
  }
  return fragments;
}

interface ModelCoverage {
  fragmentId: string;
  source: { text: string; start: number; end: number };
  outcome: 'requirements' | 'context' | 'clarification';
  interpretation?: string;
  evidenceRequired?: boolean;
  requirements?: ({ kind: 'tag'; tag: string; strength: 'must' | 'nice'; source: { text: string; start: number; end: number } }
    | { kind: 'parameter'; field: ParameterId; operator: Comparison; values: number[]; unit: string; strength: 'must' | 'nice'; source: { text: string; start: number; end: number } })[];
  clarification?: string;
}

export interface CoverageResult {
  requirements: Requirement[];
  contexts: { source: QuerySource; interpretation: string; verification: 'product_evidence_required' }[];
  unresolved: QueryFragment[];
  covered: QueryFragment[];
}

function validSource(query: string, source: unknown, expected: QuerySource): boolean {
  if (!source || typeof source !== 'object') return false;
  const value = source as Record<string, unknown>;
  return value.start === expected.start && value.end === expected.end && value.text === expected.text
    && query.slice(expected.start, expected.end) === expected.text;
}

function numericProposal(source: string, proposal: Extract<NonNullable<ModelCoverage['requirements']>[number], { kind: 'parameter' }>): { tag: string; values: number[]; unit: string } | null {
  if (!Object.hasOwn(PARAMETERS, proposal.field) || !['gt', 'gte', 'lt', 'lte', 'eq', 'covers'].includes(proposal.operator)
    || !Array.isArray(proposal.values) || !proposal.values.length || proposal.values.length > 2
    || typeof proposal.unit !== 'string') return null;
  const expectedUnit = PARAMETERS[proposal.field].unit;
  const values = proposal.values.map(value => toCanonical(value, proposal.unit, expectedUnit));
  if (values.some(value => value == null)) return null;
  const textValues = [...source.matchAll(/([-+]?(?:\d+(?:\.\d*)?|\.\d+))\s*(kVrms|Vrms|[kMG]?bps|[kMG]?Hz|[KM]B|[munpμµ]?A|[kmuμµ]?V|%|ppm|路|通道|°C|℃|度|引脚)/gi)]
    .map(match => toCanonical(Number(match[1]), match[2], expectedUnit)).filter(value => value != null) as number[];
  if (!(values as number[]).every(value => textValues.some(original => Math.abs(original - value) <= Math.max(1e-10, Math.abs(value) * 1e-8)))) return null;
  const roleWords: Partial<Record<ParameterId, RegExp>> = {
    vin: /输入|供电|vin|input|vcc|vdd/i, vout: /输出|vout|output/i,
    iout: /输出电流|负载电流|iout|output\s+current/i,
    iq: /静态|quiescent|\biq\b/i, gbw: /gbw|gbp|增益带宽/i,
    bandwidth: /带宽|bandwidth/i, vos: /失调|vos|offset/i,
    cpuClock: /主频|cpu.*(?:clock|frequency)/i, flash: /flash|程序存储/i, ram: /ram|运行内存/i,
    canFdChannels: /can[ -]?fd/i,
    adcInputChannels: /输入通道|adc\s+input\s+channel/i,
    pwmChannels: /e?pwm/i, temperatureMax: /工作温度|最高工作温度/i, temperatureRange: /工业温度|工作温度范围|工作环境温度/i,
    temperatureAccuracy: /温度传感器|temperature\s+sensor/i, packagePins: /封装|引脚/i,
    currentRange: /量程|范围|range/i, accuracy: /精度|误差|accuracy|error/i,
  };
  if (roleWords[proposal.field] && !roleWords[proposal.field]!.test(source)) return null;
  const upper = /不超过|不高于|小于等于|<=|≤/.test(source);
  const strictUpper = /(?<!不)小于|(?<![<])</.test(source);
  const lower = /至少|不低于|大于等于|>=|≥/.test(source);
  const strictLower = /大于(?!等于)|(?<![<])>/.test(source);
  if (upper && proposal.operator !== 'lte') return null;
  if (strictUpper && proposal.operator !== 'lt') return null;
  if (lower && proposal.operator !== 'gte') return null;
  if (strictLower && proposal.operator !== 'gt') return null;
  if (!upper && !strictUpper && !lower && !strictLower
      && proposal.operator !== PARAMETERS[proposal.field].defaultOperator) return null;
  const canonical = values as number[];
  return { tag: requirementTag(proposal.field, proposal.operator, canonical), values: canonical, unit: expectedUnit };
}

/** Model output is a proposal. Only exact fragment coverage with supported tags can clear a residual. */
export function validateModelCoverage(
  query: string,
  fragments: QueryFragment[],
  raw: unknown,
  modelFeatures: string[],
  allowedTags: Set<string>,
  existingTags: Set<string>,
): CoverageResult {
  const result: CoverageResult = { requirements: [], contexts: [], unresolved: [], covered: [] };
  const entries = Array.isArray(raw) && raw.length <= 32 ? raw as unknown[] : [];
  for (const fragment of fragments) {
    if (fragment.state !== 'needs_model' || !fragment.verifiable) { result.unresolved.push(fragment); continue; }
    const candidates = entries.filter(item => !!item && typeof item === 'object' && (item as Record<string, unknown>).fragmentId === fragment.id);
    if (candidates.length !== 1) { result.unresolved.push(fragment); continue; }
    const item = candidates[0] as ModelCoverage;
    if (!validSource(query, item.source, fragment.source)) {
      result.unresolved.push(fragment); continue;
    }
    if (item.outcome === 'context') {
      const interpretation = typeof item.interpretation === 'string' ? item.interpretation.trim() : '';
      // Context interpretation is useful to retrieval, but it never proves that a
      // particular product row satisfies the intent. Keep it behind the evidence gate.
      if (!interpretation || interpretation.length > 240 || item.evidenceRequired !== true
        || Array.isArray(item.requirements) && item.requirements.length !== 0) {
        result.unresolved.push(fragment); continue;
      }
      result.contexts.push({ source: { ...fragment.source, origin: 'model' }, interpretation,
        verification: 'product_evidence_required' });
      result.covered.push(fragment);
      continue;
    }
    if (item.outcome !== 'requirements' || !Array.isArray(item.requirements) || !item.requirements.length || item.requirements.length > 8) {
      result.unresolved.push(fragment); continue;
    }
    const accepted: Requirement[] = [];
    for (const proposed of item.requirements) {
      if (!proposed || !['must', 'nice'].includes(proposed.strength) || !validSource(query, proposed.source, fragment.source)) break;
      if (proposed.strength === 'nice' && !/(?:最好|优先|偏好|尽量|prefer)/i.test(fragment.source.text)) break;
      if (proposed.kind === 'tag') {
        if (typeof proposed.tag !== 'string' || !allowedTags.has(proposed.tag)
          || existingTags.has(proposed.tag) || !modelFeatures.includes(proposed.tag)) break;
        accepted.push({ id: `model-${fragment.id}-${accepted.length}`, tag: proposed.tag, kind: 'tag',
          strength: proposed.strength, source: { ...fragment.source, origin: 'model' } });
      } else if (proposed.kind === 'parameter') {
        const normalized = numericProposal(fragment.source.text, proposed);
        if (!normalized || existingTags.has(normalized.tag)) break;
        accepted.push({ id: `model-${fragment.id}-${accepted.length}`, tag: normalized.tag, kind: 'parameter',
          field: proposed.field, operator: proposed.operator, values: normalized.values, unit: normalized.unit,
          strength: proposed.strength, source: { ...fragment.source, origin: 'model' } });
      } else break;
    }
    if (accepted.length !== item.requirements.length || new Set(accepted.map(r => r.tag)).size !== accepted.length) {
      result.unresolved.push(fragment); continue;
    }
    result.requirements.push(...accepted);
    result.covered.push(fragment);
  }
  return result;
}

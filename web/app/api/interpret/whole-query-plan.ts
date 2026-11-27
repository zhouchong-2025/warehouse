import {measurementForField} from './selection-spec';
import { deriveInputTolerance, matchesInputTolerance, deriveSymmetricCurrentRange, matchesSymmetricCurrentRange } from './input-tolerance';
import { parameterRoleConflict } from './parameter-role-safety';
import { applicationEnvelopeReason } from './application-envelope';
/** A whole-question plan. Wiki text may explain terminology, never supply user requirements. */
import { PARAMETERS, requirementTag, sourceMeasurements, toCanonical, type QuerySpec, type Requirement,
  type ParameterId, type Comparison } from './selection-spec';
import type { MustConstraint } from './constraint-match';
import { CATEGORY_TAG_NAMES, categorySourceMatches, getAllKnownTags } from './query_parser';
import { isMcuResourceContext, validResourceCountSource } from './resource-context';
import { AEC_DOCUMENT_QUERY } from './query-specs';

export type PlannedTag = { requirementId?:string; tag: string; source: string; inference?: 'mcu_resources' | 'device_role'; reason?: string };
export type PlannedParameter = { requirementId?:string; field: ParameterId; operator: Comparison; values: number[];
  unit: string; source: string; strength: 'must' | 'nice'; derivation?: 'relative_tolerance' | 'absolute_tolerance' | 'symmetric_range' };
export type PlanBranch = { must: PlannedTag[]; nice: PlannedTag[]; parameters?: PlannedParameter[] };
export type WholeQueryPlan = {
  branches: PlanBranch[];
  exclude: PlannedTag[];
  waived?: { source: string }[];
  contexts?: { source: string; role: 'operating_point'; field: ParameterId; values: number[]; unit: string }[];
  unresolved: { requirementId?:string; source: string; reason: string; role?: 'protocol' | 'power' | 'wake' | 'configuration' | 'capability' }[];
  screening?: { kind: 'minimum_possible_current'; source: string; value: number }[];
  aecDocumentRequirement?: boolean;
};

/** Request-local authority produced by the model conflict resolver, never read from user input. */
export type PlanSemanticAuthority={approvedMappings:{requirementId:string;field:string;source:string}[]};
function semanticallyResolved(item:PlannedParameter,authority?:PlanSemanticAuthority){return !!item.requirementId&&!!authority?.approvedMappings.some(a=>a.requirementId===item.requirementId&&a.field===item.field&&a.source===item.source);}

function categoryTags(branch: Partial<PlanBranch> | undefined): string[] {
  return Array.isArray(branch?.must) ? branch.must.flatMap(item=>item&&typeof item.tag==='string'&&CATEGORY_TAG_NAMES.has(item.tag)?[item.tag]:[]) : [];
}

/** Downgrade unsafe model inferences to pending evidence; never manufacture a hard requirement. */
export function conservativeWholeQueryPlan(value: unknown, query: string, authority?:PlanSemanticAuthority): unknown {
  if (!value || typeof value !== 'object') return value;
  const input = value as Partial<WholeQueryPlan>;
  if (!Array.isArray(input.branches) || !Array.isArray(input.unresolved)) return value;
  const unresolved = input.unresolved.map(item => item && item.role
    && !['protocol', 'power', 'wake', 'configuration', 'capability'].includes(item.role)
    ? { ...item, role: 'capability' as const } : item);
  const contexts = Array.isArray(input.contexts) ? input.contexts.filter(item => {
    if (!item || item.role !== 'operating_point' || !Object.hasOwn(PARAMETERS, item.field)
      || typeof item.unit !== 'string' || !Array.isArray(item.values) || !sourceAt(query, item.source)) return true;
    return !input.branches!.every(branch => Array.isArray(branch?.parameters) && branch.parameters.some(p =>
      p.field === item.field && p.source === item.source && validParameter(query, p, categoryTags(branch))
      && ((p.values.length === item.values.length && p.values.every((v,i) =>
        normalizedValue(p.field, Number(v), p.unit) === normalizedValue(item.field, Number(item.values[i]), item.unit)))
        || (['vin','vcca','vccb'].includes(p.field)&&matchesInputTolerance(p.source,p.values,p.unit)&&item.values.length===1
          &&normalizedValue(item.field,Number(item.values[0]),item.unit)===deriveInputTolerance(p.source)?.nominal))));
  }) : input.contexts;
  const aecDocumentRequirement = AEC_DOCUMENT_QUERY.test(query);
  const gradeTag = (item: PlannedTag) => !aecDocumentRequirement && item
    && ['AEC-Q100符合声明', 'AEC-Q100认证'].includes(item.tag)
    ? { ...item, tag: '车规AEC-Q100' } : item;
  const screening: NonNullable<WholeQueryPlan['screening']> = [];
  const addScreening = (check: NonNullable<WholeQueryPlan['screening']>[number]) => {
    if (!screening.some(existing => existing.kind === check.kind && existing.source === check.source)) {
      screening.push(check);
    }
  };
  const defer = (source: string, reason: string, role?: WholeQueryPlan['unresolved'][number]['role']) => {
    if (!unresolved.some(item => item?.source === source && item?.role === role)) unresolved.push({ source, reason, ...(role ? { role } : {}) });
  };
  const normalizeCategory = (item: PlannedTag): PlannedTag => {
    const value = gradeTag(item);
    if (!value) return value;
    if (!CATEGORY_TAG_NAMES.has(value.tag)) {
      if (!value.inference) return value;
      const {inference: _inference, ...feature} = value;return feature;
    }
    if (!sourceAt(query, value.source)) return value;
    if (categorySourceMatches(value.tag, value.source)) {
      if (!value.inference) return value;
      const { inference: _inference, ...explicit } = value;
      return explicit;
    }
    if (value.source.trim().length < 4 || value.inference === 'mcu_resources') return value;
    // The model has already proposed this category. Missing presentation metadata
    // must not promote it to a fact or prevent bounded provisional retrieval.
    return { ...value, inference: 'device_role' as const,
      reason: typeof value.reason === 'string' && value.reason.trim().length >= 8 ? value.reason
        : `模型提出${value.tag}作为检索方向；原句未直接声明该品类，应用及型号适用性仍需核验` };
  };
  const branches = input.branches.map(branch => {
    if (!branch) return branch;
    const normalized = { ...branch,
      must: Array.isArray(branch.must) ? branch.must.map(normalizeCategory) : branch.must,
      nice: Array.isArray(branch.nice) ? branch.nice.map(normalizeCategory) : branch.nice };
    const categoryItems = Array.isArray(normalized.must) ? normalized.must.filter(item=>item&&CATEGORY_TAG_NAMES.has(item.tag)&&sourceAt(query,item.source)) : [];
    const primary = categoryItems.filter(item=>categorySourceMatches(item.tag,item.source)
      || (Array.isArray(branch.parameters) && branch.parameters.filter(p=>p&&sourceAt(query,p.source)&&item.source.includes(p.source)).length>=2));
    if (primary.length && Array.isArray(normalized.must)) normalized.must = normalized.must.filter(item=>{
      if (!item || !CATEGORY_TAG_NAMES.has(item.tag) || categorySourceMatches(item.tag,item.source||'') || primary.includes(item)
        || !sourceAt(query,item.source) || primary.some(p=>item.source.includes(p.source)))return true;
      // A proposed peripheral that carries none of the main device operating
      // requirements is an unverified function/combination, not another class
      // that the one-chip catalog row must simultaneously belong to.
      if (!unresolved.some(p=>p?.source===item.source))defer(item.source,'这段描述作为功能或外围组合要求继续核验，不能用另一器件品类替代主器件能力','capability');
      return false;
    });
    if (Array.isArray(normalized.nice)) normalized.nice=normalized.nice.filter(item=>{
      if(!item||!CATEGORY_TAG_NAMES.has(item.tag)||categorySourceMatches(item.tag,item.source||'')||!sourceAt(query,item.source))return true;
      if(!unresolved.some(p=>p?.source===item.source))defer(item.source,'保留这项原句偏好并核验具体条件；它本身不是一个新的器件品类','capability');return false;
    });
    const knownTags = getAllKnownTags();
    const hasCategory = Array.isArray(normalized.must) && normalized.must.some(item => item
      && CATEGORY_TAG_NAMES.has(item.tag) && sourceAt(query, item.source)
      && (categorySourceMatches(item.tag, item.source) || validDeviceRoleHypothesis(item)));
    if (hasCategory) for (const strength of ['must', 'nice'] as const) if (Array.isArray(normalized[strength])) {
      normalized[strength] = normalized[strength].filter(item => {
        if (!item || typeof item.tag !== 'string' || knownTags.has(item.tag)
          || /^(?:Vin|Vout|Iout)_\d+(?:\.\d+)?[VA]$/.test(item.tag) || item.inference
          || !sourceAt(query, item.source)) return true;
        defer(item.source, '这项能力保留为独立选型要求，需核对逐型号原厂证据，不能仅凭名称判定满足', 'capability');
        return false;
      });
    }
    // A model cannot quietly weaken an unqualified user condition into a preference.
    if (Array.isArray(normalized.nice)) normalized.nice = normalized.nice.filter(item => {
      if (!item || typeof item.source !== 'string' || !sourceAt(query,item.source)) return true;
      const at=query.indexOf(item.source), start=Math.max(...[',','，',';','；','。','\n'].map(c=>query.lastIndexOf(c,at-1)))+1;
      if (/优先|最好|偏好|尽量|倾向|可选|加分|prefer|optional/i.test(query.slice(start,at+item.source.length))) return true;
      defer(item.source,'这项是原句提出的选型要求，不能仅用于排序；尚需取得满足该要求的证据','capability');return false;
    });
    for (const strength of ['must', 'nice'] as const) if (Array.isArray(normalized[strength])) {
      normalized[strength] = normalized[strength].filter(item => {
        if (!item || typeof item.source !== 'string' || !sourceAt(query, item.source) || CATEGORY_TAG_NAMES.has(item.tag)) return true;
        const reason = applicationEnvelopeReason(item.source);
        if (!reason) return true;
        defer(item.source, reason, 'configuration'); return false;
      });
    }
    const mcu = Array.isArray(normalized.must) && normalized.must.some(item => item?.tag === 'MCU/DSP');
    if (mcu) for (const strength of ['must', 'nice'] as const) {
      if (Array.isArray(normalized[strength])) normalized[strength] = normalized[strength].filter(item => {
        if (!item || typeof item.source !== 'string' || !sourceAt(query, item.source)) return true;
        if (item.tag === 'MCU/DSP' || ['车规AEC-Q100', '工业级', '消费级'].includes(item.tag)) return true;
        if (['CAN', 'CAN-FD', 'UART'].includes(item.tag)) {
          defer(item.source, 'MCU外设的数量、协议和可用配置须独立核验，不能用外部接口器件品类替代', /CAN\s*2\.0/i.test(item.source) ? 'protocol' : 'capability'); return false;
        }
        if (/唤醒/.test(item.source)) { defer(item.source, '须核对MCU唤醒源及目标休眠模式下是否可用', 'wake'); return false; }
        if (/(?:休眠|睡眠|待机).*电流/.test(item.source)) { defer(item.source, '须核对模式、供电、温度和休眠电流；未给阈值不制造数值门槛', 'power'); return false; }
        return true;
      });
    }
    if (!Array.isArray(branch.parameters)) return normalized;
    const parameters = branch.parameters.filter(item => {
      if (!item || typeof item.source !== 'string') return true;
      const source = item.source;
      if (sourceAt(query, source) && !Object.hasOwn(PARAMETERS, item.field)) {
        defer(source, '该参数角色暂未接入，保留原句等待逐型号证据', 'capability'); return false;
      }
      const roleConflict = sourceAt(query, source) && parameterRoleConflict(item.field, source, query, categoryTags(normalized));
      if (roleConflict) { defer(source, roleConflict, 'capability'); return false; }
      const applicationReason = sourceAt(query, source) && applicationEnvelopeReason(source);
      if (applicationReason) { defer(source, applicationReason, 'configuration'); return false; }
      let reason = '';
      if (item.field === 'vin' && /极限耐压|绝对最大|击穿电压/.test(source)) {
        reason = '极限耐压需核对绝对最大额定值，不能用持续工作输入代替';
      } else if (item.field === 'iout' && /有刷|马达驱动|电机驱动/.test(query)
        && /电流/.test(source) && !/持续|额定|输出|负载/.test(source)&&!semanticallyResolved(item,authority)) {
        reason = '电流下限已识别；需核对逐型号额定／持续电流，不能用峰值代替完整能力证明';
        const value = numericPlanValue(item.values?.[0]);
        const amps = value === null ? null : toCanonical(value, item.unit, 'A');
        if (amps !== null && input.branches!.length === 1 && ['gt', 'gte'].includes(item.operator)) {
          addScreening({ kind: 'minimum_possible_current', source, value: amps });
        }
      } else if (item.field === 'packagePins' && /(?:SO|DF|QF|LGA|BGA|TSSOP|MSOP|SOT)[A-Z-]*\d+/i.test(source)) {
        reason = '封装型号或尺寸条件不能仅用引脚数证明';
      } else if (item.field === 'temperatureMax' && !semanticallyResolved(item,authority) && /^\s*\d+(?:\.\d+)?\s*(?:℃|°C)\s*$/i.test(source)) {
        reason = '未说明环境温度或结温，需核对温度口径';
      }
      if (!reason) return true;
      defer(source, reason);
      return false;
    });
    return { ...normalized, parameters: parameters.map(item => {
      if(!item||typeof item.source!=='string')return item;
      const at=query.indexOf(item.source), start=Math.max(...[',','，',';','；','。','\n'].map(c=>query.lastIndexOf(c,at-1)))+1;
      const result = item.strength==='nice'&&!/优先|最好|偏好|尽量|倾向|可选|加分|prefer|optional/i.test(query.slice(start,at+item.source.length)) ? {...item,strength:'must' as const}:item;
      if(item.field==='commonModeVoltage'&&item.values?.length===2&&item.operator==='between')return {...result,operator:'covers' as const};
      if(['vin','vcca','vccb'].includes(item.field)&&matchesInputTolerance(item.source,item.values,item.unit))return {...result,derivation:deriveInputTolerance(item.source)!.kind};
      if(item.field==='currentRange'&&matchesSymmetricCurrentRange(item.source,item.values,item.unit))return {...result,derivation:'symmetric_range' as const};
      return mcu&&item.field==='pwmChannels'&&!/ePWM/i.test(item.source)?{...result,field:'pwmOutputs' as const}:result;
    }) };

  });
  for (const item of unresolved) {
    if (!item || typeof item.source !== 'string') continue;
    const source = item.source;
    const minimum = source.match(/(\d+(?:\.\d+)?)\s*(mA|A)\s*(?:以上|至少|不低于|≥|>=)\s*电流/i);
    if (minimum && input.branches.length === 1 && /有刷|马达驱动|电机驱动/.test(query)
      && !/优先|最好|偏好|不要求|不需要|不要/.test(source)) {
      addScreening({ kind: 'minimum_possible_current', source,
        value: toCanonical(Number(minimum[1]), minimum[2], 'A')! });
    }
  }
  const aec = query.match(/AEC\s*[- ]?Q\s*[- ]?100/i)?.[0];
  const aecRepresented = input.branches.every(branch => branch
    && Array.isArray(branch.must) && Array.isArray(branch.nice)
    && [...branch.must, ...branch.nice]
      .some(item => item && (item.tag === 'AEC-Q100符合声明' || item.tag === 'AEC-Q100认证')));
  const aecWaived = [...(input.waived || []), ...(input.exclude || [])]
    .some(item => /AEC\s*[- ]?Q\s*[- ]?100/i.test(item?.source || ''));
  if (aecDocumentRequirement && aec && !aecRepresented && !aecWaived
    && !unresolved.some(item => /AEC\s*[- ]?Q\s*[- ]?100/i.test(item?.source || ''))) {
    defer(query.match(AEC_DOCUMENT_QUERY)?.[0] || aec, '用户明确要求 AEC-Q100 证明材料，需另查具体型号的证书或报告');
  }
  const gradeRepresented = branches.every(branch => branch && Array.isArray(branch.must)
    && branch.must.some(item => item?.tag === '车规AEC-Q100'));
  const pending = !aecDocumentRequirement && gradeRepresented ? unresolved.filter(item => {
    const source = item?.source || '';
    return !/AEC\s*[- ]?Q\s*[- ]?100/i.test(source)
      || source.replace(/AEC\s*[- ]?Q\s*[- ]?100/gi, '').replace(/车规|汽车级|认证|符合声明|等级|级别|要求|[\s，、,]/g, '') !== '';
  }) : unresolved;
  const uniquePending = pending.filter((item,index) => !item || typeof item.source !== 'string' || !applicationEnvelopeReason(item.source)
    || pending.findIndex(other => other?.source === item.source && other?.requirementId===item.requirementId) === index);
  return { ...input, branches, contexts, unresolved: uniquePending, screening, aecDocumentRequirement,
    exclude: Array.isArray(input.exclude) ? input.exclude.map(gradeTag) : input.exclude };
}

const RELATION = /峰值|瞬态|持续\s*\d|限流|优先|最好|偏好|不要|不需要|不要求|或|也可以|外置\s*MOS|控制器加|并联|串联/i;
export function needsWholeQueryPlan(query: string): boolean { return RELATION.test(query) || isMcuResourceContext(query); }

// “SOP8 或是更小封装” is one package ceiling, unlike “LDO 或 Buck”.
// Keep the comparison for the model/evidence gate, but do not demand a
// second product-category branch merely because the phrase contains “或”.
function hasDistinctAlternative(query: string): boolean {
  return /或者|也可以|或/.test(query.replace(/或(?:是)?(?:更小|更大|以内|以下|以上|不超过|不少于|至少)/g, ''));
}

function sourceAt(query: string, source: unknown) {
  if (typeof source !== 'string' || !source.trim() || source.length > query.length) return null;
  const start = query.indexOf(source);
  return start < 0 || query.lastIndexOf(source) !== start ? null
    : { text: source, start, end: start + source.length, origin: 'model' as const };
}

function numberInSource(tag: string, source: string): boolean {
  const numeric = tag.match(/^(Vin|Vout|Iout)_(\d+(?:\.\d+)?)(V|A)$/);
  if (!numeric) return true;
  const expected = Number(numeric[2]);
  const unit = numeric[3];
  return sourceMeasurements(source).some(measurement=>{
    const actual=toCanonical(measurement.value,measurement.unit,unit);
    return actual!==null&&Math.abs(actual-expected)<1e-8;
  });
}

function numericRoleSafe(query: string, item: PlannedTag, strength: 'must' | 'nice', resolved=false): boolean {
  if (/^Vin_/.test(item.tag) && /极限耐压|绝对最大|击穿电压/.test(item.source)) return false;
  if (!/^Iout_/.test(item.tag)) return true;
  const at = query.indexOf(item.source);
  const context = query.slice(Math.max(0, at - 5), at + item.source.length);
  if (/峰值|瞬态|限流|短路/.test(context)) return false;
  if (/有刷|马达驱动|电机驱动/.test(query)
    && /电流/.test(item.source) && !/持续|额定|输出|负载/.test(item.source)&&!resolved) return false;
  if (strength === 'must' && /优先|最好|偏好/.test(context)) return false;
  return true;
}

function affirmativeSource(query: string, source: string): boolean {
  const at = query.indexOf(source);
  return !/(?:不要|不需要|不要求|排除)/.test(query.slice(Math.max(0, at - 4), at + source.length));
}

function gradeSourceSafe(tag: string, source: string): boolean {
  if (['车规AEC-Q100','AEC-Q100符合声明','AEC-Q100认证'].includes(tag)) return /车规|汽车级|automotive|(?:AEC[ -]?)?Q[ -]?100/i.test(source);
  if (tag === '工业级') return /工业|工规|industrial/i.test(source);
  if (tag === '消费级') return /消费|consumer|commercial/i.test(source);
  return true;
}

function validTag(tag: unknown, known: Set<string>): tag is string {
  return typeof tag === 'string' && (known.has(tag) || /^(?:Vin|Vout|Iout)_\d+(?:\.\d+)?[VA]$/.test(tag));
}

function normalizedValue(field: ParameterId, value: number, unit: string): number | null {return measurementForField(field,value,unit);}

function numericPlanValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^[-+]?\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Preserve explicit comparisons around this field's own measurements. No category inference. */
export function parameterRelationIssue(item:PlannedParameter):string|null{
  if(!item||!Object.hasOwn(PARAMETERS,item.field)||typeof item.source!=='string')return null;
  const expected=new Set<Comparison>();
  for(const m of sourceMeasurements(item.source,item.field)){
    if(normalizedValue(item.field,m.value,m.unit)===null)continue;
    const prefix=item.source.slice(0,m.start),suffix=item.source.slice(m.end);
    const op=prefix.replace(/不(?:能|得)(?=超过|高于|大于|低于|小于)/g,'不').match(/(不超过|不高于|不大于|至多|最多|不低于|不少于|不小于|至少|起码|大于等于|小于等于|大于|高于|超过|小于|低于|恰好|等于|>=|<=|≥|≤|>|<|=)\s*$/)?.[1];
    const tail=suffix.match(/^\s*(以上|以下|以内|及以上|及以下)/)?.[1];
    const marker=op||tail;
    const relation:Comparison|undefined=marker&&(/^(?:不超过|不高于|不大于|至多|最多|小于等于|<=|≤|以下|以内|及以下)$/.test(marker)?'lte'
      :/^(?:不低于|不少于|不小于|至少|起码|大于等于|>=|≥|以上|及以上)$/.test(marker)?'gte'
      :/^(?:大于|高于|超过|>)$/.test(marker)?'gt':/^(?:小于|低于|<)$/.test(marker)?'lt':'eq')||undefined;
    if(relation)expected.add(relation);
    else if(['portCount','channelCount'].includes(item.field)&&/口$/.test(m.text.trim()))expected.add('eq');
  }
  if(expected.size===1&&!expected.has(item.operator))return `原句明确比较关系为${[...expected][0]}，计划却使用${item.operator}；不能改变边界方向、严格性或把端口数量改成至少数量`;
  if(item.field==='temperatureRange'&&item.values?.length===2&&item.operator!=='covers')return '工作温度范围要求器件覆盖原始上下限，不能改成型号温度数值落在该区间';
  return null;
}

function validParameter(query: string, item: PlannedParameter, categories: readonly string[] = [], authority?:PlanSemanticAuthority): boolean {
  if (!item || !Object.hasOwn(PARAMETERS, item.field) || !sourceAt(query, item.source)
    || !['gt', 'gte', 'lt', 'lte', 'eq', 'covers', 'between'].includes(item.operator)
    || !['must', 'nice'].includes(item.strength) || !Array.isArray(item.values)
    || !item.values.length || item.values.length > 2 || typeof item.unit !== 'string'
    || !affirmativeSource(query, item.source)) return false;
  if (item.field === 'vin' && /极限耐压|绝对最大|击穿电压/.test(item.source)) return false;
  if (item.field === 'iout' && /有刷|马达驱动|电机驱动/.test(query)
    && /电流/.test(item.source) && !/持续|额定|输出|负载/.test(item.source)&&!semanticallyResolved(item,authority)) return false;
  if (parameterRoleConflict(item.field, item.source, query, categories)) return false;
  if(parameterRelationIssue(item))return false;
  if (!validResourceCountSource(item.field, item.source)) return false;
  if(item.field==='commonModeVoltage'&&item.values.length===2&&item.operator!=='covers')return false;
  if (item.operator === 'between' && (item.values.length !== 2 || Number(item.values[0]) > Number(item.values[1]))) return false;
  const memoryRange = ['flash', 'ram'].includes(item.field) && /\d\s*(?:KB|MB)?\s*(?:~|～|至|到|to|–|-)\s*\d/i.test(item.source);
  if (['flash', 'ram'].includes(item.field) && item.values.length === 2 && ['covers', 'between'].includes(item.operator) && !memoryRange) return false;
  if (memoryRange && (item.values.length !== 2 || !['covers', 'between'].includes(item.operator))) return false;
  const symmetric = item.field==='currentRange' ? deriveSymmetricCurrentRange(item.source) : null;
  if(symmetric)return ['covers','between'].includes(item.operator)&&matchesSymmetricCurrentRange(item.source,item.values,item.unit)
    && (!item.derivation||item.derivation==='symmetric_range');
  const tolerance=['vin','vcca','vccb'].includes(item.field)?deriveInputTolerance(item.source):null;
  if(tolerance)return item.operator==='covers'&&matchesInputTolerance(item.source,item.values,item.unit)
    &&(!item.derivation||item.derivation===tolerance.kind);
  if(item.derivation)return false;
  const values = item.values.map(value => {
    const numeric = numericPlanValue(value);
    return numeric === null ? null : normalizedValue(item.field, numeric, item.unit);
  });
  if (values.some(value => value == null)) return false;
  const sourceValues = sourceMeasurements(item.source,item.field)
    .map(measurement => normalizedValue(item.field, measurement.value, measurement.unit))
    .filter((value): value is number => value != null);
  if (!values.every(value => sourceValues.some(original =>
    Math.abs(original - value!) <= Math.max(1e-10, Math.abs(value!) * 1e-8)))) return false;
  if (item.field === 'iout' && !numericRoleSafe(query,
    { tag: `Iout_${values[0]}A`, source: item.source }, item.strength,semanticallyResolved(item,authority))) return false;
  return true;
}

/** Nominal/test points are subordinate to an explicit required operating envelope. */
function validOperatingContext(query: string, item: NonNullable<WholeQueryPlan['contexts']>[number], branches: PlanBranch[]): boolean {
  if (!item || item.role !== 'operating_point' || !sourceAt(query, item.source)
    || !/标称|nominal|测试点|test.point/i.test(item.source)
    || !Object.hasOwn(PARAMETERS, item.field) || !Array.isArray(item.values) || item.values.length !== 1
    || typeof item.unit !== 'string' || sourceMeasurements(item.source).length !== 1) return false;
  const measurement = sourceMeasurements(item.source)[0];
  const prefix = item.source.slice(0, measurement.start);
  const suffix = item.source.slice(measurement.end);
  if (!/^(?:标称|nominal|测试点|test[ -]?point)(?:\s*(?:输入|输出|电压|电流|频率|主频|温度|容量|值|Vin|Vout|Iout))*\s*[:：=]?\s*$/i.test(prefix)
    || !/^[\s)）]*$/.test(suffix)) return false;
  const value = numericPlanValue(item.values[0]);
  if (value === null) return false;
  const canonical = normalizedValue(item.field, value, item.unit);
  if (canonical === null || !sourceMeasurements(item.source).some(m => normalizedValue(item.field, m.value, m.unit) === canonical)) return false;
  return branches.every(branch => branch && Array.isArray(branch.parameters) && branch.parameters.some(p => p.field === item.field && p.strength === 'must'
    && p.operator === 'covers' && p.values.length === 2 && validParameter(query, p, categoryTags(branch))
    && normalizedValue(p.field, Number(p.values[0]), p.unit)! <= canonical
    && normalizedValue(p.field, Number(p.values[1]), p.unit)! >= canonical));
}

/** A proposed category is a recall hypothesis, never proof of user intent. */
function validDeviceRoleHypothesis(item: PlannedTag): boolean {
  return item.inference === 'device_role' && CATEGORY_TAG_NAMES.has(item.tag)
    && typeof item.reason === 'string' && item.reason.trim().length >= 8
    && typeof item.source === 'string' && item.source.trim().length >= 4;
}

/** Actionable repair feedback, without accepting the failed plan. */
export function wholeQueryPlanIssues(value: unknown, query: string, authority?:PlanSemanticAuthority): string[] {
  if (!value || typeof value !== 'object') return ['回复不是有效计划JSON对象'];
  const p = value as Partial<WholeQueryPlan>;
  if (!Array.isArray(p.branches)) return ['缺少branches数组'];
  const issues: string[] = [];
  const known = getAllKnownTags();
  for (const [i, branch] of p.branches.entries()) {
    if (!branch || !Array.isArray(branch.must) || !Array.isArray(branch.nice)) { issues.push(`分支${i}结构错误`); continue; }
    for (const item of [...branch.must, ...branch.nice]) {
      if (!item || !known.has(item.tag)) { issues.push(`分支${i}使用未支持标签：${item?.tag}`); continue; }
      if (item.inference === 'device_role' && !validDeviceRoleHypothesis(item)) issues.push(`推断品类${item.tag}缺少有效依据：在同一个标签对象内填写reason字符串（至少8字），说明原句用途与所选器件角色的关系；只有inference=device_role仍不合格。`);
      if (!gradeSourceSafe(item.tag, typeof item.source === 'string' ? item.source : '')) issues.push(`等级${item.tag}必须由原句明确提出，不能从应用场景、温度或抛负载自行增加。`);
      if (!sourceAt(query, item.source)) issues.push(`标签${item.tag}的source不是唯一连续原文：${item.source}`);
      if (CATEGORY_TAG_NAMES.has(item.tag) && !categorySourceMatches(item.tag, item.source || '') && !item.inference) {
        issues.push(`标签${item.tag}不是source「${item.source}」直接声明的品类。若仅由用途推测，必须标inference=device_role，补充reason，并保留其他合理方案；不得当作用户明确要求。`);
      }
    }
    if (branch.parameters !== undefined && !Array.isArray(branch.parameters)) { issues.push(`分支${i}的parameters不是数组`); continue; }
    for (const item of branch.parameters || []) if (!validParameter(query, item, categoryTags(branch),authority)) issues.push(`参数${item?.field}的角色、数值、单位或原句绑定不合格：${item?.source}；${parameterRelationIssue(item)||''}；若有明确±容差，按原文独立计算上下限并用covers、保留source和derivation，不能只留标称值。`);
  }
  const sources = [...p.branches.flatMap(b => b && Array.isArray(b.must) && Array.isArray(b.nice) ? [
    ...[...b.must, ...b.nice].filter(t => t && !CATEGORY_TAG_NAMES.has(t.tag)).map(t => t.source),
    ...(Array.isArray(b.parameters) ? b.parameters.map(t => t?.source) : [])] : []),
    ...(Array.isArray(p.unresolved) ? p.unresolved.map(x => x?.source) : []),
    ...(Array.isArray(p.contexts) ? p.contexts.map(x => x?.source) : [])];
  for (const m of sourceMeasurements(query)) if (!sources.some(source => typeof source === 'string' && sourceAt(query, source)
    && query.indexOf(source) <= m.start && query.indexOf(source) + source.length >= m.end)) {
    issues.push(`数值${m.text}未分配角色。若为标称/测试点，使用contexts[{source:连续原文,role:operating_point,field:对应字段,values:[数值],unit:原单位}]，且必须落在每个分支已声明的同字段工作范围内；否则保留unresolved，不能擅自变成硬筛选。`);
  }
  for (const m of sourceMeasurements(query)) {
    const covers = (source: unknown) => typeof source === 'string' && sourceAt(query, source)
      && query.indexOf(source) <= m.start && query.indexOf(source) + source.length >= m.end;
    if ((Array.isArray(p.unresolved) ? p.unresolved : []).some(item => covers(item?.source)) || (Array.isArray(p.contexts) ? p.contexts : []).some(item => covers(item?.source))) continue;
    for (const [index, branch] of p.branches.entries()) {
      const items = branch && Array.isArray(branch.must) && Array.isArray(branch.nice)
        ? [...branch.must, ...branch.nice, ...(Array.isArray(branch.parameters) ? branch.parameters : [])] : [];
      if (!items.some(item => covers(item?.source))) issues.push(`分支${index}遗漏原句数值${m.text}：每个可替代方案都必须覆盖完整需求。电流采样、故障输出等内置功能不能另立一个省略主器件额定电流/PWM的替代品类；若需外围组合，保留主器件功能并将组合证据放unresolved。`);
    }
  }
  return issues.length ? issues.slice(0, 12) : ['计划未满足完整约束，请逐条检查源片段、数值角色、替代分支与否定/偏好条件'];
}

/** Reject an incomplete or invented plan; never silently promote a model phrase to a hard filter. */
export function checkedWholeQueryPlan(value: unknown, query: string, authority?:PlanSemanticAuthority): WholeQueryPlan | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Partial<WholeQueryPlan>;
  if (!Array.isArray(input.branches) || !input.branches.length || input.branches.length > 3
    || !Array.isArray(input.exclude) || !Array.isArray(input.unresolved) || input.unresolved.length > 40) return null;
  if (input.waived !== undefined && (!Array.isArray(input.waived) || input.waived.length > 12
    || input.waived.some(item => !item || !sourceAt(query, item.source)))) return null;
  if (input.contexts !== undefined && (!Array.isArray(input.contexts) || input.contexts.length > 8
    || input.contexts.some(item => !validOperatingContext(query, item, input.branches!)))) return null;
  const known = getAllKnownTags();
  for (const branch of input.branches) {
    if (!branch || !Array.isArray(branch.must) || !Array.isArray(branch.nice)
      || branch.must.length > 16 || branch.nice.length > 12
      || (branch.parameters !== undefined && (!Array.isArray(branch.parameters)
        || branch.parameters.length > 12 || branch.parameters.some(item => !validParameter(query, item, categoryTags(branch),authority))))) return null;
    for (const strength of ['must', 'nice'] as const) for (const item of branch[strength]) {
      if (!item || !validTag(item.tag, known) || !sourceAt(query, item.source)
        || !gradeSourceSafe(item.tag, item.source) || !numberInSource(item.tag, item.source) || !numericRoleSafe(query, item, strength)
        || !affirmativeSource(query, item.source)
        || (CATEGORY_TAG_NAMES.has(item.tag) && !categorySourceMatches(item.tag, item.source)
          && !(item.tag === 'MCU/DSP' && item.inference === 'mcu_resources' && isMcuResourceContext(item.source))
          && !validDeviceRoleHypothesis(item))) return null;
      if (item.inference === 'device_role' && strength !== 'must') return null;
      if (item.inference && !(item.tag === 'MCU/DSP' && item.inference === 'mcu_resources' && isMcuResourceContext(item.source)) && !validDeviceRoleHypothesis(item)) return null;
    }
  }
  for (const item of input.exclude) {
    if (!item || !validTag(item.tag, known) || !sourceAt(query, item.source)
      || /不要求|不需要/.test(query.slice(Math.max(0, query.indexOf(item.source) - 4),
        query.indexOf(item.source) + item.source.length))) return null;
  }
  for (const item of input.unresolved) {
    if (!item || !sourceAt(query, item.source) || typeof item.reason !== 'string' || !item.reason.trim()
      || item.role && !['protocol', 'power', 'wake', 'configuration', 'capability'].includes(item.role)) return null;
  }
  // A single category cannot stand in for explicitly offered alternatives.
  if (hasDistinctAlternative(query) && input.branches.length < 2
    && !input.unresolved.some(item => /或者|或|也可以/.test(item.source))) return null;
  // When the alternatives themselves name product categories, a branch cannot
  // quietly require categories from two different alternatives.
  if (input.branches.length > 1) {
    const separators = [...query.matchAll(/或者|也可以|或/g)].map(match => match.index!);
    const categorySegments = input.branches.map(branch => new Set(branch.must
      .filter(item => CATEGORY_TAG_NAMES.has(item.tag))
      .map(item => separators.filter(at => at < query.indexOf(item.source)).length)));
    const allSegments = new Set(categorySegments.flatMap(segments => [...segments]));
    if (allSegments.size > 1 && categorySegments.some(segments => segments.size > 1)) return null;
  }
  if (/限流/.test(query) && !input.unresolved.some(item => item.source.includes('限流'))) return null;
  if (/峰值/.test(query) && !input.unresolved.some(item => item.source.includes('峰值'))) return null;
  if (/不要|不需要|不要求/.test(query) && !input.exclude.length
    && !(input.waived || []).some(item => /不需要|不要求/.test(item.source))
    && !input.unresolved.some(item => /不要|不需要|不要求/.test(item.source))) return null;
  const mcuPlan = input.branches.some(branch => branch.must.some(item => item.tag === 'MCU/DSP'));
  if (mcuPlan) {
    for (const match of query.matchAll(/CAN\s*2\.0[AB]?\b/gi)) {
      if (/不要求|不需要|不要|无需/.test(query.slice(Math.max(0, match.index! - 4), match.index))) continue;
      if (!input.unresolved.some(item => item.role === 'protocol' && item.source.includes(match[0]))) return null;
    }
    const covered = [...input.branches.flatMap(branch => [...branch.must, ...branch.nice, ...(branch.parameters || [])].filter(item => !CATEGORY_TAG_NAMES.has('tag' in item ? item.tag : '')).map(item => item.source)), ...input.unresolved.map(item => item.source)];
    for (const term of query.matchAll(/UART|PWM|flash|RAM|硬件唤醒|休眠电流/gi)) {
      if (!covered.some(source => { const at = query.indexOf(source); return at <= term.index! && at + source.length >= term.index! + term[0].length; })) return null;
    }
  }
  const sources = [...input.branches.flatMap(branch => [...branch.must, ...branch.nice,
    ...(branch.parameters || [])].filter(item => !CATEGORY_TAG_NAMES.has('tag' in item ? item.tag : '')).map(item => item.source)),
    ...input.exclude.map(item => item.source), ...(input.waived || []).map(item => item.source),
    ...input.unresolved.map(item => item.source), ...(input.contexts || []).map(item => item.source)];
  for (const measurement of sourceMeasurements(query)) {
    const { start, end } = measurement;
    const covers = (source: string) => {
      const at = query.indexOf(source);
      return at <= start && at + source.length >= end;
    };
    if (!sources.some(covers)) return null;
    if (!input.unresolved.some(item => covers(item.source)) && !(input.contexts || []).some(item => covers(item.source))
      && !input.branches.every(branch => [...branch.must, ...branch.nice,
        ...(branch.parameters || [])].some(item => covers(item.source)))) return null;
  }
  // A model may say a fully represented requirement still needs model-side
  // verification. The catalog verifier does that work; only genuinely separate
  // requirements should keep a result in the pending-evidence tier.
  const represented = new Set(input.branches.flatMap(branch => [
    ...branch.must, ...branch.nice, ...(branch.parameters || []),
  ].map(item => item.source)));
  return { ...input,
    branches: input.branches.map(branch => ({ ...branch,
      parameters: branch.parameters?.map(item => ({ ...item,
        values: item.values.map(value => numericPlanValue(value)!),
        // "12V转3.3V" describes an operating point. VIN is supported if the
        // model's input range covers 12 V; its rating need not equal 12 V.
        operator: ['flash', 'ram'].includes(item.field) && item.operator === 'covers' && item.values.length === 2 ? 'between'
          : item.field === 'vin' && item.operator === 'eq'
          && /转|→|\bto\b/i.test(item.source) ? 'covers' : item.operator,
      })),
    })),
    unresolved: input.unresolved.filter(item => item.role || !represented.has(item.source)
      || input.aecDocumentRequirement && AEC_DOCUMENT_QUERY.test(item.source)),
  } as WholeQueryPlan;
}

export function planQuerySpec(query: string, plan: WholeQueryPlan): QuerySpec {
  const toRequirement = (item: PlannedTag, index: number, strength: 'must' | 'nice'): Requirement => {
    const numeric = item.tag.match(/^(Vin|Vout|Iout)_(\d+(?:\.\d+)?)([VA])$/);
    const field: Record<string, ParameterId> = { Vin: 'vin', Vout: 'vout', Iout: 'iout' };
    const operator: Record<string, Comparison> = { Vin: 'covers', Vout: 'eq', Iout: 'gte' };
    return { ...(item.requirementId?{engineeringRequirementId:item.requirementId}:{}),id: `plan-${index}-${item.tag}`, tag: item.tag,
      kind: numeric ? 'parameter' : 'tag', strength, source: sourceAt(query, item.source),
      ...(numeric ? { field: field[numeric[1]], operator: operator[numeric[1]],
        values: [Number(numeric[2])], unit: numeric[3] } : {}) };
  };
  return {
    version: 1, text: query,
    semanticContexts: [...(plan.contexts || []).map(item => ({ source: sourceAt(query, item.source)!, interpretation: `标称/测试工作点：${item.field}；已包含在用户要求的工作范围内，不另加硬筛选`, verification: 'product_evidence_required' as const })), ...plan.branches.flatMap(branch => branch.must.filter(item => item.inference).map(item => ({ source: sourceAt(query, item.source)!, interpretation: item.inference === 'device_role' ? `品类搜索假设：${item.tag}；${item.reason}；尚未确认用户器件意图` : '由存储与外设资源推断MCU器件角色；不证明具体型号具备这些资源', verification: 'product_evidence_required' as const })))],
    requirements: plan.branches.flatMap((branch, index) => [
      ...branch.must.map(item => toRequirement(item, index, 'must')),
      ...branch.nice.map(item => toRequirement(item, index, 'nice')),
      ...(branch.parameters || []).map((item, parameterIndex): Requirement => {
        const values = item.values.map(value => normalizedValue(item.field, value, item.unit)!);
        const tag = requirementTag(item.field, item.operator, values);
        return { ...(item.requirementId?{engineeringRequirementId:item.requirementId}:{}),id: `plan-${index}-parameter-${parameterIndex}-${tag}`, tag, kind: 'parameter',
          field: item.field, operator: item.operator, values, unit: PARAMETERS[item.field].unit,
          strength: item.strength, source: sourceAt(query, item.source), ...(item.derivation?{derivation:{kind:item.derivation,expression:(item.derivation==='symmetric_range'?deriveSymmetricCurrentRange(item.source):deriveInputTolerance(item.source))!.expression,computedValues:values}}:{}) };
      }),
    ]),
    unresolved: plan.unresolved.map(item => ({ ...(item.requirementId?{engineeringRequirementId:item.requirementId}:{}), source: sourceAt(query, item.source)!, reason: item.reason,
      kind: 'evidence' as const })),
  };
}

export function planMeta(tag: string, requirement?: Requirement): MustConstraint {
  const category = CATEGORY_TAG_NAMES.has(tag);
  const grade = tag === '车规AEC-Q100' || tag === '工业级' || tag === '消费级';
  const numeric = tag.match(/^(Vin|Vout|Iout)_(\d+(?:\.\d+)?)[VA]$/);
  return { tag, dimension: category ? 'category' : grade ? 'grade' : 'spec',
    ...(requirement ? { requirement } : {}),
    ...(numeric ? { family: numeric[1], value: Number(numeric[2]) } : {}) };
}

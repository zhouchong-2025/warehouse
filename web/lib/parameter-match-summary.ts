import { PARAMETERS, type ParameterFact, type QuerySpec, type Requirement, type RequirementResult } from '../app/api/interpret/selection-spec';

export type ParameterMatchRow = {id:string;label:string;value:string;comparison:string;unmatched:boolean; requirementId?:string};

const statistics = {typical:'典型值', min:'最小值', max:'最大值', unspecified:''};
const symbols = {gt:'>',gte:'≥',lt:'<',lte:'≤',eq:'='};
const number = new Intl.NumberFormat('en-US',{useGrouping:false,maximumSignificantDigits:12});

function displayUnit(unit: string, reference: number, field: string) {
  if (field === 'gbw' || field === 'bandwidth') return {unit:'MHz',scale:1e6};
  const choices: Record<string, [string,number][]> = {
    Hz:[['GHz',1e9],['MHz',1e6],['kHz',1e3],['Hz',1]],
    bps:[['Gbps',1e9],['Mbps',1e6],['kbps',1e3],['bps',1]],
    sps:[['MSPS',1e6],['kSPS',1e3],['SPS',1]],
    Vrms:[['kVrms',1e3],['Vrms',1]],
    V:[['V',1],['mV',1e-3],['μV',1e-6]],
    A:[['A',1],['mA',1e-3],['μA',1e-6],['nA',1e-9],['pA',1e-12]],
    s:[['s',1],['ms',1e-3],['μs',1e-6],['ns',1e-9],['ps',1e-12]],
  };
  const list = choices[unit];
  const scaled = list && (reference === 0 ? list.find(([,scale])=>scale === 1) : list.find(([,scale])=>reference >= scale) || list.at(-1));
  return scaled ? {unit:scaled[0],scale:scaled[1]} : {unit,scale:1};
}

function formatValues(values: number[], format: (value: number) => string, field: string, shape: ParameterFact['shape']) {
  if (field === 'channelDirections') {
    const pairs: string[] = [];
    for (let i=0;i<values.length;i+=2) pairs.push(`${values[i]} 正向 / ${values[i+1]} 反向`);
    return pairs.join('、');
  }
  return values.map(format).join(shape === 'range' ? ' ～ ' : '、');
}

function comparisonNote(requirement: Requirement, fact: ParameterFact, checked: RequirementResult, format: (value:number)=>string) {
  if (!fact.source.verified) return '来源待核';
  if (checked.status === 'unknown') return '适用条件待核';
  const {values:targets,operator,field} = requirement;
  if (!targets?.length || !operator) return '';
  if (fact.shape === 'range' && (operator === 'covers' || operator === 'eq') && fact.values.length === 2) {
    const distance = Math.min(Math.min(...targets) - fact.values[0],fact.values[1] - Math.max(...targets));
    if (distance < 0) return `超出所列范围 ${format(-distance)}`;
    return distance === 0 ? '位于范围边界' : `距最近边界 ${format(distance)}`;
  }
  if (fact.shape !== 'scalar' || fact.values.length !== 1 || field === 'channelDirections') return '';
  const actual = fact.values[0], target = targets[0];
  if (operator === 'between' && targets.length === 2) {
    const distance = Math.min(actual-target,targets[1]-actual);
    return distance < 0 ? `超出区间 ${format(-distance)}` :
      distance === 0 ? '位于区间边界' : `距最近边界 ${format(distance)}`;
  }
  if (targets.length !== 1) return '';
  if (operator === 'eq' || operator === 'covers') {
    return actual === target ? '与要求相同' : `相差 ${format(Math.abs(actual-target))}`;
  }
  if ((operator === 'lt' || operator === 'lte') && (actual < 0 || target < 0) &&
      field !== 'vos' && field !== 'accuracy' && field !== 'temperatureAccuracy') return '';
  const absolute = (operator === 'lt' || operator === 'lte') && (field === 'vos'|| field === 'accuracy'|| field === 'temperatureAccuracy');
  const difference = absolute ? Math.abs(actual)-Math.abs(target) : actual-target;
  if (difference === 0) return operator === 'gt' || operator === 'lt' ? '等于门槛，未达到严格要求' : '刚好达到';
  const direction = difference > 0 ? '高' : '低';
  return `${direction} ${format(Math.abs(difference))}`;
}

export function parameterMatchSummary(spec: QuerySpec | undefined, checks: Record<string,RequirementResult> | undefined) {
  const rows = new Map<string,ParameterMatchRow>();
  if (!checks) return [];
  for (const requirement of spec?.requirements || []) {
    const {field,operator,values,unit,tag} = requirement;
    if (!field || !Object.hasOwn(PARAMETERS,field) || !operator || unit !== PARAMETERS[field].unit ||
        !values?.length || values.some(value=>!Number.isFinite(value))) continue;
    const check = checks[tag];
    if (!check) continue;
    const label = field === 'gbw' ? '增益带宽积（GBW）' : PARAMETERS[field].label;
    const {unit:display,scale} = displayUnit(unit,Math.max(...values.map(Math.abs)),field);
    const format = (actual:number) => `${number.format(actual/scale)} ${display}`;
    const range = operator === 'between' || operator === 'covers' && values.length === 2;
    const target = formatValues(values,format,field,range ? 'range' : 'set');
    const limit = `要求 ${operator === 'covers' ? '覆盖 ' : operator === 'between' ? '在区间 ' : symbols[operator]+' '}${target}${requirement.testMethod ? ' · '+requirement.testMethod : ''}`;
    const facts = check.evidence.filter(fact => fact.field === field && fact.unit === unit &&
      fact.values.length > 0 && fact.values.every(Number.isFinite) &&
      (field !== 'channelDirections' || fact.values.length % 2 === 0));
    if (!facts.length) {
      const id = JSON.stringify([requirement.engineeringRequirementId,field,operator,values,requirement.testMethod]);
      const ambientMax = field === 'temperatureRange' && check.status === 'unmatched'
        ? check.evidence.filter(f => f.field === 'temperatureMax' && f.unit === unit && f.source.verified &&
            /Ta|环境|ambient/i.test(f.source.field) && f.values.length && f.values.every(v => Number.isFinite(v) && v < Math.max(...values)))
        : [];
      const value = ambientMax.length
        ? '环境温度上限 ' + [...new Set(ambientMax.flatMap(f => f.values))].map(format).join('、')
        : '规格待核';
      rows.set(id,{id,label,value,requirementId:requirement.engineeringRequirementId,comparison:limit,unmatched:check.status === 'unmatched'});
    }
    for (const fact of facts) {
      const statistic = statistics[fact.statistic];
      const value = formatValues(fact.values,format,field,fact.shape) + (statistic ? `（${statistic}）` : '');
      const note = comparisonNote(requirement,fact,check,format);
      const id = JSON.stringify([requirement.engineeringRequirementId,field,operator,values,requirement.testMethod,fact.values,fact.shape,fact.statistic,Boolean(fact.source.verified)]);
      rows.set(id,{id,label,value,requirementId:requirement.engineeringRequirementId,comparison:[limit,note].filter(Boolean).join(' · '),unmatched:check.status === 'unmatched'});
    }
  }
  return [...rows.values()];
}

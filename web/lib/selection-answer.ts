import type { LedgerEntry, LedgerStatus } from '../app/api/interpret/requirement-ledger';
import type { ParameterMatchRow } from './parameter-match-summary';

type Condition = {entry:LedgerEntry; status:LedgerStatus; online?:{outcome:string}};
type Destination = '问客户' | '查原厂' | '交 FAE 核验';

export function nextAction({entry,status,online}:Condition):Destination {
  if (status === 'clarification') return '问客户';
  if (online?.outcome === 'supports' || status === 'conflict' ||
      ['execution_failed','binding_gap','ambiguous_binding'].includes(entry.gap || '')) return '交 FAE 核验';
  if (entry.readings?.length) return '问客户';
  if (/整机|板级|系统级|总线拓扑|系统集成/.test(entry.object)) return '交 FAE 核验';
  return '查原厂';
}

export function selectionAnswer(row:{conditions:Condition[];complete:boolean;conflicts:number;result:{product:{part_number?:unknown}}},
  parameters:ParameterMatchRow[]) {
  const required = row.conditions.filter(item=>item.entry.required);
  if (!required.length) return null;
  const supported = required.filter(item=>item.status==='supported');
  const gap = required.find(item=>item.status==='contradicted'||item.status==='conflict') ??
    required.find(item=>item.status==='clarification') ??
    required.find(item=>item.status!=='supported');
  const title = row.conflicts ? '存在关键冲突' : row.complete ? '已核条件均满足' :
    supported.length ? '可继续评估' : '待核资料线索';
  const values = parameters.filter(item=>item.unmatched && item.requirementId===gap?.entry.requirementId).slice(0,2);
  const nearLimit = parameters.find(parameter=>!parameter.unmatched && parameter.value!=='规格待核' &&
    /刚好达到|位于范围边界|位于区间边界/.test(parameter.comparison) &&
    supported.some(item=>item.entry.requirementId===parameter.requirementId));
  const proof = [nearLimit && (nearLimit.label+' '+nearLimit.value+' · '+nearLimit.comparison),
    ...supported.filter(item=>!nearLimit || item.entry.requirementId!==nearLimit.requirementId).slice(0,nearLimit?1:2)
      .map(item=>item.entry.source)].filter(Boolean).join('、');
  const action = gap && (gap.status==='contradicted' ? '明确不满足' : nextAction(gap));
  let detail = gap?.entry.source;
  if (gap && (gap.status==='conflict'||gap.status==='contradicted') && values.length) {
    detail += ' · '+values.map(item=>item.label+' '+item.value+' · '+item.comparison).join('；');
  }
  const specifications=row.conditions.filter(c=>!c.online&&c.entry.readings?.length)
    .map(c=>c.entry.source+' · '+c.entry.readings![0].label).slice(0,2).join('；');
  if(gap?.entry.readings?.length && action==='问客户')detail=gap.entry.source+'的目标门槛';
  return {title,proof,action,detail,specifications,
    text:[row.result.product.part_number+' · '+title,proof&&'已有依据 · '+proof,specifications,action&&detail&&action+' · '+detail].filter(Boolean).join('\n')};
}

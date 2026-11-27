import type {VerifiedSource} from './source-facts';
import {allowedManufacturerUrl} from '../online-evidence/policy';
import type {EngineeringUnderstanding} from './engineering-understanding';
import type {RequirementLedger} from './requirement-ledger';
import type {PendingEvidenceCheck} from './pending-evidence';
import type {ExecutionAudit} from './execution-contract';
import {requirementOptional} from './execution-contract';
import {compareEvidenceCoverage,evidenceMatchSummary} from './evidence-ranking';
import {hasExactClauseProof,ledgerChecks} from './requirement-ledger';

type Row={vendor:string;pn:string;tier:number;branch?:number;pendingChecks?:PendingEvidenceCheck[];requirementLedger?:RequirementLedger;matchCoverage?:ReturnType<typeof evidenceMatchSummary>};
type Output={results:Row[];engineeringUnderstanding?:EngineeringUnderstanding|null;executionAudit?:ExecutionAudit;componentSearch?:unknown;_debug?:Record<string,unknown>;constraintBanner?:string};
export type SelectionIntegrity={status:'passed'|'failed'|'not_applicable';issues:{code:string;requirementId?:string;vendor?:string;pn?:string;reason:string}[];
 candidateCount:number;retainedCount:number;reviewedCandidates:number;executableConditions:number;documentConditions:number;failedConditions:number;
 deferredCandidates:{vendor:string;pn:string;reason:string}[]};
const semantic=(r:EngineeringUnderstanding['requirements'][number])=>JSON.stringify([r.id,r.source,r.object,r.role,r.meaning,r.condition,requirementOptional(r)]);
/** Final transport guard after research/feedback. No model calls, re-interpretation or proof promotion. */
export function finalizeSelectionIntegrity<T extends Output>(result:T,releaseId:string,original?:EngineeringUnderstanding|null,evidenceLookup?:(vendor:string,pn:string)=>VerifiedSource[]):T&{pipelineAudit:SelectionIntegrity}{
 const u=result.engineeringUnderstanding;
 const audit:SelectionIntegrity={status:'not_applicable',issues:[],candidateCount:result.results.length,retainedCount:result.results.length,reviewedCandidates:result.results.filter(r=>r.requirementLedger?.entries.some(e=>e.review)).length,
  executableConditions:result.executionAudit?.items.filter(i=>i.status==='executed').length||0,documentConditions:result.executionAudit?.items.filter(i=>i.status==='pending_evidence').length||0,failedConditions:result.executionAudit?.items.filter(i=>i.status==='execution_failed').length||0,deferredCandidates:[]};
 if(!u||!Array.isArray(u.requirements)||result.componentSearch)return {...result,pipelineAudit:audit};
 audit.status='passed';
 const expected=original?.requirements||u.requirements;
 const changed=expected.filter(r=>!u.requirements.some(e=>e.id===r.id&&semantic(e)===semantic(r)));
 const added=u.requirements.filter(r=>!expected.some(e=>e.id===r.id));
 if(changed.length||added.length||new Set(u.requirements.map(r=>r.id)).size!==u.requirements.length){
  for(const r of [...changed,...added])audit.issues.push({code:'contract_changed',requirementId:r.id,reason:'检索/资料反馈改变或遗漏了冻结的原始需求'});
  if(!audit.issues.length)audit.issues.push({code:'duplicate_requirement',reason:'最终需求ID不唯一'});
 }
 const fingerprint=(s:VerifiedSource)=>JSON.stringify([s.factId,s.document,s.documentSha256,s.factsSha256,s.page,s.locator,s.originalHeader,s.originalValue,s.scope,s.rating]);
 const retained:Row[]=[];
 for(const row of result.results){
  const l=row.requirementLedger;const issues:SelectionIntegrity['issues']=[];
  const problem=(code:string,reason:string,requirementId?:string)=>issues.push({code,reason:requirementId?`${expected.find(r=>r.id===requirementId)?.source||requirementId}：${reason}`:reason,requirementId,vendor:row.vendor,pn:row.pn});
  if(audit.issues.some(i=>i.code==='contract_changed'||i.code==='duplicate_requirement'))problem('contract_changed','冻结需求未保持，不能继续作为推荐');
  if(!l||l.releaseId!==releaseId||l.candidate.vendor!==row.vendor||l.candidate.pn!==row.pn)problem('ledger_identity','缺少同版本、同厂商、同完整型号的条件账本');
  else {
   if(l.entries.length!==expected.length||new Set(l.entries.map(e=>e.requirementId)).size!==expected.length)problem('ledger_coverage','逐型号账本未完整覆盖原始条件ID');
   const owned=evidenceLookup?new Set(evidenceLookup(row.vendor,row.pn).map(fingerprint)):undefined;
   for(const r of expected){const e=l.entries.find(e=>e.requirementId===r.id);
    if(!e||e.source!==r.source||e.object!==r.object||e.meaning!==r.meaning||e.condition!==r.condition||e.required===requirementOptional(r))problem('ledger_binding','条件账本的原句、对象、工况或必需性发生变化',r.id);
    if(e){
     if(owned&&e.evidence.some(s=>!owned.has(fingerprint(s))))problem('foreign_evidence','条件引用了未绑定到此型号的来源事实',r.id);
     const externalProof=e.observations.some(c=>c.authority==='manufacturer_literal'&&c.qualificationProof?.kind==='manufacturer_literal_qualification'
       &&c.qualificationProof.vendor===row.vendor&&c.qualificationProof.pn===row.pn&&c.qualificationProof.releaseId===releaseId&&c.qualificationProof.requirementId===r.id
       &&!!c.onlineCitations?.length&&c.onlineCitations.every(ref=>allowedManufacturerUrl(ref.url,row.vendor)&&/^[a-f0-9]{64}$/.test(ref.sha256)&&ref.page>0&&ref.quote.length>=12));
     if(e.status==='supported'&&!e.evidence.length&&!r.manufacturerConstraint&&!externalProof)problem('unsupported_claim','满足状态没有该型号的核验来源',r.id);
    }
    if(e?.required&&e.status==='contradicted')problem('known_conflict','该型号有确定不满足的必需条件，应转入排除记录',r.id);
   }
   for(const i of result.executionAudit?.items||[])if(i.required&&i.status==='execution_failed'&&i.branch===(row.branch??0)&&!hasExactClauseProof(l,i.requirementId))problem('execution_failed',i.reason,i.requirementId);
  }
  if(issues.length){audit.issues.push(...issues);audit.deferredCandidates.push({vendor:row.vendor,pn:row.pn,reason:[...new Set(issues.map(i=>i.reason))].join('；')});continue;}
  // The ledger owns status, badge and counts; old model/tag summaries cannot override it.
  const pendingChecks=ledgerChecks(l!);const coverage=evidenceMatchSummary({requirementLedger:l,pendingChecks});
  retained.push({...row,pendingChecks,matchCoverage:coverage,tier:coverage.complete&&!pendingChecks.some(c=>c.blocksMatch&&c.status!=='supported')?1:2});
 }
 retained.sort((a,b)=>compareEvidenceCoverage({pendingChecks:a.pendingChecks||[],requirementLedger:a.requirementLedger},{pendingChecks:b.pendingChecks||[],requirementLedger:b.requirementLedger}));
 audit.retainedCount=retained.length;if(audit.issues.length)audit.status='failed';
 return {...result,results:retained as T['results'],pipelineAudit:audit,...(audit.status==='failed'?{
  confidence:retained.length?'medium':'low',
  constraintBanner:`本次检索执行检查发现缺口，${audit.deferredCandidates.length}款未通过完整性检查的型号未列入推荐。原需求仍保留，详情见执行检查；不代表原厂缺资料或市场没有方案。`,
  _debug:{...result._debug,planStatus:'execution_incomplete',integrityFailed:true}}:{})};
}

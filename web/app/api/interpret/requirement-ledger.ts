import {catalogComparisonReadings,comparisonReadings,knownComparisonMetric,type ComparisonMetric,type ComparisonReading} from './comparison-goal';
import {atomicJointSourceCovered} from './query_parser';
import {manufacturerGroup,manufacturerIdForName} from './candidate-coverage';
import {catalogProvesPrimaryClass} from './device-identity';
import {unboundRequirementMeasurements,separateProtocolEvidence} from './requirement-quantities';
import {sourceMeasurements} from './selection-spec';
import {allowedManufacturerUrl} from '../online-evidence/policy';
import type {EngineeringUnderstanding} from './engineering-understanding';
import type {EngineeringCandidateReview} from './engineering-review';
import type {PendingEvidenceCheck} from './pending-evidence';
import type {Requirement,RequirementResult,FactProduct} from './selection-spec';
import {sourceFactsForProduct,sourcesForMatchedTag,sourcesForPrimaryIdentity,type VerifiedSource} from './source-facts';
import {requirementOptional,type RequirementExecution} from './execution-contract';

export type LedgerStatus='supported'|'contradicted'|'unknown'|'conflict'|'clarification';
export type LedgerEntry={requirementId:string;source:string;object:string;meaning:string;condition:string;required:boolean;
 comparisonMetric?:ComparisonMetric;readings?:ComparisonReading[];status:LedgerStatus;gap?:'partial_evidence'|'execution_failed'|'binding_gap'|'ambiguous_binding'|'review_support'|'unreviewed'|'unread_sources'|'missing_evidence'|'conflict';
 reason:string;evidence:VerifiedSource[];observations:PendingEvidenceCheck[];
 review?:EngineeringCandidateReview['requirements'][number]};
export type RequirementLedger={version:1;releaseId:string;candidate:{vendor:string;pn:string};entries:LedgerEntry[];
 observations:PendingEvidenceCheck[];unboundChecks:PendingEvidenceCheck[];coverage?:{includedFacts:number;totalFacts:number;linkedDocuments:number;documentsFullyRead:false}};
type Input={understanding:EngineeringUnderstanding;releaseId:string;product:FactProduct;checks:PendingEvidenceCheck[];
 queryRequirements:Requirement[];parameterChecks:Record<string,RequirementResult>;review?:EngineeringCandidateReview;execution?:RequirementExecution[];coverage?:RequirementLedger['coverage']};
const key=(s:VerifiedSource)=>JSON.stringify([s.factId,s.documentSha256,s.factsSha256,s.document,s.page,s.locator,s.originalHeader,s.originalValue,s.scope,s.rating]);
/** The ledger is release- and candidate-bound. Exact sources and explicit IDs
 * bind observations; similar prose never transfers proof between requirements.
 * Reviewer citations remain semantic leads, not executable fact certification.
 */
export function buildRequirementLedger(input:Input):RequirementLedger{
 const {understanding:u,product,checks}=input;
 const facts=sourceFactsForProduct(product);
 const owned=new Set(facts.map(f=>key(f.source)));
 const valid=(s:VerifiedSource)=>owned.has(key(s));
 const dedupe=(sources:VerifiedSource[])=>[...new Map(sources.filter(valid).map(s=>[key(s),s])).values()];
 const owners=(c:PendingEvidenceCheck)=>c.requirementId?u.requirements.filter(r=>r.id===c.requirementId&&r.source===c.source):u.intentMode==='independent_fae'?[]:u.requirements.filter(r=>r.source===c.source);
 const unboundChecks=checks.filter(c=>owners(c).length!==1);
 const entries=u.requirements.map(r=>{
  const observations=checks.filter(c=>owners(c).length===1&&owners(c)[0].id===r.id);
  const review=input.review?.vendor===String(product.__vendor)&&input.review.pn===String(product.part_number)?input.review.requirements.find(c=>c.id===r.id):undefined;
  const required=!requirementOptional(r);
  const common={requirementId:r.id,source:r.source,object:r.object,meaning:r.meaning,condition:r.condition,required,observations,review};
  if(r.manufacturerConstraint && manufacturerIdForName(r.source.trim().replace(/^(?:只看|只要|仅限|不要|排除)/,'').replace(/的$/,''))===manufacturerIdForName(r.manufacturerConstraint.name)){const wanted=manufacturerIdForName(r.manufacturerConstraint.name);const matches=wanted===manufacturerGroup(product.__vendor);return {...common,status:wanted===null?'unknown' as const:(r.manufacturerConstraint.mode==='include'?matches:!matches)?'supported' as const:'contradicted' as const,reason:wanted===null?'厂商名称尚未绑定已注册身份':`同版目录厂商身份：${manufacturerGroup(product.__vendor)}；原始厂商条件：${r.manufacturerConstraint.mode} ${r.manufacturerConstraint.name}`,evidence:[]};}
  const execution=input.execution?.find(e=>e.requirementId===r.id);
  if(knownComparisonMetric(r.comparisonMetric)&&!r.identityCategory&&!r.searchFields.length&&!r.searchFeatures?.length&&r.verification==='document'&&execution?.status!=='execution_failed'){
    const readings=r.comparisonMetric==='other' ? catalogComparisonReadings(product,r,facts) : comparisonReadings(r.comparisonMetric,facts.filter(f=>f.scope==='self'&&!f.applicability).map(f=>f.source));
    return {...common,comparisonMetric:r.comparisonMetric,readings,status:'unknown' as const,
      evidence:readings.map(reading=>reading.source),reason:readings.length?'已查到该型号规格，客户尚未指定通过门槛':'待补该型号相应指标及测试工况'};
  }
  const literal=(c:PendingEvidenceCheck)=>c.authority==='manufacturer_literal'&&(u.intentMode!=='independent_fae'||c.qualificationProof?.requirementId===r.id)&&c.qualificationProof?.vendor===String(product.__vendor)&&c.qualificationProof.pn===String(product.part_number)&&c.qualificationProof.releaseId===input.releaseId&&c.qualificationProof.kind==='manufacturer_literal_qualification'&&!!c.onlineCitations?.length&&c.onlineCitations.every(ref=>allowedManufacturerUrl(ref.url,String(product.__vendor))&&/^[a-f0-9]{64}$/.test(ref.sha256)&&ref.page>0&&ref.quote.length>=12);
  const positives=observations.filter(c=>c.status==='supported'&&c.authority!=='semantic_review'&&c.authority!=='research'&&(literal(c)||c.evidence.length>0&&c.evidence.every(valid)));
  const negatives=observations.filter(c=>c.status==='contradicted'&&c.authority!=='semantic_review'&&c.authority!=='research'&&(literal(c)||c.evidence.length>0&&c.evidence.every(valid)));
  // A parameter proof covers every declared field and enum, never the first hit.
  const fields=[...new Set(r.searchFields)];
  const parameterRows=fields.map(field=>{
   const q=input.queryRequirements.filter(q=>q.field===field&&(q.engineeringRequirementId?q.engineeringRequirementId===r.id&&!!q.source?.text&&r.source.includes(q.source.text):u.intentMode!=='independent_fae'&&q.source?.text===r.source));
   const competing=u.requirements.filter(other=>other.source===r.source&&other.searchFields.includes(field));
   return q.length===1&&(q[0].engineeringRequirementId===r.id||competing.length===1)?input.parameterChecks[q[0].tag]:undefined;
  });
  const numericNegative=parameterRows.filter((c):c is RequirementResult=>!!c&&c.status==='unmatched'&&c.evidence.some(f=>f.source.verified&&valid(f.source.verified)));
  // An audited architecture can own the category separately from a feature.
  // Accept only a literal feature + category phrase, with no leftover qualifier.
  const feature = r.searchFeatures?.length === 1 ? r.searchFeatures[0] : undefined;
  const compact = (text:string) => text.replace(/\s+/g,'').toLowerCase();
  const implied = !r.identityCategory && feature && !fields.length && r.verification === 'parameter'
    ? input.queryRequirements.find(q => q.kind === 'tag' && q.strength === 'must'
      && u.architectures?.some(a => a.kind === 'single_device' && a.categoryTags.includes(q.tag))
      && [feature+q.tag,feature+'的'+q.tag].some(phrase => compact(phrase) === compact(r.source)))?.tag
    : undefined;
  const identity = r.identityCategory || implied;
  const identityRequired=!!identity;
  const compoundIdentity=identityRequired&&(fields.length>0||!!r.searchFeatures?.length);
  const identityEvidence=identityRequired?sourcesForPrimaryIdentity(product,identity!).filter(valid):[];
  const identityProof=!identityRequired||catalogProvesPrimaryClass(product,identity!)&&identityEvidence.length>0;
  const numericProof=r.verification==='parameter'&&fields.length>0&&!unboundRequirementMeasurements(r).length&&!separateProtocolEvidence(r)&&!r.unmappedFields?.length&&!r.rejectedSearchFields?.length&&!r.bindingWarnings?.length
   &&parameterRows.every(c=>c?.status==='matched'&&c.evidence.some(f=>f.source.verified&&valid(f.source.verified)))
   &&(r.searchFeatures||[]).every(tag=>sourcesForMatchedTag(product,tag).some(valid));
  const numericEvidence=parameterRows.flatMap(c=>c?.evidence.flatMap(f=>f.source.verified?[f.source.verified]:[])||[]);
  const executedEnums=input.queryRequirements.filter(q=>q.kind==='tag'&&q.engineeringRequirementId===r.id).map(q=>q.tag);
  const enumTags=[...new Set([...(r.searchFeatures||[]),...executedEnums])];
  const enumEvidence=enumTags.flatMap(tag=>sourcesForMatchedTag(product,tag));
  // This shortcut proves a literal atomic enum only. A broad alias cannot
  // certify extra grades, modes or qualifiers contained in the same source.
  const literalEnum=enumTags.length===1&&(r.source.trim().toLowerCase()===enumTags[0].trim().toLowerCase()||enumTags[0]==='工业级'&&/^(?:工规|工业级|industrial)(?:的)?$/i.test(r.source.trim()));
  const enumProof=literalEnum&&['parameter','document'].includes(r.verification)&&!fields.length&&!!enumTags.length&&!r.unmappedFields?.length&&!r.rejectedSearchFields?.length&&!sourceMeasurements(r.source).length&&enumTags.every(tag=>sourcesForMatchedTag(product,tag).some(valid));
  const jointEnumProof=compoundIdentity&&atomicJointSourceCovered(identity!,enumTags,r.source)&&!fields.length&&enumTags.length>0&&r.verification==='parameter'&&!sourceMeasurements(r.source).length
    &&!r.unmappedFields?.length&&!r.rejectedSearchFields?.length&&!r.bindingFailures?.length&&enumTags.every(tag=>sourcesForMatchedTag(product,tag).some(valid));
  const positive=(positives.length>0||numericProof||enumProof||jointEnumProof)&&identityProof&&(!compoundIdentity||numericProof||jointEnumProof);
  const negative=negatives.length>0||numericNegative.length>0;
  const risk=observations.some(c=>c.attention==='possible_mismatch')||review?.status==='contradicted';
  const evidence=dedupe([...positives,...negatives].flatMap(c=>c.evidence).concat(numericEvidence,enumEvidence,identityEvidence));
  // A chip's exact switch-port cell can verify the original compound clause even
  // when the planner could not encode it as a port-count plus a speed tag.
  const portCellProof=positives.some(c=>c.proofKey==='switch.gigabitPorts'&&c.authority==='program')
    &&u.architectures.some(a=>a.kind==='single_device'&&a.categoryTags.includes('交换机'));
  const exact=positives.find(c=>c.authority==='program'&&c.proofKey==='catalog.completeClause');
  if(exact&&!negative&&!risk&&r.verification!=='clarification')return {...common,status:'supported' as const,evidence:exact.evidence,reason:exact.reason};
  if(portCellProof&&!negative&&!risk&&execution?.status!=='execution_failed')return {...common,status:'supported' as const,evidence,reason:positives.map(c=>c.reason).join('；')};
  if(r.identityBindingGap)return {...common,status:risk?'conflict' as const:'unknown' as const,gap:'binding_gap' as const,evidence,reason:r.identityBindingGap};
  if(r.rejectedSearchFields?.length&&!positives.some(c=>c.authority==='structured_proof'&&c.proofKey===r.evidenceQuery?.key))return {...common,status:risk?'conflict' as const:'unknown' as const,gap:'binding_gap' as const,evidence,
   reason:`检索字段与需求对象不一致：${r.rejectedSearchFields.map(f=>`${f.field}：${f.reason}`).join('；')}。已保留原始指标及工况作资料核验，不能将其他对象的参数当作满足或不满足依据。${review?.reason||''}`};
  if(negative)return {...common,status:positive?'conflict' as const:'contradicted' as const,...(positive?{gap:'conflict' as const}:{}),evidence,
   reason:positive?'同一条件出现正反证据，需核对工况与适用型号':negatives.map(c=>c.reason).concat(numericNegative.map(c=>c.reason)).join('；')};
  if(execution?.status==='execution_failed')return {...common,status:'unknown' as const,gap:'execution_failed' as const,evidence,reason:execution.reason};
  if(r.verification==='clarification')return {...common,status:'clarification' as const,evidence,reason:`原始需求口径需确认：${r.meaning}（${r.condition}）`};
  if(risk)return {...common,status:'conflict' as const,gap:'conflict' as const,evidence,reason:observations.filter(c=>c.attention==='possible_mismatch').map(c=>c.reason).concat(review?.status==='contradicted'?[review.reason]:[]).join('；')};
  if(positive)return {...common,status:'supported' as const,evidence,reason:positives.length?positives.map(c=>c.reason).join('；'):'全部已绑定参数及枚举均有该型号的同版本核验依据'};
  const ambiguous=unboundChecks.some(c=>c.source===r.source);
  const reviewSupport=review?.status==='supported'&&!!review.evidence?.length&&review.evidence.every(valid);
  return {...common,status:'unknown' as const,evidence:dedupe([...evidence,...(review?.evidence||[])]),
   gap:reviewSupport?'review_support' as const:evidence.length?'partial_evidence' as const:ambiguous?'ambiguous_binding' as const:!review?'unreviewed' as const:input.coverage&&(input.coverage.totalFacts>input.coverage.includedFacts||input.coverage.linkedDocuments>0)?'unread_sources' as const:'missing_evidence' as const,
   reason:reviewSupport?`模型已引用该型号支持原文；尚未完成可执行核验，不能视为满足。${review.reason}`:evidence.length?`已找到该条件的部分同型号证据，但尚未覆盖完整对象、数值或工况；不能将部分命中当作整项满足。${review?.reason||observations.map(c=>c.reason).join('；')}`:ambiguous?'同一原句关联多个条件，旧检查未明确绑定对象；不能将其中一项的证据复制给其他条件':observations.map(c=>c.reason).join('；')||review?.reason||'该条件尚未完成逐型号证据审阅；不表示原厂资料不存在'};
 });
 return {version:1,releaseId:input.releaseId,candidate:{vendor:String(product.__vendor),pn:String(product.part_number)},entries,observations:checks,unboundChecks,...(input.coverage?{coverage:input.coverage}:{})};
}
/** The UI and match tier consume the same projection. Raw observations remain
 * in the ledger for audit, not as additional contradictory display rows. */
export function ledgerChecks(ledger:RequirementLedger):PendingEvidenceCheck[]{
 return [...ledger.entries.map(e=>({requirementId:e.requirementId,requirementLabel:`${e.required?'':'偏好 · '}${e.object}：${e.meaning}`,authority:'ledger' as const,source:e.source,
  status:e.status==='supported'?'supported' as const:e.status==='contradicted'?'contradicted' as const:'unknown' as const,
  blocksMatch:e.required,reason:`${e.object}：${e.reason}`,evidence:e.evidence,
  ...(e.status==='conflict'?{attention:'possible_mismatch' as const,statusText:'证据冲突，需核对工况'}:e.status==='clarification'?{attention:'clarification' as const,statusText:'需求口径待确认'}:e.status==='unknown'?{attention:'missing_evidence' as const,statusText:e.gap==='review_support'?'已找到支持线索，待核验':e.gap==='partial_evidence'?'已有部分证据，完整条件待核':e.gap==='execution_failed'?'条件尚未成功执行':e.gap==='binding_gap'?'字段不适用，原要求待核验':e.gap==='ambiguous_binding'?'证据对象尚未绑定':e.gap==='unreviewed'?'尚未完成资料审阅':e.gap==='unread_sources'?'现有证据未覆盖，仍有资料待补查':'已读取资料未提供适用证据'}:{}),
  researchReferences:e.observations.flatMap(c=>c.researchReferences||[]),onlineCitations:e.observations.flatMap(c=>c.onlineCitations||[])})),
  ...ledger.unboundChecks.filter(c=>!(c.status==='unknown'&&c.attention!=='possible_mismatch'&&c.summaryOfRequirementIds?.length&&c.summaryOfRequirementIds.every(id=>ledger.entries.some(e=>e.requirementId===id)))).map(c=>({...c,...(c.status==='supported'?{status:'unknown' as const,statusText:'证据对象尚未绑定',reason:'该检查未唯一绑定条件，保留原证据待核；不据此认定满足。'+c.reason}:{})}))];
}

/** Badge provenance and condition rows consume the same certified ledger.
 * A catalog tag hit must not still say “source pending” after its exact identity
 * requirement has verified source evidence. No transfer from fuzzy text. */
export function ledgerTagEvidence(ledger:RequirementLedger|undefined,u:EngineeringUnderstanding|null,original:Record<string,VerifiedSource[]>,matchedTags:string[]){
 const out={...original};if(!ledger||!u)return out;
 for(const e of ledger.entries){
  if(e.status!=='supported'||!e.evidence.length)continue;
  const r=u.requirements.find(r=>r.id===e.requirementId);if(!r)continue;
  for(const tag of [...(r.identityCategory?[r.identityCategory]:[]),...(r.searchFeatures||[])]){
   if(matchedTags.includes(tag))out[tag]=[...new Map([...(out[tag]||[]),...e.evidence].map(f=>[key(f),f])).values()];
  }
 }
 return out;
}

export function hasExactClauseProof(ledger:RequirementLedger|undefined,id:string){
 return !!ledger?.entries.some(e=>e.requirementId===id&&e.status==='supported'&&e.evidence.length>0&&e.observations.some(c=>c.proofKey==='catalog.completeClause'&&c.authority==='program'&&c.status==='supported'));
}

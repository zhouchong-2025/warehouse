import {catalogPredicateAgrees,catalogPredicateFields} from './catalog-predicate';
import schema from '../../../lib/evidence-schema.json' with {type:'json'};
import {sourceMeasurements,toCanonical,type FactProduct} from './selection-spec';
import {sourceFactsForProduct} from './source-facts';
import type {PendingEvidenceCheck} from './pending-evidence';
import type {EngineeringUnderstanding} from './engineering-understanding';
import {requirementOptional} from './execution-contract';
export const EVIDENCE_SCHEMA={...schema,fields:{...schema.fields,...catalogPredicateFields}};
export type EvidenceQuery={key:string;operator:'eq'|'gte'|'covers'|'supports_domains'|'supports_ordered_pair';values:(string|number|boolean)[]};
type Field={kind:string;roles:string[];values?:string[];description:string;unit?:string};
export function evidenceQueryIssues(raw:unknown,r:{source:string;role:string}):string[]{
 if(!raw||typeof raw!=='object')return ['证据查询须为对象'];
 const q=raw as EvidenceQuery;
 if(Object.hasOwn(catalogPredicateFields,q.key))return catalogPredicateAgrees(q,r)?[]:['型号表约束须与原始技术对象、数值、方向及全部工况一致'];
 const field=(schema.fields as Record<string,Field>)[q.key];
 if(!field||!field.roles.includes(r.role)||!Array.isArray(q.values))return ['证据查询字段或对象角色无效'];
 if(field.kind==='voltage_pair'){
  const values=sourceMeasurements(r.source).flatMap(m=>{const v=toCanonical(m.value,m.unit,'V');return v===null?[]:[v];});
  if(!['supports_domains','supports_ordered_pair'].includes(q.operator)||q.values.length!==2||sourceMeasurements(r.source).length!==2||values.length!==2||q.values.some(v=>typeof v!=='number'||!Number.isFinite(v))||[...q.values].sort().some((v,i)=>v!==[...values].sort()[i]))return ['逻辑电压域须逐字绑定原文中的两个电压，不得增减或改变数值'];
  if(/VCCA|VCCB|A侧|B侧/i.test(r.source)&&q.operator!=='supports_ordered_pair')return ['原文指定了A/B端，不能用任意方向互换证明'];
 }else{
  if(q.operator!=='eq'||q.values.length!==1||sourceMeasurements(r.source).length||/\d/.test(r.source)||/\b(?:AEC|ISO|ASIL|Grade)\b/i.test(r.source))return ['原子属性不能吞掉同句数值、等级或组合条件'];
  if(field.kind==='boolean'&&typeof q.values[0]!=='boolean'||field.kind==='enum'&&!field.values?.includes(String(q.values[0])))return ['证据属性值不在受控范围'];
  if(q.key==='io.poweroffIsolation'&&/零漏电|零电流|0\s*(?:uA|μA|µA|nA)|zero.{0,8}(?:leak|current)/i.test(r.source))return ['掉电高阻不能证明零漏电'];
  if(q.key==='lifecycle.status'&&/现货|库存|交期|当天|stock|lead.time/i.test(r.source))return ['在产声明不能证明库存或交期'];
 }
 return [];
}
export function evaluateEvidenceQueries(product:FactProduct,u:EngineeringUnderstanding):PendingEvidenceCheck[]{
 return u.requirements.flatMap<PendingEvidenceCheck>(r=>{
  const q=r.evidenceQuery;if(!q||evidenceQueryIssues(q,r).length)return [];
  if(Object.hasOwn(catalogPredicateFields,q.key))return []; // Executed against original row cells by catalogRowChecks.
  const facts=sourceFactsForProduct(product).filter(f=>f.field===q.key&&f.origin==='reviewed_evidence');
  if(!facts.length&&q.key==='lifecycle.status')facts.push(...sourceFactsForProduct(product).filter(f=>/^Status|状态$/i.test(f.publishedHeader||'')&&f.publishedValue==='Production'));
  const base={requirementId:r.id,source:r.source,blocksMatch:!requirementOptional(r),proofKey:q.key,authority:'structured_proof' as const};
  if(!facts.length)return [{...base,status:'unknown' as const,evidence:[],reason:'已理解该条件，但该型号暂无适用范围经过核验的原厂证据',attention:'missing_evidence' as const}];
  if(facts.some(f=>f.applicability?.requiresContextReview))return [{...base,status:'unknown' as const,evidence:facts.map(f=>f.source),reason:'该型号存在明确适用关系，但附加工况尚需核验；关系链接不能代替本次条件验证。'+facts.map(f=>f.conditions||'').join('；'),attention:'missing_evidence' as const}];
  const decisions=facts.map(f=>{
   if(q.operator==='eq')return (q.key==='lifecycle.status'?f.publishedValue:f.normalizedValue)===q.values[0];
   const v=f.normalizedValue as {aMin:number;aMax:number;bMin:number;bMax:number;relation:string};
   const fits=(a:number,b:number)=>a>=v.aMin&&a<=v.aMax&&b>=v.bMin&&b<=v.bMax&&v.relation==='a<=b'&&a<=b;
   return fits(Number(q.values[0]),Number(q.values[1]))||q.operator==='supports_domains'&&fits(Number(q.values[1]),Number(q.values[0]));
  });
  const consistent=decisions.every(x=>x===decisions[0]);
  const status=!consistent?'unknown' as const:decisions[0]?'supported' as const:'contradicted' as const;
  return [{...base,status,evidence:facts.map(f=>f.source),reason:!consistent?'原厂补充证据相互冲突，保留待核':`${status==='supported'?'原厂型号适用证据支持':'原厂型号适用证据不满足'}此条件。${facts.map(f=>f.conditions||f.evidence.condition||'').join('；')}`,...(!consistent?{attention:'possible_mismatch' as const}:{})}];
 });
}

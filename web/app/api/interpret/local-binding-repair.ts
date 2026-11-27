import {engineeringModelCall} from './engineering-understanding';
import type {FaeIntent} from './fae-intent';
import {EVIDENCE_SCHEMA,evidenceQueryIssues,type EvidenceQuery} from './evidence-contract';
export type BindingRepairTrace={stage:'evidence_query';requirementIds:string[];status:'repaired'|'unresolved';inputScope:'invalid_ids_only';issues:string[];failure?:'reply_shape'|'invalid_patch'|'reply_format'};
type Binding={requirementId:string;evidenceQuery?:EvidenceQuery|null;[key:string]:unknown};
const PROMPT=`你是FAE证据绑定局部修复员。query是完整原始需求；repairs仅包含已经定位的错误绑定。只修复这些ID的evidenceQuery类型、受控字段或来源对应关系，不重写工程理解、其他绑定、架构、数值或条件。没有可安全表达的字段时evidenceQuery填null，原始要求仍完整保留资料核验，不能当成已满足。只能使用各项allowedFields，数值必须来自对应source，不能借完整query中其他对象的数值。布尔值用JSON true/false，电压域用不带单位的JSON数字。返回JSON {"patches":[{"requirementId":"输入ID","evidenceQuery":null或受控查询对象}]}，每个输入ID恰好一次。不得返回其他字段、完整绑定列表或不相关ID。`;
export async function repairProofBindings(query:string,intent:FaeIntent,raw:unknown,key:string,fetcher:typeof fetch):Promise<{raw:unknown;trace:BindingRepairTrace}|null>{
 if(!raw||typeof raw!=='object')return null;
 const object=raw as {requirementBindings?:Binding[]};if(!Array.isArray(object.requirementBindings))return null;
 const repairs=object.requirementBindings.flatMap(b=>{
  const r=intent.requirements.find(r=>r.id===b.requirementId);const errors=r&&b.evidenceQuery?evidenceQueryIssues(b.evidenceQuery,r):[];
  return r&&errors.length?[{requirementId:r.id,source:r.source,object:r.object,role:r.role,meaning:r.meaning,condition:r.condition,errors,invalidEvidenceQuery:b.evidenceQuery,
   allowedFields:Object.fromEntries(Object.entries(EVIDENCE_SCHEMA.fields).filter(([,field])=>(field.roles as readonly string[]).includes(r.role)))}]:[];
 });
 if(!repairs.length)return null;
 const ids=repairs.map(r=>r.requirementId),trace:BindingRepairTrace={stage:'evidence_query',requirementIds:ids,status:'unresolved',inputScope:'invalid_ids_only',issues:repairs.flatMap(r=>r.errors.map(e=>`${r.requirementId}: ${e}`))};
 try{
  const response=await engineeringModelCall(key,fetcher,PROMPT,{query,repairs},1400)as {patches?:{requirementId:string;evidenceQuery:EvidenceQuery|null}[]};
  if(!response||!Array.isArray(response.patches)||response.patches.length!==ids.length||new Set(response.patches.map(p=>p?.requirementId)).size!==ids.length)return{raw,trace:{...trace,failure:'reply_shape'}};
  for(const p of response.patches){
   const r=intent.requirements.find(r=>r.id===p?.requirementId);
   if(!r||!ids.includes(r.id)||Object.keys(p).some(k=>!['requirementId','evidenceQuery'].includes(k))||!Object.hasOwn(p,'evidenceQuery')||p.evidenceQuery!==null&&evidenceQueryIssues(p.evidenceQuery,r).length)return{raw,trace:{...trace,failure:'invalid_patch'}};
  }
  return{raw:{...object,requirementBindings:object.requirementBindings.map(b=>{const p=response.patches!.find(p=>p.requirementId===b.requirementId);return p?{...b,evidenceQuery:p.evidenceQuery}:b;})},trace:{...trace,status:'repaired'}};
 }catch(error){const kind=(error as {kind?:string})?.kind;if(error instanceof Error&&error.name==='AbortError'||kind==='http'||kind==='transport')throw error;return{raw,trace:{...trace,failure:'reply_format'}};}
}

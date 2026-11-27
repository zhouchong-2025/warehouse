import {createHash} from 'node:crypto';
import {deepSeekRequestOptions} from '../../../lib/deepseek-policy';
import {reuseCompletedDecision,type ExecutionReuseContext} from '../../../lib/execution-decision-reuse';
import {engineeringModelCall,type EngineeringUnderstanding} from './engineering-understanding';
import {auditRequirementExecution} from './execution-contract';
import type {PlanSemanticAuthority,WholeQueryPlan} from './whole-query-plan';
import {compactModelEvidence} from './model-evidence-packet';
export type MappingResolution={requirementId:string;decision:'execute'|'document';reason:string;sources:string[];declaredFields:string[]};
const PROMPT=`你是FAE执行冲突复核员。完整query和已审核工程契约是唯一需求来源。旧词面规则与目录适配发生冲突，不能重复按孤立引用重新解释任务，也不能凭产品记忆证明满足。
逐项决定execute（原映射准确表达原对象、量纲、比较关系与工况，应执行）或document（当前字段不能准确表达原要求，保留全部原始要求和工况逐型号核验，不认为满足）。不得修改数值、原意、必需性或架构，不得添加条件；资料未读不等于需求歧义。补充问题不能撤掉明确条件。裸温度若完整契约仍无法确定环境/结温，选择document；若上下文明示环境，短引文不影响执行。裸电流若完整原句明确连续工作，可执行持续容量；峰值/脉冲/被测电流不得改作持续输出，极限/瞬态电压不得改为工作VIN，封装尺寸不得改为引脚数。不要用document逃避有明确对象和可执行映射的条件。
只返回JSON {"resolutions":[{"requirementId":"输入冲突ID","decision":"execute|document","reason":"具体对象和工况依据","sources":["完整query中的真实连续片段"]}]}。每个冲突ID恰好一次。sources只引用原query，不能引用资料指令。`;
export async function resolveMappingConflicts(query:string,u:EngineeringUnderstanding,plan:WholeQueryPlan,proposal:unknown,key:string,fetcher:typeof fetch,reuse?:ExecutionReuseContext){
 const conflicts=auditRequirementExecution(u,plan).items.filter(x=>x.required&&x.status==='execution_failed');
 const ids=[...new Set(conflicts.map(c=>c.requirementId))];
 if(!ids.length)return null;
 const payload=compactModelEvidence({query,engineeringUnderstanding:u,conflicts,proposedMappings:proposal});
 const check=(raw:{resolutions?:MappingResolution[]})=>{
 if(!raw||typeof raw!=='object'||!Array.isArray(raw.resolutions)||raw.resolutions.length!==ids.length||new Set(raw.resolutions.map(x=>x?.requirementId)).size!==ids.length)return null;
 const authority:PlanSemanticAuthority={approvedMappings:[]},resolutions:MappingResolution[]=[];
 for(const item of raw.resolutions){
  const r=u.requirements.find(r=>r.id===item?.requirementId);
  if(!r||!ids.includes(r.id)||!['execute','document'].includes(item.decision)||typeof item.reason!=='string'||item.reason.length<8||item.reason.length>800||!Array.isArray(item.sources)||!item.sources.length||item.sources.length>4||item.sources.some(s=>typeof s!=='string'||!s.trim()||s.length>query.length||!query.includes(s)))return null;
  const resolution={requirementId:r.id,decision:item.decision,reason:item.reason,sources:item.sources,declaredFields:[...r.searchFields]};resolutions.push(resolution);
  if(item.decision==='execute'){
   // Authority only covers the exact submitted field/source/ID tuple. The normal
   // validator still checks numbers, dimensions, relations and explicit conflicts.
   const mappings=(proposal as {mappings?:{requirementId:string;field:string;source:string}[]})?.mappings;
   if(!Array.isArray(mappings))return null;
   const owned=mappings.filter(m=>m.requirementId===r.id&&r.searchFields.includes(m.field)&&typeof m.source==='string'&&r.source.includes(m.source));
   if(!owned.length)return null;
   authority.approvedMappings.push(...owned.map(m=>({requirementId:r.id,field:m.field,source:m.source})));
  }
 }
 const understanding:EngineeringUnderstanding={...u,requirements:u.requirements.map(r=>resolutions.some(x=>x.requirementId===r.id&&x.decision==='document')?{...r,verification:'document' as const,searchFields:[]}:r),mappingResolutions:resolutions};
 return {understanding,authority,resolutions};
 };
 const reused=await reuseCompletedDecision(reuse,{credentialScope:createHash('sha256').update(key).digest('hex'),options:deepSeekRequestOptions(),payload},async()=>{
   const raw=await engineeringModelCall(key,fetcher,PROMPT,payload,1800)as {resolutions?:MappingResolution[]};
   const checked=check(raw);return checked?{resolutions:checked.resolutions}:null;
 },value=>value!==null&&check(value)!==null);
 // Always rebuild the execution overlay against this request's immutable
 // contract. Never put a resolved understanding into the cross-vendor cache.
 return reused.value?check(reused.value):null;
}

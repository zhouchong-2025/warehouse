import {identityRequirementMapped,type EngineeringUnderstanding } from './engineering-understanding';
import type { WholeQueryPlan } from './whole-query-plan';
import { CATEGORY_TAG_NAMES, categorySourceMatches } from './query_parser';
import { sourceMeasurements, PARAMETERS, parseParameterRequirements, type Requirement } from './selection-spec';

export type RequirementExecution = {requirementId:string;source:string;object:string;branch:number;required:boolean;
  status:'executed'|'pending_evidence'|'execution_failed';fields:string[];reason:string; numericPrescreen?:string};
export type ExecutionAudit = {status:'complete'|'partial';blockedBranches:number[];items:RequirementExecution[]};
export function optionalRequirement(source:string){return /优先|最好|尽量|偏好|不要求|不需要|\b(?:prefer|optional)\b/i.test(source);}
export function requirementOptional(r:{source:string;necessity?:'required'|'preferred'}){return r.necessity==='preferred'?true:r.necessity==='required'?false:optionalRequirement(r.source);}
const owns=(owner:string,source:string)=>!!source&&(owner.includes(source)||source.includes(owner));
/** Recover an independently checkable numeric condition only from the whole
 * quoted requirement. Keep the document obligation on the original ID. */
export function pendingNumericScreens(u:EngineeringUnderstanding,plan:WholeQueryPlan,branchIndex:number,query:string):Requirement[] {
  const branch=plan.branches[branchIndex];
  const categories=branch.must.map(t=>t.tag).join('，');
  const checks:Requirement[]=[];
  for(const gap of plan.unresolved){
    const r=u.requirements.find(item=>item.id===gap.requirementId);
    if(!r || r.necessity!=='required' || r.knowledgeBasis==='uncertain' || r.source!==gap.source ||
      r.comparisonMetric || r.verification==='clarification' || r.evidenceQuery ||
      !query.includes(r.source) || u.questions.some(q=>q.scope==='blocking'&&q.requirementIds?.includes(r.id)))continue;
    const start=query.indexOf(r.source);
    // A quoted number in a negation, alternative, or compound condition is
    // insufficient authority for a branch-wide hard bound.
    const clauseBefore=query.slice(0,start).split(/[，,。；;！？!?]/).pop()||'';
    const clauseAfter=query.slice(start+r.source.length).split(/[，,。；;！？!?]/)[0];
    if(/或|峰值|脉冲|限流|过流|测试点|结温|绝对最大|不要求|无需|优先|最好/.test(clauseBefore+r.source+clauseAfter))continue;
    if(query.indexOf(r.source,start+1)>=0 || /或者|或是|或|不要求|不需要|无需|最好|尽量|优先/.test(r.source) ||
      /(?:不要求|不需要|无需|最好|尽量|优先)\s*$/.test(query.slice(0,start)))continue;
    for(const check of parseParameterRequirements(categories+'，'+r.source).requirements){
      if(check.source?.text.trim().replace(/^[，,]/,'').trim()!==r.source.trim() ||
        branch.parameters?.some(p=>p.field===check.field) || checks.some(p=>p.tag===check.tag))continue;
      const hardFloor=check.operator==='gte'||check.operator==='gt';
      const applicable=check.field==='dataRate' && hardFloor && (/^(?:数据速率|码流)/.test(r.source) || /CAN-FD/.test(categories) && /^数据段/.test(r.source)) ||
        check.field==='iout' && /DCDC|降压|升压|LDO/.test(categories) && /^(?:输出电流|负载电流|负载这边|负载端|负载侧)/.test(r.source) && hardFloor ||
        check.field==='temperatureMax' && /^最高工作温度/.test(r.source) && hardFloor ||
        check.field==='channelCount' && /电平转换|运放/.test(categories) && /^通道/.test(r.source) && check.operator==='eq';
      if(applicable)checks.push({...check,engineeringRequirementId:r.id,source:{text:r.source,start,end:start+r.source.length,origin:'rule'}});
    }
  }
  return checks;
}

/** Audits execution, not engineering truth. A missing product fact is not a failed mapping. */
export function auditRequirementExecution(u:EngineeringUnderstanding,plan:WholeQueryPlan):ExecutionAudit{
  const boundTo=(r:EngineeringUnderstanding['requirements'][number],item:{requirementId?:string;source:string})=>u.intentMode==='independent_fae'?item.requirementId===r.id&&owns(r.source,item.source):item.requirementId?item.requirementId===r.id:owns(r.source,item.source);
  const items:RequirementExecution[]=plan.branches.flatMap((branch,index)=>u.requirements.map(r=>{
    const required=!requirementOptional(r);
    const fields=[...new Set([...r.searchFields,...(r.bindingDeclaration?.fields||[]),...(r.bindingDeferral?.declaredFields||[]),...(r.unmappedFields||[]),...(r.rejectedSearchFields||[]).map(f=>f.field)])];
    const common={requirementId:r.id,source:r.source,object:r.object,branch:index,required,fields};
    const deferred=u.mappingResolutions?.find(x=>x.requirementId===r.id&&x.decision==='document')||r.bindingDeferral;
    const failures=r.bindingFailures||[];
    const executableFailure=failures.filter(f=>f.stage==='proof_query'||f.stage==='identity'||r.bindingDeclaration?.verification==='parameter'&&(!r.searchFeatures?.length||sourceMeasurements(r.source).length>0));
    if(required&&!deferred&&executableFailure.length)return {...common,status:'execution_failed' as const,reason:`必要条件“${r.source}”的声明绑定未成功编译：${executableFailure.map(f=>`${f.field||f.stage}：${f.reason}`).join('；')}；应修复绑定，不能当作原厂资料缺失`};
    const missingFeatures=(r.searchFeatures||[]).filter(tag=>!branch.must.some(t=>t.tag===tag&&boundTo(r,t))
      &&(required||!branch.nice.some(t=>t.tag===tag&&boundTo(r,t))));
    if(missingFeatures.length&&r.verification!=='clarification'&&required)return {...common,status:'execution_failed' as const,
      reason:`必要条件“${r.source}”未执行契约声明的枚举：${missingFeatures.join('、')}；数字或主品类命中不能代替`};
    if(deferred)return {...common,status:'pending_evidence' as const,reason:`执行映射经模型明确复核后转资料核验：${deferred.reason}；不是已满足，也不是已确认原厂缺资料`};
    if(identityRequirementMapped(r,[branch]))return {...common,status:'executed' as const,reason:'主器件身份已显式绑定；型号证据另行核验'};
    if(r.verification!=='parameter'&&!r.searchFields.length)return {...common,status:'pending_evidence' as const,reason:r.verification==='clarification'?'原需求需澄清，尚未作为数值筛选':'保留为逐型号资料/应用证据核验，不声称满足'};
    const mapped=fields.length?fields.every(field=>(branch.parameters||[]).some(p=>p.field===field&&boundTo(r,p)&&(!required||p.strength==='must')))
      :[...branch.must,...(!required?branch.nice:[])].some(t=>boundTo(r,t)&&(!CATEGORY_TAG_NAMES.has(t.tag)||categorySourceMatches(t.tag,r.source)))&&!sourceMeasurements(r.source).length;
    if(mapped)return {...common,status:'executed' as const,reason:'已绑定原需求并进入可执行筛选；型号是否有证据另行核验'};
    if(!r.searchFields.length&&!r.rejectedSearchFields?.length)return {...common,status:'pending_evidence' as const,reason:'契约未声明可执行目录字段，按原需求保留逐型号资料核验，不能视为满足'};
    if(!required)return {...common,status:'pending_evidence' as const,reason:'偏好尚未映射，保留待核，不阻断必要条件筛选'};
    return {...common,status:'execution_failed' as const,reason:`必要条件“${r.source}”未成功执行${fields.length?`：${fields.map(f=>PARAMETERS[f as keyof typeof PARAMETERS]?.label||f).join('、')}`:'：缺少有效参数或枚举映射'}；不能用其他条件命中代替`};
  }));
  const blockedBranches=[...new Set(items.filter(i=>i.status==='execution_failed'&&i.required).map(i=>i.branch))];
  return {status:blockedBranches.length?'partial':'complete',blockedBranches,items};
}

/** Reuse audited meaning with valid bindings, never freeze a failed compiler result. */
export function reusableEngineeringContract(u:EngineeringUnderstanding){
 return !u.requirements.some(r=>!requirementOptional(r)&&(r.identityBindingGap||r.bindingFailures?.length)&&!r.bindingDeferral
  &&!u.mappingResolutions?.some(m=>m.requirementId===r.id&&m.decision==='document'));
}

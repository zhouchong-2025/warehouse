import {measurementForField} from './selection-spec';
import {identityRequirementMapped} from './engineering-understanding';
import { bindPlanToEngineering, searchFieldRoleIssue, type EngineeringUnderstanding } from './engineering-understanding';
import { requirementOptional } from './execution-contract';
import { PARAMETERS, sourceMeasurements, toCanonical } from './selection-spec';
import { CATEGORY_TAG_NAMES, categorySourceMatches, getAllKnownTags } from './query_parser';
import { checkedWholeQueryPlan, wholeQueryPlanIssues, conservativeWholeQueryPlan, type WholeQueryPlan, type PlanBranch, type PlanSemanticAuthority } from './whole-query-plan';

/** The second model translates a contract; it does not author another interpretation. */
export const ENGINEERING_ADAPTER_PROMPT = `你是工程需求契约的目录适配器。engineeringUnderstanding是唯一工程含义来源，query只用于核验原句、数字和单位。不得重新理解任务、生成器件方案或重新输出整份需求。程序会直接使用契约的architectures检索主器件，并保留所有未映射要求。
中文数词和单位是原始数值的等价写法，例如五安=5A、3.3伏=3.3V；source必须仍用原文。电源输出电流的“约/差不多/左右”仍是容量目标，不是可忽略的偏好；按原目标值用gte初筛，不自行发明容差、下调数值或降为nice，未明确的工况/容差保留在契约。
numericSourceHints仅按该需求允许的字段，对真实原句中的数值做机械单位换算，不决定比较方向或表示已满足。可映射的数值必须放mappings，不能因旧检索标签被拒绝就清空数值条件；选择field时仍须核对对象和工况。没有原句数值或兼容单位时不得制造映射。
只输出一个JSON对象：{"mappings":[{"architectureIndex":0,"requirementId":"r1","field":"契约searchFields允许的字段","operator":"gt|gte|lt|lte|eq|covers|between","values":[5],"unit":"V","source":"该需求内含数值的连续原文","strength":"must"}],"features":[{"architectureIndex":0,"requirementId":"r2","tag":"明确要求的已有特性标签","source":"该需求内的连续原文","strength":"must"}],"exclude":[],"waived":[],"contexts":[]}。
architectureIndex对应engineeringUnderstanding.architectures的从0开始下标，仅映射kind=single_device。requirementId必须存在。不输出branches、must、nice或unresolved。不复制需求段落或生成解释；不能映射就不输出对应项，程序会保留原要求并说明缺口。features不能填写品类，主品类由程序沿用契约。契约searchFeatures声明的每个枚举须逐项映射到features，不能静默省略；无法映射则原声明保留并报告，程序会审计是否执行。已有枚举条件如工业级可用features，不需虚构温度数值。契约中明确的非数值协议/线路介质/接口必须适配到已有特性枚举，不能因同一需求映射了dataRate就省略协议。例如契约meaning明确100BASE-TX而source是Tx，features应使用允许枚举100Base-TX，source仍保留Tx；不能以PHY或100Mbps代替TX介质，也不能添加T1-PHY或MAC接口作为替代。只有契约本身明确对应含义才可映射，不依据孤立词自行判断。数字可映射verification为parameter/application/document且searchFields明确允许的安全字段；document项的其余含义始终保留文档核验，不能因一个数字命中而完成整项，保留对象、比较方向、严格边界、工况与必需/偏好关系。工作输入范围用covers，持续输出容量通常gte，明确上限用lte，严格大于/小于用gt/lt，Flash/RAM限定容量区间用between；默认值不能覆盖原文明确关系。输入容差可独立换算上下限；不得猜门槛。未说优先/尽量等不得降为nice。不要把芯片数量当端口数、内部模块当独立被选器件。exclude只映射明确不要的已有标签，waived只保留明确不要求的source。所有source来自对应需求，不拼接。不确定就留空数组。只输出JSON。`;

/** Mechanical conversions only, after the full engineering contract. Does not
 * choose a field/operator, create filters, or take numbers from product data.
 */
export function engineeringNumericSourceHints(u:EngineeringUnderstanding){
  return u.requirements.flatMap(r=>{
    const measurements=sourceMeasurements(r.source,r.searchFields.length===1?r.searchFields[0]:r.searchFields.includes('dataRate')?'dataRate':undefined).slice(0,12).flatMap(m=>{
      const candidates=r.searchFields.flatMap(field=>{
        if(!Object.hasOwn(PARAMETERS,field)||searchFieldRoleIssue(r.role,field))return [];
        const def=PARAMETERS[field as keyof typeof PARAMETERS],value=measurementForField(field as keyof typeof PARAMETERS,m.value,m.unit);
        return value===null?[]:[{field,value,unit:def.unit}];
      });
      return candidates.length?[{text:m.text,value:m.value,unit:m.unit,candidates}]:[];
    });
    return measurements.length?[{requirementId:r.id,source:r.source,role:r.role,measurements}]:[];
  });
}

/** Isolate unsafe mappings while retaining every original requirement as pending. */
export function adaptEngineeringPlan(raw: unknown, u: EngineeringUnderstanding, query: string, authority?:PlanSemanticAuthority): {plan:WholeQueryPlan|null;issues:string[];retryNeeded?:boolean} {
  if(!raw||typeof raw!=='object')return {plan:null,issues:['目录适配回复不是对象']};
  const input=raw as Record<string,unknown>;
  let contractInput=raw;
  const conversionIssues:string[]=[];
  if(Array.isArray(input.mappings)){
    const generated=u.architectures.map(a=>({must:a.categoryTags.map(tag=>({tag,source:a.source})),nice:[],parameters:[]} as PlanBranch));
    for(const [kind,items]of [['parameter',input.mappings],['feature',input.features]]as const){
      if(!Array.isArray(items))continue;
      for(const item of items){
        if(!item||typeof item!=='object'){conversionIssues.push('目录映射项结构无效');continue;}
        const m=item as Record<string,unknown>,index=Number(m.architectureIndex),r=u.requirements.find(r=>r.id===m.requirementId);
        if(!Number.isInteger(index)||!u.architectures[index]||u.architectures[index].kind!=='single_device'||!r
          ||typeof m.source!=='string'||!r.source.includes(m.source)||!m.source.trim()){
          conversionIssues.push(`映射没有绑定有效需求与器件对象：${String(m.requirementId||'未知需求')}`);continue;
        }
        // A comparison without a pass threshold must never become a filter.
        if (r.comparisonMetric) continue;
        const {architectureIndex:_index,...mapping}=m;
        if(kind==='parameter'){
          if(!r.searchFields.includes(String(m.field))){conversionIssues.push(`需求${r.id}未允许字段${String(m.field)}；不得重新启用已拒绝或未声明的对象映射，原要求保留资料核验`);continue;}
          generated[index].parameters!.push(mapping as unknown as NonNullable<PlanBranch['parameters']>[number]);
        }
        else if(CATEGORY_TAG_NAMES.has(String(m.tag))){
          if(!u.architectures[index].categoryTags.includes(String(m.tag)))conversionIssues.push(`特性映射混入检索方向标签“${String(m.tag)}”：主品类由architectures负责；性能数值应映射到契约允许的参数，不能因标签类型不合而静默丢失需求。`);
        }else{
          // Do not let later container cleanup silently erase an invented tag.
          // The bounded repair can express a number as a real parameter instead.
          if(typeof m.tag!=='string'||!getAllKnownTags().has(m.tag)){
            conversionIssues.push(`未知特性标签“${String(m.tag)}”：只能使用已有枚举；数值与单位应映射到契约允许的参数字段，不得用自造标签代替。`);continue;
          }
          const strength = u.intentMode === 'independent_fae' && r.searchFeatures?.includes(m.tag)
            ? (requirementOptional(r) ? 'nice' : 'must') : (m.strength === 'nice' ? 'nice' : 'must');
          generated[index][strength].push({...mapping, strength} as unknown as PlanBranch['must'][number]);
        }
      }
    }
    contractInput={branches:generated.filter((_,i)=>u.architectures[i].kind==='single_device'),exclude:input.exclude??[],waived:input.waived??[],contexts:input.contexts??[],unresolved:[]};
  }
  const value=conservativeWholeQueryPlan(contractInput,query,authority) as Partial<WholeQueryPlan>;
  if(!Array.isArray(value.branches)||!Array.isArray(value.exclude)||!Array.isArray(value.unresolved))return {plan:null,issues:['目录适配回复缺少必要数组']};
  const issues:string[]=[...conversionIssues];
  const branches:PlanBranch[]=u.architectures.filter(a=>a.kind==='single_device').map(a=>({
    must:a.categoryTags.map(tag=>({tag,source:a.source,...(!categorySourceMatches(tag,a.source)?{
      inference:'device_role' as const,reason:`工程理解提出${a.name}方向：${a.rationale}`}: {})})),nice:[],parameters:[],
  }));
  if(!branches.length)return {plan:null,issues:['工程契约没有可独立检索的主器件方向']};
  // The full query is used only inside validation probes, never to discharge a real requirement.
  const probe=(bs:PlanBranch[],extra:Partial<WholeQueryPlan>={})=>checkedWholeQueryPlan({branches:bs,exclude:[],
    unresolved:[{source:query,reason:'仅用于单项映射校验',role:'protocol'}],...extra},query,authority);
  if(!probe(branches))return {plan:null,issues:['工程契约的器件方向不能安全映射到目录']};
  const copy=()=>branches.map(b=>({...b,must:[...b.must],nice:[...b.nice],parameters:[...(b.parameters||[])]}));
  // Explicit grade names are enum values, not invented numeric temperature bounds.
  // Bind them from the contract even if the mapper only returns numeric fields.
  for(const r of u.requirements)for(const tag of ['工业级','消费级','车规AEC-Q100']){
    // An explicit alternative is not a requirement that every grade hold at once.
    if(/或者|或|也可以|均可|都可/.test(r.source))continue;
    if(!r.source.includes(tag)&&!(tag==='工业级'&&/工规|industrial/i.test(r.source))&&!(tag==='车规AEC-Q100'&&/车规|AEC\s*[- ]?Q\s*[- ]?100/i.test(r.source)))continue;
    const strength=requirementOptional(r)?'nice':'must';
    for(const [index,branch]of branches.entries()){
      const item={tag,source:r.source,requirementId:r.id},bs=copy();bs[index][strength].push(item);
      if(probe(bs))branch[strength].push(item);
    }
  }
  // The independent binding audit already owns semantic enum selection.
  // Carry it by requirement ID rather than asking another model to reproduce
  // the same decision. Syntax/provenance checks remain in the plan validator.
  if(u.intentMode==='independent_fae')for(const r of u.requirements){
    if(r.verification==='clarification')continue;
    for(const tag of r.searchFeatures||[]){
      if(!getAllKnownTags().has(tag)||CATEGORY_TAG_NAMES.has(tag))continue;
      const strength=requirementOptional(r)?'nice':'must';
      for(const [index,branch]of branches.entries()){
        if(branch[strength].some(t=>t.tag===tag&&t.requirementId===r.id))continue;
        const item={tag,source:r.source,requirementId:r.id},bs=copy();bs[index][strength].push(item);
        if(probe(bs))branch[strength].push(item);
      }
    }
  }
  for(const [index,branch]of branches.entries()){
    // Modern mappings carry explicit architectureIndex. Same-category alternatives
    // must not borrow each other's parameters merely because their tags match.
    const sources=Array.isArray(input.mappings)?[value.branches[index]].filter(Boolean)
      :value.branches.filter(b=>Array.isArray(b?.must)&&b.must.some(t=>t&&branch.must.some(c=>c.tag===t.tag)));
    for(const proposed of sources){
      for(const strength of ['must','nice']as const)for(const item of Array.isArray(proposed[strength])?proposed[strength]:[]){
        if(item&&CATEGORY_TAG_NAMES.has(item.tag))continue; // Architecture is owned by the contract.
        const bs=copy();bs[index][strength].push(item);
        if(branch[strength].some(t=>t.tag===item?.tag&&t.source===item?.source))continue;
        if(probe(bs))branch[strength].push(item);else issues.push(`特性映射未通过校验：${item?.tag||'未知标签'}；原始需求仍保留`);
      }
      for(const proposedParameter of Array.isArray(proposed.parameters)?proposed.parameters:[]){
        let item=proposedParameter;
        const owners=u.requirements.filter(r=>r.searchFields.includes(item?.field)&&typeof item?.source==='string'&&r.source.includes(item.source)&&(!item.requirementId||item.requirementId===r.id));
        if(!owners.length){issues.push(`参数${item?.field||'未知字段'}没有原需求允许的对象绑定；原指标保留资料核验，不能以字段相似重新启用`);continue;}
        if(u.intentMode==='independent_fae' && owners.length===1 && owners[0].necessity)
          item={...item,strength:requirementOptional(owners[0])?'nice':'must'};
        const bs=copy();bs[index].parameters!.push(item);
        if(probe(bs)){branch.parameters!.push(item);continue;}
        // A short numeric quote may have dropped the unit/object qualifier
        // needed to validate it (e.g. a wired-link rate abbreviation). Widen
        // only to one owning, audited requirement; never change values/roles.
        const expandedOwners=u.requirements.filter(r=>typeof item?.source==='string'&&item.source.trim()
          &&r.source.includes(item.source)&&r.searchFields.includes(item.field));
        if(expandedOwners.length===1){
          const expanded={...item,source:expandedOwners[0].source},retry=copy();retry[index].parameters!.push(expanded);
          if(probe(retry)){branch.parameters!.push(expanded);continue;}
        }
        issues.push(`参数映射未通过校验：${item?.field||'未知字段'}（${item?.source||'来源无效'}）；未执行这项筛选，原始需求仍保留`);
      }
    }
  }
  const extra:Partial<WholeQueryPlan>={};
  for(const field of ['exclude','waived','contexts','screening']as const){
    const items=value[field];if(!Array.isArray(items))continue;
    // Exclusions/contexts are kept only as a validated group, never manufactured from missing data.
    if(probe(branches,{...extra,[field]:items}))Object.assign(extra,{[field]:items});
    else issues.push(`${field}映射未通过校验；原始限制仍保留待核`);
  }
  const unresolved=value.unresolved.filter(item=>item&&typeof item.source==='string'&&query.includes(item.source)
    &&typeof item.reason==='string'&&item.reason.trim()).map(item=>({...item,role:item.role||'capability' as const}));
  // Coverage is rebuilt from the contract, not the second model's claim that it covered everything.
  const bound=bindPlanToEngineering({branches,exclude:[],...extra,unresolved},u);
  // A retry may repair a malformed mapping, but cannot add a missing catalog capability.
  let retryNeeded=issues.length>0;
  for(const r of u.requirements){
    const missingFeatures=(r.searchFeatures||[]).filter(tag=>!bound.branches.every(b=>[...b.must,...(requirementOptional(r)?b.nice:[])].some(t=>t.tag===tag&&(t.requirementId?t.requirementId===r.id:r.source.includes(t.source)||t.source.includes(r.source)))));
    if(missingFeatures.length){
      if(!requirementOptional(r))retryNeeded=true;
      const reason=`「${r.source}」：契约声明的枚举尚未执行：${missingFeatures.join('、')}；数字或品类命中不能替代协议/介质/接口要求`;
      issues.push(reason);const pending=bound.unresolved.find(x=>x.requirementId===r.id);
      if(pending)pending.reason+=`；${reason}`;else bound.unresolved.push({requirementId:r.id,source:r.source,reason,role:'capability'});
    }
    const mappedEverywhere=r.searchFields.length>0&&bound.branches.length>0&&bound.branches.every(b=>r.searchFields.every(field=>(b.parameters||[]).some(p=>
      (p.requirementId?p.requirementId===r.id:r.source.includes(p.source)||p.source.includes(r.source))&&p.field===field&&(requirementOptional(r)||p.strength==='must'))));
    const enumMapped=bound.branches.every(b=>[...b.must,...(requirementOptional(r)?b.nice:[])].some(t=>!CATEGORY_TAG_NAMES.has(t.tag)&&(t.requirementId?t.requirementId===r.id:t.source===r.source)));
    if(r.verification==='parameter'&&r.searchFields.length&&!mappedEverywhere&&!enumMapped)retryNeeded=true;
    if(!identityRequirementMapped(r,bound.branches)&&(r.unmappedFields?.length||r.rejectedSearchFields?.length||r.verification==='parameter'&&!mappedEverywhere&&!enumMapped)){
      const reason=`「${r.source}」：${r.object}的${r.meaning}尚未完整接入可执行筛选，保留为待核条件，不代表满足或不满足`;
      issues.push(reason);
      const pending=bound.unresolved.find(x=>x.requirementId===r.id);
      if(pending)pending.reason+=`；${reason}`;
      else bound.unresolved.push({requirementId:r.id,source:r.source,reason,role:'capability'});
    }
  }
  const plan=checkedWholeQueryPlan(bound,query,authority);
  if(plan)for(const branch of plan.branches){
    for(const item of [...branch.must,...branch.nice,...(branch.parameters||[])]){
      const allowed=u.requirements.filter(r=>r.source.includes(item.source)&&('field'in item?r.searchFields.includes(item.field):r.searchFeatures?.includes(item.tag)||r.identityCategory===item.tag));
      if(item.requirementId&&!allowed.some(r=>r.id===item.requirementId)){delete item.requirementId;}
      if(!item.requirementId&&allowed.length===1)item.requirementId=allowed[0].id;
    }
  }
  return {plan,retryNeeded,issues:plan?issues:[...issues,...wholeQueryPlanIssues(bound,query,authority),'适配后仍无法保证完整约束覆盖，未执行型号搜索']};
}

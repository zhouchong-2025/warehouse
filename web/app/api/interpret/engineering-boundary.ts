/** A valid engineering task need not be representable by this catalog's single-device filters. */
import type { EngineeringUnderstanding } from './engineering-understanding';
import { CATEGORY_TAG_NAMES } from './query_parser';
export type EngineeringBoundary = {code:'ac_input'|'multiple_outputs'|'circuit_only'|'unsupported_architecture'|'plan_representation'|'planning_request'|'task_mode';reason:string};
export function engineeringBoundaries(u:EngineeringUnderstanding):EngineeringBoundary[]{
  const gaps:EngineeringBoundary[]=[];
  if(u.catalogScope==='outside')return [{code:'task_mode',reason:'原始选型需求已理解；当前目录未覆盖该器件方向，不使用相近类别替代。可继续查阅资料或补充库外原厂证据，目录缺失不代表市场没有方案。'}];
  if(u.taskKind&&['clarification','comparison','explanation','unsupported'].includes(u.taskKind))return [{code:'task_mode',reason:u.taskKind==='clarification'?'先明确影响方案的关键问题，再确定可检索方向；不强推型号。':u.taskKind==='unsupported'?'该任务的主方向尚未映射到当前目录；继续核查资料，不将库外等同于市场上不存在。':'这是比较、兼容或工程解释任务；先按原始问题查证资料，不用替代料号清单代替回答。'}];
  if(u.requirements.some(r=>r.role==='supply'&&/\bVAC\b|V\s*(?:AC|a\.c\.)\b|交流/i.test(r.source)))gaps.push({code:'ac_input',reason:'当前目录的工作输入电压筛选尚不支持交流输入有效值及其与整流后/芯片供电的关系，不能把交流电压直接当直流VIN比较。'});
  const outputs=u.requirements.filter(r=>r.role==='regulated_output'&&r.searchFields.includes('vout'));
  if(new Set(outputs.map(r=>r.source)).size>1)gaps.push({code:'multiple_outputs',reason:'这是多个输出对象的要求；当前目录尚不能按每路电压、电流及同时负载分别核验，不能把多路输出合并成一个VOUT/Iout筛选。'});
  if(u.taskKind==='solution'||!u.architectures.some(a=>a.kind==='single_device'))gaps.push({code:'circuit_only',reason:'当前理解指向电路组合方案，单芯片目录不能直接证明整套方案满足；需要方案级资料、外围器件和应用验证。'});
  else if(!u.architectures.some(a=>a.kind==='single_device'&&a.categoryTags.some(t=>CATEGORY_TAG_NAMES.has(t))))gaps.push({code:'unsupported_architecture',reason:'工程方案所需品类尚未映射到当前目录，不能强行套用相近芯片品类。'});
  return gaps;
}
export function understoodWithoutScreening(query:string,u:EngineeringUnderstanding,gaps:EngineeringBoundary[]){
  return {features:[],must:[],nice:[],mustMeta:[],exclude_tags:[],vendor:null,category_hint:'工程需求与资料边界',
    explanation:u.task,confidence:'medium',suggestions:[],results:[],engineeringUnderstanding:u,
    engineeringBoundary:gaps,
    constraintBanner:gaps.some(g=>g.code==='task_mode')?gaps.map(g=>g.reason).join(''):`工程需求已理解，但当前资料/检索能力尚不能核验这套完整需求。${gaps.map(g=>g.reason).join('')}尚未执行型号匹配，不代表市场上没有方案。`,
    querySpec:{version:1 as const,text:query,requirements:[],unresolved:u.requirements.map(r=>({
      source:{text:r.source,start:query.indexOf(r.source),end:query.indexOf(r.source)+r.source.length,origin:'model' as const},
      reason:`${r.object}：${r.meaning}；工况：${r.condition}；当前保留为工程需求，尚未完成型号/方案证据核验`,kind:'capability' as const,
    }))},
    _debug:{llmCalled:true,llmSucceeded:true,planStatus:'engineering_only',screeningStatus:'not_executed'},
  };
}

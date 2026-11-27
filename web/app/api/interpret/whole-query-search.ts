import {hasExactClauseProof} from './requirement-ledger';
import {catalogRowChecks,mandatoryIdentity,provesIdentity} from './catalog-row-checks';
import {finalizeSelectionIntegrity} from './selection-integrity';
import {compareEvidenceCoverage,evidenceMatchSummary,orderComparableReadings} from './evidence-ranking';
import type {ExecutionReuseContext} from '../../../lib/execution-decision-reuse';
import {cancellableSelectionFetch,throwIfSelectionCancelled,waitForSelection} from '../../../lib/selection-cancellation';
import {resolveMappingConflicts} from './mapping-resolution';
import type {PlanSemanticAuthority} from './whole-query-plan';
import {evaluateEvidenceQueries} from './evidence-contract';
import {buildRequirementLedger,ledgerChecks,ledgerTagEvidence,type RequirementLedger} from './requirement-ledger';
import {coverGroups,manufacturerGroup,manufacturerScopeAllows,requirementEvidenceRelevance} from './candidate-coverage';
import type { WholeQueryPlan } from './whole-query-plan';
import {loadProductKnowledge,searchProductKnowledge,packetSummary,packetFacts} from './product-knowledge';
import { auditRequirementExecution,reusableEngineeringContract,pendingNumericScreens } from './execution-contract';
import { researchConflictChecks } from './research-feedback';
import {selectionModelUsage} from '../../../lib/selection-model-usage';
import {reuseSelection,selectionReuseKey} from '../../../lib/selection-result-reuse';
import {deepSeekRequestOptions} from '../../../lib/deepseek-policy';
import { ENGINEERING_ADAPTER_PROMPT, adaptEngineeringPlan, engineeringNumericSourceHints } from './engineering-plan-adapter';
import { runFaeResearch,researchDirection,manufacturerResearch,type FaeResearch } from './fae-research';
import { matchesMainDeviceIdentity } from './resource-context';
import { supplementCandidateEvidence } from './automatic-source-evidence';
import { screenEngineeringModules } from './engineering-modules';
import { engineeringBoundaries, understoodWithoutScreening } from './engineering-boundary';
import { understandEngineering, completePlanContainers, EngineeringStageError, type EngineeringUnderstanding } from './engineering-understanding';
import { reviewEngineeringCandidates, engineeringReviewChecks, deferredReviewBranches, reconcileReviewWithResearch, type EngineeringReview } from './engineering-review';
import { parsePlanContent } from './plan-content';
import { solutionDirections } from './solution-directions';
import { normalizeEngineeringInput, hasDirectionalNumberControls } from './engineering-input';
import { uncoveredIntent } from './intent-coverage';
import { getAllKnownTags } from './query_parser';
import { partialCanProtocolCandidate, scoreByConstraints, type ConstraintProduct } from './constraint-match';
import { matchesExplicitExclusion } from './exclusion-match';
import { loadAllVendors } from './data-loader';
import { loadWikiDocuments } from '../wiki-search/source-loader';
import { searchWikiDocuments } from '../wiki-search/retrieval';
import { buildWikiLLMContext } from '../wiki-search/llm-context';
import { PARAMETERS } from './selection-spec';
import { sourceFactsForProduct, type VerifiedSource } from './source-facts';
import { evaluatePendingEvidence, evaluateIdentityRequirements, type PendingEvidenceCheck } from './pending-evidence';
import { checkedWholeQueryPlan, conservativeWholeQueryPlan, needsWholeQueryPlan, planMeta, planQuerySpec, wholeQueryPlanIssues,
} from './whole-query-plan';

type PlannedCandidate = { score: ReturnType<typeof scoreByConstraints>[number]; branch: number;
  pendingChecks: PendingEvidenceCheck[];requirementLedger?:RequirementLedger };

export function hasFullyProvenCandidate(result:{results:unknown[];querySpec:{unresolved:unknown[]}}):boolean{
  if(result.querySpec.unresolved.length)return false;
  return result.results.some(value=>{const row=value as {tier?:number;requirementLedger?:RequirementLedger;pendingChecks?:PendingEvidenceCheck[]};
    const entries=row.requirementLedger?.entries;
    return row.tier===1&&!!entries?.some(e=>e.required)&&entries.every(e=>!e.required||e.status==='supported')
      &&!row.requirementLedger?.unboundChecks.some(c=>c.blocksMatch&&c.status!=='supported')
      &&!row.pendingChecks?.some(c=>c.blocksMatch&&c.status!=='supported');
  });
}

export function keepExplicitConverterClass(query:string,plan:WholeQueryPlan):WholeQueryPlan {
  const classPattern=/(?<![a-z0-9])dc[ \t‐‑–—-]*dc(?![a-z0-9])/i;
  const converterClass=query.match(classPattern);
  const namedAsTarget=converterClass && /(?:想找|要找|选用|需要|找|选)\s*(?:一?[颗个款])?\s*$/.test(query.slice(0,converterClass.index));
  if(converterClass && !/降压|升压|buck|boost|step[ -]?(?:up|down)|反激|正激|隔离/i.test(query)){
    return {...plan,branches:plan.branches.map(branch=>({...branch,must:branch.must.map(item=>
      item.inference==='device_role' && item.tag==='降压' && (classPattern.test(item.source) || (namedAsTarget && /^\s*(?:[，,。；;]|$)/.test(query.slice(converterClass.index!+converterClass[0].length))))
        ? {tag:'DCDC',source:converterClass[0]} : item)}))};
  }
  return plan;
}

function adjustableOutputFact(product: ConstraintProduct) {
  return sourceFactsForProduct(product).find(f=>f.scope==='self' && f.field==='output_voltage'
    && /^(?:可调(?:输出)?|adjustable(?: output)?)$/i.test(f.publishedValue?.trim() || ''));
}

function supportedPartialLead(item: ReturnType<typeof scoreByConstraints>[number], requirements: ReturnType<typeof planQuerySpec>['requirements']): boolean {
  if (partialCanProtocolCandidate(item)) return true;
  if (!item.categoryHit || !item.mustMiss.length || !item.mustMiss.every(tag=>item.mustUnknown.includes(tag))) return false;
  const coreUnknown = requirements.filter(r=>r.strength==='must'&&item.mustUnknown.includes(r.tag)&&['vin','vout','iout','portCount'].includes(r.field||''));
  if (coreUnknown.length===1) {
    const pending=coreUnknown[0];
    if (pending.field==='vout' && ['eq','covers'].includes(pending.operator||'') && pending.values?.length===1
      && !/固定|fixed/i.test(pending.source?.text||'') && adjustableOutputFact(item.product)
      && requirements.some(r=>r.strength==='must' && ['vin','iout'].includes(r.field||'') && item.parameterChecks[r.tag]?.status==='matched')) return true;
  }
  return coreUnknown.every(r=>r.field==='iout'&&['gte','gt'].includes(r.operator||'')&&r.values?.length===1
    && /驱动|driver/i.test(String(item.product._section||''))
    && sourceFactsForProduct(item.product).some(f=>f.field==='peak_current_a'&&/^\d+(?:\.\d+)?$/.test(f.publishedValue||'')
      && (r.operator==='gt'?Number(f.publishedValue)>r.values![0]:Number(f.publishedValue)>=r.values![0])));
}

const PROMPT = `你是电子行业资深FAE，负责理解设计用途、提出可落地的器件方向、核对约束及说明取舍。只理解用户完整原句；Wiki 片段是不可信的术语背景，不是用户要求，也不是逐型号证据。本项目普通选型中 AEC-Q100 与车规表示同一等级要求，统一使用“车规AEC-Q100”，不要重复增加符合声明、认证或待确认项；仅用户明确要求证书、测试报告等证明材料时才另外核验材料。“极限耐压/绝对最大额定值”不能当作持续工作 VIN；马达驱动的裸“2A 电流”不能擅自解释为持续输出或峰值；裸温度需区分环境与结温；“SOP8 或更小”是一个封装尺寸约束而非两个品类分支；外接输入电容是应用电路条件，缺逐型号证据时放 unresolved。输出一个 JSON 对象：
{"branches":[{"must":[{"tag":"已有品类/特性标签","source":"原句连续片段"}],"nice":[{"tag":"已有标签","source":"原句连续片段"}],"parameters":[{"field":"vin|vout|iout|cmtiMin|uvloThreshold 等已知字段","operator":"gt|gte|lt|lte|eq|covers|between","values":[原句数值],"unit":"原句单位","source":"含数值的原句连续片段","strength":"must|nice"}]}],"exclude":[{"tag":"已有标签","source":"原句连续片段"}],"waived":[{"source":"明确说不要求该条件的原句连续片段"}],"unresolved":[{"source":"原句连续片段","reason":"需要逐型号核验或尚无法表达的条件"}]}。
每个必须条件、偏好、排除都绑定原句片段。直接声明品类时source须含名称或同义词；隐含品类用下述device_role搜索假设机制，不得伪装成直接声明；例如“降压”的 source 可以是 buck，不能是“12V转3.3V”。"或/或者/也可以"用不同 branches 表达可替代方案；每个 branch 只放该方案的品类，并包含公共参数条件。例如“LDO 或 buck”：LDO 分支只放 LDO 品类，buck 分支只放降压品类，绝不把 buck/降压放进 LDO 分支。“12V转3.3V”中的 12V 是输入工作点，vin 用 covers 判断器件范围是否包含 12V，不能用 eq 要求器件额定输入恰好等于 12V。输出电流 Iout 只表示持续输出容量；峰值、限流、电流检测、电路级输出能力不能改写成芯片 Iout。正常 2A、峰值 10A：Iout_2A 为 must，峰值 10A 放 unresolved。优先 10A：放 nice。"不要求车规"放 waived，不排除车规；"不要车规"放 exclude。unresolved.role若填写仅限protocol|power|wake|configuration|capability，未知能力统一capability。未明确说优先/尽量/最好/可选的条件不得擅自降为nice。unresolved 只记录尚未表达或无法用现有逐型号证据核验的独立条件；已放进 must、nice 或 parameters 的条件不要重复放入 unresolved。不得从 Wiki 数值生成用户条件。MCU资源需求有独立规则：用户即使未写MCU，只要原句同时描述Flash/RAM和UART/PWM/CAN中至少两类外设资源，可在must放{"tag":"MCU/DSP","source":"完整原句连续片段","inference":"mcu_resources"}，source必须真实存在且同时含存储和至少两类外设，不得拼接或重复词语。CAN外设不是CAN收发器品类，不要把CAN、UART、低功耗唤醒、待机模式作为MCU能力标签。外设数量用canChannels、canFdChannels、uartChannels、pwmOutputs，未说恰好时用gte、单位路；一/两等中文数词须对应1/2。pwmChannels仅表示明确的ePWM模块，不等于可用输出脚数量。CAN2.0B还必须在unresolved单列role=protocol，即使与canChannels共用同一原句。Flash/RAM容量区间用between [下限,上限]，不是covers或仅gte；电压工作范围仍用covers。未量化的低休眠电流放unresolved role=power，硬件唤醒放role=wake，不能自造阈值或把CAN选择性唤醒当MCU唤醒。外设同时使用还要保留role=configuration的引脚复用核验，source取对应真实原句。所有UART/PWM/Flash/协议/唤醒条件均须被参数或待核项覆盖，不能只用MCU品类来源片段代替。
工作包络与应用验证：用户给出标称/测试工作点且已给覆盖该点的同字段工作范围时，用顶层contexts:[{source:"标称 12V",role:"operating_point",field:"vin",values:[12],unit:"V"}]记录该点，不能遗漏，也不能另要求器件输入恰好为12V。contexts仅允许一个有原文的数值点，且每个分支必须有该字段covers上下限包住该点。若无范围或角色不清则放unresolved。电源需求的持续VIN范围、输出电压/持续电流、环境温度可独立参数化；输入抛负载/浪涌必须保留电压、持续时间和是否要求期间正常工作，不能与持续VIN或绝对最大值混用。纹波mVpp、负载阶跃幅度和时间、效率@输入/负载条件属于应用验证，完整放unresolved，不得转成Vos、Iout或孤立电压筛选；效率目标不是可选偏好。封装长×宽mm不能转成引脚数；放unresolved保留尺寸要求。未说车规/AEC时不能自行增加。输入范围高于输出可提出LDO/降压等候选品类假设，依据功耗/散热和应用条件逐步判断，不擅自保证效率。
通用品类推断：用户只描述用途/资源而未直接写品类时，可提出最多三个可替代品类分支。每个推断品类对象必须同时含inference="device_role"和reason字符串（至少8字），例如{"tag":"LDO","source":"输入5V，输出3.3V","inference":"device_role","reason":"输入高于输出且要求低噪声模拟供电，提出线性稳压器搜索方向"}。reason不能省略或移到分支上；用它解释原句用途与器件角色关系，source为真实连续原文；只是搜索假设，不能声称用户已明确品类。区分被选器件、外围部件、负载、内置外设。同一器件的功能要求不能变成独立替代品类，例如电机驱动所需电流采样、堵转保护、nFAULT不能用单独电流检测放大器分支替代整套驱动需求；确需外置组合时仍保留主器件及完整工况，并把组合核验保留为待核。不可见到CAN就推为收发器、见到MOS就推为MOS器件。存在两种合理解释时保留替代方案或在unresolved明确歧义，不强行唯一化。所有非数值诉求（低噪声、隔离供电、响应快、保护、工作模式、外围需求等）必须独立表达，已有字段不能表达就放unresolved，不丢弃、不发明阈值。一个品类source或参数source不能代表其中所有独立语义均已理解。
输入容差可计算但必须可追溯：例如“输入5V±5%”独立计算4.75~5.25V，用vin/covers/[4.75,5.25]/V、source取完整原句容差表达、derivation="relative_tolerance"；绝对容差如5V±250mV用absolute_tolerance。程序复算验证，不能发明不同上下限，也不能只保留5V；不用contexts重复记录整个容差式。供24bit ADC的AVDD表示被供电负载与模拟电源用途，不是要选ADC或要求电源24bit分辨率。噪声≤10μVrms(10Hz~10kHz)是指定频段积分RMS噪声，不能当噪声谱密度、失调或峰峰纹波；完整放unresolved。压差≤200mV@0.5A是对应负载的dropout指标，不能作为输出电压或实际输入输出差；完整保留测试负载。静态电流上限只有典型值时不能当成最大值保证。
FAE通用工作方式：先区分被选器件、负载、内部外设、接口以及供电/信号/环境角色。采用有依据的常用默认口径推进，不因用户未说品类名就把问题退回；型号资料缺失不等于用户表达不清，也不等于不满足。把直接可核验参数、同工况应用验证、真正会改变方案的歧义分开。共模电压不是供电、被测/负载电流不是放大器输出、结温不是环境温度、额定值不是所有工况同时保证；没有数据不能自行制造阈值。封装“限3*3/3x3/3×3mm”默认本体标称长宽上限（通常mm），在unresolved保留原句供封装证据核验，不反复要求用户确认本体还是PCB；用户明确PCB/焊盘/最大外形/含公差时遵从明确口径。低噪声/低功耗/响应快等是有意义的选型诉求，未量化时保留比较方向，不能把某型号典型值当用户门槛。仅当两个合理解释会改变候选或可行性时提出具体问题，资料缺字段应说明查什么原厂资料。接口问句区分控制器与收发器、协议版本与速率；模拟问句区分共模、差模、输入量程与输出摆幅；MCU问句区分外设模块、输出引脚及同时复用。不要承诺未获得同条件证据的应用性能。
只能输出 JSON，无解释文字。`;

function modelServiceFailure(status?:number):string{
  if(status===402)return 'DeepSeek账户余额不足（HTTP 402），请恢复该API账户余额后重试。';
  if(status===401)return 'DeepSeek身份认证未通过（HTTP 401），请核对本地模型服务配置。';
  if(status===429)return 'DeepSeek请求受限（HTTP 429），请稍后重试。';
  return status?`DeepSeek服务请求未成功（HTTP ${status}），请稍后重试。`:'模型请求未完成，可能是连接或超时，请稍后重试。';
}

function unavailable(query: string, reason: string, called: boolean) {
  return { features: [], must: [], nice: [], mustMeta: [], exclude_tags: [], vendor: null,
    category_hint: null, explanation: '完整问题尚未核验', confidence: 'low', suggestions: [], results: [],
    constraintBanner: reason,
    querySpec: { version: 1, text: query, requirements: [], unresolved: [{
      source: { text: query, start: 0, end: query.length, origin: 'model' as const }, reason,
      kind: 'model_unavailable' as const,
    }] },
    _debug: { llmCalled: called, llmSucceeded: false, planStatus: 'unavailable' } };
}

/** Reuse is scoped to the exact text, release, credential, model and all search switches.
 * It never suppresses source validation on a new query or a changed frozen release.
 */
type FrozenSearch={expires:number;understanding:EngineeringUnderstanding;plan?:WholeQueryPlan};
const frozenSearches=new WeakMap<typeof fetch,Map<string,FrozenSearch>>();
const pendingContracts=new WeakMap<typeof fetch,Map<string,Promise<void>>>();
export async function searchWholeQuery(query:string,releaseId:string,vendor:string|null,key:string,fetcher:typeof fetch=fetch,signal?:AbortSignal){
  const options=deepSeekRequestOptions();
  const flags=['FAE_ENGINEERING_PIPELINE_ENABLED','FAE_INDEPENDENT_INTENT_ENABLED','FAE_RESEARCH_LOOP_ENABLED','FAE_SEMANTIC_AUDIT_ENABLED','FAE_AUTO_EVIDENCE_ENABLED','ONLINE_EVIDENCE_ENABLED','FAE_AGENT_RETRIEVAL_ENABLED','FAE_COST_OPTIMIZED_ENABLED','FAE_EXECUTION_DECISION_REUSE','FAE_LOCAL_BINDING_REPAIR_ENABLED'].map(k=>[k,process.env[k]||'']);
  const cacheKey=selectionReuseKey({query,releaseId,vendor,credentialScope:selectionReuseKey(key),options,flags});
  const canReuseIntent=process.env.FAE_MODEL_RESULT_REUSE!=='0';
  const canReuse=canReuseIntent&&process.env.FAE_AUTO_EVIDENCE_ENABLED!=='1';
  const intentKey=selectionReuseKey({query,releaseId,credentialScope:selectionReuseKey(key),options,flags});
  let intents=frozenSearches.get(fetcher);if(!intents){intents=new Map();frozenSearches.set(fetcher,intents);}
  for(const[k,v]of intents)if(v.expires<=Date.now())intents.delete(k);
  let pending=pendingContracts.get(fetcher);if(!pending){pending=new Map();pendingContracts.set(fetcher,pending);}
  const outcome=await reuseSelection(fetcher,cacheKey,canReuse,async(sharedSignal)=>{
    throwIfSelectionCancelled(sharedSignal);
    let frozen=canReuseIntent?intents!.get(intentKey):undefined;
    if(canReuseIntent)while(!frozen&&pending!.has(intentKey)){await waitForSelection(pending!.get(intentKey)!,sharedSignal);frozen=intents!.get(intentKey);}
    let release:undefined|(()=>void),owned:Promise<void>|undefined;
    if(canReuseIntent&&!frozen){owned=new Promise<void>(resolve=>{release=resolve;});pending!.set(intentKey,owned);}
    const finish=()=>{if(owned&&pending!.get(intentKey)===owned)pending!.delete(intentKey);release?.();};
    const usage=selectionModelUsage(cancellableSelectionFetch(fetcher,sharedSignal),{releaseId,queryHash:selectionReuseKey(query)});
    const executionReuse:ExecutionReuseContext={owner:fetcher,releaseId,namespace:intentKey,enabled:canReuseIntent&&process.env.FAE_EXECUTION_DECISION_REUSE!=='0',signal:sharedSignal,metrics:{hits:0,misses:0}};
    try{
      const value=await executeWholeQuery(query,releaseId,vendor,key,usage.fetch,frozen,(understanding,plan)=>{
        throwIfSelectionCancelled(sharedSignal);
        if(!reusableEngineeringContract(understanding)){intents!.delete(intentKey);finish();return;}
        // Only the original pre-research contract enters this cross-vendor cache.
        if(!owned){const existing=intents!.get(intentKey);if(existing&&!existing.plan&&plan)intents!.set(intentKey,{...existing,plan:structuredClone(plan)});return;}
        if(intents!.size>=16)intents!.delete(intents!.keys().next().value!);
        intents!.set(intentKey,{expires:Date.now()+600000,understanding:structuredClone(understanding),...(plan?{plan:structuredClone(plan)}:{})});finish();
      },executionReuse);
      const modelUsage=usage.snapshot();
      return {...value,...(modelUsage.budget.blocked?{constraintBanner:modelUsage.budget.sharedDenials.includes('shared_store_unavailable')
        ? '模型额度服务暂不可用，已暂停后续核验。稍后可重试。'
        : modelUsage.budget.sharedDenials.includes('concurrency')
          ? '选型服务当前较忙，已暂停后续模型核验。稍后可重试。'
          : '已达到模型调用或估算费用上限。已核实的证据仍可查看，待核条件需继续确认。'}:{}),_debug:{...value._debug,understandingReused:!!frozen,executionDecisionReuse:executionReuse.metrics,modelUsage}};
    }finally{finish();}
  },Date.now,signal);
  if(outcome.status==='miss')return {...outcome.value,_debug:{...outcome.value._debug,responseReuse:outcome.status}};
  // The provider usage belongs to the originating request, not the request reusing it.
  const noNewCalls=selectionModelUsage(fetcher).snapshot();
  return {...outcome.value,_debug:{...outcome.value._debug,responseReuse:outcome.status,
    modelUsage:{...noNewCalls,reused:true}}};
}

/** Model plans the whole question; catalog facts, not the model, decide product matches. */
async function executeWholeQuery(query: string, releaseId: string, vendor: string | null,
  key: string, fetcher: typeof fetch = fetch, frozen?:FrozenSearch,onContract?:(u:EngineeringUnderstanding,p?:WholeQueryPlan)=>void,executionReuse?:ExecutionReuseContext) {
  if(hasDirectionalNumberControls(query))return {...unavailable(query,'输入含影响显示顺序的不可见控制字符，无法安全解释数值；请清除这些字符后重试。',false),
    querySpec:{version:1,text:query,requirements:[],unresolved:[{source:{text:query,start:0,end:query.length,origin:'rule'},reason:'输入含不可见的方向控制字符，尚未解释其数值',kind:'clarification'}]},
    _debug:{llmCalled:false,llmSucceeded:false,planStatus:'unavailable',failureStage:'input_validation'}};
  const normalizedInput=normalizeEngineeringInput(query);
  let faeResearch:FaeResearch|undefined;
  let immutableContract=frozen?.understanding?structuredClone(frozen.understanding):undefined;
  const agentMode=process.env.FAE_AGENT_RETRIEVAL_ENABLED==='1'&&process.env.FAE_RESEARCH_LOOP_ENABLED==='1';
  const agent:AgentRetrieval|undefined=agentMode?{prioritized:new Set(),executionReuse,beforeScreening:async(u)=>{
    immutableContract ||= structuredClone(u);
    onContract?.(u); // Publish before request/vendor-scoped research and repair.
    const products=loadAllVendors(releaseId).filter(v=>(!vendor||vendor===v.slug||manufacturerGroup(v.slug)===vendor)&&manufacturerScopeAllows(v.slug,u))
      .flatMap(v=>v.products.filter(p=>p._selection_status!=='identity_unverified').map(p=>({...p,__vendor:v.slug})));
    faeResearch=await runFaeResearch({query:normalizedInput,understanding:u,documents:loadWikiDocuments(releaseId),products,key,fetcher,knowledgeIndex:loadProductKnowledge(releaseId),
      initial:{phase:'before_candidate_screening',instruction:'尚未执行字段筛选。依据完整需求主动检索全厂商资料、读取具体型号与脚注；字段暂不可表达的条件也继续查证，不能先认定没有候选。读取结果用于后续候选优先审阅，仍需逐条件核验。'},
      online:process.env.ONLINE_EVIDENCE_ENABLED==='1'&&process.env.ONLINE_EVIDENCE_TOKEN?manufacturerResearch(releaseId,u,products,fetcher):undefined});
    for(const ref of faeResearch.references){
      if(ref.pn&&ref.vendor&&products.some(p=>(p as Record<string,unknown>).part_number===ref.pn&&p.__vendor===ref.vendor))agent!.prioritized.add(`${ref.vendor}:${ref.pn}`);
      for(const mention of ref.modelMentions||[])if(products.some(p=>(p as Record<string,unknown>).part_number===mention.pn&&p.__vendor===mention.vendor))agent!.prioritized.add(`${mention.vendor}:${mention.pn}`);
    }
    const revised=await researchDirection(normalizedInput,u,faeResearch,key,fetcher);
    return revised&&JSON.stringify(revised.requirements)===JSON.stringify(u.requirements)?revised:u;
  }}:undefined;
  let r=await searchNormalizedWholeQuery(normalizedInput,releaseId,vendor,key,fetcher,frozen?{understanding:structuredClone(frozen.understanding),seedPlan:agentMode?undefined:structuredClone(frozen.plan),reviewLimit:4}:undefined,agent,u=>{immutableContract ||= structuredClone(u);});
  if(!agentMode&&'engineeringUnderstanding'in r&&r.engineeringUnderstanding)onContract?.(r.engineeringUnderstanding,'executionAudit'in r&&r.executionAudit?.status==='partial'?undefined:'executionPlan'in r?r.executionPlan:undefined);
  const understanding='engineeringUnderstanding'in r?r.engineeringUnderstanding:null;
  if(!agentMode&&process.env.FAE_RESEARCH_LOOP_ENABLED==='1'&&understanding&&understanding.taskKind!=='clarification'&&!hasFullyProvenCandidate(r)&&(r.querySpec.unresolved.length||!r.results.length||'researchLeads'in r&&r.researchLeads.length)){
    try{
      const products=loadAllVendors(releaseId).filter(v=>(!vendor||vendor===v.slug||manufacturerGroup(v.slug)===vendor)&&(!('engineeringUnderstanding'in r)||!r.engineeringUnderstanding||manufacturerScopeAllows(v.slug,r.engineeringUnderstanding)))
        .flatMap(v=>v.products.filter(p=>p._selection_status!=='identity_unverified').map(p=>({...p,__vendor:v.slug})));
      const initial={summary:r.constraintBanner,candidates:coverGroups(r.results,4,p=>manufacturerGroup(p.vendor)).map(p=>({pn:p.pn,vendor:p.vendor})),
        researchLeads:'researchLeads'in r?coverGroups(r.researchLeads,4,p=>manufacturerGroup(p.vendor)).map(p=>({pn:p.pn,vendor:p.vendor,reason:p.reason})):[],
        excluded:'screeningExcluded'in r?coverGroups(r.screeningExcluded,4,p=>manufacturerGroup(p.vendor)).map(p=>({pn:p.pn,vendor:p.vendor,reasons:p.reasons})):[],
        gaps:r.querySpec.unresolved.slice(0,10).map(g=>({source:g.source.text,reason:g.reason}))};
      faeResearch=await runFaeResearch({query:normalizedInput,understanding,documents:loadWikiDocuments(releaseId),products,initial,key,fetcher,knowledgeIndex:loadProductKnowledge(releaseId),
        online:process.env.ONLINE_EVIDENCE_ENABLED==='1'&&process.env.ONLINE_EVIDENCE_TOKEN?manufacturerResearch(releaseId,understanding,products,fetcher):undefined});
      const revised=await researchDirection(normalizedInput,understanding,faeResearch,key,fetcher);
      if(revised){
        const retried=await searchNormalizedWholeQuery(normalizedInput,releaseId,vendor,key,fetcher,{understanding:revised,reviewLimit:2});
        if(retried._debug.planStatus==='validated'&&'engineeringUnderstanding'in retried&&JSON.stringify(retried.engineeringUnderstanding?.requirements)===JSON.stringify(understanding.requirements)){
          r=retried;faeResearch.rerunApplied=true;
        }else faeResearch.directionStatus='新增方向复查未完成，保留原检索结果';
      }
    }catch{faeResearch={status:'unavailable',summary:'本次资料研究未完成；原检索结果及原始条件保持。',rounds:0,trace:[],findings:[],references:[]};}
  }
  // Independent research findings must reach the affected card, not remain buried in prose.
  // One deterministic re-screen after independent source review. Reuse the
  // same frozen meaning/plan and original model evidence review: no new model
  // interpretation, no catalog mutation, no promotion of source_support to fact.
  if(faeResearch?.findingsReview==='reviewed'&&'engineeringUnderstanding'in r&&r.engineeringUnderstanding&&'engineeringReview'in r&&r.engineeringReview&&'executionPlan'in r&&r.results.length===0){
    const reconciled=reconcileReviewWithResearch(r.engineeringReview,faeResearch);
    if(reconciled.changed.length){
      const rescored=await searchNormalizedWholeQuery(normalizedInput,releaseId,vendor,key,fetcher,{understanding:r.engineeringUnderstanding,reviewLimit:0,
        seedPlan:r.executionPlan,seedReview:reconciled.review});
      const allowed=new Set(reconciled.changed),restored=rescored.results.filter(row=>allowed.has(`${row.vendor}:${row.pn}`));
      if(restored.length&&'executionPlan'in rescored&&'sourceAccess'in rescored)r={...rescored,results:restored,sourceAccess:{...rescored.sourceAccess,selectedCandidates:restored.length}};
    }
  }
  const feedbackProducts=faeResearch||understanding&&r.results.length?new Map(loadAllVendors(releaseId).flatMap(v=>v.products.map(p=>[`${v.slug}:${p.part_number}`,{...p,__vendor:v.slug}] as const))):new Map();
  const feedbackRows=r.results.map(row=>{
    const feedback=faeResearch&&understanding?researchConflictChecks(understanding,faeResearch,String(row.pn),String(row.vendor),feedbackProducts.get(`${row.vendor}:${row.pn}`)):[];
    if(!feedback.length)return row;
    const product=feedbackProducts.get(`${row.vendor}:${row.pn}`);
    if(understanding&&product&&'requirementLedger'in row&&row.requirementLedger){
      const previous=row.requirementLedger;
      const ledger=buildRequirementLedger({understanding,releaseId,product,coverage:previous.coverage,checks:[...previous.observations,...feedback],
        queryRequirements:r.querySpec.requirements.filter(q=>q.id.startsWith(`plan-${row.branch}-`)),parameterChecks:row.parameterChecks,
        review:'engineeringReview'in r?r.engineeringReview?.candidates.find(c=>c.pn===row.pn&&c.vendor===row.vendor):undefined,
        execution:'executionAudit'in r?r.executionAudit?.items.filter(e=>e.branch===row.branch):undefined});
      const pendingChecks=ledgerChecks(ledger);
      return {...row,requirementLedger:ledger,tier:pendingChecks.some(c=>c.blocksMatch&&c.status!=='supported')?2:1,pendingChecks};
    }
    return {...row,tier:feedback.some(c=>c.blocksMatch)?2:row.tier,pendingChecks:[...row.pendingChecks,...feedback]};
  });
  // The final guard reprojects the ledger and reapplies evidence coverage ranking after feedback.
  const hasResearchRisk=feedbackRows.some(row=>row.pendingChecks.some(c=>c.blocksMatch&&c.attention==='possible_mismatch'));
  const result={...r,...(agentMode?{agentRetrieval:{phase:'before_screening',status:faeResearch?.status||'not_started',prioritizedModels:[...agent!.prioritized]}}:{}),results:feedbackRows,...(hasResearchRisk?{confidence:'medium',constraintBanner:r.constraintBanner+' 资料独立复核发现可能不满足的型号，已降级并后置，具体冲突与原文见卡片。'}:{}),...(faeResearch?{faeResearch}:{}),...('researchLeads'in r?{researchLeads:r.researchLeads.map(lead=>({...lead,pendingChecks:faeResearch&&understanding?researchConflictChecks(understanding,faeResearch,lead.pn,lead.vendor,feedbackProducts.get(`${lead.vendor}:${lead.pn}`)):[]}))}:{})};
  const finalized=finalizeSelectionIntegrity(result,releaseId,immutableContract||understanding,(vendor,pn)=>{const product=feedbackProducts.get(`${vendor}:${pn}`);return product?sourceFactsForProduct(product).map(f=>f.source):[];});
  return normalizedInput===query?finalized:{...finalized,querySpec:{...r.querySpec,originalText:query,inputNormalization:'已按兼容白名单处理全角字符、排版空白、工程连字符/比较符、数值链接与转义；原文保留在originalText，偏移位置对应规范化text'}};
}
type AgentRetrieval={executionReuse?:ExecutionReuseContext;prioritized:Set<string>;beforeScreening:(u:EngineeringUnderstanding)=>Promise<EngineeringUnderstanding>};
export async function searchNormalizedWholeQuery(query: string, releaseId: string, vendor: string | null, key: string, fetcher: typeof fetch, moduleContext?:{understanding:EngineeringUnderstanding;reviewLimit:number;seedPlan?:WholeQueryPlan;seedReview?:EngineeringReview},agent?:AgentRetrieval,contractSink?:(u:EngineeringUnderstanding)=>void) {
  const knowledge=loadProductKnowledge(releaseId);
  let wikiContext: ReturnType<typeof buildWikiLLMContext> = [];
  try { wikiContext = buildWikiLLMContext(searchWikiDocuments(query, loadWikiDocuments(releaseId), 3)); }
  catch { /* Missing Wiki context cannot create product evidence. */ }
  const engineeringEnabled = process.env.FAE_ENGINEERING_PIPELINE_ENABLED === '1';
  const parameterDefinitions = Object.fromEntries(Object.entries(PARAMETERS).map(([id,p])=>[id,{label:p.label,unit:p.unit,defaultOperator:p.defaultOperator}]));
  let engineeringUnderstanding: EngineeringUnderstanding | null = moduleContext?.understanding||null;
  if(engineeringEnabled&&!engineeringUnderstanding){
    const packetContext=searchProductKnowledge(knowledge,query,5).map(({packet:p})=>({productPacket:packetSummary(p),facts:packetFacts(p,query,6).map(f=>({id:f.id,header:f.publishedHeader||f.field,value:f.publishedValue,condition:f.evidence.condition,source:f.source})),documents:p.documents.slice(0,4)}));
    try { engineeringUnderstanding = await understandEngineering(query,key,fetcher,parameterDefinitions,[...new Set(loadAllVendors(releaseId).flatMap(v=>v.products.map(p=>String(p._section||''))).filter(Boolean))],[...wikiContext,...packetContext]); }
    catch(error) {
      const failure=error instanceof EngineeringStageError?error:new EngineeringStageError('transport');
      const received=['reply_format','understanding_validation','semantic_validation'].includes(failure.kind);
      const omissions=failure.validationIssues?.filter(issue=>issue.startsWith('原始条件未被'))||[];
      return {...unavailable(query,failure.kind==='semantic_validation'?`工程理解的独立语义复核尚未通过，暂未执行型号筛选：${(failure.validationIssues||[]).join('；')}`:received?(omissions.length?`模型已返回，但以下条件仍未完整纳入工程理解，已停止型号筛选：${omissions.join('；')}`:'模型已返回，但工程需求的结构或原句来源尚未通过校验，未执行型号筛选；这不是网络连接失败。'):failure.kind==='http'?modelServiceFailure(failure.status):'工程需求理解请求未完成，可能是连接或超时，请重试；尚未执行型号筛选。',true),
        _debug:{llmCalled:true,llmSucceeded:received,planStatus:'unavailable',failureStage:'engineering_understanding',engineeringFailureKind:failure.kind,validationIssues:failure.validationIssues,httpStatus:failure.status}};
    }
    if(!engineeringUnderstanding)return unavailable(query,'工程需求理解尚未完成，未执行型号筛选。',true);
  }
  if(agent&&engineeringUnderstanding&&engineeringUnderstanding.taskKind!=='clarification'){
    try{engineeringUnderstanding=await agent.beforeScreening(engineeringUnderstanding);}catch{/* Failure cannot relax the original engineering contract. */}
  }
  if(engineeringEnabled&&engineeringUnderstanding){
    contractSink?.(structuredClone(engineeringUnderstanding));
    const boundaries=engineeringBoundaries(engineeringUnderstanding);
    if(boundaries.length){
      const base=understoodWithoutScreening(query,engineeringUnderstanding,boundaries);
      if(boundaries.every(b=>b.code==='circuit_only')){
        const sections=[...new Set(loadAllVendors(releaseId).flatMap(v=>v.products.map(p=>String(p._section||''))).filter(Boolean))];
        const componentSearch=await screenEngineeringModules(engineeringUnderstanding,sections,key,fetcher,
          async(childQuery,childUnderstanding,reviewLimit):Promise<unknown>=>{
            const child=await searchNormalizedWholeQuery(childQuery,releaseId,vendor,key,fetcher,{understanding:childUnderstanding,reviewLimit});
            return finalizeSelectionIntegrity(child,releaseId,childUnderstanding,(slug,pn)=>{const p=loadAllVendors(releaseId).find(v=>v.slug===slug)?.products.find(p=>p.part_number===pn);return p?sourceFactsForProduct({...p,__vendor:slug}).map(f=>f.source):[];});
          });
        return {...base,componentSearch,
          constraintBanner:componentSearch.status==='screened'?'已按功能模块分别检索资料候选；模块之间的连接、功率、隔离结构和系统试验仍须核验。这些候选不表示整套方案已满足。':base.constraintBanner,
          _debug:{llmCalled:true,llmSucceeded:true,planStatus:componentSearch.status==='screened'?'component_screening':'engineering_only',screeningStatus:componentSearch.status==='screened'?'component_only':'not_executed'}};
      }
      return base;
    }
  }
  const seedPlan=moduleContext?.seedPlan?checkedWholeQueryPlan(moduleContext.seedPlan,query):null;
  let plan: ReturnType<typeof checkedWholeQueryPlan> = seedPlan;
  let retainedPartial: ReturnType<typeof checkedWholeQueryPlan> = null;
  let retainedMappingIssues: string[] = [];
  let mappingIssues: string[] = [];
  let previousOutput = '';
  let planningAttempts = 0;
  let semanticAuthority:PlanSemanticAuthority|undefined;let conflictResolutionAttempted=false;
  let validationIssues: string[] = [];
  const planningIssues: { attempt: number; issues: string[] }[] = [];
  const outputRepairs: {attempt:number;kind:string}[] = [];
  for (let attempt = 0; attempt < (seedPlan?0:2); attempt++) {
    planningAttempts++;
    let raw: unknown;
    try {
      const response = await fetcher('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ ...deepSeekRequestOptions(), temperature: 0.1, max_tokens: 3200, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: engineeringUnderstanding ? ENGINEERING_ADAPTER_PROMPT : PROMPT }, { role: 'user', content: JSON.stringify({
            query, allowedTags: [...getAllKnownTags()], parameterFields: Object.keys(PARAMETERS),
            parameterDefinitions, ...(engineeringUnderstanding ? {} : {wikiContext}),
            ...(engineeringUnderstanding ? {engineeringUnderstanding,numericSourceHints:engineeringNumericSourceHints(engineeringUnderstanding),planningContract:'只适配这份工程契约，不重新理解原句。无法映射的条件保留待核，不改变对象、关系或方案。'} : {}),
            ...(attempt ? { validationIssues, previousOutput: previousOutput.slice(0, 7000), repair: '计划未通过校验。重新核对完整原句：器件角色、用途、每项数值和非数值诉求、否定、偏好及替代关系都要保留。source必须是连续原文；隐含品类用device_role和reason标为假设；中文数量、单位、上下限及参数角色不可丢失。无法表达或存在歧义的内容放unresolved，不能发明标签、数值或用户意图。' } : {}),
          }) }] }),
      });
      if (!response.ok) throw new EngineeringStageError('http',response.status);
      const content = (await response.json()).choices?.[0]?.message?.content;
      previousOutput = typeof content === 'string' ? content : '';
      const parsed = parsePlanContent(previousOutput);raw = parsed.value;
      if(parsed.repair)outputRepairs.push({attempt:planningAttempts,kind:parsed.repair});
    } catch(error) {
      if(retainedPartial){plan=retainedPartial;mappingIssues=retainedMappingIssues;break;}
      const status=error instanceof EngineeringStageError?error.status:undefined;
      const message=modelServiceFailure(status);
      if(engineeringUnderstanding)return {...understoodWithoutScreening(query,engineeringUnderstanding,[{code:'planning_request',reason:`工程理解已保留，但检索规划请求未完成。${message}`}]),
        _debug:{llmCalled:true,llmSucceeded:true,planningSucceeded:false,planStatus:'engineering_only',screeningStatus:'not_executed',failureStage:'planning_transport',httpStatus:status,planningAttempts}};
      return { ...unavailable(query,message,true),
        _debug: { llmCalled: true, llmSucceeded: false, planStatus: 'unavailable', failureStage: 'transport',httpStatus:status, planningAttempts } };
    }
    if(engineeringUnderstanding){
      let adapted=adaptEngineeringPlan(completePlanContainers(raw),engineeringUnderstanding,query,semanticAuthority);
      if(agent&&adapted.plan&&adapted.retryNeeded&&!conflictResolutionAttempted&&auditRequirementExecution(engineeringUnderstanding,adapted.plan).status==='partial'){
        conflictResolutionAttempted=true;
        try{const resolved=await resolveMappingConflicts(query,engineeringUnderstanding,adapted.plan,raw,key,fetcher,agent.executionReuse);
          if(resolved){engineeringUnderstanding=resolved.understanding;semanticAuthority=resolved.authority;
            if(raw&&typeof raw==='object'&&Array.isArray((raw as {mappings?:unknown}).mappings)){const deferred=new Set(resolved.resolutions.filter(x=>x.decision==='document').map(x=>x.requirementId));
              raw={...raw,mappings:((raw as {mappings:{requirementId?:string}[]}).mappings).filter(m=>!deferred.has(m.requirementId||''))};}
            adapted=adaptEngineeringPlan(completePlanContainers(raw),engineeringUnderstanding,query,semanticAuthority);}
        }catch{/* Preserve explicit failure; never convert a failed repair into a match. */}
      }
      plan=adapted.plan;validationIssues=adapted.issues;
      if(validationIssues.length)planningIssues.push({attempt:planningAttempts,issues:validationIssues});
      if(plan){
        // Retry a partial mapping once, then retain independently validated conditions.
        mappingIssues=validationIssues;
        if(adapted.retryNeeded&&attempt===0){retainedPartial=plan;retainedMappingIssues=validationIssues;continue;}
        break;
      }
      continue;
    }
    const normalized = conservativeWholeQueryPlan(raw, query);
    plan = checkedWholeQueryPlan(normalized, query);
    if (!plan) { validationIssues = wholeQueryPlanIssues(normalized, query); planningIssues.push({attempt: planningAttempts, issues: validationIssues}); }
    if (plan) break;
  }
  if(!plan&&retainedPartial){plan=retainedPartial;mappingIssues=retainedMappingIssues;}
  if(!plan&&engineeringUnderstanding&&!moduleContext&&engineeringUnderstanding.architectures.some(a=>a.kind==='circuit')){
    const base=understoodWithoutScreening(query,engineeringUnderstanding,[{code:'plan_representation',reason:'整套检索计划无法安全表达，已转为独立功能模块初筛；系统要求仍完整保留。'}]);
    const sections=[...new Set(loadAllVendors(releaseId).flatMap(v=>v.products.map(p=>String(p._section||''))).filter(Boolean))];
    const componentSearch=await screenEngineeringModules(engineeringUnderstanding,sections,key,fetcher,
      async(childQuery,childUnderstanding,reviewLimit):Promise<unknown>=>{
            const child=await searchNormalizedWholeQuery(childQuery,releaseId,vendor,key,fetcher,{understanding:childUnderstanding,reviewLimit});
            return finalizeSelectionIntegrity(child,releaseId,childUnderstanding,(slug,pn)=>{const p=loadAllVendors(releaseId).find(v=>v.slug===slug)?.products.find(p=>p.part_number===pn);return p?sourceFactsForProduct({...p,__vendor:slug}).map(f=>f.source):[];});
          });
    return {...base,componentSearch,
      constraintBanner:componentSearch.status==='screened'?'整套需求已按功能模块继续初筛；模块之间的连接、功率、隔离结构和系统试验仍须核验，不能把模块候选当成整套合格方案。':base.constraintBanner,
      _debug:{llmCalled:true,llmSucceeded:true,planStatus:componentSearch.status==='screened'?'component_screening':'engineering_only',screeningStatus:componentSearch.status==='screened'?'component_only':'not_executed',planningAttempts,planningIssues,outputRepairs}};
  }
  if(!plan&&engineeringUnderstanding)return {...understoodWithoutScreening(query,engineeringUnderstanding,[{code:'plan_representation',reason:'模型已完成工程理解，但检索计划经修复仍无法安全表达全部约束；已保留原句及对象/工况，不执行不可靠的型号筛选。'}]),
    _debug:{llmCalled:true,llmSucceeded:true,planStatus:'engineering_only',screeningStatus:'not_executed',failureStage:'plan_validation',planningAttempts,planningIssues,outputRepairs}};
  if (!plan) return { ...unavailable(query, '需求计划经一次修复仍未通过校验；原句条件已保留，尚不能判断有无符合型号。', true),
    engineeringUnderstanding, _debug: { llmCalled: true, llmSucceeded: true, planStatus: 'unavailable', failureStage: 'plan_validation', planningAttempts, planningIssues, outputRepairs } };
  // Respect the converter class the customer actually named. A proposed
  // topology remains available in the engineering architecture for review.
  plan=keepExplicitConverterClass(query,plan);
  // Run across every category. A validated JSON plan may still omit prose requirements.
  const representedSources = [...plan.branches.flatMap(branch => [
    ...[...branch.must, ...branch.nice].filter(item => !item.inference).flatMap(item =>
      /[，,；;。\n]/.test(item.source) ? [] : [item.source]),
    ...(branch.parameters || []).flatMap(item => item.source.split(/[，,；;。\n]/).filter(part => /\d/.test(part))),
  ]), ...plan.exclude.map(item => item.source), ...(plan.waived || []).map(item => item.source),
  ...plan.unresolved.map(item => item.source), ...(plan.contexts || []).map(item => item.source)];
  // The audited engineering contract already owns coverage. A second lexical
  // pass must not turn a fulfilled compound requirement back into missing text.
  const residuals = engineeringUnderstanding ? [] : uncoveredIntent(query, representedSources);
  plan = { ...plan, unresolved: [...plan.unresolved, ...residuals.map(source => ({ source,
    reason: '这段原句尚未完整表达为可核验条件；保留待核，不能视为已满足', role: 'capability' as const }))] };
  let plannedWikiHits: ReturnType<typeof searchWikiDocuments> = [];
  try {
    const terms = plan.branches.flatMap(branch => [
      ...branch.must.map(item => item.tag), ...(branch.parameters || []).map(item => item.field),
    ]);
    plannedWikiHits = searchWikiDocuments(`${query} ${[...new Set(terms)].join(' ')}`,
      loadWikiDocuments(releaseId), 5);
  } catch { /* Catalog facts remain independently available. */ }

  if(engineeringUnderstanding?.architectures.some(a=>a.kind==='single_device'&&/分流|电流监测|功率监测/i.test(a.name)) &&
      engineeringUnderstanding.requirements.some(r=>r.necessity!=='preferred'&&/^(?:.*(?:串|串联)|采用|外置)?(?:分流电阻|采样电阻)$/.test(r.source)&&!/不|无需/.test(r.source)) &&
      engineeringUnderstanding.requirements.some(r=>r.necessity!=='preferred'&&/I2C|SMBus/i.test(r.source)&&!/不需要|无需|不支持/.test(r.source))){
    plan={...plan,branches:plan.branches.map(b=>({...b,must:b.must.map(t=>t.inference==='device_role'&&t.tag==='电流传感器'?{...t,tag:'数字功率监测器'}:t)}))};
  }
  const products: ConstraintProduct[] = loadAllVendors(releaseId).flatMap(v => {
    const group = manufacturerGroup(v.slug);
    if (vendor && vendor !== v.slug && vendor !== group || engineeringUnderstanding&&!manufacturerScopeAllows(v.slug,engineeringUnderstanding)) return [];
    return v.products.filter(p => p._selection_status !== 'identity_unverified')
      .map(p => ({ ...p, __vendor: v.slug, _features: '', _detail_intro: '',
        _detail_features: '', _detail_apps: '' }));
  }).filter(p => !matchesExplicitExclusion(p, plan.exclude.map(item => item.tag)));

  const executionAudit=engineeringUnderstanding?auditRequirementExecution(engineeringUnderstanding,plan):undefined;
  const querySpec = planQuerySpec(query, plan);
  const genericMotor = plan.branches.some(b=>b.must.some(t=>t.tag==='马达驱动'))
    && !/直流|有刷|无刷|步进|三相|BLDC|brushed|brushless|stepper/i.test(query);
  const motorWord = query.match(/电机|马达|motor/i)?.[0];
  const motorSource = motorWord&&query.indexOf(motorWord)===query.lastIndexOf(motorWord)?motorWord:query;
  const motorTypeGap = genericMotor ? {source:motorSource,
    reason:'电机负载类型尚未明确，有刷、步进与三相无刷需要不同驱动方式；当前先核验已给参数，负载类型适配仍待核验'} : null;
  if(motorTypeGap)querySpec.unresolved.push({source:{text:motorSource,start:query.indexOf(motorSource),end:query.indexOf(motorSource)+motorSource.length,origin:'model'},reason:motorTypeGap.reason,kind:'clarification'});

  const chosen = new Map<string, PlannedCandidate>();
  // Missing a core field prevents a match, not inspection of the underlying
  // source. Keep a separate, bounded research lane for evidence review.
  const research = new Map<string, PlannedCandidate>();
  const sourceAccess = {catalogProducts:products.length,categoryProducts:0,coreEvidenceGaps:0,
    selectedCandidates:0,researchLeads:0,reviewedCandidates:0,reviewFactCount:0};
  const rejected = new Map<string, { pn: string; vendor: string; reasons: string[]; evidence: VerifiedSource[] }>();
  for (const [index, branch] of plan.branches.entries()) {
    const branchRequirements = querySpec.requirements.filter(item => item.id.startsWith(`plan-${index}-`));
    if(engineeringUnderstanding && executionAudit){
      for(const screen of pendingNumericScreens(engineeringUnderstanding,plan,index,query)){
        branchRequirements.push(screen);
        const audit=executionAudit.items.find(item=>item.branch===index&&item.requirementId===screen.engineeringRequirementId);
        if(audit){
          audit.numericPrescreen=screen.tag;
          audit.reason+='；已按型号参数初筛 '+screen.tag+'，完整工况仍需核验';
        }
      }
    }
    const must = [...new Set(branchRequirements.filter(item => item.strength === 'must').map(item => item.tag))];
    const nice = [...new Set(branchRequirements.filter(item => item.strength === 'nice').map(item => item.tag))];
    if (!must.length) continue;
    // Model-proposed chapter names are navigation hints, never an exhaustive catalog boundary.
    // MCU peripherals are capabilities of the MCU, not standalone transceiver candidates.
    const branchProducts=products.filter(p=>matchesMainDeviceIdentity(p,branch.must.map(t=>t.tag)));
    const focus=mandatoryIdentity(engineeringUnderstanding||undefined,branch.must.map(t=>t.tag));
    const focused=focus?branchProducts.filter(p=>provesIdentity(p,focus)):[];
    const scored = scoreByConstraints(focus?focused:branchProducts, must, nice, must.map(tag => planMeta(tag,
      branchRequirements.find(item => item.tag === tag))), query);
    // Record hard row conflicts even when a different missing condition would
    // otherwise send the part straight to research. Keep alternatives branch-local.
    const rowChecks=new Map<typeof scored[number],PendingEvidenceCheck[]>();
    const eligible=scored.filter(item=>{
      if(!engineeringUnderstanding||!item.categoryHit)return true;
      const checks=catalogRowChecks(item.product,engineeringUnderstanding);
      rowChecks.set(item,checks);
      const conflicts=checks.filter(c=>c.blocksMatch&&c.status==='contradicted');
      if(!conflicts.length)return true;
      const {part_number,__vendor}=item.product;
      rejected.set(`${__vendor}:${part_number}`,{pn:String(part_number),vendor:String(__vendor),
        reasons:conflicts.map(c=>c.reason),evidence:conflicts.flatMap(c=>c.evidence)});
      return false;
    });
    sourceAccess.categoryProducts += scored.filter(item=>item.categoryHit).length;
    for(const score of eligible.filter(item=>item.categoryHit&&!item.fullMatch&&!supportedPartialLead(item,branchRequirements)
      &&item.mustMiss.length>0&&item.mustMiss.every(tag=>item.mustUnknown.includes(tag)))){
      sourceAccess.coreEvidenceGaps++;
      const pendingChecks=evaluatePendingEvidence(score.product,plan,index,engineeringUnderstanding||undefined);
      if(!pendingChecks.some(c=>c.blocksMatch&&c.status==='contradicted')&&sourceFactsForProduct(score.product).length){
        const id=`${score.product.__vendor}:${score.product.part_number}`;
        if(!research.has(id)||research.get(id)!.score.score<score.score)research.set(id,{score,branch:index,pendingChecks});
      }
    }
    for (const score of eligible.filter(item => item.categoryHit)) {
      const failed = score.mustMiss.filter(tag => !score.mustUnknown.includes(tag));
      const proven = failed.flatMap(tag => {
        const check = score.parameterChecks[tag];
        const evidence = check?.evidence.flatMap(f => f.source.verified ? [f.source.verified] : []) || [];
        return check?.status === 'unmatched' && evidence.length ? [{tag,check,evidence}] : [];
      });
      if (proven.length) rejected.set(`${score.product.__vendor}:${score.product.part_number}`, {
        pn: String(score.product.part_number), vendor: String(score.product.__vendor),
        reasons: proven.map(({tag,check}) => `${tag}：原表${check.evidence.map(f=>`${f.source.field}=${f.source.raw}`).join('；')}；${check.reason}`),
        evidence: proven.flatMap(p=>p.evidence),
      });
    }
    // Include an exact research hit for adjudication even if its numeric screen is
    // incomplete. It still needs the right primary class and positive row evidence.
    const ranked = eligible.filter(item => item.fullMatch || supportedPartialLead(item, branchRequirements)
      || item.categoryHit && agent?.prioritized.has(`${item.product.__vendor}:${item.product.part_number}`)
        && item.mustMiss.every(tag=>item.mustUnknown.includes(tag)) && engineeringUnderstanding
        && rowChecks.get(item)?.some(c=>c.blocksMatch&&c.status==='supported'&&c.proofKey==='catalog.completeClause'))
      .sort((a,b)=>Number(agent?.prioritized.has(`${b.product.__vendor}:${b.product.part_number}`))-Number(agent?.prioritized.has(`${a.product.__vendor}:${a.product.part_number}`))||b.score-a.score);
    for (const score of ranked) {
      const id = `${score.product.__vendor}:${score.product.part_number}`;
      const pendingChecks = evaluatePendingEvidence(score.product, plan, index,engineeringUnderstanding||undefined);
      if(engineeringUnderstanding)pendingChecks.push(...(rowChecks.get(score)??catalogRowChecks(score.product,engineeringUnderstanding)));
      if(motorTypeGap)pendingChecks.push({...motorTypeGap,status:'unknown',blocksMatch:true,statusText:'负载类型适配待核验',evidence:[]});
      for (const tag of score.mustUnknown) {
        const requirement = branchRequirements.find(item => item.tag === tag);
        const check = score.parameterChecks[tag];
        const boundRequirement=engineeringUnderstanding?.requirements.find(r=>r.id===requirement?.engineeringRequirementId);
        const source = boundRequirement?.source||requirement?.source?.text || tag;
        const adjustable = requirement?.field==='vout' && requirement.values?.length===1 ? adjustableOutputFact(score.product) : undefined;
        const iqReference = requirement?.field==='iq'&&['lte','lt'].includes(requirement.operator||'')
          &&check?.evidence.length&&check.evidence.every(f=>f.statistic!=='max'&&f.shape!=='range');
        const peak = requirement?.field==='iout' ? sourceFactsForProduct(score.product).filter(f=>f.field==='peak_current_a'&&/^\d+(?:\.\d+)?$/.test(f.publishedValue||'')) : [];

        if (!pendingChecks.some(item => item.source === source)) pendingChecks.push({ source,...(boundRequirement?{requirementId:boundRequirement.id,authority:'program' as const}:{}),status: 'unknown', blocksMatch: true,
          ...(iqReference?{statusText:'已有Iq参考值，最大保证待核',recommendationRank:check!.evidence.every(f=>f.values.every(v=>v<=requirement!.values![0]))?1:0}:{}),
          reason: adjustable ? `目录仅列可调输出，需核对输出调节范围是否覆盖 ${requirement!.values![0]} V` : peak.length ? '已有峰值电流线索，但额定／持续输出电流尚未证实；不能把峰值当作持续能力' : check?.reason || '缺少该具体型号的已审阅来源，不能判断满足',
          observed: adjustable ? '原表输出电压：可调输出' : peak.length ? `原表峰值电流：${peak.map(f=>f.publishedValue).join('/')}A` : check?.evidence.map(f => `${f.source.field}：${f.source.raw}`).join('；') || undefined,
          evidence: adjustable ? [adjustable.source] : peak.length ? peak.map(f=>f.source) : check?.evidence.flatMap(f => f.source.verified ? [f.source.verified] : []) || [] });
      }
      for (const hypothesis of branch.must.filter(item => item.inference === 'device_role')) {
        pendingChecks.push({ source: hypothesis.source, summaryOfRequirementIds:engineeringUnderstanding?.requirements.map(r=>r.id), status: 'unknown', blocksMatch: true, statusText: '按用途提供的候选方向',
          reason: `器件品类仍是搜索假设：${hypothesis.tag}。${hypothesis.reason}；已按这一方向继续检索，这不是对原句数值条件的否定，最终方案仍按逐型号参数与应用证据核验`, evidence: [] });
      }
      if(engineeringUnderstanding)pendingChecks.push(...evaluateEvidenceQueries(score.product,engineeringUnderstanding));
      const conflicts = pendingChecks.filter(check => check.blocksMatch && check.status === 'contradicted');
      if (conflicts.length) {
        rejected.set(id, { pn: String(score.product.part_number), vendor: String(score.product.__vendor),
          reasons: conflicts.map(check => check.reason), evidence: conflicts.flatMap(check => check.evidence) });
        continue;
      }
      const complete = !pendingChecks.some(check => check.blocksMatch && check.status !== 'supported');
      const previous = chosen.get(id);
      const previousComplete = previous && !previous.pendingChecks.some(check => check.blocksMatch && check.status !== 'supported');
      if (!previous || complete && !previousComplete || complete === previousComplete && previous.score.score < score.score) {
        const requirementLedger=engineeringUnderstanding?buildRequirementLedger({understanding:engineeringUnderstanding,releaseId,product:score.product,checks:pendingChecks,
          queryRequirements:querySpec.requirements,parameterChecks:score.parameterChecks,execution:executionAudit?.items.filter(e=>e.branch===index)}):undefined;
        chosen.set(id, { score, branch: index, pendingChecks,requirementLedger });
      }
    }
  }
  const screeningExcluded = [...rejected].filter(([id]) => !chosen.has(id)).map(([, item]) => item);
  const rank = (a: PlannedCandidate, b: PlannedCandidate) => compareEvidenceCoverage(a,b)
      || Math.max(0,...b.pendingChecks.map(c=>c.recommendationRank||0)) - Math.max(0,...a.pendingChecks.map(c=>c.recommendationRank||0))
      || requirementEvidenceRelevance(b.score.product,engineeringUnderstanding?.requirements.map(r=>r.source)||[query])-requirementEvidenceRelevance(a.score.product,engineeringUnderstanding?.requirements.map(r=>r.source)||[query])
      || b.score.score - a.score.score;
  const ordered = orderComparableReadings([...chosen.values()].sort(rank));
  const branchMatchCounts = plan.branches.map((_, index) => ordered.filter(item => item.branch === index).length);
  // Keep a small number of evidenced candidates from each requested option.
  // A populous Buck branch must not hide a viable LDO alternative at page one.
  const reserved = plan.branches.flatMap((_, index) => ordered.filter(item => item.branch === index).slice(0, 3));
  const selected = coverGroups([...new Set([...reserved,...ordered])],30,item=>`${item.branch}:${manufacturerGroup(item.score.product.__vendor)}`)
    .sort(rank);
  const retrievalCoverage={eligible:ordered.length,retained:selected.length,limit:30,manufacturerGroups:new Set(ordered.map(i=>manufacturerGroup(i.score.product.__vendor))).size,retainedManufacturerGroups:new Set(selected.map(i=>manufacturerGroup(i.score.product.__vendor))).size};
  const reviewLimit=moduleContext?.reviewLimit??4;
  const researchSelected=engineeringUnderstanding?[...research.entries()].filter(([id])=>!chosen.has(id)&&!rejected.has(id))
    .map(([,item])=>item).sort((a,b)=>b.score.score-a.score.score).slice(0,Math.min(2,Math.max(0,reviewLimit-selected.length))):[];
  const reviewCandidates=coverGroups(selected,reviewLimit,item=>`${item.branch}:${manufacturerGroup(item.score.product.__vendor)}`);
  const reviewInputs=[...reviewCandidates,...researchSelected];
  sourceAccess.selectedCandidates=selected.length;
  sourceAccess.researchLeads=researchSelected.length;
  sourceAccess.reviewFactCount=engineeringUnderstanding?reviewInputs.reduce((n,item)=>n+Math.min(60,sourceFactsForProduct(item.score.product).length),0):0;
  const evidencePacket=({score,pendingChecks}:PlannedCandidate)=>{
    const p=knowledge.packets.get(`${score.product.__vendor}:${score.product.part_number}`),facts=p?packetFacts(p,query,60):sourceFactsForProduct(score.product).slice(0,60);
    return {pn:String(score.product.part_number),vendor:String(score.product.__vendor),
      category:String(score.product._section||''),...(p?{productPacket:{...packetSummary(p),documents:p.documents.slice(0,8),coverage:{includedFactCount:facts.length,totalFacts:p.facts.length,unreadFactCount:p.facts.length-facts.length,factCoverageComplete:facts.length===p.facts.length,documentCoverage:"indexed_not_read"}}}:{}),facts:facts.map(f=>({id:f.id,
        header:f.publishedHeader||f.field,value:f.publishedValue||f.publishedFeature||'',condition:f.evidence?.condition,source:f.source})),
      checks:score.parameterChecks,pending:pendingChecks};};
  const engineeringReview=moduleContext?.seedReview??(engineeringUnderstanding ? await reviewEngineeringCandidates(engineeringUnderstanding,
    reviewCandidates.map(evidencePacket),key,fetcher,agent?.executionReuse) : undefined);
  // Research failures cannot invalidate an already reviewed recommendation.
  const researchReview=engineeringUnderstanding&&researchSelected.length?await reviewEngineeringCandidates(engineeringUnderstanding,
    researchSelected.map(evidencePacket),key,fetcher,agent?.executionReuse):undefined;
  (sourceAccess as typeof sourceAccess & {vendorCoverage:unknown}).vendorCoverage=[...new Set(products.map(p=>manufacturerGroup(p.__vendor)))].map(v=>({vendor:v,catalogProducts:products.filter(p=>manufacturerGroup(p.__vendor)===v).length,selectedCandidates:selected.filter(i=>manufacturerGroup(i.score.product.__vendor)===v).length,reviewCandidates:reviewCandidates.filter(i=>manufacturerGroup(i.score.product.__vendor)===v).length}));
  sourceAccess.reviewedCandidates=(engineeringReview?.candidates.length||0)+(researchReview?.candidates.length||0);
  if(engineeringUnderstanding){
    for(const item of selected){
      item.pendingChecks.push(...evaluateIdentityRequirements(item.score.product,engineeringUnderstanding));
      const reviewed=engineeringReview?.candidates.find(r=>r.pn===item.score.product.part_number&&r.vendor===item.score.product.__vendor);
      item.pendingChecks.push(...engineeringReviewChecks(engineeringUnderstanding,reviewed,item.score.product));
    }
  }
  const reviewDeferred:PlannedCandidate[]=[];
  const executionDeferred:PlannedCandidate[]=[];
  await supplementCandidateEvidence(selected,releaseId,fetcher);
  if(engineeringUnderstanding)for(const item of selected){
    const packet=knowledge.packets.get(`${item.score.product.__vendor}:${item.score.product.part_number}`);
    const reviewed=engineeringReview?.candidates.find(c=>c.pn===item.score.product.part_number&&c.vendor===item.score.product.__vendor);
    item.requirementLedger=buildRequirementLedger({understanding:engineeringUnderstanding,releaseId,product:item.score.product,checks:item.pendingChecks,
      queryRequirements:querySpec.requirements.filter(q=>q.id.startsWith(`plan-${item.branch}-`)),parameterChecks:item.score.parameterChecks,
      review:reviewed,...(packet?{coverage:{includedFacts:reviewed?Math.min(60,packet.facts.length):0,totalFacts:packet.facts.length,linkedDocuments:packet.documents.length,documentsFullyRead:false as const}}:{}),execution:executionAudit?.items.filter(e=>e.branch===item.branch)});
    item.pendingChecks=ledgerChecks(item.requirementLedger);
  }
  const reviewDeferrals=engineeringUnderstanding?deferredReviewBranches(engineeringUnderstanding,
    selected.map(i=>({pn:String(i.score.product.part_number),vendor:String(i.score.product.__vendor),branch:i.branch,
      verifiedRequirementSupport:Object.values(i.score.parameterChecks).some(c=>c.status==='matched'&&c.evidence.length>0)
        ||i.pendingChecks.some(c=>c.status==='supported'&&c.evidence.length>0&&engineeringUnderstanding.requirements.some(r=>r.source===c.source))})),engineeringReview):new Map<number,string>();
  // Only independently checked manufacturer statements can update a condition.
  for(let i=selected.length-1;i>=0;i--){
    const ledger=selected[i].requirementLedger;
    const required=ledger?.entries.filter(e=>e.required)||[];
    // A brand-only match has no technical basis for a sales recommendation.
    const onlyManufacturerSupported=required.some(e=>e.status==='supported'&&!e.evidence.length&&engineeringUnderstanding?.requirements.find(r=>r.id===e.requirementId)?.manufacturerConstraint)
      && required.some(e=>e.status!=='supported') && !required.some(e=>e.status==='supported'&&(e.evidence.length||e.observations.some(c=>c.onlineCitations?.length)));
    const conflicts=selected[i].pendingChecks.filter(c=>c.blocksMatch&&c.status==='contradicted');
    if(conflicts.length){const p=selected[i].score.product;screeningExcluded.push({pn:String(p.part_number),vendor:String(p.__vendor),reasons:conflicts.map(c=>c.reason),evidence:conflicts.flatMap(c=>c.evidence)});selected.splice(i,1);}
    else if(executionAudit?.items.some(e=>e.branch===selected[i].branch&&e.required&&e.status==='execution_failed'&&!hasExactClauseProof(selected[i].requirementLedger,e.requirementId))){executionDeferred.push(selected[i]);selected.splice(i,1);}
    else if(onlyManufacturerSupported||reviewDeferrals.has(selected[i].branch)){reviewDeferred.push(selected[i]);selected.splice(i,1);}
  }
  // Reverse-index removal must not reverse the original evidence ranking.
  executionDeferred.reverse();reviewDeferred.reverse();
  // Review risks must affect presentation, not merely be appended after ranking.
  // When the branch has evidenced alternatives, keep rows with none of its
  // hard numeric targets verified as research leads. Preserve all evidence.
  const supportedNumeric=(item:PlannedCandidate)=>Object.values(item.score.parameterChecks).some(c=>c.status==='matched');
  const evidencedBranches=new Set(selected.filter(supportedNumeric).map(item=>item.branch));
  const numericLeads=selected.filter(item=>evidencedBranches.has(item.branch) && Object.keys(item.score.parameterChecks).length>0 && !supportedNumeric(item));
  const deferredNumeric=new Set(numericLeads);
  const rankedSelection=orderComparableReadings(selected.filter(item=>!deferredNumeric.has(item)).sort(rank));
  selected.splice(0,selected.length,...rankedSelection);
  sourceAccess.selectedCandidates=selected.length;
  // This is a preview lane, not a second retrieval cutoff. Keep all bounded
  // deferred candidates and place a representative of each branch/manufacturer
  // first; the UI may collapse the rest but must not erase them.
  const deferredLeadPool=[...executionDeferred,...researchSelected,...reviewDeferred,...numericLeads];
  const evidenceLeads=coverGroups(deferredLeadPool,deferredLeadPool.length,item=>`${item.branch}:${manufacturerGroup(item.score.product.__vendor)}`);
  sourceAccess.researchLeads=evidenceLeads.length;
  const unresolved = (!engineeringUnderstanding&&plan.unresolved.length>0)||!selected.length||selected.some(item => item.pendingChecks.some(check => check.blocksMatch && check.status !== 'supported'));
  const must = [...new Set(querySpec.requirements.filter(item => item.id.startsWith('plan-0-')
    && item.strength === 'must').map(item => item.tag))];
  const nice = [...new Set(querySpec.requirements.filter(item => item.id.startsWith('plan-0-')
    && item.strength === 'nice').map(item => item.tag))];
  return { features: [...new Set(querySpec.requirements.map(item => item.tag))],
    must, nice, mustMeta: must.map(tag => planMeta(tag)), exclude_tags: plan.exclude.map(item => item.tag),
    vendor, category_hint: '完整需求计划', explanation: engineeringUnderstanding?.task || '按完整问题召回，逐型号证据核验',
    confidence: unresolved ? 'medium' : 'high', suggestions: [], querySpec,
    engineeringUnderstanding, engineeringReview, researchReview, executionAudit,
    executionPlan:plan,planBranches: plan.branches, branchMatchCounts:branchMatchCounts.map((count,i)=>executionAudit?.blockedBranches.includes(i)?selected.filter(item=>item.branch===i).length:count), wikiHits: plannedWikiHits,
    retrievedWikiPaths: plannedWikiHits.map(hit => hit.path),
    constraintBanner: !selected.length
      ? executionAudit?.status==='partial' && (executionDeferred.length || !screeningExcluded.length) ? `必要条件未成功执行筛选：${[...new Set(executionAudit.items.filter(i=>i.status==='execution_failed').map(i=>i.source))].join('、')}。其余条件继续核验，受影响型号列在资料线索中。`
        : reviewDeferred.length ? `已理解原始需求，但当前审阅未证实这些品类线索适用；${reviewDeferred.length}款尚未完成证明的型号已转到补查资料区，不作为候选。${screeningExcluded.length?`另有 ${screeningExcluded.length} 款存在已核验的硬条件冲突，见逐型号排除原因。`:''}`
        : screeningExcluded.length ? `需求已解析，现有目录中有 ${screeningExcluded.length} 款存在已核验的参数冲突，原因与来源见下方；其余资料不足项仍未证实，不能据此断言市场上没有方案。`
        : '需求已解析，但现有目录尚未找到可核验的候选；资料不足与无匹配需要分别补查，这不是模型发送失败。'
      : unresolved
      ? `以下是目录初筛资料候选，并非完整方案推荐；品类或少量参数命中不能证明适用。按原始必需条件的有证据满足数量从多到少排序，同等覆盖下风险项后置；待核不计为满足。每项缺证和可能不满足的条件见型号卡片。${screeningExcluded.length ? `已按型号证据及约束核验剔除 ${screeningExcluded.length} 款。` : ''}`
      : selected.length ? `按 ${plan.branches.length} 种需求方案核验，找到 ${ordered.length} 款满足已表达条件的型号。`
        : '目录中未找到逐型号证据满足完整需求的型号；不能据此断定市场上没有对应方案。',
    screeningExcluded,
    sourceAccess,retrievalCoverage,productKnowledge:{version:1,releaseId,indexedProducts:knowledge.packets.size,candidates:selected.flatMap(({score})=>{const p=knowledge.packets.get(`${score.product.__vendor}:${score.product.part_number}`);return p?[packetSummary(p)]:[];})},
    researchLeads:evidenceLeads.map(({score,branch,requirementLedger})=>({supportedConditions:requirementLedger?.entries.filter(e=>e.status==='supported').map(e=>e.source),pn:String(score.product.part_number),vendor:String(score.product.__vendor),
      missingConditions:executionAudit?.blockedBranches.includes(branch)?executionAudit.items.filter(i=>i.branch===branch&&i.status==='execution_failed').map(i=>i.source):score.mustUnknown.length?score.mustUnknown:['原始必要条件尚未被型号证据证实'],
      reason:executionAudit?.blockedBranches.includes(branch)?'必要条件的筛选执行未完成，仅供补查，不属于推荐候选。':reviewDeferrals.get(branch)||'关键数值缺少可执行的逐型号证据；保留原表供核对，未计入推荐或已匹配候选。',
      evidence:sourceFactsForProduct(score.product).map(f=>f.source)})),
    ...(engineeringUnderstanding?{searchMapping:{status:mappingIssues.length||executionAudit?.status==='partial'?'partial':'mapped',issues:[...new Set([...mappingIssues,...(executionAudit?.items.filter(i=>i.status==='execution_failed').map(i=>i.reason)||[])])],
      summary:executionAudit?.status==='partial'?'部分条件未能执行目录筛选；仅保留逐型号证据已覆盖这些条件的候选。':mappingIssues.length?'部分条件保留资料核验；已执行筛选与缺证状态分别展示，不代表完整满足。':'检索沿用同一份工程需求；已映射条件用于初筛，其余条件按逐型号证据核验。'}}:{}),
    solutionDirections: solutionDirections(query, plan, products),
    results: selected.map(({ score, branch, pendingChecks,requirementLedger }) => ({
      matchCoverage:evidenceMatchSummary({pendingChecks,requirementLedger}),
      pn: String(score.product.part_number), vendor: String(score.product.__vendor),
      tier: pendingChecks.some(check => check.blocksMatch && check.status !== 'supported') ? 2 : 1,
      pendingChecks,requirementLedger,
      branch, branchMustTags: querySpec.requirements.filter(item =>
        item.id.startsWith(`plan-${branch}-`) && item.strength === 'must').map(item => item.tag),
      hitCount: score.mustHit.length,
      missingTags: score.mustMiss.filter(tag=>!(tag==='车规AEC-Q100'&&pendingChecks.some(c=>c.status==='supported'&&c.onlineCitations?.length&&/AEC\s*[- ]?Q\s*[- ]?100/i.test(c.source)))),
      mustUnknown: score.mustUnknown.filter(tag=>!(tag==='车规AEC-Q100'&&pendingChecks.some(c=>c.status==='supported'&&c.onlineCitations?.length&&/AEC\s*[- ]?Q\s*[- ]?100/i.test(c.source)))), parameterChecks: score.parameterChecks,
      sourceEvidence:ledgerTagEvidence(requirementLedger,engineeringUnderstanding,score.sourceEvidence,[...score.mustHit,...score.niceHit]), score: score.score, assessment: score.assessment,
      mustHit: score.mustHit, niceHit: score.niceHit, downgradeHits: score.downgradeHits,
    })),
    _debug: { llmCalled: true, llmSucceeded: true, planStatus: 'validated', planningAttempts, planningIssues, outputRepairs, screeningStatus:executionAudit?.status==='partial'?'execution_incomplete':'executed', mappingStatus:engineeringUnderstanding?(mappingIssues.length||executionAudit?.status==='partial'?'partial':'mapped'):undefined, intentCoverage: { residuals, categoryHypotheses: plan.branches.flatMap(branch => branch.must.filter(item => item.inference === 'device_role')) } } };
}

export function needsPlanWithoutModel(query: string): boolean { return needsWholeQueryPlan(query); }
export function unavailableWholeQuery(query: string) {
  return unavailable(query, '本次尚未调用语义模型，完整条件尚未核验。请确认本次问题后搜索；空白结果不表示没有符合型号。', false);
}

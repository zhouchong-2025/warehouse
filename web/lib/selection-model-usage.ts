import {appendFileSync,mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {estimateDeepSeekCost} from './deepseek-policy';
import {sharedModelTimeoutMs, type BudgetDenial} from './redis-selection-budget';
import {acquireSharedSelectionBudget} from './shared-selection-budget';

type UsageRow={elapsedMs?:number;stage:string;requestedModel?:string;returnedModel?:string;status?:number;
  reported:boolean;inputTokens:number;outputTokens:number;cacheHitTokens:number;cacheMissTokens:number;reasoningTokens:number};
function stageFor(body:Record<string,unknown>):string{
  const messages=body.messages as {content?:unknown}[]|undefined;
  const s=typeof messages?.[0]?.content==='string'?messages[0].content:'';
  if(s.includes('竞品规格提取。'))return 'competitor_extraction';
  if(s.includes('竞品候选证据比对。'))return 'competitor_comparison';
  if(s.includes('FAE证据绑定局部修复员'))return 'binding_repair';
  if(s.includes('FAE执行冲突复核员'))return 'mapping_resolution';
  if(s.includes('先做独立工程理解'))return 'fae_intent';
  if(s.includes('FAE工程契约的目录绑定编辑员'))return 'catalog_binding';
  if(s.includes('FAE资料研究员'))return 'research';
  if(s.includes('独立资料结论复核员'))return 'source_review';
  if(s.includes('独立电子FAE方向复核员'))return 'direction_audit';
  if(s.includes('目录适配器'))return 'adapter';
  if(s.includes('独立的电子工程'))return 'meaning_audit';
  if(s.includes('先理解工程任务')||s.includes('校正编辑员'))return 'understanding';
  if(s.includes('审阅工程需求与候选'))return 'candidate_review';
  return 'planning_or_module';
}
const count=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:0;

/** Per-request counters only. Never retains prompts, API keys, or reasoning text. */
type UsageOptions={releaseId?:string;queryHash?:string;maxCalls?:number;maxPeakCny?:number;ledgerPath?:string};
export function selectionModelUsage(fetcher:typeof fetch,options:UsageOptions={}){
  const rows:UsageRow[]=[];const requestId=randomUUID();let blocked=0,ledgerErrors=0,pendingAdmissions=0;
  const sharedDenials = new Set<BudgetDenial>();
  const configured=(value:unknown):number|undefined=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:undefined;};
  const maxCalls=Math.floor(configured(options.maxCalls??process.env.DEEPSEEK_MAX_CALLS_PER_SEARCH)??24);
  const maxPeakCny=configured(options.maxPeakCny??process.env.DEEPSEEK_MAX_PEAK_CNY_PER_SEARCH);
  const ledgerPath=options.ledgerPath??process.env.DEEPSEEK_USAGE_LEDGER_PATH;
  const price=(r:UsageRow)=>r.reported?estimateDeepSeekCost(r.returnedModel||'',r.cacheHitTokens,r.cacheMissTokens,r.outputTokens):null;
  const persist=(row:UsageRow)=>{if(!ledgerPath)return;try{
    mkdirSync(dirname(ledgerPath),{recursive:true,mode:0o700});
    appendFileSync(ledgerPath,JSON.stringify({version:1,eventId:randomUUID(),timestamp:new Date().toISOString(),producer:'selection',requestId,
      releaseId:options.releaseId,queryHash:options.queryHash,...row,estimatedCny:price(row)})+'\n',{mode:0o600});chmodSync(ledgerPath,0o600);
  }catch{ledgerErrors++;}};
  const tracked:typeof fetch=async(input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    if(new URL(url).hostname!=='api.deepseek.com')return fetcher(input,init);
    // This is a stop-before-next-call guard, not a provider-side billing cap.
    // An in-flight call can exceed the remaining estimate. Unknown usage stops
    // subsequent calls when a monetary guard is configured.
    const spent=rows.reduce((n,r)=>n+(price(r)?.peak||0),0);
    if(rows.length+pendingAdmissions>=maxCalls||maxPeakCny!==undefined&&(spent>=maxPeakCny||pendingAdmissions>0||rows.some(r=>!price(r)))){
      blocked++;return Response.json({error:{message:'Local model budget exhausted'}},{status:503,headers:{'x-local-model-budget':'exhausted'}});
    }
    pendingAdmissions++;
    let shared;
    try {
      shared = await acquireSharedSelectionBudget();
    } finally {
      pendingAdmissions--;
    }
    if ('denied' in shared) {
      blocked++;
      sharedDenials.add(shared.denied);
      return Response.json({error:{message:'Shared selection model limit reached'}},{
        status:shared.denied==='shared_store_unavailable'?503:429,headers:{'x-local-model-budget':shared.denied},
      });
    }
    const reservationIndex = rows.length;
    try {
      let body:Record<string,unknown>={};try{body=JSON.parse(String(init?.body||'{}'));}catch{/* telemetry is optional */}
      const row:UsageRow={stage:stageFor(body),requestedModel:typeof body.model==='string'?body.model:undefined,
        reported:false,inputTokens:0,outputTokens:0,cacheHitTokens:0,cacheMissTokens:0,reasoningTokens:0};rows.push(row);
      const started=Date.now();
      const timeout = AbortSignal.timeout(sharedModelTimeoutMs);
      const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
      let response:Response;try{response=await fetcher(input,{...init,signal});}catch(error){row.elapsedMs=Date.now()-started;persist(row);throw error;}
      row.elapsedMs=Date.now()-started;row.status=response.status;
      try{
        const d=await response.clone().json(),u=d.usage;
        if(typeof d.model==='string')row.returnedModel=d.model;
        if(u&&typeof u.prompt_tokens==='number'&&typeof u.completion_tokens==='number'){
          row.reported=true;row.inputTokens=count(u.prompt_tokens);row.outputTokens=count(u.completion_tokens);
          row.cacheHitTokens=Math.min(row.inputTokens,count(u.prompt_cache_hit_tokens??u.prompt_tokens_details?.cached_tokens));
          row.cacheMissTokens=row.inputTokens-row.cacheHitTokens;
          row.reasoningTokens=count(u.completion_tokens_details?.reasoning_tokens);
        }
      }catch{/* Missing usage must not invalidate a valid engineering response. */}
      persist(row);return response;
    } finally {
      const row = rows[reservationIndex];
      await shared.finish(row ? price(row)?.peak : undefined);
    }
  };
  return {fetch:tracked,snapshot:()=>{
    const stages:Record<string,{calls:number;inputTokens:number;outputTokens:number;cacheHitTokens:number}>={};
    let offPeak=0,peak=0,pricedCalls=0;
    for(const r of rows){const a=stages[r.stage]??={calls:0,inputTokens:0,outputTokens:0,cacheHitTokens:0};a.calls++;a.inputTokens+=r.inputTokens;a.outputTokens+=r.outputTokens;a.cacheHitTokens+=r.cacheHitTokens;
      // Never price a legacy alias without the provider's actual returned model.
      const price=r.reported&&estimateDeepSeekCost(r.returnedModel||'',r.cacheHitTokens,r.cacheMissTokens,r.outputTokens);
      if(price){offPeak+=price.offPeak;peak+=price.peak;pricedCalls++;}
    }
    return {calls:rows.length,reportedCalls:rows.filter(r=>r.reported).length,
      returnedModels:[...new Set(rows.flatMap(r=>r.returnedModel?[r.returnedModel]:[]))],
      inputTokens:rows.reduce((n,r)=>n+r.inputTokens,0),outputTokens:rows.reduce((n,r)=>n+r.outputTokens,0),
      cacheHitTokens:rows.reduce((n,r)=>n+r.cacheHitTokens,0),reasoningTokens:rows.reduce((n,r)=>n+r.reasoningTokens,0),
      failedCalls:rows.filter(r=>r.status===undefined||r.status>=400).length,stages,
      estimatedCny:{offPeak,peak,pricedCalls,complete:pricedCalls===rows.length,estimateOnly:true,priceDate:'2026-11-15'},
      budget:{maxCalls,maxPeakCny,blocked,sharedDenials:[...sharedDenials],mode:'stop_before_next_call',estimateOnly:true},ledger:{enabled:!!ledgerPath,writeErrors:ledgerErrors},requestId,reused:false};
  }};
}

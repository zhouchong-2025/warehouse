import {throwIfSelectionCancelled,waitForSelection} from './selection-cancellation';
import {createHash} from 'node:crypto';

type Entry={expires:number;value:unknown};
type Work={promise:Promise<unknown>;controller:AbortController;subscribers:number;settled:boolean};
type Bucket={done:Map<string,Entry>;pending:Map<string,Work>};
const buckets=new WeakMap<typeof fetch,Bucket>();
const TTL=60_000,MAX_ENTRIES=16,MAX_BYTES=1_000_000;
function record(v:unknown):Record<string,unknown>{return v&&typeof v==='object'?v as Record<string,unknown>:{};}
export function isReusableSelectionResult(v:unknown){
  const r=record(v),debug=record(r._debug),research=record(r.faeResearch),usage=record(debug.modelUsage);
  return record(r.pipelineAudit).status!=='failed'&&record(r.executionAudit).status!=='partial'&&debug.planStatus==='validated'&&!!r.engineeringUnderstanding&&Array.isArray(r.results)&&r.results.length>0&&!r.componentSearch
    &&research.status!=='unavailable'&&research.findingsReview!=='unavailable'
    &&record(r.engineeringReview).status!=='unavailable'&&record(r.researchReview).status!=='unavailable'
    &&usage.failedCalls===0&&!debug.liveEvidenceUsed&&!record(usage.budget).blocked
    &&!(Array.isArray(research.trace)&&research.trace.some(t=>/manufacturer/.test(String(record(t).tool))));
}
export function selectionReuseKey(parts:unknown){return createHash('sha256').update(JSON.stringify(parts)).digest('hex');}

/** Short, bounded, in-memory reuse of a validated response on the same frozen
 * release. Disabled for responses that used live manufacturer evidence; failures are never cached.
 */
export async function reuseSelection<T>(fetcher:typeof fetch,key:string,enabled:boolean,run:(signal?:AbortSignal)=>Promise<T>,now=Date.now,signal?:AbortSignal):Promise<{value:T;status:'miss'|'hit'|'shared'}>{
  throwIfSelectionCancelled(signal);
  if(!enabled)return {value:await waitForSelection(run(signal),signal),status:'miss'};
  let b=buckets.get(fetcher);if(!b){b={done:new Map(),pending:new Map()};buckets.set(fetcher,b);}
  for(const[k,e]of b.done)if(e.expires<=now())b.done.delete(k);
  const entry=b.done.get(key);if(entry)return {value:structuredClone(entry.value)as T,status:'hit'};
  const subscribe=(work:Work,status:'miss'|'shared')=>{
    work.subscribers++;
    return new Promise<{value:T;status:'miss'|'shared'}>((resolve,reject)=>{
      let ended=false;
      const detach=()=>{if(ended)return;ended=true;signal?.removeEventListener('abort',abort);work.subscribers--;
        if(!work.settled&&!work.subscribers){if(b!.pending.get(key)===work)b!.pending.delete(key);work.controller.abort(new DOMException('All selection consumers cancelled','AbortError'));}
      };
      const abort=()=>{detach();reject(signal?.reason??new DOMException('Selection cancelled','AbortError'));};
      work.promise.then(value=>{if(ended)return;detach();resolve({value:status==='shared'?structuredClone(value)as T:value as T,status});},error=>{if(ended)return;detach();reject(error);});
      if(signal?.aborted){abort();return;}
      signal?.addEventListener('abort',abort,{once:true});
    });
  };
  const pending=b.pending.get(key);if(pending)return subscribe(pending,'shared');
  if(b.pending.size>=MAX_ENTRIES)return {value:await waitForSelection(run(signal),signal),status:'miss'};
  const work:Work={promise:Promise.resolve(),controller:new AbortController(),subscribers:0,settled:false};
  b.pending.set(key,work);
  work.promise=(async()=>{
    try{
      throwIfSelectionCancelled(work.controller.signal);
      const value=await run(work.controller.signal);
      if(!work.controller.signal.aborted&&isReusableSelectionResult(value)&&Buffer.byteLength(JSON.stringify(value),'utf8')<=MAX_BYTES){
        if(b!.done.size>=MAX_ENTRIES)b!.done.delete(b!.done.keys().next().value!);
        b!.done.set(key,{expires:now()+TTL,value:structuredClone(value)});
      }
      return value;
    }finally{work.settled=true;if(b!.pending.get(key)===work)b!.pending.delete(key);}
  })();
  return subscribe(work,'miss');
}

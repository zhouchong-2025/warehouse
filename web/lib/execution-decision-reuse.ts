import {createHash} from 'node:crypto';
export type ExecutionReuseContext={owner:object;releaseId:string;namespace:string;enabled:boolean;signal?:AbortSignal;metrics?:{hits:number;misses:number}};
type Entry={expires:number;value:unknown};
const buckets=new WeakMap<object,Map<string,Entry>>();
const TTL=600_000,MAX_ENTRIES=32,MAX_BYTES=64_000;
/** Completed semantic decisions only. Do not share a pending call tied to one
 * request's cancellation/budget with another request. No fuzzy query matching. */
export async function reuseCompletedDecision<T>(context:ExecutionReuseContext|undefined,input:unknown,run:()=>Promise<T>,valid:(value:T)=>boolean,now=Date.now):Promise<{value:T;status:'hit'|'miss'}>{
 context?.signal?.throwIfAborted();
 if(!context?.enabled||!context.releaseId||!context.namespace)return{value:await run(),status:'miss'};
 const key=createHash('sha256').update(JSON.stringify(['mapping-conflicts-v1',context.releaseId,context.namespace,input])).digest('hex');
 let bucket=buckets.get(context.owner);if(!bucket){bucket=new Map();buckets.set(context.owner,bucket);}
 for(const[k,e]of bucket)if(e.expires<=now())bucket.delete(k);
 const cached=bucket.get(key);
 if(cached){const value=structuredClone(cached.value)as T;if(valid(value)){if(context.metrics)context.metrics.hits++;return{value,status:'hit'};}bucket.delete(key);}
 if(context.metrics)context.metrics.misses++;
 const value=await run();context.signal?.throwIfAborted();
 if(valid(value)&&Buffer.byteLength(JSON.stringify(value),'utf8')<=MAX_BYTES){if(bucket.size>=MAX_ENTRIES)bucket.delete(bucket.keys().next().value!);bucket.set(key,{expires:now()+TTL,value:structuredClone(value)});}
 return{value,status:'miss'};
}

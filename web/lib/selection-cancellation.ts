/** Cancellation is execution control only; it never changes engineering meaning. */
export function throwIfSelectionCancelled(signal?:AbortSignal){signal?.throwIfAborted();}
export function waitForSelection<T>(work:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return work;
 if(signal.aborted){void work.catch(()=>{});return Promise.reject(signal.reason??new DOMException('Selection cancelled','AbortError'));}
 return new Promise((resolve,reject)=>{
  const abort=()=>{cleanup();reject(signal.reason??new DOMException('Selection cancelled','AbortError'));};
  const cleanup=()=>signal.removeEventListener('abort',abort);
  signal.addEventListener('abort',abort,{once:true});
  work.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
 });
}
export function cancellableSelectionFetch(fetcher:typeof fetch,signal?:AbortSignal):typeof fetch{
 if(!signal)return fetcher;
 return async(input,init)=>{
  throwIfSelectionCancelled(signal);
  const signals=[signal,...(init?.signal?[init.signal]:[]),...(input instanceof Request?[input.signal]:[])];
  // The originating provider request may already be billed. Abort prevents
  // further work; any eventual usage response is still accounted by the caller.
  return fetcher(input,{...init,signal:AbortSignal.any(signals)});
 };
}

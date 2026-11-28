/** Configuration readiness only: this GET never sends a question to a model. */
export async function readModelAvailability(fetcher:typeof fetch=fetch,signal?:AbortSignal):Promise<boolean>{
  const response=await fetcher('/api/interpret',{method:'GET',cache:'no-store',signal});
  if(!response.ok)throw new Error('模型配置状态暂无法读取；本次尚未发送给模型，请重试。');
  const status=await response.json();return status?.modelAvailable===true;
}

/** Official model IDs checked against api-docs.deepseek.com on 2026-11-15.
 * Never upgrade to a more expensive model as an implicit retry.
 */
export function deepSeekRequestOptions() {
  const model=process.env.DEEPSEEK_MODEL||'deepseek-flash';
  if(!['deepseek-flash','deepseek-v4-pro'].includes(model))throw new Error('Unsupported DEEPSEEK_MODEL; use an explicit official model ID');
  const effort=process.env.DEEPSEEK_THINKING_EFFORT||'none';
  if(!['none','low','high','max'].includes(effort))throw new Error('Invalid DEEPSEEK_THINKING_EFFORT');
  // The legacy deepseek-chat endpoint was observed to return Flash without
  // reasoning. Preserve that mode explicitly; canonical names default to thinking.
  return {model,thinking:{type:effort==='none'?'disabled':'enabled'},reasoning_effort:effort};
}

export const DEEPSEEK_PRICE_REFERENCE={
  checkedOn:'2026-11-15',currency:'CNY',unit:'per_million_tokens',
  source:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  offPeak:{'deepseek-flash':{hit:0.02,miss:1,output:4},'deepseek-v4-pro':{hit:0.15,miss:4.5,output:13.5}},
} as const;

export function estimateDeepSeekCost(model:string,hit:number,miss:number,output:number){
  if(model!=='deepseek-flash'&&model!=='deepseek-v4-pro')return null;
  const p=DEEPSEEK_PRICE_REFERENCE.offPeak[model];
  const offPeak=(hit*p.hit+miss*p.miss+output*p.output)/1e6;
  return {offPeak,peak:offPeak*2,currency:'CNY',estimateOnly:true,priceDate:DEEPSEEK_PRICE_REFERENCE.checkedOn};
}

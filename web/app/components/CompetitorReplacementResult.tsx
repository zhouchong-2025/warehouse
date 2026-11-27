import type {CompetitorResult} from '../api/interpret/competitor-replacement';

export default function CompetitorReplacementResult({answer}:{answer:CompetitorResult}){
 const {reference,candidates,pn}=answer;
 const href=(page:number|null)=>reference?.document.url.split('#')[0]+(page?'#page='+page:'');
 return <section className="mb-4 space-y-3 break-words rounded-xl border border-[#31556d] bg-[#10212b] p-4 text-sm text-[#e6edf3]">
   <h2 className="font-semibold">竞品替代评估 {pn}</h2>
   <p>{answer.message}</p>
   {reference&&<details className="rounded border border-[#31556d] p-3">
     <summary className="cursor-pointer">原件规格和完整料号来源</summary>
     <a className="text-[#79c0ff] underline" href={href(reference.identity.page)} target="_blank" rel="noreferrer">原厂完整料号依据</a>
     <blockquote className="mt-1">{reference.identity.quote}</blockquote>
     {reference.facts.map((fact,i)=><p key={i} className="mt-2"><a className="text-[#79c0ff] underline" href={href(fact.page)} target="_blank" rel="noreferrer">{fact.label}</a> · {fact.quote}</p>)}
   </details>}
   {answer.stage==='complete'&&!candidates.length&&<p>当前品牌暂无已比对的替代候选。</p>}
   {candidates.map(candidate=><article key={candidate.vendor+':'+candidate.pn} className="space-y-2 rounded border border-[#31556d] p-3">
     <h3 className="font-semibold text-[#a5e6f5]">{candidate.pn} · 功能候选</h3>
     <p className="text-[#ffe6a4]">{candidate.directSwap==='package_conflict'?'封装不同，无法原板直换':'原板直换待核'}</p>
     {candidate.differences.slice(0,2).map((d,i)=><p key={i}>{d.label} · 原件 {d.reference.quote} / 候选 {d.candidate.value}</p>)}
     {reference?.facts.some(f=>/逻辑.*(?:电源|电压)|电平转换|VIO/i.test(f.label)) &&
       !candidate.differences.some(f=>/逻辑.*(?:电源|电压)|电平转换|VIO/i.test(f.label)) &&
       <p className="text-[#ffe6a4]">原件有独立逻辑电源的原厂资料。候选对应引脚和电平待核。</p>}
     <details><summary className="cursor-pointer text-[#79c0ff]">FAE 工况和双侧原厂依据</summary>
     {candidate.differences.map((d,i)=><div key={i} className="mt-2">
       <strong>{d.label}</strong><p>原件 · {d.reference.quote} · <a href={href(d.reference.page)} className="underline" target="_blank" rel="noreferrer">原厂引文</a></p>
       <p>候选 · {d.candidate.header} {d.candidate.value} {d.candidate.condition} · {d.candidate.document} 第 {d.candidate.page} 页</p>
     </div>)}
     <p className="mt-2">样品验证前核对完整型号的引脚、控制逻辑、封装焊盘及客户实际工作条件。</p>
     </details>
   </article>)}
 </section>;
}

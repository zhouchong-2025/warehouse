import type {ReplacementPilot} from '../api/interpret/replacement-pilot';

export default function ReplacementPilotResult({answer}:{answer:ReplacementPilot}){
 const {reference,candidates,queryBandwidthMHz,customerConstraints,requiresDirectSwap}=answer;
 return <section className="mb-4 space-y-3 rounded-xl border border-[#31556d] bg-[#10212b] p-4 text-sm text-[#e6edf3]">
   <h2 className="font-semibold">替代评估 · {reference.pn}</h2>
   <p>{reference.manufacturer}原件 · {reference.function} · {reference.packageName} · {reference.bandwidthMHz} MHz（{reference.bandwidthCondition}）</p>
   {!candidates.length && <p>当前厂商范围内暂无已核对的替代线索。</p>}
   {candidates.map(candidate=><article key={candidate.pn} className="space-y-2 rounded border border-[#31556d] p-3">
     <h3 className="font-semibold text-[#a5e6f5]">{candidate.pn} · {candidate.assessment==='evaluate'?'可优先评估':candidate.assessment==='below_bandwidth'?'低于带宽要求':'额外条件待核'}</h3>
     <p>同为双路 SPDT、MSOP‑10、AEC-Q100 Grade 1，环境温度范围均为 −40～125 ℃。</p>
     <p className="text-[#ffe6a4]">带宽 {reference.bandwidthMHz} → {candidate.bandwidthMHz} MHz · 两者均为典型值{queryBandwidthMHz!==undefined? ' · 客户目标 '+queryBandwidthMHz+' MHz':''}。</p>
     {customerConstraints&&<p className="break-words">本次附加要求 · {customerConstraints}</p>}
     <p>{requiresDirectSwap?'原板直换待核。请提供原板引脚接线及封装焊盘图，由 FAE 逐项对照。':'确认客户实际信号带宽及是否沿用原 PCB，再判断可用性。'}</p>
     <details>
       <summary className="cursor-pointer text-[#79c0ff]">FAE · 工况及原厂依据</summary>
       <p className="mt-2">原件供电 {reference.supply}，候选供电 {candidate.supply}。候选的 100 MHz 对应 {candidate.bandwidthCondition}。</p>
       <p className="mt-1">原件订购号 {reference.orderNumber}。换料前核对原板逐脚功能、控制真值表、焊盘尺寸和实际信号条件。</p>
       <div className="mt-2 flex flex-wrap gap-3 text-[#79c0ff]">
         <a className="underline" href={reference.url} target="_blank" rel="noreferrer">圣邦微原件规格</a>
         <a className="underline" href={candidate.url+'#page=7'} target="_blank" rel="noreferrer">思瑞浦带宽与工况</a>
         <a className="underline" href={candidate.url+'#page=4'} target="_blank" rel="noreferrer">思瑞浦引脚与真值表</a>
       </div>
     </details>
   </article>)}
 </section>;
}

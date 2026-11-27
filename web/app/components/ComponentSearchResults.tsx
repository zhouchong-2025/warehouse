import ParameterMatchLines from './ParameterMatchLines';
import type { ModuleSearchSummary } from '../api/interpret/engineering-modules';
import { displayConstraintTag } from '../product-utils';
export default function ComponentSearchResults({summary,engineeringView=false}:{summary:ModuleSearchSummary;engineeringView?:boolean}){
  return <section className="mb-5 rounded-xl border border-[#58a6ff]/40 bg-[#0d2036] p-4 text-sm text-[#c9d1d9]">
    <h3 className="font-semibold text-[#79c0ff]">方案需要 {summary.modules.length} 个功能模块</h3>
    {engineeringView&&<p className="mt-2">{summary.strategy}</p>}
    <p className="mt-2 text-[#ffe6a4]">各模块分别初筛，尚未证明能组合成完整方案；需按实际需求共同核验接口、供电与系统性能。</p>
    {engineeringView&&<ol className="mt-4 space-y-3">
      {summary.modules.map((m,i)=><li key={m.id} className="rounded-lg border border-[#30363d] p-3">
        <h4 className="font-semibold text-[#e6edf3]">{i+1}. {m.name}</h4>
        <p className="mt-1">{m.purpose}</p>
        <p className="mt-1 text-xs text-[#8b949e]">对应原始要求：{m.sources.join('；')}</p>
      </li>)}
    </ol>}
    {!!summary.systemRequirements.length&&<div className="mt-4 rounded-lg border border-[#866229] p-3">
      <h4 className="font-semibold text-[#ffe6a4]">整套方案仍需验证</h4>
      {summary.systemRequirements.slice(0,engineeringView?undefined:1).map((r,i)=><p key={`${i}:${r.source}`} className="mt-2">{r.source}：{r.meaning}</p>)}
    </div>}
    {!!summary.integrationChecks.length&&<details className="mt-3"><summary className="cursor-pointer text-[#ffe6a4]">模块之间还要核验什么</summary>
      {summary.integrationChecks.map((s,i)=><p key={i} className="mt-2">{s}</p>)}</details>}
    <h3 className="mt-6 border-t border-[#30363d] pt-4 font-semibold text-[#79c0ff]">按模块查看资料候选</h3>
    <p className="mt-2 text-xs text-[#8b949e]">以下型号用于继续查证。请结合各型号的待核项判断，不能直接视为整套方案推荐。</p>
    {summary.modules.map(m=><article key={m.id} className="mt-4 border-t border-[#30363d] pt-3">
      <h4 className="font-semibold text-[#e6edf3]">{m.name}</h4>
      {m.retrievalCoverage&&m.retrievalCoverage.eligible>m.retrievalCoverage.retained&&<p className="mt-2 text-xs text-[#8b949e]">共召回 {m.retrievalCoverage.eligible} 条，本轮保留 {m.retrievalCoverage.retained} 条核验；未保留项不表示没有对应产品。</p>}
      {m.candidates.length===0?<p className="mt-2 text-[#ffe6a4]">{m.status==='screened'?'该模块暂未找到可核验的目录候选；仍可继续补查资料。':'该模块检索尚未完成，其他模块的结果已保留。'}{m.status==='unavailable'&&` ${m.note}`}</p>:
        <><p className="mt-2 text-xs text-[#8b949e]">共 {m.candidates.length} 条模块资料线索</p>{m.candidates.slice(0,engineeringView?3:1).map(c=><ModuleCandidateCard key={`${c.vendor}:${c.pn}`} c={c} engineeringView={engineeringView}/>)}
        {m.candidates.length>(engineeringView?3:1)&&<details className="mt-3"><summary className="cursor-pointer">展开其余 {m.candidates.length-(engineeringView?3:1)} 条模块线索</summary>{m.candidates.slice(engineeringView?3:1).map(c=><ModuleCandidateCard key={`${c.vendor}:${c.pn}`} c={c} engineeringView={engineeringView}/>)}</details>}</>}

      {!!m.researchLeads?.length&&<details className="mt-3 text-[#ffe6a4]"><summary className="cursor-pointer">另有 {m.researchLeads.length} 条待补证资料线索，未计入模块候选</summary>{m.researchLeads.map(c=><p key={`${c.vendor}:${c.pn}`} className="mt-2"><strong>{c.pn}</strong>：{c.reason} 缺证条件：{c.missingConditions.join('；')}</p>)}</details>}
    </article>)}
  </section>;
}

function ModuleCandidateCard({c,engineeringView}:{engineeringView:boolean;c:import('../api/interpret/engineering-modules').ModuleCandidate}){return <div key={`${c.vendor}:${c.pn}`} className="mt-3 rounded-lg border border-[#30363d] bg-[#0d1117] p-3">
          <strong className="text-[#79c0ff]">{c.pn}</strong><span className="ml-2 text-xs text-[#ffe6a4]">模块资料线索，组合待核</span>
          <p className="mt-1">目录核验通过的条件：{c.matched.length?c.matched.map(displayConstraintTag).join('、'):'尚无已核验参数'}</p>
          {!engineeringView&&c.pending.find(p=>p.blocksMatch&&p.status!=='supported')&&<p className="mt-1 text-[#ffe6a4]">优先核对 · {c.pending.find(p=>p.blocksMatch&&p.status!=='supported')?.source}</p>}
          <ParameterMatchLines rows={engineeringView ? c.parameters || [] : (c.parameters || []).filter(p=>p.value!=='规格待核').slice(0,2)}/>
          {!!c.pending.length&&<details open={engineeringView || undefined} className="mt-2"><summary className="cursor-pointer">查看该模块的待核项与风险（{c.pending.filter(p=>p.blocksMatch&&p.status!=='supported').length}项）</summary>
            {c.pending.map((p,i)=><p className="mt-2" key={i}>{p.status==='supported'?'有证据支持':p.status==='contradicted'?'不满足':p.statusText||(p.attention==='possible_mismatch'?'可能不满足':'缺少证据')}：{p.source}。{p.reason}</p>)}</details>}
          {!!c.evidence.length&&<details className="mt-2 text-xs"><summary className="cursor-pointer">查看目录来源</summary>
            {c.evidence.slice(0,6).map((e,i)=><p key={i} className="mt-1">{e.document}，第{e.page}页：{e.originalHeader}＝{e.originalValue}</p>)}</details>}
        </div>;}

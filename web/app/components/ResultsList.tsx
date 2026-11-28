"use client";

import { useState } from "react";

import {summarizePendingChecks} from '@/lib/pending-check-summary';

import {
  getCategoryBadge,
  displayConstraintTag,
  getDisplayParams,
  getEvidenceSources,
  type Product,
  type SearchResult,
  type VendorFilterOption,
  type LLMInterpretation,
  type VendorData,
  productIdentity,
  pendingRequirementReview,
} from "@/app/product-utils";
import CompetitorReplacementResult from "./CompetitorReplacementResult";
import ReplacementPilotResult from "./ReplacementPilotResult";
import ComponentSearchResults from './ComponentSearchResults';
import SuggestionCards from "./SuggestionCards";
import OnlineEvidencePanel from "./OnlineEvidencePanel";
import { withOnlineRecommendation, type OnlineEvidenceUpdate, type OnlineRecommendation } from '@/lib/online-recommendation';
import {nextAction,selectionAnswer} from '@/lib/selection-answer';
import ParameterMatchLines from "./ParameterMatchLines";
import { parameterMatchSummary } from '@/lib/parameter-match-summary';
import { salesEvidenceLine } from '@/lib/online-evidence-summary';
import EvidenceBatchPanel from "./EvidenceBatchPanel";
import {suggestedEvidenceCandidates} from "../api/online-evidence/batch";
import type { WikiSearchHit } from "@/lib/wiki-search-types";

type ConstraintView = {
  tier: number | null;
  banner: string;
  items: any[];
  niceRequested?: string[];
} | null;

type CrossRefData = {
  target: string;
  hits: any[];
  vendorByProduct: Map<Product, { vendor: string; vendorName: string }>;
} | null;

type Props = {
  loading: boolean;
  llmLoading: boolean;
  searchFailed?: boolean;
  results: SearchResult[] | null;
  displayResults: SearchResult[];
  constraintView: ConstraintView;
  llmResult: LLMInterpretation;
  crossRef: CrossRefData;
  search: string;
  visibleSuggestions: { text: string; query: string; reason: string }[];
  onApplySuggestion: (query: string) => void;
  compareList: string[];
  onToggleCompare: (vendor: string, part: string) => void;
  preferredPns: Set<string>;
  vendors: VendorFilterOption[];
  totalProducts: number;
  releaseId: string | null;
  wikiHits: WikiSearchHit[];
  activeVendor: string | null;
  online: OnlineRecommendation;
  onEvidence: (rows:OnlineEvidenceUpdate[]) => void;
  onVendorChange: (vendor: string | null) => void;
};

const wikiPageUrl = (releaseId: string, path: string) =>
  `/api/wiki-page?releaseId=${releaseId}&path=${encodeURIComponent(path)}`;

function CandidateReview({pn,vendor,result,releaseId}:{pn:string;vendor:string;result:LLMInterpretation;releaseId:string|null}){
  const review=result?.engineeringReview?.candidates.find(r=>r.pn===pn&&r.vendor===vendor)
    ||result?.researchReview?.candidates.find(r=>r.pn===pn&&r.vendor===vendor);
  if(!review)return null;
  return <details className="mt-3 rounded-lg border border-[#30363d] p-3 text-xs text-[#c9d1d9]"><summary className="cursor-pointer">型号审阅与依据</summary>
    <p className="mt-1">{review.summary}</p>
    <p className="mt-1 text-[#8b949e]">以下为模型对引用资料的解释；不替代参数核验、资格文件或应用验证。</p>
    <details className="mt-2"><summary className="cursor-pointer">查看逐项判断与原表依据</summary>
      {review.requirements.map(r=><article key={r.id} className="mt-2 border-t border-[#30363d] pt-2">
        <p><strong>{result?.engineeringUnderstanding?.requirements.find(x=>x.id===r.id)?.source||r.id}</strong> · {r.status==='supported'?'资料支持（模型解读）':r.status==='contradicted'?'可能冲突（模型解读）':'资料尚不足'}</p>
        <p className="mt-1">{r.reason}</p>
        {r.evidence?.map((source,i)=><p key={`${source.factId}:${i}`} className="mt-1 text-[#8b949e]">
          {source.document} · 第 {source.page} 页 · {source.originalHeader}：{source.originalValue}
          {source.wikiFactPage&&releaseId&&<> · <a className="text-[#58a6ff] underline" target="_blank" rel="noopener noreferrer" href={wikiPageUrl(releaseId,source.wikiFactPage)}>来源</a></>}
        </p>)}
      </article>)}
    </details>
  </details>;
}

function ResearchLeadList({result,releaseId,vendors,search}:{result:NonNullable<LLMInterpretation>;releaseId:string|null;vendors:VendorFilterOption[];search:string}){
  const leads=result.researchLeads||[];
  const renderLead=(r:NonNullable<NonNullable<LLMInterpretation>['researchLeads']>[number])=><article key={`${r.vendor}:${r.pn}`} className="mt-3">
    <p><strong>{r.pn}</strong><span className="ml-2 text-[#8b949e]">{vendors.find(v=>v.slugs.includes(r.vendor))?.name||r.vendor}</span>：{r.reason}</p>
    {!!r.supportedConditions?.length && <p>已有依据 · {r.supportedConditions.join('、')}</p>}
    {r.pendingChecks?.filter(c=>c.attention==='possible_mismatch').map((check,i)=><div className="mt-1 text-[#ff7b72]" key={i}><strong>资料冲突风险 · {check.source}</strong>：{check.reason}
      <details className="mt-1"><summary>查看冲突原文</summary>{check.researchReferences?.map(ref=><blockquote key={ref.id} className="mt-1 border-l-2 pl-2">{ref.document||ref.path||'原厂资料'}{ref.page?` · 第${ref.page}页`:''}：{ref.quote}</blockquote>)}</details>
    </div>)}<p className="mt-1">缺证条件：{r.missingConditions.map(displayConstraintTag).join('；')}</p>
    <CandidateReview pn={r.pn} vendor={r.vendor} result={result} releaseId={releaseId}/>
  </article>;
  return <section className="mb-4 rounded-lg border border-[#866229] p-3 text-sm text-[#ffe6a4]">
    <p className="font-semibold">补查资料线索 · 尚未证实适用，未计入候选</p>
    <p className="mt-1">共 {leads.length} 条线索{leads.length>6?'，先展示 6 条，其余可展开查看。':'。'}</p>
    {leads.slice(0,6).map(renderLead)}
    {leads.length>6&&<details key={`${releaseId}:${search}`} className="mt-3"><summary className="cursor-pointer">展开其余 {leads.length-6} 条线索</summary>{leads.slice(6).map(renderLead)}</details>}
  </section>;
}

export default function ResultsList({
  loading,
  llmLoading,
  searchFailed,
  results,
  displayResults,
  constraintView,
  llmResult,
  crossRef,
  search,
  visibleSuggestions,
  onApplySuggestion,
  compareList,
  onToggleCompare,
  preferredPns,
  vendors,
  totalProducts,
  releaseId,
  wikiHits,
  activeVendor,
  onVendorChange,
  online,
  onEvidence,
}: Props) {
  const [engineeringView,setEngineeringView] = useState(false);
  const [copyFeedback,setCopyFeedback] = useState('');
  const [expanded, setExpanded] = useState<{key:string;limit:number} | null>(null);
  const listKey = JSON.stringify([releaseId, search, activeVendor, displayResults.map(row => [row.vendor,row.product.part_number])]);
  const visibleLimit = expanded?.key === listKey ? expanded.limit : 5;
  const ranked = withOnlineRecommendation(displayResults,releaseId,online);
  const shown = ranked.slice(0,visibleLimit);
  const hasOnline = ranked.some(row => row.hasDocument);
  const searchRequestId = llmResult?._debug?.modelUsage?.requestId;
  const requirementReview = pendingRequirementReview(llmResult);
  const originalEvidenceCandidates = releaseId ? suggestedEvidenceCandidates(llmResult?.results || [], releaseId) : [];
  const evidenceCandidates = originalEvidenceCandidates.map(candidate => {
    const row = ranked.find(({result}) => result.vendor === candidate.vendor && result.product.part_number === candidate.pn);
    const completed = new Set(row?.conditions.filter(item=>item.online && item.online.outcome !== 'unknown').map(item=>item.entry.requirementId));
    return {...candidate,requirements:candidate.requirements.filter(r=>!completed.has(r.id) &&
      !row?.conditions.some(c=>c.entry.requirementId===r.id && c.entry.source===r.source && nextAction(c)!=='查原厂'))};
  }).filter(candidate=>candidate.requirements.length);
  return (
    <>
      {/* Vendor filters */}
      <div className="sticky top-[57px] z-40 backdrop-blur-xl bg-[#0d1117]/90 border-b border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex gap-2 overflow-x-auto">
          <button onClick={() => onVendorChange(null)} className={`min-h-11 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${!activeVendor ? "bg-[#1e6ef0] text-white" : "bg-[#161b22] text-[#8b949e] hover:text-white border border-[#30363d]"}`}>
            全部 ({totalProducts})
          </button>
          {vendors.map((v) => (
            <button key={v.key} onClick={() => onVendorChange(activeVendor === v.key ? null : v.key)} className={`min-h-11 px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${activeVendor === v.key ? "bg-[#1e6ef0] text-white" : "bg-[#161b22] text-[#8b949e] hover:text-white border border-[#30363d]"}`}>
              {v.name} ({v.productCount})
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">
        {searchFailed ? (<p role="status" className="py-20 text-center text-[#8b949e]">本次检索尚未完成，请重试；暂不展示未经本次需求核验的型号。</p>) : loading || llmLoading ? (
          <div role="status" className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="w-8 h-8 border-2 border-[#1e6ef0] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[#8b949e]">{llmLoading ? "正在检索资料并核验候选；完成后展示结果。" : "正在加载产品资料…"}</p>
          </div>
        ) : llmResult?.competitorReplacement ? (<CompetitorReplacementResult answer={llmResult.competitorReplacement}/>) : llmResult?.replacementPilot ? (<ReplacementPilotResult answer={llmResult.replacementPilot}/>) : results ? (
          <>
            <div className="mb-4 text-sm text-[#8b949e] flex items-center justify-between">
              <span>{llmResult?.componentSearch?.status==='screened' ? `已拆解 ${llmResult.componentSearch.modules.length} 个功能模块 · 整套方案尚未验证` : llmResult?._debug?.planStatus === 'engineering_only' ? '工程需求已理解 · 尚未执行型号匹配' : llmResult?.category_hint === '完整需求计划'
                ? hasOnline
                  ? `完整匹配 ${ranked.filter(row => row.complete).length} 款 · 已按本次补查结果更新顺序`
                  : `完整匹配：${llmResult.results?.filter(item => item.tier === 1).length || 0} 款 · 待核资料线索：${llmResult.results?.filter(item => item.tier !== 1).length || 0} 款`
                : <>找到 {llmResult?.totalMatches ?? displayResults.length} 个候选 · {constraintView && (constraintView.tier || 0) > 1 ? "参考候选排序" : (llmResult?.sortKey ? llmResult.sortKey.label : "按相关度排序")}</>}</span>
              <span className="text-xs">{llmResult?.componentSearch ? `${llmResult.componentSearch.modules.reduce((n,m)=>n+m.candidates.length,0)} 条模块资料线索` : `显示 ${shown.length} / ${displayResults.length} 款`}</span>
            </div>

            {(!!displayResults.length || !!llmResult?.componentSearch) && <div className="mb-4 flex gap-2" aria-label="结果视图">
              <button type="button" aria-pressed={!engineeringView} className="rounded border border-[#30363d] px-3 py-2 text-sm aria-pressed:bg-[#1e6ef0] aria-pressed:text-white" onClick={()=>setEngineeringView(false)}>销售简答</button>
              <button type="button" aria-pressed={engineeringView} className="rounded border border-[#30363d] px-3 py-2 text-sm aria-pressed:bg-[#1e6ef0] aria-pressed:text-white" onClick={()=>setEngineeringView(true)}>FAE 工程视图</button>
            </div>}
            {copyFeedback && <p role="status" className="mb-2 text-xs text-[#a5e6f5]">{copyFeedback}</p>}
            {llmResult?.modelLimitNotice && <p role="status" className="mb-4 rounded-lg border border-[#d29922] bg-[#302513] p-3 text-sm text-[#ffe6a4]">{llmResult.modelLimitNotice}</p>}
            {releaseId && originalEvidenceCandidates.length > 0 && <EvidenceBatchPanel
              key={JSON.stringify([releaseId, search, originalEvidenceCandidates])}
              candidates={evidenceCandidates} releaseId={releaseId} searchRequestId={searchRequestId} onEvidence={onEvidence}/>}
            {llmResult?.componentSearch&&<ComponentSearchResults summary={llmResult.componentSearch} engineeringView={engineeringView}/>}
            {llmResult?.retrievalCoverage&&llmResult.retrievalCoverage.eligible>llmResult.retrievalCoverage.retained&&<p className="mb-4 rounded-lg border border-[#30363d] p-3 text-sm text-[#8b949e]">本次检索共召回 {llmResult.retrievalCoverage.eligible} 条资料候选，本轮保留 {llmResult.retrievalCoverage.retained} 条继续核验；其余尚未核验，不表示没有对应产品。可收窄条件重新搜索，或在品牌页点「进一步检索此品牌」。</p>}

            {!llmResult?.modelLimitNotice && !llmResult?.componentSearch && Array.isArray(llmResult?.results) && llmResult.constraintBanner && !displayResults.length && (
              <p className="mb-4 rounded-lg border border-[#30363d] bg-[#161b22] p-3 text-sm text-[#c9d1d9]">{llmResult.constraintBanner}</p>
            )}
            {llmResult?.executionAudit?.status==='partial'&&<section role="status" className="mb-4 rounded-lg border border-[#d29922] bg-[#302513] p-3 text-sm text-[#ffe6a4]">
              <p className="font-semibold">必要条件筛选未完成 · 受影响方向不展示推荐</p>
              <details className="mt-1"><summary>查看受影响条件</summary>
              {llmResult.executionAudit.items.filter(i=>i.status==='execution_failed').map(i=><p key={`${i.branch}:${i.requirementId}`} className="mt-2">方向{i.branch+1} · {i.object}：{i.reason}</p>)}
              </details>
            </section>}
            <details className="mb-4 rounded-lg border border-[#30363d] p-3 text-sm text-[#8b949e]">
              <summary className="cursor-pointer">工程复核与资料{llmResult?.searchMapping?.status==='partial'?' · 部分条件待核':''}{llmResult?.faeResearch?.findingsReview==='unavailable'?' · 资料复核未完成':''}</summary>
            {llmResult?.engineeringUnderstanding&&<section className="mb-4 rounded-lg border border-[#31556d] bg-[#10212b] p-4 text-sm text-[#c9d1d9]">
              <p className="font-semibold text-[#a5e6f5]">工程任务与选型边界</p>
              <p className="mt-2">{llmResult.engineeringUnderstanding.task}</p>
              {!!llmResult.engineeringUnderstanding.questions.length&&<div className="mt-3 text-[#ffe6a4]">
                <p className="font-semibold">会影响方案的问题</p>
                {llmResult.engineeringUnderstanding.questions.map((q,i)=><p className="mt-2" key={i}>{q.scope==='supplementary'?'补充核验（不影响已明确条件筛选） · ':''}{q.question} · {q.consequence}</p>)}
              </div>}
              {!!(llmResult.engineeringUnderstanding.originalArchitectures?.length||llmResult.engineeringUnderstanding.architectures.length)&&<details className="mt-3"><summary className="cursor-pointer">查看候选方向及适用边界</summary>
                {(llmResult.engineeringUnderstanding.originalArchitectures||llmResult.engineeringUnderstanding.architectures).map((a,i)=><p className="mt-2" key={i}>{a.name}：{a.rationale}</p>)}
              </details>}
              {!!llmResult.results?.some(p=>p.pendingChecks?.some(c=>c.status==='contradicted'))&&<div className="mt-3 text-[#ffe6a4]">
                <p className="font-semibold">以下资料冲突需先注意；不表示所有候选都有相同冲突</p>
                {llmResult.results.filter(p=>p.pendingChecks?.some(c=>c.status==='contradicted')).slice(0,6).map(p=><p key={`${p.vendor}:${p.pn}`} className="mt-2">{p.pn}：{p.pendingChecks?.filter(c=>c.status==='contradicted').map(c=>`${c.source}：${c.reason}`).join('；')}</p>)}
              </div>}
            </section>}

              {!!displayResults.length && llmResult?.constraintBanner && <p className="my-2">{llmResult.constraintBanner}</p>}
              {llmResult?.executionAudit&&<details className="my-3"><summary className="cursor-pointer">需求条件执行核对（{llmResult.executionAudit.items.length}项）</summary>
                {llmResult.executionAudit.items.map(item=><div key={`${item.branch}:${item.requirementId}`} className="mt-2 border-t border-[#30363d] pt-2">
                  <p className={item.status==='execution_failed'?'text-[#ff7b72]':item.status==='executed'?'text-[#3fb950]':'text-[#ffe6a4]'}>方向{item.branch+1} · {item.status==='executed'?'已执行筛选':item.status==='execution_failed'?'执行失败':'待补证据'}：{item.source}</p><p className="mt-1">{item.reason}</p>
                </div>)}
              </details>}
              {llmResult?.engineeringReview&&<p className="my-3 text-xs">{llmResult.engineeringReview.note} 各型号的逐项判断见卡片“型号审阅与依据”。</p>}
            {llmResult?.faeResearch&&<section className="mb-4 rounded-lg border border-[#31556d] bg-[#10212b] p-4 text-sm text-[#c9d1d9]">
              <p className="font-semibold text-[#a5e6f5]">FAE 资料追查{llmResult.faeResearch.status==='budget_exhausted'?' · 本轮读取额度已用完':llmResult.faeResearch.status==='unavailable'||llmResult.faeResearch.findingsReview==='unavailable'?' · 部分未完成':''}</p>
              <p className="mt-2">{llmResult.faeResearch.summary}</p>
              {llmResult.faeResearch.reviewCoverage&&<p className="mt-1">已复核 {llmResult.faeResearch.reviewCoverage.reviewedFindings} 条资料解读，{llmResult.faeResearch.reviewCoverage.pendingFindings} 条复核未完成；{llmResult.faeResearch.reviewCoverage.requirementsWithoutFindings.length} 项原始需求尚无资料解读。</p>}
              <p className="mt-1 text-xs text-[#8b949e]">资料解读不等于完整匹配或认证通过；下方候选仍按原始要求核验。</p>
              {!!llmResult.faeResearch.discoveredModels?.length&&<p className="mt-2 text-[#ffe6a4]">库外型号线索：{llmResult.faeResearch.discoveredModels.map(m=>m.pn).join('、')}。这些型号仅出现在本次读取的资料中，尚未加入目录或完成全部条件核验。</p>}
              {llmResult.faeResearch.directionStatus&&<p className="mt-2">{llmResult.faeResearch.directionStatus}{llmResult.faeResearch.rerunApplied?'；已重新检索。':''}</p>}
              {llmResult.faeResearch.findings.map((f,i)=><article key={i} className="mt-3 border-t border-[#31556d] pt-2">
                <p><strong>{llmResult.engineeringUnderstanding?.requirements.find(r=>r.id===f.requirementId)?.source||f.requirementId}</strong>{f.pn&&` · ${f.pn}`} · {f.status==='source_support'?'资料支持线索':f.status==='source_conflict'?'资料冲突线索':'仍需补查'}</p>
                <p className="mt-1">{f.reason}</p>
                {f.references.map(ref=><details key={ref.id} className="mt-1 text-xs text-[#8b949e]"><summary className="cursor-pointer">{ref.document||ref.path||'原厂联网资料'} {ref.page?`· 第 ${ref.page} 页`:ref.startLine?`· 第 ${ref.startLine} 行起`:''}{ref.truncated?' · 节选':''}</summary>
                  <p className="mt-1 whitespace-pre-wrap">{ref.quote}</p>
                  {ref.path&&releaseId&&<a className="text-[#58a6ff] underline" href={wikiPageUrl(releaseId,ref.path)} target="_blank" rel="noopener noreferrer">查看冻结资料</a>}
                  {ref.url&&<a className="text-[#58a6ff] underline" href={ref.url} target="_blank" rel="noopener noreferrer">查看原厂文件</a>}
                </details>)}
              </article>)}
              <details className="mt-3 text-xs text-[#8b949e]"><summary className="cursor-pointer">查看 {llmResult.faeResearch.rounds} 轮资料追查过程{llmResult.faeResearch.modelCalls?`（追查阶段调用模型 ${llmResult.faeResearch.modelCalls} 次）`:''}</summary>
                {llmResult.faeResearch.trace.map((t,i)=><p key={i} className="mt-2">{i+1}. {t.purpose}：{t.summary}</p>)}
              </details>
              {!!llmResult.faeResearch.references.length&&<details className="mt-2 text-xs text-[#8b949e]"><summary className="cursor-pointer">查看实际读取的 {llmResult.faeResearch.references.length} 段资料（不代表全部已核验）</summary>
                {llmResult.faeResearch.references.map(ref=><article key={ref.id} className="mt-2"><p>{ref.document||ref.path||'原厂文件'}{ref.page?` · 第 ${ref.page} 页`:''}</p><p className="whitespace-pre-wrap">{ref.quote}</p>{ref.url&&<a className="text-[#58a6ff] underline" href={ref.url} target="_blank" rel="noopener noreferrer">原厂原文</a>}</article>)}
              </details>}
            </section>}
            {llmResult?.sourceAccess&&<details className="mb-4 rounded-lg border border-[#30363d] p-3 text-xs text-[#8b949e]">
              <summary className="cursor-pointer">查看本次资料检索覆盖范围</summary>
              <p className="mt-2">本次厂商范围内 {llmResult.sourceAccess.catalogProducts} 条型号记录；各方案品类命中合计 {llmResult.sourceAccess.categoryProducts} 条（不同方案可重复）。关键数值缺证 {llmResult.sourceAccess.coreEvidenceGaps} 条；另列 {llmResult.sourceAccess.researchLeads} 条补查线索。</p>
              <p className="mt-1">模型收到 {llmResult.sourceAccess.reviewFactCount} 条逐型号事实，完成 {llmResult.sourceAccess.reviewedCandidates} 款综合审阅。未审阅型号不视为已完成综合判断；这也不表示已查遍原厂全部资料。</p>
            </details>}
            {llmResult?.searchMapping?.status==='partial' && (
              <section className="mb-4 rounded-lg border border-[#866229] bg-[#302513] p-3 text-sm text-[#ffe6a4]">
                <p className="font-semibold">需求已理解 · 部分筛选尚未接通</p>
                <p className="mt-1">{llmResult.searchMapping.summary}</p>
                <details className="mt-2"><summary className="cursor-pointer">查看未执行的筛选及原因</summary>
                  <ul className="mt-2 list-disc pl-5">{llmResult.searchMapping.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>
                </details>
              </section>
            )}
            {requirementReview.length > 0 && (
              <details className="mb-4 max-w-4xl rounded-lg border border-[#866229] bg-[#302513] p-3 text-sm text-[#ffe6a4]">
                <summary className="font-semibold cursor-pointer">查看原句中 {requirementReview.length} 项未确认条件及风险汇总</summary>
                <p className="mt-1 text-xs">风险提示用于确定补查顺序；只有直接反证才判定不满足。</p>
                {requirementReview.map(row => <article key={row.source} className="mt-3 border-t border-[#866229]/40 pt-3">
                  <p><strong>{row.source}</strong> · {row.label}</p>
                  {row.observations.length > 0 && <p className="mt-1">已有资料：{row.observations.join('；')}</p>}
                  {row.reasons.map(reason => <p key={reason} className="mt-1">{reason}</p>)}
                  {row.nextSteps.length > 0 && <p className="mt-1">需补查：{row.nextSteps.join('；')}</p>}
                  {row.pages.length > 0 && <p className="mt-1 text-xs text-[#bac9de]">关联型号原表第 {row.pages.join('、')} 页；各型号详情见下方卡片。</p>}
                </article>)}
              </details>
            )}
            {!!llmResult?.solutionDirections?.length && <details className="mb-4 rounded-lg border border-[#d29922]/40 bg-[#161b22] p-3 text-sm text-[#c9d1d9]">
              <summary className="cursor-pointer">查看其他电路方案线索（尚未核验，不计为匹配）</summary>
              {llmResult.solutionDirections.map(direction=><div key={direction.title} className="mt-3 space-y-2">
                <strong>{direction.title}</strong><p>{direction.explanation}</p>
                <ul className="list-disc pl-5">{direction.parts.map(p=><li key={`${p.vendor}:${p.pn}`}>
                  {p.pn}：{p.category}；原表负载类型：{p.loadType}（第{[...new Set(p.evidence.map(e=>e.page))].join('、')}页）
                </li>)}</ul>
                <p>仍需核验：{direction.pending.join('；')}</p>
              </div>)}
            </details>}
            {!!llmResult?.screeningExcluded?.length && (
              <details className="mb-4 rounded-lg border border-[#30363d] bg-[#161b22] p-3 text-sm text-[#c9d1d9]">
                <summary className="cursor-pointer">查看未列入参考候选的 {llmResult.screeningExcluded.length} 款及原表原因</summary>
                <ul className="mt-2 space-y-1 pl-5 list-disc">
                  {llmResult.screeningExcluded.map(item => <li key={`${item.vendor}:${item.pn}`}>
                    {item.pn}：{item.reasons.join('；')}
                    {item.evidence.length > 0 && `（原表第 ${[...new Set(item.evidence.map(source => source.page))].join('、')} 页）`}
                  </li>)}
                </ul>
              </details>
            )}
            {displayResults.some(r => !r.referenceOnly && r.assessment?.requirementsStatus === 'matched') && (
              <p className="mb-4 text-xs text-[#8b949e]">目录参数匹配表示已收录字段满足当前条件。若有原厂订购表，下方会单列已核对的输出电压与封装组合；其他电气条件和实际工况仍需各自的证据。</p>
            )}

            {!llmResult?.componentSearch && !!llmResult?.querySpec?.unresolved.length && requirementReview.length === 0 && (
              <div className="mb-4 border border-[#d29922]/30 rounded-lg p-3 text-sm text-[#d29922]">
                <p>{llmResult.modelConsentRequired ? '以下条件尚未完成完整需求理解。请点击搜索并确认发送，当前本地初筛不能证明这些条件满足：' : ['engineering_only','component_screening'].includes(llmResult._debug?.planStatus||'') ? '以下工程要求已保留；当前缺少可执行的资料核验路径，不是要求你重复确认语义：' : llmResult.querySpec.unresolved.some(item => item.kind === 'model_unavailable')
                  ? llmResult._debug?.llmSucceeded ? '模型已返回，但完整需求规划未通过校验；原句已保留：'
                    : displayResults.length ? '查询模型暂不可用。以下候选只按已识别条件筛选，未应用未解析片段；请稍后重试：'
                    : '查询模型暂不可用，完整问题尚未核验：'
                  : llmResult.querySpec.unresolved.some(item => item.kind === 'evidence')
                    ? '以下保留原句条件；每个型号分别核验，有证据支持才计入完整匹配，资料不足则放入补查资料：'
                    : '还需要明确以下条件，当前候选仅供参考：'}</p>
                {llmResult.querySpec.unresolved.map(item => <p key={item.source.start}><strong>{item.source.text}</strong>：{item.reason}</p>)}
              </div>
            )}
            {wikiHits.length > 0 && releaseId && (
              <details className="mb-5 max-w-4xl rounded-lg border border-[#30363d] bg-[#161b22]/70 p-3">
                <summary className="cursor-pointer text-sm text-[#bac9de]">查看相关 Wiki 来源（{wikiHits.length} 条）</summary>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="text-sm font-medium text-[#e6edf3]">相关 Wiki 来源</h3>
                  <span className="text-[11px] text-[#8b949e]">仅作检索上下文，不单独证明参数满足</span>
                </div>
                <div className="space-y-2">
                  {wikiHits.map(hit => (
                    <article key={`${hit.path}:${hit.sha256}`} className="rounded-md bg-[#0d1117] px-3 py-2">
                      <a className="text-xs text-[#58a6ff] underline" href={wikiPageUrl(releaseId, hit.path)} target="_blank" rel="noopener noreferrer">
                        {hit.path} · {hit.sourceType === 'vendor' ? '厂商 Wiki' : hit.sourceType === 'fact' ? '事实页' : '检索参考页'}
                      </a>
                      <p className="mt-1 text-xs leading-5 text-[#c9d1d9]">{hit.snippet}</p>
                    </article>
                  ))}
                </div>
              </details>
            )}
            {!!llmResult?.researchLeads?.length&&<ResearchLeadList result={llmResult} releaseId={releaseId} vendors={vendors} search={search}/>}
            </details>
            {/* 竞品反查横幅(cross_ref): 命中=厂商声称标注; 零命中=诚实降级 */}
            {crossRef && crossRef.hits.length > 0 && (
              <div className="mb-4 max-w-3xl bg-[#1e6ef0]/8 border border-[#1e6ef0]/30 rounded-lg p-3">
                <p className="text-[#e6edf3] text-sm">
                  找到 {crossRef.hits.length} 款标称可替代 <span className="font-semibold">{crossRef.target}</span> 的国产料。
                  替代关系来自厂商「可替代产品」标注，建议 FAE 核对通道数/隔离电压/速率等关键参数后选型。
                </p>
              </div>
            )}
            {crossRef && crossRef.hits.length === 0 && (
              <div className="mb-4 max-w-3xl bg-[#d29922]/8 border border-[#d29922]/30 rounded-lg p-3">
                <p className="text-[#e6edf3] text-sm">
                  暂未找到标称可替代 <span className="font-semibold">{crossRef.target}</span> 的国产料（目前替代标注主要覆盖思瑞浦汽车产品线）。
                  建议改用品类+参数搜索（如「2通道数字隔离器 100Mbps」）按规格找等效料。
                </p>
              </div>
            )}

            {/* 约束横幅 — tier2/3 降级说明, 或 tier1 带排序意图(高PSRR等)的说明 */}
            {constraintView && constraintView.banner && constraintView.banner!==llmResult?.constraintBanner && (
              <div className="mb-4 max-w-3xl bg-[#d29922]/8 border border-[#d29922]/30 rounded-lg p-3">
                <p className="text-[#e6edf3] text-sm">{constraintView.banner.replaceAll('车规AEC-Q100', '车规级')}</p>
              </div>
            )}

            {!!llmResult?.excludedByOperating?.length && (
              <details className="mb-4 max-w-3xl rounded-lg border border-[#f85149]/30 bg-[#f85149]/8 p-3 text-sm text-[#e6edf3]">
                <summary className="cursor-pointer text-[#ff7b72]">查看已排除的工作点</summary>
                {llmResult.excludedByOperating.map(item => (
                  <div key={`${item.vendor}-${item.pn}`} className="mt-1">
                    <span className="font-mono">{item.pn}</span>：VCCA={item.assessment.namedRailCheck?.vccaV}V、VCCB={item.assessment.namedRailCheck?.vccbV}V 不满足规格书的联合工作条件。
                    <details className="mt-1 text-xs text-[#8b949e]">
                      <summary className="cursor-pointer text-[#58a6ff]">查看原 PDF 依据</summary>
                      {item.assessment.namedRailCheck?.sources.map(source => (
                        <p key={source.factId} className="mt-1">{source.document} · 物理页 {source.page} · {source.originalHeader}：{source.originalValue}</p>
                      ))}
                    </details>
                  </div>
                ))}
              </details>
            )}

            {/* Suggestion banner — always show when AI has advice */}
            {visibleSuggestions.length > 0 && displayResults.length > 0 && !constraintView?.banner && (
              <SuggestionCards
                suggestions={visibleSuggestions}
                search={search}
                onApplySuggestion={onApplySuggestion}
                variant="banner"
              />
            )}

            <div className={llmResult?.results?.some(item => item.pendingChecks?.length)
              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3'
              : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'}>
              {shown.map(row => {
                const { vendor, vendorName, product, score, matchedTerms, missingTerms, matchSummary, referenceOnly, nicePartial, evidence, downgradeHits, parameterChecks, sourceEvidence, assessment, pendingChecks } = row.result;
                const parameters = parameterMatchSummary(llmResult?.querySpec,parameterChecks);
                const answer = selectionAnswer(row,parameters);
                const salesParameters = [...parameters].sort((a,b)=>Number(b.unmatched)-Number(a.unmatched));
                const updatedIds = new Set(row.conditions.flatMap(({entry,online}) => online && online.outcome !== 'unknown' ? [entry.requirementId] : []));
                const stillPending = pendingChecks?.filter(check => !check.requirementId || !updatedIds.has(check.requirementId) ||
                  !row.conditions.some(item => item.entry.requirementId === check.requirementId && item.entry.source === check.source));
                const summary = row.hasDocument && row.requiredCount
                  ? [`${row.confirmed.length}/${row.requiredCount} 项已确认`,row.sourced.length ? `${row.sourced.length} 项已补到规格` : '',
                    row.unresolved.length ? `${row.unresolved.length} 项待核` : '',row.conflicts ? `${row.conflicts} 项有冲突` : ''].filter(Boolean).join(' · ')
                  : matchSummary;
                const typedRequirements = row.conditions.length
                  ? row.conditions.filter(item=>nextAction(item)==='查原厂').filter(({entry}) => pendingChecks?.some(c=>c.status==='unknown'&&c.requirementId===entry.requirementId))
                    .map(({entry}) => ({id:entry.requirementId,source:entry.source,object:entry.object,meaning:entry.meaning,condition:entry.condition}))
                  : pendingChecks?.filter(c=>c.status==='unknown'&&c.requirementId).map(c=>({id:c.requirementId!,source:c.source}));
                return (
                <div key={`${vendor}-${product.part_number}`} className="min-w-0 break-words p-4 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#1e6ef0] hover:shadow-[0_0_16px_rgba(30,110,240,0.1)] transition-all group">
                  {/* Part number + vendor + score */}
                  <div className="flex flex-col items-start gap-1 mb-2">
                    <div className="min-w-0 flex-1 font-mono font-bold text-[#58a6ff] group-hover:text-white transition-colors text-sm truncate">
                      {product.part_number}
                    </div>
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[#1e6ef0]/15 text-[#8b949e] whitespace-nowrap">
                      {vendorName} · {summary || score.toFixed(1)}
                    </span>
                  </div>

                  {/* Published section is the source-reviewed product category. */}
                  {(() => {
                    const categoryTag = getCategoryBadge(product);
                    return categoryTag ? (
                      <div className="mb-2 text-xs px-2 py-0.5 rounded inline-block text-[#3fb950] bg-[#3fb950]/10">
                        {categoryTag}
                      </div>
                    ) : null;
                  })()}

                  {answer && <div className="mb-3 space-y-1 text-xs">
                    <p className="font-semibold text-[#e6edf3]">{answer.title}</p>
                    {answer.proof && <p className="text-[#a5e6f5]">已有依据 · {answer.proof}</p>}
                    {answer.specifications && <p className="text-[#a5e6f5]">可比较规格 · {answer.specifications}</p>}
                    {answer.action && <p className={row.conflicts ? 'text-[#ff7b72]' : 'text-[#ffe6a4]'}>{answer.action} · {answer.detail}</p>}
                    {!engineeringView && <button type="button" className="text-[#79c0ff] underline" onClick={async()=>{
                      try { await navigator.clipboard.writeText(answer.text);setCopyFeedback('已复制 '+product.part_number+' 的简答'); }
                      catch { setCopyFeedback('复制不可用，可选中简答文字手动复制'); }
                    }}>复制简答</button>}
                  </div>}
                  <ParameterMatchLines rows={engineeringView || !answer ? parameters : salesParameters.filter(p=>p.value!=='规格待核').slice(0,2)}/>
                  {(!answer || engineeringView) && !!stillPending?.length && (() => {
                    const { supported, pending, critical } = summarizePendingChecks(stillPending);
                    return <>
                      {supported.length > 0 && <p className="mt-1 text-xs text-[#a5e6f5]">
                        已有依据 · {supported.slice(0,2).map(({source}) => source).join('、')}{supported.length > 2 ? ` 等 ${supported.length} 项` : ''}
                      </p>}
                      {critical.map(({id,source,check}) => <p key={id} className="mt-1 text-xs text-[#ff7b72]">
                        {check.status === 'contradicted' ? '不满足' : '可能不满足'} · {source}
                      </p>)}
                      {pending.length > 0 && <p className="mt-1 text-xs text-[#ffe6a4]">
                        待核 · {pending.slice(0,3).map(({source}) => source).join('、')}{pending.length > 3 ? ` 等 ${pending.length} 项` : ''}
                      </p>}
                    </>;
                  })()}
                  {row.conditions.some(({online}) => online) && <dl aria-label="联网补查要点" className="mt-2 divide-y divide-[#31556d] rounded-lg border border-[#31556d] px-2.5 text-xs">
                    {row.conditions.map(({entry,online,confirmed}) => {
                      if (!online) return null;
                      const line = salesEvidenceLine(online);
                      const conflict = online.outcome === 'conflicts';
                      return <div key={entry.requirementId} className="py-1.5">
                        <dt className="inline font-medium text-[#c9d1d9]">{line.label}</dt>
                        <dd className="inline">
                          <span className={conflict ? 'ml-2 font-semibold text-[#ff7b72]' : 'ml-2 font-semibold text-[#a5e6f5]'}>
                            {conflict ? '可能不符' : line.value || (confirmed ? '已确认' : line.next || line.status)}
                          </span>
                          {line.condition && <span className="ml-2 text-[#8b949e]">（{line.condition}）</span>}
                        </dd>
                      </div>;
                    })}
                  </dl>}
                  {(assessment?.operatingStatus === 'outside_documented_bounds' || assessment?.namedRailStatus === 'outside_documented_bounds') &&
                    <p className="mt-1 text-xs text-[#ff7b72]">工作条件超出原厂规格</p>}
                  {(assessment?.operatingChecks?.some(check => check.thermal?.exceedsFullRatedAmbientRange) || assessment?.thermalReferenceChecks?.length) &&
                    <p className="mt-1 text-xs text-[#ffe6a4]">散热条件需复核</p>}
                  {releaseId && !!typedRequirements?.length && pendingChecks && <OnlineEvidencePanel
                    key={JSON.stringify([releaseId, vendor, product.part_number, pendingChecks.map(check => [check.requirementId,check.source])])}
                    vendor={vendor} pn={product.part_number} releaseId={releaseId} searchRequestId={searchRequestId} onEvidence={onEvidence} resolvedIds={updatedIds}
                    requirements={typedRequirements}
                    clauses={pendingChecks.filter(check => check.status === "unknown").map(check => check.source)} />}
                  <details open={engineeringView || undefined} className="mt-3 border-t border-[#30363d] pt-2 text-xs text-[#c9d1d9]">
                    <summary className="cursor-pointer text-[#79c0ff]">工程复核 · 参数和选型依据</summary>
                    <CandidateReview pn={product.part_number} vendor={vendor} result={llmResult} releaseId={releaseId}/>
                      {row.conditions.filter(c => c.online).map(({entry,online}) => <div key={entry.requirementId} className="mt-2">
                      <strong>联网补查 · {entry.source}</strong>
                      <p>{online?.explanation}</p>
                      {online?.conditions && <p>{online.conditions}</p>}
                      {online?.citations.map((cite,index) => <a key={index} href={cite.url.split('#')[0] + '#page=' + cite.page}
                        target="_blank" rel="noreferrer" className="mr-3 text-[#79c0ff] underline">原厂 PDF 第 {cite.page} 页</a>)}
                    </div>)}
                    {!!pendingChecks?.length && <>
                        <details className="mt-2"><summary className="cursor-pointer">查看全部逐项依据</summary>
                        <ul className="mt-1 space-y-1">
                          {pendingChecks.map((check, index) => <li key={`${index}:${check.source}`} className="border-b border-[#866229]/30 pb-2 last:border-0">
                            <strong>{check.status === 'supported' ? '✓' : check.status === 'contradicted' ? '✕' : '△'} {check.requirementLabel||check.source}</strong>：
                            {check.status === 'supported' ? '有证据支持' : check.status === 'contradicted' ? '不满足'
                              : check.statusText || (check.attention === 'possible_mismatch'
                                ? '可能不满足' : check.attention === 'clarification' ? '口径待确认' : '缺少证据')}
                            {check.assumption && <p className="mt-1 text-[#9ddde5]">选型口径：{check.assumption}</p>}
                            {check.observed && <p className="mt-1 text-[#e6edf3]">现有参数：{check.observed}</p>}
                            <p className="mt-1">{check.reason}</p>
                            {check.researchReferences?.map(ref=><details key={ref.id} className="mt-1"><summary>资料复核原文 · {ref.document||'原厂资料'}{ref.page?` · 第${ref.page}页`:''}</summary><blockquote className="mt-1 border-l-2 pl-2 whitespace-pre-wrap">{ref.quote}</blockquote>{ref.path&&releaseId&&<a className="underline" href={wikiPageUrl(releaseId,ref.path)} target="_blank" rel="noreferrer">查看冻结来源</a>}</details>)}
                            {check.onlineCitations?.map((citation,i)=><div key={i} className="mt-1">
                              <a href={citation.url} target="_blank" rel="noreferrer" className="text-[#79c0ff] underline">本次原厂补证 · PDF 第{citation.page}页</a>
                              <blockquote className="mt-1 border-l-2 border-[#58a6ff]/40 pl-2">{citation.quote}</blockquote>
                              <details><summary>文件指纹</summary><p className="break-all">SHA-256：{citation.sha256}</p></details>
                            </div>)}
                          </li>)}
                        </ul>
                        </details>
                        <details className="mt-2">
                          <summary className="cursor-pointer">进一步补查方向</summary>
                          {pendingChecks.map((check, index) => <div key={`${index}:${check.source}`} className="mt-2 border-t border-[#866229]/30 pt-1">
                            <strong>{check.source}</strong>
                            {check.nextStep && <p>需补查：{check.nextStep}</p>}
                          </div>)}
                        </details>
                      </>}
                    {/* Match quality badge + 霆宝优选 */}
                    {matchSummary ? (
                      <div className="mb-2 flex flex-wrap items-center gap-1">
                        {preferredPns.has(product.part_number?.toUpperCase() || '') && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-[#f0883e]/20 text-[#f0883e] font-medium">霆宝优选</span>
                        )}
                        <span className={`text-[10px] px-1 py-0.5 rounded ${assessment?.operatingChecks?.some(check => check.thermal?.exceedsFullRatedAmbientRange) || assessment?.thermalReferenceChecks?.some(check => check.belowRoomTemperature) || assessment?.operatingStatus === 'outside_documented_bounds' || assessment?.namedRailStatus === 'outside_documented_bounds' ? "bg-[#f85149]/15 text-[#ff7b72]" : referenceOnly || assessment?.thermalReferenceChecks?.length ? "bg-[#d29922]/20 text-[#d29922]" : nicePartial ? "bg-[#1e6ef0]/15 text-[#58a6ff]" : downgradeHits && Object.keys(downgradeHits).length > 0 ? "bg-[#1e6ef0]/15 text-[#58a6ff]" : "bg-[#3fb950]/20 text-[#3fb950]"}`}>
                          {assessment?.namedRailStatus === 'outside_documented_bounds' ? '双电源轨工作条件不满足' : assessment?.operatingStatus === 'outside_documented_bounds' ? '已列工作范围不满足' : assessment?.operatingChecks?.some(check => check.thermal?.exceedsFullRatedAmbientRange) || assessment?.thermalReferenceChecks?.length ? '目录匹配 · 散热需复核' : referenceOnly ? (pendingChecks?.length ? '已匹配部分条件 · 其余待核' : assessment ? '参考料' : '检索候选 · 条件待核') : nicePartial ? `目录参数匹配（偏好未全满足）` : downgradeHits && Object.keys(downgradeHits).length > 0 ? `目录参数匹配 (${Object.values(downgradeHits).join('、')})` : "目录参数匹配"}
                        </span>
                        {missingTerms && missingTerms.length > 0 && (
                          <span className={`text-[10px] px-1 py-0.5 rounded ${missingTerms.every(term => term.includes('参数待确认')) ? 'bg-[#d29922]/15 text-[#d29922]' : 'bg-[#f85149]/10 text-[#ff7b72]'}`}>
                            {missingTerms.every(term => term.includes('参数待确认')) ? '待核' : '缺少'} {missingTerms.slice(0, 2).map(displayConstraintTag).join('、')}
                          </span>
                        )}
                      </div>
                    ) : score >= 30 ? (
                      <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-[#d29922]/20 text-[#d29922]">相关候选 · 待核实参数</span>
                    ) : score >= 10 ? (
                      <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-[#d29922]/20 text-[#d29922]">接近匹配</span>
                    ) : null}

                    {/* Params */}
                    <div className="space-y-1">
                      {getDisplayParams(product).map(([key, val]) => (
                        <div key={key} className="flex items-baseline gap-1 text-xs">
                          <span className="text-[#484f58] min-w-[55px] truncate">{key}:</span>
                          <span className="text-[#e6edf3] truncate">{val}</span>
                        </div>
                      ))}
                    </div>

                    {assessment?.orderableStatus === 'unverified' && !assessment.adjustableOrderables?.length && product._section === 'LDO 线性稳压器选型表' && (
                      <p className="mt-3 rounded border border-[#d29922]/30 bg-[#d29922]/8 px-2 py-1 text-xs text-[#d29922]">
                        选型表可用于目录参数初筛。完整订购号，以及输出电压与封装是否属于同一订购型号，仍待核对；实际工作点和散热条件也需单独核验。
                      </p>
                    )}

                    {(assessment?.orderableStatus === 'configuration_found' || !!assessment?.adjustableOrderables?.length) && (
                      <details className="mt-3 text-xs text-[#8b949e]">
                        <summary className="cursor-pointer text-[#58a6ff]">已核对订购表：{(assessment.matchingOrderables?.length || 0) + (assessment.adjustableOrderables?.length || 0)} 个相关料号</summary>
                        <p className="mt-1">仅核对 {assessment.orderableCheckedTags?.join('、')}；输入电压、电流及实际工况不由这张订购表证明。</p>
                        {assessment.matchingOrderables?.map(config => (
                          <p key={config.orderNumber} className="mt-1 font-mono text-[#e6edf3]">
                            {config.orderNumber} · {config.outputVoltageV}V · {config.package}
                            <span className="font-sans text-[#8b949e]">（{config.source.document} 订购表第 {config.source.page} 页{config.source.outputEvidence ? `；输出档位第 ${config.source.outputEvidence.physicalPage} 页` : ''}）</span>
                          </p>
                        ))}
                        {assessment.adjustableOrderables?.map(config => (
                          <p key={config.orderNumber} className="mt-1 font-mono text-[#d29922]">
                            {config.orderNumber} · 可调 {config.adjustableRangeV.min}–{config.adjustableRangeV.max}V · {config.package} · {config.features}
                            <span className="font-sans text-[#8b949e]">（输出需外部设定；{config.source.document} 第 {config.source.outputEvidence?.physicalPage}、{config.source.rangeEvidence.physicalPage}、{config.source.page} 页）</span>
                          </p>
                        ))}
                        {assessment.orderableStatus === 'unverified' && <p className="mt-1 text-[#d29922]">仅有可调版本覆盖所提电压；固定输出组合未列出，实际设定仍需核验。</p>}
                      </details>
                    )}
                    {assessment?.namedRailCheck && (
                      <details className="mt-2 text-xs text-[#8b949e]">
                        <summary className="cursor-pointer text-[#58a6ff]">双电源轨工作条件核对</summary>
                        <p className={`mt-1 ${assessment.namedRailCheck.status === 'outside_documented_bounds' ? 'text-[#ff7b72]' : 'text-[#e6edf3]'}`}>
                          VCCA={assessment.namedRailCheck.vccaV}V，VCCB={assessment.namedRailCheck.vccbV}V：{assessment.namedRailCheck.status === 'inside_documented_bounds' ? '满足已列电气条件' : '不满足已列电气条件'}。封装、订购料号及实际应用仍需分别核验。
                        </p>
                        {assessment.namedRailCheck.sources.map(source => (
                          <p key={source.factId} className="mt-1 ml-2">
                            {source.document} · 物理页 {source.page} · {source.originalHeader}：{source.originalValue}
                          </p>
                        ))}
                      </details>
                    )}
                    {assessment?.operatingChecks?.some(check => check.thermal?.exceedsFullRatedAmbientRange) && (
                      <p className="mt-2 rounded border border-[#f85149]/40 bg-[#f85149]/10 px-2 py-1 text-xs text-[#ff7b72]">
                        散热警示：按该封装规格书热阻估算，所提输入电压与负载电流下，即使取额定最低环境温度也会超出结温上限。请展开工作范围核对并复核 PCB 散热。
                      </p>
                    )}
                    {!!assessment?.thermalReferenceChecks?.length && (
                      <details className="mt-2 text-xs text-[#8b949e]" open={assessment.thermalReferenceChecks.some(check => check.belowRoomTemperature)}>
                        <summary className="cursor-pointer text-[#ff7b72]">NSR31 散热参考：实际应用仍需核验</summary>
                        {assessment.thermalReferenceChecks.map(check => (
                          <div key={check.orderNumber} className="mt-2">
                            <p className={check.belowRoomTemperature ? 'text-[#ff7b72]' : 'text-[#d29922]'}>
                              {check.orderNumber}：{check.inputV}V、{check.outputCurrentA * 1000}mA、{check.outputVoltageV}V；按 {check.referenceBoard} 的 θJA={check.referenceThetaJaCPerW}°C/W，忽略静态电流后的乐观环境温度上限为 {check.optimisticMaximumAmbientC}°C。
                            </p>
                            <p>此值只用于提示散热风险。规格书建议避免长期结温超过 {check.junctionGuidanceC}°C；实际 PCB、环境温度、压差和器件温度仍需验证。</p>
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[#58a6ff]">查看原 PDF 条件</summary>
                              {check.sources.map(source => (
                                <p key={source.factId} className="mt-1 ml-2">
                                  {source.document} · 物理页 {source.page} · {source.originalHeader}：{source.originalValue}
                                </p>
                              ))}
                            </details>
                          </div>
                        ))}
                      </details>
                    )}
                    {!!assessment?.operatingChecks?.length && (
                      <details className="mt-2 text-xs text-[#8b949e]">
                        <summary className="cursor-pointer text-[#58a6ff]">规格书工作范围核对</summary>
                        {assessment.operatingChecks.map(check => (
                          <div key={check.orderNumber} className="mt-2">
                            <p className={check.status === 'outside_documented_bounds' ? 'text-[#ff7b72]' : 'text-[#e6edf3]'}>
                              {check.orderNumber}：{check.status === 'outside_documented_bounds' ? '所提运行点超出已列工作范围' : '所提数值在已列电气范围内'}
                            </p>
                            <p>VIN ≥ {check.minimumInputV}V 且 ≤ {check.maximumInputV}V；IOUT ≤ {check.maximumOutputCurrentA * 1000}mA。使能、输出电容和实际结温仍需核验。</p>
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[#58a6ff]">查看工作范围原 PDF 依据</summary>
                              {check.sources.map(source => (
                                <p key={source.factId} className="mt-1 ml-2">
                                  {source.document} · 物理页 {source.page} · {source.originalHeader}：{source.originalValue}
                                </p>
                              ))}
                            </details>
                            {check.thermal && (
                              <div>
                                <p className={check.thermal.exceedsFullRatedAmbientRange ? 'text-[#ff7b72]' : 'text-[#d29922]'}>
                                  按规格书该封装 θJA={check.thermal.referenceThetaJaCPerW}°C/W 估算，忽略接地电流后的乐观环境温度上限为 {check.thermal.optimisticMaximumAmbientC}°C；
                                  {check.thermal.exceedsFullRatedAmbientRange ? '低于额定环境温度下限，需优先复核散热/PCB 方案。' : '实际 PCB 和环境温度仍需核验。'}
                                </p>
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-[#58a6ff]">查看热估算原 PDF 依据</summary>
                                  {check.thermal.sources.map(source => (
                                    <p key={source.factId} className="mt-1 ml-2">
                                      {source.document} · 物理页 {source.page} · {source.originalHeader}：{source.originalValue}
                                    </p>
                                  ))}
                                </details>
                              </div>
                            )}
                          </div>
                        ))}
                      </details>
                    )}
                    {assessment?.orderableStatus === 'no_listed_configuration' && (
                      <p className="mt-3 text-xs text-[#d29922]">这版原厂订购表未列出同时满足 {assessment.orderableCheckedTags?.join('、')} 的配置。</p>
                    )}

                    {/* Matched terms highlight with evidence source */}
                    {matchedTerms.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {matchedTerms.slice(0, 4).map(t => {
                          const ev = evidence?.find(e => e.term === t);
                          return (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#d29922]/15 text-[#d29922]">
                            ✓ {displayConstraintTag(t)}{ev?.source && ev.source !== '产品标签' ? <span className="text-[#8b949e] ml-0.5">({ev.source})</span> : null}
                          </span>
                          );
                        })}
                      </div>
                    )}

                    {parameterChecks && Object.keys(parameterChecks).length > 0 && (
                      <details className="mt-3 text-xs text-[#8b949e]">
                        <summary className="cursor-pointer">参数判断依据</summary>
                        {Object.entries(parameterChecks).map(([tag, check]) => (
                          <div key={tag} className="mt-2">
                            <p>{displayConstraintTag(tag)}：{({ matched: '满足', unmatched: '不满足', unknown: '待确认' })[check.status]} · {check.reason}</p>
                            {check.evidence.map((fact, i) => <p key={i}>{fact.source.field}：{fact.source.raw}</p>)}
                          </div>
                        ))}
                      </details>
                    )}
                    {sourceEvidence && Object.keys(sourceEvidence).length > 0 && (
                      <details className="mt-2 text-xs text-[#8b949e]">
                        <summary className="cursor-pointer">原 PDF 来源</summary>
                        {Object.entries(sourceEvidence).map(([tag, refs]) => (
                          <div key={tag} className="mt-2">
                            <p className="text-[#e6edf3]">{displayConstraintTag(tag)}</p>
                            {refs.map(ref => (
                              <p key={ref.factId} className="ml-2">
                                {ref.document} · 物理页 {ref.page} · {ref.originalHeader.replace(/\s+/g, '')}：{ref.originalValue.replace(/\s+/g, ' ')}
                                {releaseId && ref.wikiFactPage?.startsWith('wiki/facts/') && (
                                  <a className="ml-2 text-[#58a6ff] underline" href={wikiPageUrl(releaseId, ref.wikiFactPage)} target="_blank" rel="noopener noreferrer">Wiki 事实页</a>
                                )}
                              </p>
                            ))}
                          </div>
                        ))}
                      </details>
                    )}
                  </details>
                  <button
                    onClick={() => onToggleCompare(vendor, product.part_number)}
                    className={`mt-3 text-xs px-2 py-1 rounded transition-all ${
                      compareList.includes(productIdentity(vendor, product.part_number))
                        ? "bg-[#3fb950]/20 text-[#3fb950] border border-[#3fb950]/30"
                        : "text-[#1e6ef0] hover:text-[#58a6ff]"
                    }`}
                  >
                    {compareList.includes(productIdentity(vendor, product.part_number)) ? "✓ 已加入对比" : "+ 加入对比"}
                  </button>
                </div>
              );})}
            </div>

            {displayResults.length > 5 && <div className="mt-4 text-center">
              {shown.length < ranked.length && <button type="button" className="rounded-lg border border-[#30363d] px-4 py-2 text-sm text-[#79c0ff]"
                onClick={() => setExpanded({key:listKey,limit:visibleLimit + 25})}>
                查看更多型号（再看 {Math.min(25, ranked.length-shown.length)} 款）
              </button>}
              {visibleLimit > 5 && <button type="button" className="ml-2 px-4 py-2 text-sm text-[#79c0ff]"
                onClick={() => setExpanded(null)}>收起其余型号</button>}
            </div>}

            {displayResults.length === 0 && search.trim() && (
              <div className="text-center py-12 text-[#8b949e]">
                {visibleSuggestions.length > 0 ? (
                  <SuggestionCards
                    suggestions={visibleSuggestions}
                    search={search}
                    onApplySuggestion={onApplySuggestion}
                    variant="full"
                  />
                ) : (
                  <>
                    <div className="text-4xl mb-4">🔍</div>
                    <p>{llmResult?.componentSearch?.status==='screened' ? '以上为功能模块资料线索；整套方案仍需接口、供电、隔离和系统试验验证' : llmResult?._debug?.planStatus === 'engineering_only' ? '需补齐方案资料与核验路径后再进行型号匹配' : llmResult?.category_hint === '完整需求计划' && llmResult._debug?.planStatus === 'validated'
                      ? '当前未找到全部必要条件均有证据支持的型号'
                      : llmResult?._debug?.planStatus === 'unavailable'
                      ? '完整选型条件尚未核验，暂无可展示的型号'
                      : <>未找到匹配 &quot;{search}&quot; 的芯片</>}</p>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-[#8b949e]">
            <div className="text-5xl mb-4">🔎</div>
            <p className="text-lg">输入完整需求后点击搜索</p>
            <p className="text-sm mt-2">模型理解完整需求后，再核验型号参数与证据</p>
          </div>
        )}
      </main>
    </>
  );
}

"use client";

import {
  getCategoryBadge,
  CATEGORY_BADGE_SET,
  getDisplayParams,
  getEvidenceSources,
  type Product,
  type SearchResult,
  type VendorFilterOption,
  type LLMInterpretation,
  type VendorData,
} from "@/app/product-utils";
import SuggestionCards from "./SuggestionCards";

type ConstraintView = {
  tier: number | null;
  banner: string;
  items: any[];
  vendorByPn?: Map<string, { vendor: string; vendorName: string }>;
  niceRequested?: string[];
} | null;

type CrossRefData = {
  target: string;
  hits: any[];
  vendorByPn: Map<string, { vendor: string; vendorName: string }>;
} | null;

type Props = {
  loading: boolean;
  results: SearchResult[] | null;
  displayResults: SearchResult[];
  constraintView: ConstraintView;
  llmResult: LLMInterpretation;
  crossRef: CrossRefData;
  search: string;
  visibleSuggestions: { text: string; query: string; reason: string }[];
  onApplySuggestion: (query: string) => void;
  compareList: string[];
  onToggleCompare: (part: string) => void;
  preferredPns: Set<string>;
  vendors: VendorFilterOption[];
  totalProducts: number;
  activeVendor: string | null;
  onVendorChange: (vendor: string | null) => void;
};

export default function ResultsList({
  loading,
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
  activeVendor,
  onVendorChange,
}: Props) {
  return (
    <>
      {/* Vendor filters */}
      <div className="sticky top-[57px] z-40 backdrop-blur-xl bg-[#0d1117]/90 border-b border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex gap-2 overflow-x-auto">
          <button onClick={() => onVendorChange(null)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${!activeVendor ? "bg-[#1e6ef0] text-white" : "bg-[#161b22] text-[#8b949e] hover:text-white border border-[#30363d]"}`}>
            全部 ({totalProducts})
          </button>
          {vendors.map((v) => (
            <button key={v.key} onClick={() => onVendorChange(activeVendor === v.key ? null : v.key)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${activeVendor === v.key ? "bg-[#1e6ef0] text-white" : "bg-[#161b22] text-[#8b949e] hover:text-white border border-[#30363d]"}`}>
              {v.name} ({v.productCount})
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#1e6ef0] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results ? (
          <>
            <div className="mb-4 text-sm text-[#8b949e] flex items-center justify-between">
              <span>找到 {displayResults.length} 个匹配 · {constraintView && (constraintView.tier || 0) > 1 ? "降级排序" : (llmResult?.sortKey ? llmResult.sortKey.label : "按相关度排序")}</span>
              <span className="text-xs">显示 {Math.min(displayResults.length, 200)} 个</span>
            </div>

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
            {constraintView && constraintView.banner && (
              <div className="mb-4 max-w-3xl bg-[#d29922]/8 border border-[#d29922]/30 rounded-lg p-3">
                <p className="text-[#e6edf3] text-sm">{constraintView.banner}</p>
              </div>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {displayResults.slice(0, 200).map(({ vendor, vendorName, product, score, matchedTerms, missingTerms, missingNice, matchSummary, referenceOnly, nicePartial, evidence, downgradeHits }) => (
                <div key={`${vendor}-${product.part_number}`} className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#1e6ef0] hover:shadow-[0_0_16px_rgba(30,110,240,0.1)] transition-all group">
                  {/* Part number + vendor + score */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-mono font-bold text-[#58a6ff] group-hover:text-white transition-colors text-sm truncate max-w-[65%]">
                      {product.part_number}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e6ef0]/15 text-[#8b949e] whitespace-nowrap">
                      {vendorName} · {matchSummary || score.toFixed(1)}
                    </span>
                  </div>

                  {/* Category tag from _features (more reliable than _section) */}
                  {(() => {
                    const categoryTag = getCategoryBadge(product);
                    const isCanonicalCategory = CATEGORY_BADGE_SET.has(categoryTag);
                    return categoryTag ? (
                      <div className={`mb-2 text-xs px-2 py-0.5 rounded inline-block ${isCanonicalCategory ? "text-[#3fb950] bg-[#3fb950]/10" : "text-[#8b949e] bg-[#8b949e]/10"}`}>
                        {categoryTag}
                      </div>
                    ) : null;
                  })()}

                  {/* Match quality badge + 霆宝优选 */}
                  {matchSummary ? (
                    <div className="mb-2 flex flex-wrap items-center gap-1">
                      {preferredPns.has(product.part_number?.toUpperCase() || '') && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-[#f0883e]/20 text-[#f0883e] font-medium">霆宝优选</span>
                      )}
                      <span className={`text-[10px] px-1 py-0.5 rounded ${referenceOnly ? "bg-[#d29922]/20 text-[#d29922]" : nicePartial ? "bg-[#1e6ef0]/15 text-[#58a6ff]" : downgradeHits && Object.keys(downgradeHits).length > 0 ? "bg-[#1e6ef0]/15 text-[#58a6ff]" : "bg-[#3fb950]/20 text-[#3fb950]"}`}>
                        {referenceOnly ? "参考料" : nicePartial ? `部分匹配（缺少${(missingNice || []).join('、')}）` : downgradeHits && Object.keys(downgradeHits).length > 0 ? `降级兼容 (${Object.values(downgradeHits).join('、')})` : "完全匹配"}
                      </span>
                      {missingTerms && missingTerms.length > 0 && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-[#f85149]/10 text-[#ff7b72]">
                          缺少 {missingTerms.slice(0, 2).join('、')}
                        </span>
                      )}
                    </div>
                  ) : score >= 30 ? (
                    <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-[#3fb950]/20 text-[#3fb950]">精确匹配</span>
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

                  {/* Matched terms highlight with evidence source */}
                  {matchedTerms.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {matchedTerms.slice(0, 4).map(t => {
                        const ev = evidence?.find(e => e.term === t);
                        return (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#d29922]/15 text-[#d29922]">
                          ✓ {t}{ev?.source && ev.source !== '产品标签' ? <span className="text-[#8b949e] ml-0.5">({ev.source})</span> : null}
                        </span>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => onToggleCompare(product.part_number)}
                    className={`mt-3 text-xs px-2 py-1 rounded transition-all ${
                      compareList.includes(product.part_number)
                        ? "bg-[#3fb950]/20 text-[#3fb950] border border-[#3fb950]/30"
                        : "text-[#1e6ef0] hover:text-[#58a6ff]"
                    }`}
                  >
                    {compareList.includes(product.part_number) ? "✓ 已加入对比" : "+ 加入对比"}
                  </button>
                </div>
              ))}
            </div>

            {displayResults.length > 200 && (
              <div className="text-center py-8 text-[#8b949e] text-sm">显示前 200 个 · 请缩小搜索范围</div>
            )}

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
                    <p>未找到匹配 &quot;{search}&quot; 的芯片</p>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-[#8b949e]">
            <div className="text-5xl mb-4">🔎</div>
            <p className="text-lg">输入型号、参数或需求开始搜索</p>
            <p className="text-sm mt-2">试试：CAN-FD · 小封装 · 车规隔离</p>
          </div>
        )}
      </main>
    </>
  );
}

"use client";

import { expandSearch } from "@/lib/synonyms";
import type { LLMInterpretation } from "@/app/product-utils";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  llmLoading: boolean;
  llmResult: LLMInterpretation;
  totalProducts: number;
  vendorCount: number;
};

export default function SearchBar({
  search,
  onSearchChange,
  onSearchSubmit,
  llmLoading,
  llmResult,
  totalProducts,
  vendorCount,
}: Props) {
  return (
    <section className="relative overflow-hidden border-b border-[#30363d]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1e6ef0]/10 via-transparent to-[#58a6ff]/5" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20 text-center">
        <h2 className="text-3xl sm:text-5xl font-bold mb-4">
          <span className="text-gradient">Teampo</span>
          <span className="text-white"> 选型平台</span>
        </h2>
        <p className="text-[#8b949e] text-lg max-w-2xl mx-auto mb-8">
          纳芯微 · 思瑞浦 · 裕太微 — {totalProducts} 个芯片，智能评分排序
        </p>
        <div className="max-w-xl mx-auto relative">
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索参数、应用需求，如 CAN-FD 特定帧唤醒..."
            className="w-full px-5 py-3.5 pr-12 rounded-xl bg-[#161b22] border border-[#30363d] text-white placeholder-[#484f58] focus:outline-none focus:border-[#1e6ef0] focus:ring-2 focus:ring-[#1e6ef0]/20 text-base transition-all"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter' && search.trim()) onSearchSubmit(); }}
          />
          <button
            onClick={() => {
              if (search.trim().length >= 3) onSearchSubmit();
            }}
            disabled={llmLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-[#1e6ef0]/10 hover:bg-[#1e6ef0]/20 border border-[#1e6ef0]/30 hover:border-[#1e6ef0]/50 transition-all disabled:opacity-50"
            title="搜索"
          >
            {llmLoading ? (
              <div className="w-4 h-4 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 text-[#58a6ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </button>
        </div>
        {/* Synonym hint */}
        {search.trim() && (() => {
          const expanded = expandSearch(search.trim());
          const originalTerms = search.trim().toLowerCase().split(/\s+/);
          const newTerms = expanded.split(/\s+/).filter(t => !originalTerms.includes(t));
          if (newTerms.length === 0) return null;
          return (
            <div className="mt-2 flex items-center justify-center gap-1 text-xs text-[#484f58]">
              <span>🔍 智能匹配:</span>
              {newTerms.slice(0, 5).map(t => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-[#1e6ef0]/10 text-[#58a6ff]">{t}</span>
              ))}
            </div>
          );
        })()}
        {/* LLM interpretation */}
        {llmLoading && (
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-[#484f58]">
            <div className="w-3 h-3 border border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
            <span>AI 正在理解您的需求...</span>
          </div>
        )}
        {llmResult && !llmLoading && (
          <div className="mt-2 max-w-xl mx-auto p-3 rounded-lg bg-[#3fb950]/5 border border-[#3fb950]/20 text-left">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-[#3fb950] font-medium">🤖 AI 理解:</span>
              <span className="text-xs text-[#8b949e]">置信度 {llmResult.confidence}</span>
            </div>
            <p className="text-xs text-[#e6edf3]">{llmResult.explanation}</p>
            {llmResult.features.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {llmResult.features.map(f => (
                  <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-[#3fb950]/15 text-[#3fb950]">{f}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

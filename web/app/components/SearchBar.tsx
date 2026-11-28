"use client";

import { useRef, useState } from "react";
import VoiceInput from "./VoiceInput";
import { displayConstraintTag, type LLMInterpretation } from "@/app/product-utils";
import { normalizeVoiceTranscript, voiceTranscriptFields } from "@/lib/voice-transcript";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  llmLoading: boolean;
  llmResult: LLMInterpretation;
  totalProducts: number;
  vendorCount: number;
  modelAvailable: boolean;
};

export default function SearchBar({
  search,
  onSearchChange,
  onSearchSubmit,
  llmLoading,
  llmResult,
  totalProducts,
  vendorCount,
  modelAvailable,
}: Props) {
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState<string | null>(null);
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const hasVoiceDraft = voiceDraft !== null;
  const searchDisabled = llmLoading || voiceActive || hasVoiceDraft || !search.trim();
  const voiceFields = voiceDraft === null ? [] : voiceTranscriptFields(voiceDraft);
  const acceptVoiceDraft = () => {
    const utterance = voiceDraft?.trim();
    if (!utterance) return;
    onSearchChange([search.trimEnd(), utterance].filter(Boolean).join('\n'));
    setVoiceDraft(null);
  };
  return (
    <section className="relative overflow-hidden border-b border-[#30363d]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1e6ef0]/10 via-transparent to-[#58a6ff]/5" />
      <div className={`relative max-w-7xl mx-auto px-4 sm:px-6 ${llmResult ? 'py-5 sm:py-6' : 'py-12 sm:py-20'} text-center`}>
        {!llmResult&&<h2 className="text-3xl sm:text-5xl font-bold mb-4">
          <span className="text-gradient">Teampo</span>
          <span className="text-white"> 选型平台</span>
        </h2>}
        {!llmResult&&<p className="text-[#8b949e] text-lg max-w-2xl mx-auto mb-8">
          纳芯微 · 思瑞浦 · 裕太微 — {totalProducts} 个芯片，智能评分排序
        </p>}
        <div className="max-w-3xl mx-auto text-left">
          <label htmlFor="selection-query" className="sr-only">选型需求</label>
          <textarea
            id="selection-query"
            rows={3}
            value={search}
            readOnly={voiceActive}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="输入或语音描述需求，如：车规 Buck，12V 转 3.3V，输出至少 3A…"
            aria-describedby="voice-help"
            className="w-full min-h-28 resize-y px-4 py-3 rounded-xl bg-[#161b22] border border-[#30363d] text-white placeholder-[#6e7681] focus:outline-none focus:border-[#1e6ef0] focus:ring-2 focus:ring-[#1e6ef0]/20 text-base leading-relaxed transition-all"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !searchDisabled) { e.preventDefault(); onSearchSubmit(); } }}
          />
          <div className="mt-2 flex items-start justify-between gap-3">
            <VoiceInput onTranscript={setVoiceDraft} onActiveChange={setVoiceActive} disabled={llmLoading} reviewPending={hasVoiceDraft} />
            <button type="button" onClick={onSearchSubmit} disabled={searchDisabled}
              className="min-h-11 shrink-0 px-5 rounded-lg bg-[#1e6ef0] text-sm font-medium text-white hover:bg-[#388bfd] focus-visible:outline-2 focus-visible:outline-[#58a6ff] disabled:opacity-50">
              {llmLoading ? '搜索中…' : '搜索'}
            </button>
          </div>
          {voiceDraft !== null && <section aria-label="语音转写核对" className="mt-3 rounded-lg border border-[#31556d] bg-[#10212b] p-3 text-sm text-[#c9d1d9]">
            <label htmlFor="voice-draft" className="font-medium text-[#a5e6f5]">核对语音转写</label>
            <p id="voice-draft-help" className="mt-1 text-xs">检查型号、数值和单位，可直接修改。点下方字段可定位原句。</p>
            <textarea id="voice-draft" ref={draftInput} rows={3} value={voiceDraft} aria-describedby="voice-draft-help"
              onChange={event => setVoiceDraft(event.target.value)}
              className="mt-2 w-full rounded border border-[#466071] bg-[#161b22] px-3 py-2 text-base text-white focus-visible:outline-2 focus-visible:outline-[#58a6ff]" />
            {voiceFields.length > 0 && <div className="mt-1 flex max-h-44 flex-wrap gap-1 overflow-y-auto">
              {voiceFields.map(field => <button type="button" key={field.start} aria-label={`${field.kind} ${field.text}`}
                className="min-h-9 max-w-full break-all rounded border border-[#466071] px-2 text-xs text-[#ffe6a4] hover:bg-[#1b3445]"
                onClick={() => {
                  draftInput.current?.focus();
                  draftInput.current?.setSelectionRange(field.start, field.end);
                }}>{field.text}</button>)}
            </div>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={acceptVoiceDraft} disabled={!voiceDraft.trim()}
                className="min-h-11 rounded bg-[#1e6ef0] px-3 font-medium text-white disabled:opacity-50">确认并填入</button>
              {voiceFields.some(field => field.normalized) && <button type="button"
                onClick={() => setVoiceDraft(normalizeVoiceTranscript(voiceDraft, voiceFields))}
                className="min-h-11 px-2 text-[#a5e6f5]">统一数值写法</button>}
              <button type="button" onClick={() => setVoiceDraft(null)} className="min-h-11 px-2">丢弃</button>
            </div>
          </section>}
          <p className="mt-1 text-xs text-[#8b949e]">Enter 搜索，Shift+Enter 换行。</p>
        </div>
        <p className="mt-2 text-xs text-[#8b949e]">点击搜索或按回车，将本次需求及相关资料片段发送给 DeepSeek，由模型理解完整需求后核验候选；输入过程中不调用模型。</p>
        {!modelAvailable&&<p className="mt-1 text-xs text-[#8b949e]">提交时检查模型服务状态；不可用时提示重试，不切换到规则推荐。</p>}
        {/* LLM interpretation */}
        {llmLoading && (
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-[#484f58]">
            <div className="w-3 h-3 border border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
            <span>正在检索与核验…</span>
          </div>
        )}
        {llmResult && !llmLoading && (
          <details className="mt-2 max-w-xl mx-auto px-3 py-2 rounded-lg border border-[#30363d] text-left">
            <summary className="cursor-pointer text-xs text-[#8b949e]">查看本次识别的搜索条件</summary>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-[#3fb950] font-medium">{llmResult.executionAudit?.status === 'partial' ? '需求已理解 · 必要条件筛选未完成：' : llmResult._debug?.planStatus === 'unavailable' ? '需求理解未完成：' : llmResult._debug?.planStatus === 'component_screening' ? '1. 需求理解'  : llmResult._debug?.planStatus === 'engineering_only' ? '工程需求已理解，待补资料与核验：' : llmResult._debug?.planStatus === 'validated' ? '需求理解与核验：'
                : llmResult._debug?.llmSucceeded ? llmResult._debug?.planStatus === 'unavailable' ? '模型回复待核验：' : '模型需求理解：' : llmResult._debug?.llmCalled ? '模型请求未完成：' : llmResult._debug?.reason === 'pn_exact_match' ? '目录型号查询：' : '目录查询结果：'}</span>
              <span className="text-xs text-[#8b949e]">置信度 {llmResult.confidence}</span>
            </div>
            {!llmResult.engineeringUnderstanding&&<p className="text-xs text-[#e6edf3]">{llmResult.explanation.replaceAll('车规AEC-Q100', '车规级')}</p>}
            {llmResult.features.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {llmResult.features.map(f => (
                  <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-[#3fb950]/15 text-[#3fb950]">{displayConstraintTag(f)}</span>
                ))}
              </div>
            )}
          </details>
        )}
      </div>
    </section>
  );
}

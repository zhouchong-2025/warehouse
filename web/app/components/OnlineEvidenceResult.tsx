import { salesEvidenceLine, type OnlineCheck, type OnlineCitation } from '@/lib/online-evidence-summary';

type OnlineDocument = { sha256: string; identityStatus: string };

function CitationLink({citation}: {citation:OnlineCitation}) {
  return <a href={citation.url.split('#')[0] + '#page=' + citation.page} target="_blank" rel="noreferrer"
    className="text-[#79c0ff] underline">原厂 PDF · 第 {citation.page} 页</a>;
}

export default function OnlineEvidenceResult({pn, checks, documents = [], applicability = [], errors = [], cacheHit}: {
  pn: string;
  checks: OnlineCheck[];
  documents?: OnlineDocument[];
  applicability?: OnlineCitation[];
  errors?: {reason:string}[];
  cacheHit?: boolean;
}) {
  return <section aria-label={pn + ' 联网补查结果'} className="mt-3 rounded-lg border border-[#31556d] bg-[#0d2036] p-3 text-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="font-semibold text-[#a5e6f5]">{pn} · 联网补查</h4>
      {cacheHit && <span className="text-xs text-[#8b949e]">复用补查记录</span>}
    </div>
    <dl className="mt-2 divide-y divide-[#31556d]">
      {checks.map((check,index) => {
        const line = salesEvidenceLine(check);
        return <div key={check.requirementId || index} className="py-2">
          <dt className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium">{line.label}</span>
            <span className={check.citations.length && check.outcome === 'supports' ? 'text-xs text-[#a5e6f5]' : 'text-xs text-[#ffe6a4]'}>{line.status}</span>
          </dt>
          <dd className="mt-1">
            {line.value && <p className="font-semibold text-white">{line.value}</p>}
            {line.condition && <p className="text-xs text-[#c9d1d9]">{line.condition}</p>}
            {line.next && <p className="text-xs text-[#c9d1d9]">{line.next}</p>}
          </dd>
        </div>;
      })}
    </dl>
    {!checks.some(check => check.citations.length) && errors.length > 0 &&
      <p className="mb-2 text-xs text-[#ffe6a4]">本次没有取得可用的原厂依据。</p>}
    <details className="border-t border-[#31556d] pt-2 text-xs text-[#c9d1d9]">
      <summary className="cursor-pointer text-[#79c0ff]">工程复核 · 完整判断与原厂引用</summary>
      {checks.map((check,index) => <div key={check.requirementId || index} className="mt-3 space-y-1">
        <p className="font-medium">{check.source}</p>
        <p>{check.explanation}</p>
        {check.conditions && <p className="text-[#ffe6a4]">{check.conditions}</p>}
        {check.citations.map((citation,i) => <div key={i}>
          <CitationLink citation={citation}/>
          <blockquote className="mt-1 break-words border-l-2 border-[#58a6ff]/40 pl-2">{citation.quote}</blockquote>
        </div>)}
      </div>)}
      {applicability.map((citation,i) => <div key={i} className="mt-2">
        <span>型号适用范围 · </span><CitationLink citation={citation}/>
        <blockquote>{citation.quote}</blockquote>
      </div>)}
      {documents.map(document => <p key={document.sha256} className="mt-2 break-all">{document.identityStatus}<br/>SHA-256：{document.sha256}</p>)}
      {errors.map((item,i) => <p key={i} className="mt-2 text-[#ffe6a4]">{item.reason}</p>)}
      <p className="mt-2 text-[#8b949e]">本次推荐同时参考目录证据和联网补查结果。</p>
    </details>
  </section>;
}

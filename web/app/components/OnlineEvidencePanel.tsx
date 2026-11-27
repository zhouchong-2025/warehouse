'use client';
import manufacturers from '../../lib/manufacturers.json';
import type {EvidenceRequirement} from '../api/online-evidence/policy';
import type { OnlineCheck, OnlineCitation } from '@/lib/online-evidence-summary';
import { submittedOnlineChecks, type OnlineEvidenceUpdate } from '@/lib/online-recommendation';
import OnlineEvidenceResult from './OnlineEvidenceResult';
import { useEffect, useRef, useState } from 'react';

type Research = { jobId?: string; status?: string; stage?: string; error?: string; cacheHit?: boolean;
  result?: { checks: OnlineCheck[]; applicabilityCitations?: OnlineCitation[]; documents: { url: string; sha256: string; identityStatus: string }[];
    errors: { url: string; reason: string }[] } };
export default function OnlineEvidencePanel({ vendor, pn, releaseId, clauses,requirements, onEvidence, resolvedIds, searchRequestId }: {
  vendor: string; pn: string; releaseId: string; clauses: string[];requirements?:EvidenceRequirement[]; onEvidence?: (rows: OnlineEvidenceUpdate[]) => void; resolvedIds?: ReadonlySet<string>; searchRequestId?:string;
}) {
  const [available, setAvailable] = useState(false);
  const [research, setResearch] = useState<Research | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const items:EvidenceRequirement[]=requirements?.length?requirements:clauses.map((source,i)=>({id:`legacy-${i}`,source}));
  const remaining = items.filter(item => !resolvedIds?.has(item.id));
  const [selectedClauses, setSelectedClauses] = useState<string[]>(items.slice(0, 5).map(r=>r.id));
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/api/online-evidence', { signal: abort.signal }).then(r => r.json()).then(x => setAvailable(x.available === true)).catch(() => {});
    return () => { abort.abort(); controller.current?.abort(); };
  }, []);
  const supportedVendor = Object.hasOwn(manufacturers.vendors,vendor);
  const residualChecks = research?.result?.checks.filter(check => !check.requirementId || !resolvedIds?.has(check.requirementId));
  if (!available || !supportedVendor || !clauses.length || (!remaining.length && !residualChecks?.length && !research?.error && !busy)) return null;
  async function start() {
    if (!selectedClauses.length || selectedClauses.length > 5) return;
    const submitted = remaining.filter(r=>selectedClauses.includes(r.id));
    if (!submitted.length) return;
    setConfirming(false);
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setResearch({ stage: '提交补查任务' });
    try {
      const response = await fetch('/api/online-evidence', { method: 'POST', signal: abort.signal,
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ vendor, pn, releaseId,
          searchRequestId, clauses:submitted.map(r=>r.source),...(requirements?.length?{requirements:submitted}:{}), consent: true }) });
      let job = await response.json() as Research;
      if (!response.ok) throw new Error(job.error || '暂时无法补查');
      setResearch(job);
      const deadline = Date.now() + 180000;
      while (job.jobId && ['queued', 'running'].includes(job.status || '') && Date.now() < deadline) {
        await new Promise<void>(resolve => {
          const finish = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', finish); resolve(); };
          const timer = window.setTimeout(finish, 1500);
          abort.signal.addEventListener('abort', finish, { once: true });
        });
        if (abort.signal.aborted) return;
        const poll = await fetch(`/api/online-evidence?jobId=${job.jobId}`, { signal: abort.signal, cache: 'no-store' });
        job = await poll.json(); if (!poll.ok) throw new Error(job.error || '任务状态暂不可用'); setResearch(job);
      }
      if (!abort.signal.aborted && job.status === 'complete' && job.result && requirements?.length)
        onEvidence?.([{vendor,pn,checks:submittedOnlineChecks(job.result.checks,submitted),applicabilityCitations:job.result.applicabilityCitations}]);
      if (job.status === 'queued' || job.status === 'running') setResearch({ ...job, error: '补查仍未完成，可稍后重试；原搜索结果保持不变' });
    } catch (error) {
      if (!abort.signal.aborted) setResearch({ error: error instanceof Error ? error.message : '补查未完成' });
    } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <section className="mt-3 border-t border-[#30363d] pt-2 text-xs text-[#c9d1d9]">
    {!!remaining.length && <button disabled={busy} onClick={() => {setSelectedClauses(remaining.slice(0,5).map(item => item.id));setConfirming(true);}} className="rounded border border-[#58a6ff]/50 px-2 py-1 text-[#79c0ff] disabled:opacity-50">
      {busy ? research?.stage || '正在联网补查…' : research ? '再次补查待核条件' : '只补查此型号'}
    </button>}
    {confirming && <div role="group" aria-label="本次联网补查确认" className="mt-2 rounded border border-[#58a6ff]/40 p-2">
      <p>将向DeepSeek发送 {pn}、以下条件及最多2份原厂PDF相关页摘录（最多14页）。补查结果会更新本次推荐。</p>
      <p className="mt-1">选择本次补查条件：{selectedClauses.length}/5；其余条件保留待核，可分次补查。</p>
      <ul className="my-2 space-y-1">{remaining.map(item => <li key={item.id}><label className="flex items-start gap-2">
        <input type="checkbox" checked={selectedClauses.includes(item.id)} disabled={!selectedClauses.includes(item.id) && selectedClauses.length >= 5}
          onChange={event => setSelectedClauses(previous => event.target.checked ? [...previous, item.id] : previous.filter(s => s !== item.id))} />
        <span>{item.source}</span></label></li>)}</ul>
      <button disabled={!selectedClauses.length} className="mr-2 rounded bg-[#1e6ef0] px-2 py-1 text-white disabled:opacity-50" onClick={start}>确认并联网补查</button>
      <button className="rounded border border-[#30363d] px-2 py-1" onClick={() => setConfirming(false)}>取消</button>
    </div>}
    {research?.error && <p className="mt-2 text-[#ffe6a4]">{research.error}</p>}
    {research?.result && !!residualChecks?.length && <OnlineEvidenceResult pn={pn} checks={residualChecks}
      documents={research.result.documents} errors={research.result.errors} cacheHit={research.cacheHit}/>}
  </section>;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import type { EvidenceCandidate, EvidencePlan } from '../api/online-evidence/batch';

import type { OnlineCheck, OnlineCitation } from '@/lib/online-evidence-summary';
import { submittedOnlineChecks, type OnlineEvidenceUpdate } from '@/lib/online-recommendation';
import OnlineEvidenceResult from './OnlineEvidenceResult';
type BatchRow = {
  vendor: string; pn: string; error?: string; cacheHit?: boolean;
  applicabilityCitations?: OnlineCitation[];
  errors?: { reason: string }[];
  checks: OnlineCheck[];
};
type Job = { jobId?: string; status?: string; stage?: string; error?: string; cacheHit?: boolean; result?: { models: BatchRow[] } };

function identity(row: EvidenceCandidate | BatchRow) {
  return JSON.stringify([row.vendor,row.pn]);
}

export default function EvidenceBatchPanel({ candidates, releaseId, onEvidence, searchRequestId }: {candidates: EvidenceCandidate[]; releaseId: string; searchRequestId?:string; onEvidence?: (rows: OnlineEvidenceUpdate[]) => void}) {
  const [available, setAvailable] = useState(false);
  const [plan, setPlan] = useState<EvidencePlan>();
  const [job, setJob] = useState<Job>();
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [conditionIds, setConditionIds] = useState(new Set<string>());
  const operation = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/online-evidence', {signal:controller.signal}).then(r => r.json())
      .then(r => setAvailable(r.available === true)).catch(() => {});
    return () => {controller.abort(); operation.current?.abort();};
  }, []);

  function conditionKey(requirement: EvidenceCandidate['requirements'][number]) {
    return JSON.stringify([requirement.id, requirement.source]);
  }

  async function submit(action: 'plan_batch' | 'start_batch', items: EvidenceCandidate[]) {
    if (operation.current || !items.length) return;
    const controller = new AbortController();
    operation.current = controller;
    const {signal} = controller;
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/online-evidence', {
        method:'POST', signal, headers:{'content-type':'application/json'},
        body:JSON.stringify({action, releaseId, searchRequestId, candidates:items, consent:action === 'start_batch'}),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || '补查暂不可用');
      if (action === 'plan_batch') {
        const proposed = value as EvidencePlan;
        const rows = proposed.groups.flatMap(group => group.candidates);
        setSelected(new Set(rows.map(identity)));
        setConditionIds(new Set(rows.flatMap(row => row.requirements.map(conditionKey))));
        setPlan(proposed);
        return;
      }
      setPlan(undefined);
      setShowAll(false);
      let current = value as Job;
      setJob(current);
      const deadline = Date.now() + 240000;
      while (current.jobId && ['queued','running'].includes(current.status || '') && Date.now() < deadline) {
        await new Promise(resolve => window.setTimeout(resolve,1500));
        if (signal.aborted) return;
        const next = await fetch('/api/online-evidence?jobId=' + current.jobId, {signal,cache:'no-store'});
        current = await next.json();
        if (!next.ok) throw new Error(current.error || '暂时无法读取补查进度');
        setJob(current);
      }
      if (!signal.aborted && current.status === 'complete' && current.result)
        onEvidence?.(current.result.models.flatMap(row => {
          const candidate = items.find(item => identity(item) === identity(row));
          return candidate && !row.error ? [{...row,checks:submittedOnlineChecks(row.checks,candidate.requirements)}] : [];
        }));
      if (['queued','running'].includes(current.status || '')) setError('后台仍在补查，稍后可重新提交同一范围以读取原任务。');
    } catch (failure) {
      if (!signal.aborted) setError(failure instanceof Error ? failure.message : '补查未完成');
    } finally {
      operation.current = null;
      if (!signal.aborted) setBusy(false);
    }
  }

  if (!available || (!candidates.length && !job && !busy && !plan)) return null;
  const planned = plan?.groups.flatMap(group => group.candidates) || [];
  const conditions = [...new Map(planned.flatMap(row => row.requirements.map(r => [conditionKey(r),r] as const))).values()];
  const chosen = planned.filter(row => selected.has(identity(row)))
    .map(row => ({...row,requirements:row.requirements.filter(r => conditionIds.has(conditionKey(r)))}))
    .filter(row => row.requirements.length);
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  };

  return <section aria-label="推荐联网补查" className="mb-4 rounded-lg border border-[#31556d] bg-[#10212b] p-4 text-sm text-[#c9d1d9]">
    <p className="font-semibold text-[#a5e6f5]">优先补查待核条件</p>
    {!plan && (busy || candidates.length > 0) && <button className="mt-2 rounded border border-[#58a6ff]/50 px-3 py-2 disabled:opacity-50" disabled={busy}
      onClick={() => submit('plan_batch',candidates)}>{busy ? job?.stage || '正在处理…' : '查看首批补查范围'}</button>}
    {plan && <div className="mt-3 space-y-2">
      {plan.groups.map((group,index) => <fieldset key={index}>
        <legend>{group.sourceUrl ? '共用原厂规格书' : '需查找原厂规格书'}</legend>
        {group.candidates.map(row => <label key={identity(row)} className="mr-4 inline-flex items-center gap-1">
          <input type="checkbox" checked={selected.has(identity(row))} disabled={busy}
            onChange={() => setSelected(previous => toggle(previous,identity(row)))}/>{row.pn}
        </label>)}
      </fieldset>)}
      <fieldset>
        <legend>补查条件</legend>
        {conditions.map(r => <label key={conditionKey(r)} className="mr-4 inline-flex items-center gap-1">
          <input type="checkbox" checked={conditionIds.has(conditionKey(r))} disabled={busy}
            onChange={() => setConditionIds(previous => toggle(previous,conditionKey(r)))}/>{r.source}
        </label>)}
      </fieldset>
      <p>预计本批预算 ¥{plan.estimatedPeakCny.toFixed(2)}（按高峰价保守估算）。确认后会将所选型号、条件和相关原厂摘录发送给 DeepSeek。</p>
      <button className="rounded bg-[#1e6ef0] px-3 py-2 text-white disabled:opacity-50" disabled={busy || !chosen.length}
        onClick={() => submit('start_batch',chosen)}>确认并联网补查 {chosen.length} 款</button>
      <button className="ml-2 px-2 py-2" disabled={busy} onClick={() => setPlan(undefined)}>取消</button>
    </div>}
    {(error || job?.error) && <p role="status" className="mt-2 text-[#ffe6a4]">{error || job?.error}</p>}
    {job?.result && <div className="mt-2">
      <p role="status" className="text-[#a5e6f5]">已补查 {job.result.models.length} 款 · 要点见下方型号卡片</p>
      {job.result.models.filter(row => row.error).map(row =>
        <p key={identity(row)} className="mt-1 text-[#ffe6a4]">{row.pn} · {row.error}</p>)}
      {job.result.models.some(row => !row.error) && <details className="mt-1">
        <summary className="cursor-pointer text-xs text-[#8b949e]">查看本批补查记录</summary>
        {job.result.models.filter(row => !row.error).slice(0,showAll ? undefined : 2).map(row =>
          <OnlineEvidenceResult key={identity(row)} pn={row.pn} checks={row.checks}
            applicability={row.applicabilityCitations} errors={row.errors} cacheHit={job.cacheHit || row.cacheHit}/>)}
        {job.result.models.filter(row => !row.error).length > 2 && <button type="button" className="mt-2 text-[#79c0ff] underline"
          onClick={() => setShowAll(open => !open)}>{showAll ? '收起其余记录' : '查看更多记录'}</button>}
      </details>}
    </div>}
  </section>;
}

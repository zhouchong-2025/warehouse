import type { RequirementLedger, LedgerStatus } from '../app/api/interpret/requirement-ledger';
import type { SearchResult } from '../app/product-utils';
import type { EvidenceRequirement } from '../app/api/online-evidence/policy';
import { allowedManufacturerUrl } from '../app/api/online-evidence/policy';
import type { OnlineCheck, OnlineCitation } from './online-evidence-summary';

export type OnlineEvidenceUpdate = {vendor: string; pn: string; checks: OnlineCheck[]; applicabilityCitations?: OnlineCitation[]};
type ConditionCheck = OnlineCheck & {requirementId: string; applicabilityCitations?: OnlineCitation[]};
export type OnlineRecommendation = Record<string, Record<string, ConditionCheck>>;

const identity = (vendor: string, pn: string) => JSON.stringify([vendor,pn]);

export function submittedOnlineChecks(checks: OnlineCheck[], requirements: EvidenceRequirement[]): OnlineCheck[] {
  return checks.filter(check => requirements.some(r => r.id === check.requirementId && r.source === check.source));
}

export function mergeOnlineRecommendation(previous: OnlineRecommendation, updates: OnlineEvidenceUpdate[]): OnlineRecommendation {
  const next = {...previous};
  for (const {vendor,pn,checks,applicabilityCitations} of updates) {
    const key = identity(vendor,pn);
    const row = {...next[key]};
    for (const check of checks) {
      if (!check.requirementId || !['supports','conflicts','unknown'].includes(check.outcome) ||
          !check.citations.length || !check.citations.every(c => allowedManufacturerUrl(c.url,vendor) &&
            Number.isInteger(c.page) && c.page > 0 && c.quote.trim().length >= 12 && /^[a-f0-9]{64}$/.test(c.sha256 || ''))) continue;
      const old = row[check.requirementId];
      // An inconclusive repeat must not erase evidence or hide a reported conflict.
      if (old?.source === check.source &&
          (old.outcome === 'conflicts' || check.outcome === 'unknown' ||
            (old.verification === 'manufacturer_literal_qualification' && check.outcome === 'supports' && !check.verification))) continue;
      row[check.requirementId] = {...check,requirementId:check.requirementId,applicabilityCitations:applicabilityCitations || old?.applicabilityCitations};
    }
    if (Object.keys(row).length) next[key] = row;
  }
  return next;
}

function confirmsRailToRail(check: ConditionCheck, pn: string, condition: string) {
  if (!/^(?:轨到轨|轨到轨输入[/、与和]?输出|RRIO)$/i.test(check.source.trim()) ||
      !/^(?:未指定(?:供电电压(?:与单[/／]双电源)?|供电及负载)|未指定|无额外工况)[。；]?$/.test(condition.trim())) return false;
  return check.citations.some(citation => /^(?:rail[- ]to[- ]rail (?:input and output|i\/o)|轨到轨输入(?:及|与|和)输出)[.。]?$/i.test(citation.quote.trim()) &&
    check.applicabilityCitations?.some(ref => ref.sha256 === citation.sha256 && ref.url === citation.url &&
      ref.quote.split(/[^A-Z0-9-]+/i).some(token => token.toUpperCase() === pn.toUpperCase())));
}

export function effectiveConditions(vendor: string, pn: string, ledger: RequirementLedger | undefined,
  releaseId: string | null, updates: OnlineRecommendation) {
  if (!ledger || ledger.releaseId !== releaseId || ledger.candidate.vendor !== vendor || ledger.candidate.pn !== pn) return [];
  const checks = updates[identity(vendor,pn)];
  return ledger.entries.map(entry => {
    const check = checks?.[entry.requirementId];
    const online = check?.source === entry.source &&
      !['contradicted','conflict','clarification'].includes(entry.status) &&
      !['execution_failed','binding_gap','ambiguous_binding'].includes(entry.gap || '') ? check : undefined;
    const confirmed = online?.outcome === 'supports' &&
      ((online.verification === 'manufacturer_literal_qualification' && online.model === pn) ||
        confirmsRailToRail(online,pn,entry.condition));
    const status: LedgerStatus = online?.outcome === 'conflicts' ? 'conflict' : confirmed ? 'supported' : entry.status;
    return {entry,online,confirmed,status};
  });
}

export function withOnlineRecommendation(results: SearchResult[], releaseId: string | null, updates: OnlineRecommendation) {
  const ranked = results.map(result => {
    const conditions = effectiveConditions(result.vendor,result.product.part_number,result.requirementLedger,releaseId,updates);
    const required = conditions.filter(c => c.entry.required);
    const conflicts = required.filter(c => c.entry.status === 'contradicted' || c.entry.status === 'conflict' ||
      c.online?.outcome === 'conflicts').length;
    const confirmed = required.filter(c => (c.entry.status === 'supported' || c.confirmed) && c.online?.outcome !== 'conflicts');
    const sourced = required.filter(c => c.entry.status === 'unknown' && !c.confirmed && c.online?.outcome === 'supports');
    const unresolved = required.filter(c => c.entry.status === 'clarification' ||
      (c.entry.status === 'unknown' && c.online?.outcome !== 'supports' && c.online?.outcome !== 'conflicts'));
    const hasDocument = conditions.some(c => c.online);
    const hasUnbound = result.pendingChecks?.some(check => check.blocksMatch && check.status !== 'supported' &&
      !check.summaryOfRequirementIds?.length && !required.some(c => c.entry.requirementId === check.requirementId && c.entry.source === check.source));
    return {result,conditions,requiredCount:required.length,conflicts,confirmed,sourced,unresolved,hasDocument,
      complete:required.length > 0 && confirmed.length === required.length && !conflicts && !hasUnbound};
  });
  if (!ranked.some(row => row.hasDocument)) return ranked;
  // Retain the original ranking for ties. Reports of a potential conflict
  // take precedence over the number of matches.
  return ranked.sort((a,b) => Number(a.conflicts > 0)-Number(b.conflicts > 0) ||
    Number(b.complete)-Number(a.complete) || b.confirmed.length-a.confirmed.length ||
    b.sourced.length-a.sourced.length || a.conflicts-b.conflicts);
}

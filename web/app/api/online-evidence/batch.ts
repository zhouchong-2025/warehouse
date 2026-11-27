import { allowedManufacturerUrl, validatedResearchInput } from './policy';
import manufacturers from '../../../lib/manufacturers.json' with {type:'json'};
import type { ExactSelectionResult } from '../../product-utils';
import type { EvidenceRequirement } from './policy';

export type EvidenceCandidate = { vendor: string; pn: string; requirements: EvidenceRequirement[] };
export type EvidenceGroup = { candidates: EvidenceCandidate[]; sourceUrl?: string };
export type EvidencePlan = { groups: EvidenceGroup[]; estimatedPeakCny: number };

// Reviewed in the five-candidate pilot. Base-model coverage does not establish
// the applicability of any individual specification or ordering suffix.
const reviewedDocuments = [
  { models: ['TP2301', 'TP2302', 'TP2304'], file: 'Datasheet_TP2301-TP2302-TP2304.pdf' },
  { models: ['TP2402', 'TP2404'], file: 'Datasheet_TP2401-TP2402-TP2404.pdf' },
];

export function reviewedSource(candidate: Pick<EvidenceCandidate, 'vendor' | 'pn'>): string | undefined {
  if (candidate.vendor !== '3peak-analog') return;
  const document = reviewedDocuments.find(item => item.models.includes(candidate.pn));
  if (document) return 'https://static.3peak.com/res/doc/ds/' + document.file;
}

export function catalogOfficialPdfUrls(candidate: Pick<EvidenceCandidate, 'vendor' | 'pn'>, facts: unknown): string[] {
  const reviewed = reviewedSource(candidate);
  const links = new Set<string>();
  if (reviewed) links.add(reviewed);
  if (Array.isArray(facts)) {
    for (const fact of facts) {
      const url = fact?.evidence?.sourceUrl;
      if (fact?.model === candidate.pn && fact.scope === 'self' && typeof url === 'string' &&
          /\.pdf(?:\?|$)/i.test(url) && allowedManufacturerUrl(url, candidate.vendor))
        links.add(url);
    }
  }
  return [...links].slice(0,3);
}

export function validateCandidates(raw: unknown, releaseId: unknown): EvidenceCandidate[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 5) return null;
  const candidates: EvidenceCandidate[] = [];
  for (const row of raw) {
    if (!row || !Array.isArray(row.requirements)) return null;
    const value = validatedResearchInput({
      vendor: row.vendor, pn: row.pn, releaseId, consent: true,
      clauses: row.requirements.map((requirement: EvidenceRequirement | null) => requirement?.source),
      requirements: row.requirements,
    });
    if (!value?.requirements || candidates.some(c => c.vendor === value.vendor && c.pn === value.pn)) return null;
    candidates.push({vendor: value.vendor, pn: value.pn, requirements: value.requirements});
  }
  return candidates;
}

export function planEvidenceBatch(candidates: EvidenceCandidate[], lookup = reviewedSource): EvidencePlan {
  const groups: EvidenceGroup[] = [];
  for (const candidate of candidates) {
    const proposed = lookup(candidate);
    const sourceUrl = proposed && allowedManufacturerUrl(proposed, candidate.vendor) ? proposed : undefined;
    const existing = sourceUrl && groups.find(group => group.sourceUrl === sourceUrl &&
      group.candidates[0].vendor === candidate.vendor &&
      JSON.stringify(group.candidates[0].requirements) === JSON.stringify(candidate.requirements));
    if (existing) existing.candidates.push(candidate);
    else if (groups.length < 2) groups.push({ candidates: [candidate], sourceUrl });
  }
  return { groups, estimatedPeakCny: groups.reduce((sum, group) => sum + (group.sourceUrl ? 0.11 : 0.18), 0) };
}

export function suggestedEvidenceCandidates(results: ExactSelectionResult[], releaseId: string): EvidenceCandidate[] {
  return results
    .filter(row => Object.hasOwn(manufacturers.vendors,row.vendor) && row.requirementLedger?.releaseId === releaseId &&
      row.requirementLedger.candidate.pn === row.pn && row.requirementLedger.candidate.vendor === row.vendor &&
      !row.requirementLedger.entries.some(e => e.required && ['conflict', 'contradicted'].includes(e.status)))
    .sort((a,b) => countSupported(b) - countSupported(a))
    .flatMap(row => {
      const requirements = row.requirementLedger!.entries
        .filter(e => e.required && e.status === 'unknown' && !['binding_gap', 'execution_failed', 'ambiguous_binding'].includes(e.gap || ''))
        .filter(e => e.source.length <= 200 && [e.object,e.meaning,e.condition].every(t => t.length <= 900))
        .slice(0,5)
        .map(e => ({id: e.requirementId, source: e.source, object: e.object, meaning:e.meaning, condition:e.condition}));
      return requirements.length ? [{vendor:row.vendor, pn:row.pn, requirements}] : [];
    })
    .slice(0,5);
}

function countSupported(row: ExactSelectionResult) {
  return row.requirementLedger?.entries.filter(e => e.required && e.status === 'supported').length ?? 0;
}

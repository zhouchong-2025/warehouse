import { findProductByPN } from '../interpret/data-loader';
import { evaluateRequirement, PARAMETERS, type Comparison, type FactProduct, type ParameterId, type Requirement } from '../interpret/selection-spec';
import { sourceFactsForProduct } from '../interpret/source-facts';
import { loadKnowledge, type KnowledgePage, type KnowledgeSourceExcerpt } from './source-loader';

const normalize = (text: string) => text.toLocaleLowerCase().replace(/\s+/g, '');
const modelPattern = /\b(?:NSI|NSR|TPP|TPA|LM|TPCM)[A-Z0-9]+(?:[-–][A-Z0-9]+)?\b/gi;

function relevance(query: string, page: KnowledgePage): number {
  const q = normalize(query);
  const terms = [page.title, ...page.aliases];
  let score = terms.reduce((sum, term) => sum + (q.includes(normalize(term)) ? 20 : 0), 0);
  const models = [...query.matchAll(modelPattern)].map(match => match[0].toUpperCase().replace('–', '-'));
  if (models.length && (page.type === 'family' || page.type === 'selection-guide') &&
      page.scope.models.length && !models.some(model => page.scope.models.includes(model))) return 0;
  score += models.filter(model => page.scope.models.includes(model)).length * 30;
  const haystack = normalize(`${page.title} ${page.summary} ${page.content}`);
  const latin = query.match(/[A-Za-z][A-Za-z0-9-]{1,}/g) || [];
  for (const word of latin) if (haystack.includes(normalize(word))) score += 4;
  const chinese = (query.match(/[\u3400-\u9fff]{2,}/g) || []).flatMap(word =>
    [...word].slice(0, -1).map((char, index) => char + word[index + 1]));
  for (const pair of new Set(chinese)) if (haystack.includes(pair)) score += 1;
  return score;
}

function excerptRelevance(query: string, excerpt: KnowledgeSourceExcerpt): number {
  const normalized = normalize(query);
  const modelMatches = excerpt.models.filter(model => normalized.includes(normalize(model)));
  if (modelMatches.length) return 30 + modelMatches.length;
  const haystack = normalize(`${excerpt.identity} ${excerpt.sourceExcerpt}`);
  let score = 0;
  for (const word of query.match(/[A-Za-z][A-Za-z0-9-]{1,}/g) || []) {
    if (haystack.includes(normalize(word))) score += 4;
  }
  for (const word of query.match(/[\u3400-\u9fff]{2,}/g) || []) {
    for (let index = 0; index < word.length - 1; index++) {
      if (haystack.includes(word.slice(index, index + 2))) score += 1;
    }
  }
  return score;
}

export function searchKnowledge(query: string, releaseId: string, limit = 5) {
  const bundle = loadKnowledge(releaseId);
  const boundedLimit = Math.max(1, Math.min(limit, 8));
  return {
    releaseId, knowledgeVersion: bundle.knowledgeVersion, evidencePolicy: 'context_only' as const,
    hits: bundle.pages.map(page => ({ page, score: relevance(query, page) }))
      .filter(hit => hit.score > 0).sort((a, b) => b.score - a.score || a.page.id.localeCompare(b.page.id))
      .slice(0, boundedLimit).map(({ page, score }) => ({
        pageId: page.id, title: page.title, type: page.type, summary: page.summary, score,
        path: page.path, sha256: page.sha256, scope: page.scope,
        citationIds: page.citations.map(citation => citation.id), limitations: page.limitations,
        hardFilterEligible: false,
      })),
    sourceExcerpts: (bundle.sourceExcerpts || []).map(excerpt => ({ excerpt, score: excerptRelevance(query, excerpt) }))
      .filter(hit => hit.score > 0)
      .sort((a, b) => b.score - a.score || a.excerpt.id.localeCompare(b.excerpt.id))
      .slice(0, boundedLimit).map(({ excerpt, score }) => ({
        id: excerpt.id, identity: excerpt.identity, score, documentId: excerpt.documentId,
        documentSha256: excerpt.documentSha256, physicalPage: excerpt.page,
        scope: excerpt.scope, models: excerpt.models, selectionUse: 'context_only' as const,
        hardFilterEligible: false,
      })),
  };
}

export function readSourceExcerpt(id: string, releaseId: string) {
  const excerpt = loadKnowledge(releaseId).sourceExcerpts?.find(item => item.id === id);
  if (!excerpt) throw new Error('Unknown knowledge source excerpt');
  return { releaseId, id: excerpt.id, content: excerpt.sourceExcerpt, identity: excerpt.identity,
    documentId: excerpt.documentId, documentSha256: excerpt.documentSha256,
    physicalPage: excerpt.page, scope: excerpt.scope, models: excerpt.models,
    selectionUse: 'context_only' as const, hardFilterEligible: false };
}

export function readSection(pageId: string, section: string | null, releaseId: string) {
  const bundle = loadKnowledge(releaseId);
  const page = bundle.pages.find(item => item.id === pageId);
  if (!page) throw new Error('Unknown knowledge page');
  const content = page.content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();
  const lines = content.split('\n');
  const starts = lines.flatMap((line, index) => /^#{1,3}\s+/.test(line)
    ? [{ index, heading: line.replace(/^#{1,3}\s+/, '').trim() }] : []);
  let selected = content;
  if (section) {
    const match = starts.find(item => item.heading === section);
    if (!match) throw new Error('Unknown knowledge section');
    const next = starts.find(item => item.index > match.index);
    selected = lines.slice(match.index, next?.index).join('\n').trim();
  }
  return {
    releaseId, knowledgeVersion: bundle.knowledgeVersion, pageId, section,
    content: selected, scope: page.scope, limitations: page.limitations, links: page.links,
    citations: page.citations.map(({ id, kind, facts, ...rest }) => ({
      id, kind, ...rest,
      ...(facts ? { factIds: facts.map(fact => fact.id) } : {}),
    })),
    evidencePolicy: 'context_only' as const, hardFilterEligible: false,
  };
}

export function getProductFacts(vendor: string, model: string, fields: string[], releaseId: string) {
  loadKnowledge(releaseId); // Knowledge and catalog must be in the same checked release.
  const match = findProductByPN(model, releaseId);
  if (!match || match.vendor !== vendor) {
    return { releaseId, vendor, model, status: 'unknown' as const, reason: '型号不在本版已核验目录', facts: [] };
  }
  const product = { ...match.product, __vendor: vendor };
  const allowed = new Set(fields);
  const facts = sourceFactsForProduct(product).filter(fact => !allowed.size || allowed.has(fact.field))
    .map(fact => ({ id: fact.id, field: fact.field, rating: fact.rating,
      value: fact.evidence.originalValue, header: fact.evidence.originalHeader,
      condition: fact.evidence.condition || null, source: fact.source,
      subjectKind: fact.subjectKind, scope: fact.scope }));
  return { releaseId, vendor, model, status: facts.length ? 'found' as const : 'unknown' as const,
    reason: facts.length ? null : '本版缺少该型号的已核验事实', facts };
}

export function evaluateRequirements(vendor: string, model: string, requests: Array<{
  field: string; operator: string; values: number[]; unit?: string; testMethod?: string;
}>, releaseId: string) {
  loadKnowledge(releaseId);
  const match = findProductByPN(model, releaseId);
  if (!match || match.vendor !== vendor) throw new Error('Exact model is unavailable in this release');
  const product = { ...match.product, __vendor: vendor } as FactProduct;
  const results = requests.map((request, index) => {
    if (!Object.hasOwn(PARAMETERS, request.field) ||
        !['gte', 'lte', 'eq', 'covers'].includes(request.operator) ||
        !Array.isArray(request.values) || request.values.length < 1 || request.values.length > 2 ||
        !request.values.every(value => typeof value === 'number' && Number.isFinite(value)) ||
        (request.testMethod && request.testMethod !== 'UL1577') ||
        (request.unit && request.unit.replace(/[μµ]/g, 'u') !== PARAMETERS[request.field as ParameterId]?.unit)) {
      return { field: request.field, status: 'unknown' as const, reason: 'unsupported_or_invalid_requirement', evidence: [] };
    }
    const requirement: Requirement = {
      id: `knowledge-${index}`, tag: request.field, kind: 'parameter', field: request.field as ParameterId,
      operator: request.operator as Comparison, values: request.values,
      unit: request.unit || PARAMETERS[request.field as ParameterId].unit,
      testMethod: request.testMethod as 'UL1577' | undefined,
      strength: 'must', source: null,
    };
    const checked = evaluateRequirement(product, requirement);
    const verified = checked.evidence.filter(fact => fact.source.verified);
    // A positive decision without a pinned model-row source is not a grounded answer.
    const status = checked.status === 'matched' && !verified.length ? 'unknown' : checked.status;
    return { field: request.field, status,
      reason: status === 'unknown' && checked.status === 'matched' ? 'missing_verified_model_evidence' : checked.reason,
      evidence: checked.evidence.map(fact => ({ field: fact.field, values: fact.values,
        unit: fact.unit, statistic: fact.statistic, raw: fact.source.raw,
        source: fact.source.verified || null })),
    };
  });
  return { releaseId, vendor, model, results, evaluator: 'selection-spec.evaluateRequirement' };
}

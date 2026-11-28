// Shared types and utilities used across page.tsx and its child components

export type Product = Record<string, string>;
export type VendorData = { name: string; productCount: number; products: Product[] };

export function productIdentity(vendor: string, partNumber: string): string {
  return JSON.stringify([vendor, partNumber]);
}

export function displayConstraintTag(tag: string): string {
  return tag.replaceAll('车规AEC-Q100', '车规级');
}

export type SearchResult = {
  requirementLedger?:import("./api/interpret/requirement-ledger").RequirementLedger;
  pendingChecks?: import("@/app/api/interpret/pending-evidence").PendingEvidenceCheck[];
  assessment?: import("@/app/api/interpret/selection-assessment").SelectionAssessment;
  vendor: string;
  vendorName: string;
  product: Product;
  score: number;
  matchedTerms: string[];
  missingTerms?: string[];
  missingNice?: string[];
  nicePartial?: boolean;
  matchSummary?: string;
  referenceOnly?: boolean;
  evidence?: { term: string; source: string }[];
  parameterChecks?: Record<string, import("@/app/api/interpret/selection-spec").RequirementResult>;
  sourceEvidence?: Record<string, import("@/app/api/interpret/source-facts").VerifiedSource[]>;
  downgradeHits?: Record<string, string>;
};

export type VendorFilterOption = {
  key: string;
  name: string;
  productCount: number;
  slugs: string[];
};

export type ExactSelectionResult = {
  matchCoverage?: {requiredTotal:number;requiredSupported:number;requiredPending:number;conflicts:number;preferredSupported:number;complete:boolean;possibleMismatch:boolean};
  requirementLedger?:import("./api/interpret/requirement-ledger").RequirementLedger;
  pendingChecks?: import("@/app/api/interpret/pending-evidence").PendingEvidenceCheck[];
  assessment: import("@/app/api/interpret/selection-assessment").SelectionAssessment;
  pn: string;
  vendor: string;
  tier: number;
  branchMustTags?: string[];
  rdson?: string;
  score: number;
  mustHit: string[];
  missingTags?: string[];
  mustUnknown?: string[];
  niceHit: string[];
  downgradeHits: Record<string, string>;
  parameterChecks: Record<string, import("@/app/api/interpret/selection-spec").RequirementResult>;
  sourceEvidence: Record<string, import("@/app/api/interpret/source-facts").VerifiedSource[]>;
};

/** Adapt the API's canonical selection assessment for display without re-scoring it in the browser. */
export function mapApiSelectionResults(
  apiResults: ExactSelectionResult[],
  products: { vendor: string; vendorName: string; product: Product }[],
  mustTags: string[],
  niceTags: string[],
): SearchResult[] {
  return apiResults.flatMap(result => {
    const product = products.find(item => item.product.part_number === result.pn && item.vendor === result.vendor);
    if (!product) return [];
    const missingNice = niceTags.filter(tag => !result.niceHit.includes(tag));
    const missingTerms = [...(result.missingTags || []).map(tag =>
      result.mustUnknown?.includes(tag) ? `${tag}（参数待确认）` : tag), ...missingNice];
    const matchedTerms = [...result.mustHit, ...result.niceHit];
    const unconfirmed = (result.pendingChecks || []).filter(check => check.blocksMatch && check.status !== 'supported');
    return [{
      vendor: product.vendor,
      vendorName: product.vendorName,
      product: product.product,
      score: result.score,
      matchedTerms,
      missingTerms,
      missingNice,
      ...(result.requirementLedger?{requirementLedger:result.requirementLedger}:{}),
      matchSummary: result.requirementLedger
        ? `${result.requirementLedger.entries.filter(e=>e.required&&e.status==='supported').length}/${result.requirementLedger.entries.filter(e=>e.required).length}项必需条件有证据 · ${result.requirementLedger.entries.filter(e=>e.required&&e.status!=='supported').length}项待核`
        : result.tier === 1
        ? `${matchedTerms.length}/${(result.branchMustTags || mustTags).length + niceTags.length} 条件`
        : result.pendingChecks?.length
          ? `${result.mustHit.length}项已核验 · ${unconfirmed.length}项待核`
          : `${result.mustHit.length}/${(result.branchMustTags || mustTags).length} 条硬条件`,
      referenceOnly: result.tier !== 1,
      nicePartial: result.tier === 1 && missingNice.length > 0,
      evidence: getEvidenceSources(product.product, matchedTerms).map(item =>
        result.sourceEvidence?.[item.term]?.length ? { ...item, source: '审阅来源' } : item),
      parameterChecks: result.parameterChecks,
      sourceEvidence: result.sourceEvidence,
      assessment: result.assessment,
      downgradeHits: result.downgradeHits,
      pendingChecks: result.pendingChecks,
    }];
  });
}

export type LLMInterpretation = {
  competitorReplacement?:import('./api/interpret/competitor-replacement').CompetitorResult;
  replacementPilot?:import('./api/interpret/replacement-pilot').ReplacementPilot;
  pipelineAudit?:import("./api/interpret/selection-integrity").SelectionIntegrity;
  modelConsentRequired?: boolean;
  totalMatches?: number;
  features: string[];
  vendor: string | null;
  category_hint: string | null;
  explanation: string;
  confidence: string;
  _debug?: { modelUsage?: {requestId?:string}; llmCalled?: boolean; llmSucceeded?: boolean; planStatus?: string; reason?: string };
  componentSearch?: import('./api/interpret/engineering-modules').ModuleSearchSummary;
  engineeringUnderstanding?: import('./api/interpret/engineering-understanding').EngineeringUnderstanding | null;
  executionAudit?: import('./api/interpret/execution-contract').ExecutionAudit;
  searchMapping?: {status:string;summary:string;issues:string[]};
  engineeringReview?: import('./api/interpret/engineering-review').EngineeringReview;
  researchReview?: import('./api/interpret/engineering-review').EngineeringReview;
  faeResearch?: import('./api/interpret/fae-research').FaeResearch;
  retrievalCoverage?: {eligible:number;retained:number;limit:number;manufacturerGroups:number;retainedManufacturerGroups:number};
  sourceAccess?: {catalogProducts:number;categoryProducts:number;coreEvidenceGaps:number;selectedCandidates:number;researchLeads:number;reviewedCandidates:number;reviewFactCount:number};
  researchLeads?: {pn:string;vendor:string;supportedConditions?:string[];missingConditions:string[];reason:string;pendingChecks?:import('./api/interpret/pending-evidence').PendingEvidenceCheck[];evidence:import('./api/interpret/source-facts').VerifiedSource[]}[];
  querySpec?: import("@/app/api/interpret/selection-spec").QuerySpec;
  suggestions?: { text: string; query: string; reason: string }[];
  exclude_tags?: string[];
  must?: string[];
  nice?: string[];
  mustMeta?: import("@/app/api/interpret/constraint-match").MustConstraint[];
  sortKey?: import("@/app/api/interpret/constraint-match").SortIntent;
  intent?: 'spec_search' | 'cross_ref';
  crossRefTarget?: string;
  results?: ExactSelectionResult[];
  wikiHits?: import("@/lib/wiki-search-types").WikiSearchHit[];
  modelCheck?: { pn: string; vendor: string; status: 'matched' | 'unmatched' | 'unknown';
    matched: string[]; unmatched: string[]; unknown: string[] };
  constraintBanner?: string;
  modelLimitNotice?: string;
  solutionDirections?: import('./api/interpret/solution-directions').SolutionDirection[];
  screeningExcluded?: { pn: string; vendor: string; reasons: string[];
    evidence: import("@/app/api/interpret/source-facts").VerifiedSource[] }[];
  excludedByOperating?: { pn: string; vendor: string;
    assessment: import("@/app/api/interpret/selection-assessment").SelectionAssessment }[];
} | null;

/** Preserve risk hints alongside unknown status; never convert a hint into a rejection. */
export function pendingRequirementReview(result: LLMInterpretation) {
  if (result?.category_hint !== '完整需求计划') return [];
  const pending = [...(result.querySpec?.unresolved || [])];
  for (const candidate of result.results || []) for (const check of candidate.pendingChecks || []) {
    if (check.status !== 'unknown' || pending.some(item => item.source.text === check.source)) continue;
    const at = result.querySpec?.text.indexOf(check.source) ?? -1;
    pending.push({ source: { text: check.source, start: at, end: at + check.source.length, origin: 'model' }, reason: check.reason, kind: 'evidence' });
  }
  return pending.map(item => {
    const checks = (result.results || []).flatMap(candidate => candidate.pendingChecks || [])
      .filter(check => check.source === item.source.text);
    const unique = (values: (string | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))];
    const customLabels = unique(checks.map(check => check.statusText));
    const label = checks.some(check => check.status === 'contradicted') ? '已有不满足证据'
      : checks.length && checks.every(check => check.status === 'supported') ? '有证据支持'
      : customLabels.length === 1 && checks.every(check => check.statusText === customLabels[0]) ? customLabels[0]
      : checks.some(check => check.attention === 'possible_mismatch') ? '可能不满足，需补证据'
      : checks.some(check => check.attention === 'clarification') ? '口径待确认，满足性未证实'
      : '缺少证据，暂不能判断';
    return { source: item.source.text, label,
      observations: unique(checks.map(check => check.observed)),
      reasons: unique(checks.map(check => check.reason)).length
        ? unique(checks.map(check => check.reason)) : [item.reason],
      nextSteps: unique(checks.map(check => check.nextStep)),
      pages: [...new Set(checks.flatMap(check => check.evidence.map(source => source.page)))],
    };
  });
}

export function getCategoryBadge(product: Product): string {
  return (product._section || "").trim();
}

// 2026-06-16: 追踪标签匹配的证据来源
export function getEvidenceSources(product: Product, matchedTerms: string[]): { term: string; source: string }[] {
  const evidence: { term: string; source: string }[] = [];
  const detailIntro = (product._detail_intro || "").toLowerCase();
  const detailFeatures = (product._detail_features || "").toLowerCase();
  const params = (product._params || "").toLowerCase();
  const section = (product._section || "").toLowerCase();
  const features = (product._features || "").toLowerCase();
  const detailScope = (product as unknown as { _detail_source?: { scope?: string } })._detail_source?.scope;
  const searchContext = (product as unknown as {
    _search_context?: { text?: string; source?: { scope?: string; selectionUse?: string } }
  })._search_context;

  for (const term of matchedTerms) {
    const t = term.toLowerCase();
    let source = '来源待核';
    if (params.length > 5 && params.includes(t)) {
      source = '参数表';
    } else if (section.length > 3 && section.includes(t)) {
      source = '选型表';
    } else if (searchContext?.source?.selectionUse === 'context_only'
        && searchContext.text?.toLowerCase().includes(t)) {
      source = searchContext.source.scope === 'family' ? '系列原页（仅供参考）'
        : '型号原页（仅供参考）';
    } else if (detailIntro.includes(t) || detailFeatures.includes(t)) {
      source = detailScope === 'family' ? '系列介绍（仅供参考）'
        : detailScope === 'model' ? '型号介绍（待核）' : '介绍文字（待核）';
    } else if (features.split(/\s+/).includes(t)) {
      source = '旧标签（待核）';
    }
    evidence.push({ term, source });
  }
  return evidence;
}

// Get displayable params for a product
export function getDisplayParams(p: Product): [string, string][] {
  const parsedParams: [string, string][] = (p._params || "")
    .split(" | ")
    .map((pair): [string, string] | null => {
      const idx = pair.indexOf(": ");
      if (idx <= 0) return null;
      return [pair.slice(0, idx).trim(), pair.slice(idx + 2).trim()];
    })
    .filter((x): x is [string, string] => !!x && !!x[1]);

  const preferredParamOrder = [
    "供电电压(V)", "VIO 电压(V)", "输入电压", "工作电压 (V)", "工作电压(V)",
    "最大工作速率 （Mbps)", "最大工作速率(Mbps)", "低功耗模式", "封装类型", "封装", "MSL",
    "工作温度范围 (℃)", "工作温度 (℃)", "AEC-Q100",
  ];
  const chosen: [string, string][] = [];
  const seen = new Set<string>();
  for (const key of preferredParamOrder) {
    const hit = parsedParams.find(([k]) => k === key);
    if (hit && !seen.has(hit[0])) {
      chosen.push(hit);
      seen.add(hit[0]);
    }
  }
  for (const pair of parsedParams) {
    if (!seen.has(pair[0])) {
      chosen.push(pair);
      seen.add(pair[0]);
    }
    if (chosen.length >= 6) break;
  }
  return chosen.slice(0, 6);
}

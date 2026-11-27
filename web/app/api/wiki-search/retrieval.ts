import { isMcuResourceContext } from '../interpret/resource-context';
import { loadSemanticEvidenceRules } from '@/lib/semantic-evidence';
import { isCanSicQuery, parseQuery } from '../interpret/query_parser';

export type WikiDocument = {
  path: string;
  sha256: string;
  content: string;
  sourceType: 'vendor' | 'fact' | 'reference';
};

export type WikiSearchHit = {
  path: string;
  sha256: string;
  sourceType: WikiDocument['sourceType'];
  snippet: string;
  matchedTerms: string[];
  contextOnly: true;
};

function terms(query: string): string[] {
  const normalized = query.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const latin = normalized.match(/[a-z0-9][a-z0-9._+-]*/g) || [];
  // Source tables often store a value and its unit in separate cells ("40 V"),
  // while users write it as one token ("40V"). Keep both forms searchable.
  const numericValues = latin.flatMap(term => {
    const value = term.match(/^(\d+(?:\.\d+)?)(?:kv?rms|mv|v|ma|ua|a|khz|mhz|ghz|bit|bits|ch|channel|channels)$/);
    return value ? [value[1]] : [];
  });
  const cjk = [...normalized.matchAll(/[\u3400-\u9fff]+/g)].flatMap(([run]) => {
    if (run.length < 2) return [run];
    return Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2));
  });
  return [...new Set([...latin, ...numericValues, ...cjk].filter(term => term.length > 1))];
}

function numericQueryValues(query: string): string[] {
  const values = [...query.matchAll(/(\d+(?:\.\d+)?)\s*(?:kv\s*rms|kvrms|mv|ma|ua|v|a|khz|mhz|ghz|bits?|channels?|ch|通道|位)/gi)]
    .map(match => match[1]);
  return [...new Set(values)];
}

/** Expand only explicit, registered query concepts. The resulting hits remain context-only. */
function queryTermGroups(query: string): {
  direct: string[];
  semantic: Array<{ aliases: string[]; sourceRegex: string; anchorSnippet: boolean }>;
} {
  const canSic = isCanSicQuery(query);
  // Do not let a case-folded “SiC” token retrieve CAN SIC rows when the user
  // is asking about silicon-carbide devices or has provided no CAN context.
  const direct = terms(query).filter(term => term !== 'sic' || canSic);
  const semantic = loadSemanticEvidenceRules().flatMap(rule => {
    if (rule.tag === 'SIC' && !canSic) return [];
    if (!rule.query_regex?.trim()) return [];
    try {
      if (!new RegExp(rule.query_regex, 'i').test(query)) return [];
    } catch {
      return [];
    }
    const expansion = [...new Set([rule.tag, ...rule.aliases])]
      .map(alias => alias.trim())
      .filter(alias => alias.length > 1);
    return expansion.length && rule.regex?.trim()
      ? [{ aliases: expansion, sourceRegex: rule.regex,
        anchorSnippet: rule.dimension === 'feature' && rule.storage === 'source_evidence' }]
      : [];
  });
  return { direct, semantic };
}

function containsAlias(text: string, alias: string): boolean {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = /^[a-z0-9]/i.test(alias)
    ? new RegExp(`\\b${alias.split(/[\s_-]+/).map(escape).join('[\\s_-]+')}\\b`, 'i')
    : new RegExp(escape(alias), 'i');
  return pattern.test(text);
}

function queryModelIdentifiers(query: string): string[] {
  const packagePrefixes = /^(?:QFN|DFN|SON|SOT|SOP|SOIC|TSSOP|SSOP|MSOP|WLCSP|CSP|BGA|LGA|SOW|TQFP|QFP|DIP|TO|SC|TSOT|WLP|QFN|UQFN|XSON)\d/i;
  return [...new Set(query.match(/\b[A-Z]{2,}\d[A-Z0-9]*(?:-[A-Z0-9]+)*\b/g) || [])]
    .filter(identifier => !packagePrefixes.test(identifier)
      && identifier !== query.match(/\b(CAN\d+)\.\d[AB]?\b/i)?.[1]);
}

function queryEthernetStandards(query: string): string[] {
  return [...new Set(query.match(/\b\d+BASE-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/gi) || [])];
}

function containsExactIdentifier(text: string, identifier: string): boolean {
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Z0-9])${escape(identifier)}($|[^A-Z0-9])`, 'i').test(text);
}

const titleCategoryCache = new Map<string, { categories: string[]; hint: string }>();

function queryCategoryProfile(query: string): { categories: string[]; hint: string } {
  const parsed = parseQuery(query);
  const tags = [...new Set(parsed.mustMeta.filter(item => item.dimension === 'category').map(item => item.tag))];
  // Drop a broad category when the parser has also identified a more specific
  // one, e.g. "隔离" alongside "隔离栅极驱动".
  return {
    categories: tags.filter(tag => !tags.some(other => other !== tag && other.includes(tag))),
    hint: parsed.category_hint,
  };
}

function documentCategoryProfile(document: WikiDocument): { categories: string[]; hint: string } {
  const title = document.content.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
  if (!title) return { categories: [], hint: '' };
  const cached = titleCategoryCache.get(title);
  if (cached) return cached;
  const parsed = parseQuery(title);
  const profile = {
    categories: [...new Set(parsed.mustMeta.filter(item => item.dimension === 'category').map(item => item.tag))],
    hint: parsed.category_hint,
  };
  titleCategoryCache.set(title, profile);
  return profile;
}

function compatibleCategory(queryCategory: string, documentCategory: string): boolean {
  const negativePrefix = /^(?:非|non[-\s])/i;
  if (negativePrefix.test(documentCategory) && !negativePrefix.test(queryCategory)) return false;
  // CAN-FD is not a safe parent/child text match for classic CAN: a CAN-only
  // source does not establish FD capability, even when it contains the token CAN.
  if (queryCategory === 'CAN-FD' && documentCategory === 'CAN') return false;
  return queryCategory === documentCategory
    || queryCategory.includes(documentCategory)
    || documentCategory.includes(queryCategory);
}

function exactModelRowSnippet(
  sourceTitle: string | undefined,
  exactModelLines: Array<{ line: string; index: number }>,
  matchedTerms: string[],
  query: string,
): string | null {
  type Cell = { line: string; index: number; field: string; header: string; value: string; originalValue: string; locator: string };
  const rows = new Map<string, Cell[]>();
  for (const item of exactModelLines) {
    const cells = item.line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
    // Source-bound fact pages use one row per field rather than the wider
    // compiled-table schema. Join fields only when they share the same source
    // page and model row; exclude the column coordinate from the group key.
    const factLocator = cells[5]?.match(/^(\d+)\s*\/\s*(\d+)\s*\/\s*\d+$/);
    if (cells.length >= 7 && factLocator && cells[6]?.includes(':')) {
      const locator = `${factLocator[1]}/0/${factLocator[2]}`;
      rows.set(locator, [...(rows.get(locator) || []), {
        ...item,
        field: cells[1],
        header: cells[1],
        value: cells[2],
        originalValue: cells[3],
        locator,
      }]);
      continue;
    }
    if (cells.length < 10 || !/^[a-z0-9_]+$/i.test(cells[1] || '')) continue;
    // Compiled tables have two layouts: ordinary tables put header/value at
    // columns 2/3, while sectioned tables add a scope column before them.
    const scoped = cells[2] === 'unspecified' || cells[2] === 'shared';
    const headerIndex = scoped ? 3 : 2;
    const valueIndex = headerIndex + 1;
    const pageIndex = valueIndex + 1;
    if (!cells[headerIndex] || cells[pageIndex] === undefined) continue;
    // The final two cells repeat the original header/value; omit the column
    // coordinate so all cells from the same model row are collected together.
    const metadata = cells.slice(pageIndex, Math.max(pageIndex, cells.length - 4));
    const locator = `${cells[0]}/${metadata.join('/')}`;
    rows.set(locator, [...(rows.get(locator) || []), {
      ...item,
      field: cells[1],
      header: cells[headerIndex],
      value: cells[valueIndex],
      originalValue: cells.at(-1) || '',
      locator,
    }]);
  }
  if (!rows.size) return null;

  const queryNumbers = numericQueryValues(query);
  const ranked = [...rows.entries()].map(([locator, rowLines], order) => {
    const numericMatches = queryNumbers.filter(value => rowLines.some(item =>
      [item.value, item.originalValue].some(cell =>
        cell.match(/\d+(?:\.\d+)?/g)?.includes(value)))).length;
    const textMatches = matchedTerms.reduce((sum, term) => sum + Number(
      rowLines.some(({ line }) => line.toLocaleLowerCase().includes(term.toLocaleLowerCase()))), 0);
    return { locator, rowLines, numericMatches, textMatches, order };
  }).sort((a, b) => b.numericMatches - a.numericMatches || b.textMatches - a.textMatches || a.order - b.order);
  const best = ranked[0];
  const modelLine = best.rowLines.find(item => /^(?:model|part number)$/i.test(item.header)) || best.rowLines[0];
  const relevant = best.rowLines.filter(item => {
    if (item === modelLine) return true;
    const header = item.header;
    const value = item.value;
    const field = item.field;
    const lineText = `${header} ${value} ${field}`.toLocaleLowerCase();
    const directMatch = matchedTerms.some(term => lineText.includes(term.toLocaleLowerCase()));
    const numberMatch = queryNumbers.some(number =>
      [value, item.originalValue].some(cell => cell.match(/\d+(?:\.\d+)?/g)?.includes(number)));
    const descriptiveField = /feature|description|detail|特性|描述/i.test(`${header} ${field}`);
    const packageField = /package|封装/i.test(`${header} ${field}`);
    // Exact-model context must preserve catalog qualifiers that can disqualify
    // a candidate (for example Industrial when the query asks for automotive).
    // These are part of the source row, not semantic aliases or inferred facts.
    const identityQualifier = /^(?:status|rating|grade|等级|产品等级|评级)$/i.test(`${header}`)
      || /^(?:status|rating|grade|等级|产品等级|评级)$/i.test(`${field}`);
    return directMatch || numberMatch || descriptiveField || packageField || identityQualifier;
  }).sort((a, b) => {
    const priority = (item: Cell) => {
      const label = `${item.header} ${item.field}`;
      if (/package|封装/i.test(label)) return 0;
      const directTerms = matchedTerms.filter(term => term.length > 2
        && `${label} ${item.value}`.toLocaleLowerCase().includes(term.toLocaleLowerCase())).length;
      if (directTerms) return 1 - Math.min(directTerms, 10) / 100;
      const numericMatches = queryNumbers.filter(number =>
        [item.value, item.originalValue].some(value => value.match(/\d+(?:\.\d+)?/g)?.includes(number))).length;
      return numericMatches ? 2 - Math.min(numericMatches, 10) / 100 : 3;
    };
    return priority(a) - priority(b) || a.index - b.index;
  });
  const compact = relevant.map(item => `${item.header || item.field}: ${item.value}`);
  const locatorParts = best.locator.split('/');
  const [physicalPage, printedPage, ...tableRow] = locatorParts;
  const provenance = `Source row: p${physicalPage}${printedPage && printedPage !== '0' ? `/printed ${printedPage}` : ''}, table/row ${tableRow.join('/')}`;
  const modelId = queryModelIdentifiers(query)[0];
  return `${sourceTitle ? `${sourceTitle} ` : ''}${provenance} | Model: ${modelId} | ${compact.join(' | ')}`
    .replace(/\s+/g, ' ').slice(0, 600);
}

function bestSnippet(content: string, matchedTerms: string[], query: string, semanticAliases: string[] = []): string {
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const sourceTitle = lines.find(line => /^#\s+/.test(line));
  const queryIdentifiers = queryModelIdentifiers(query);
  const queryNumbers = numericQueryValues(query);
  if (!queryIdentifiers.length) {
    const referenceSummary = lines.find(line => line.startsWith('检索摘要：'));
    if (referenceSummary) return referenceSummary.slice(0, 600);
  }
  // Queries can include package codes and spec codes (for example DFN3X3-8 or
  // LRE100-1). The first identifier is the requested part number in this
  // query format; later identifiers must not pull unrelated rows into snippet.
  const modelIds = queryIdentifiers.slice(0, 1);
  const exactModelLines = modelIds.length
    ? lines.map((line, index) => ({ line, index })).filter(item => modelIds.some(model =>
      new RegExp(`(^|[^A-Z0-9])${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Z0-9])`, 'i').test(item.line)))
    : [];
  if (exactModelLines.length) {
    const compact = exactModelRowSnippet(sourceTitle, exactModelLines, matchedTerms, query);
    if (compact) return compact;
  }
  let candidates = lines.map((line, index) => ({ line, index }));
  // When a registered concept is recognized through an alias (for example a
  // Chinese CMTI query against a table that only says "CMTI"), anchor the
  // snippet on the concept-bearing source line. Otherwise broad query bigrams
  // such as "共模" can select a neighboring common-mode-voltage field and
  // make valid CMTI source pages look like false evidence.
  if (!queryIdentifiers.length && semanticAliases.length) {
    const conceptLines = candidates.filter(({ line }) => semanticAliases.some(alias => containsAlias(line, alias)));
    if (conceptLines.length) candidates = conceptLines;
  }
  // Compiled source tables store one cell per line. For a natural-language
  // query, keep the best-matching model row together so a generic match such
  // as "Industrial" cannot crowd the input-voltage cell out of the snippet.
  if (!queryIdentifiers.length) {
    const rows = new Map<string, Array<{ line: string; index: number }>>();
    const rowCandidates = semanticAliases.length
      ? lines.map((line, index) => ({ line, index }))
        .filter(({ line }) => semanticAliases.some(alias => containsAlias(line, alias)))
      : lines.map((line, index) => ({ line, index }));
    for (const item of rowCandidates) {
      const model = item.line.match(/^\|\s*([A-Z]{2,}\d[A-Z0-9-]*)\s*\|/i)?.[1];
      if (model) rows.set(model, [...(rows.get(model) || []), item]);
    }
    const rankedRows = [...rows.entries()].map(([model, rowLines], order) => {
      const rowText = rowLines.map(item => item.line).join(' ').toLocaleLowerCase();
      const score = matchedTerms.reduce((sum, term) => sum + Number(rowText.includes(term.toLocaleLowerCase())), 0);
      // Compiled source rows include page/table coordinates. Match query
      // numbers only against the published/raw value cells so (for example)
      // a requested 4 V UVLO value cannot accidentally match a row coordinate
      // or a nearby product. This only ranks evidence snippets; it never
      // converts a value into a product-level match decision.
      const exactNumericMatches = queryNumbers.filter(value => rowLines.some(({ line }) => {
        const cells = line.split('|').map(cell => cell.trim());
        return [cells[3], cells[4], cells[9], cells[10]].some(cell => cell !== undefined
          && cell.match(/\d+(?:\.\d+)?/g)?.includes(value));
      })).length;
      return { model, rowLines, score, exactNumericMatches, order };
    }).filter(row => row.score > 0).sort((a, b) => b.exactNumericMatches - a.exactNumericMatches
      || b.score - a.score || a.order - b.order);
    if (rankedRows.length) {
      const best = rankedRows[0];
      const modelLine = best.rowLines.find(item => /\|\s*model_cell\s*\|/i.test(item.line)) || best.rowLines[0];
      const matchesEvidenceTerm = (line: string, term: string) => /^\d+(?:\.\d+)?$/.test(term)
        ? line.match(/\d+(?:\.\d+)?/g)?.includes(term) || false
        : line.toLocaleLowerCase().includes(term.toLocaleLowerCase());
      const evidenceLines = best.rowLines.filter(item => item !== modelLine
        && (matchedTerms.some(term => matchesEvidenceTerm(item.line, term))
          || queryNumbers.some(value => item.line.match(/\d+(?:\.\d+)?/g)?.includes(value))
          || (/车规|汽车级|automotive/i.test(query) && /车规|汽车级|automotive/i.test(item.line))))
        .sort((a, b) => {
          const score = (item: { line: string }) => matchedTerms.filter(term =>
            matchesEvidenceTerm(item.line, term)).length
            + queryNumbers.filter(value => item.line.match(/\d+(?:\.\d+)?/g)?.includes(value)).length * 20
            + Number(/车规|汽车级|automotive/i.test(query) && /车规|汽车级|automotive/i.test(item.line)) * 20;
          return score(b) - score(a) || a.index - b.index;
        });
      const compactCell = (line: string) => {
        const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
        if (cells.length >= 10) {
          if (/^[a-z0-9_]+$/i.test(cells[2] || '') && /_cell$/i.test(cells[2])) {
            return `${cells[3]}: ${cells[4]}`;
          }
          const scoped = cells[2] === 'unspecified' || cells[2] === 'shared';
          const headerIndex = scoped ? 3 : 2;
          return `${cells[headerIndex]}: ${cells[headerIndex + 1]}`;
        }
        if (cells[6]?.startsWith('novosense:') || cells[6]?.startsWith('3peak:')) {
          return `${cells[1]}: ${cells[2]}`;
        }
        if (/^[a-z0-9_]+$/i.test(cells[2] || '') && /_cell$/i.test(cells[2])) {
          return `${cells[3]}: ${cells[4]}`;
        }
        return `${cells[1]}: ${cells[2]}`;
      };
      const evidence = `Model: ${best.model} | ${[modelLine, ...evidenceLines.slice(0, 5)]
        .filter(item => item !== modelLine || !/\|\s*model_cell\s*\|/i.test(item.line))
        .map(item => compactCell(item.line)).join(' | ')}`;
      return `${sourceTitle ? `${sourceTitle} ` : ''}${evidence}`
        .replace(/\s+/g, ' ').slice(0, 600);
    }
  }
  if (exactModelLines.length) {
    const anchorIndexes = new Set(exactModelLines.map(item => item.index));
    const contextIndexes = new Set<number>(anchorIndexes);
    for (const anchor of anchorIndexes) {
      for (let offset = -2; offset <= 2; offset++) {
        if (anchor + offset >= 0 && anchor + offset < lines.length) contextIndexes.add(anchor + offset);
      }
    }
    candidates = candidates.filter(item => {
      if (!contextIndexes.has(item.index)) return false;
      if (anchorIndexes.has(item.index)) return true;
      const lineModelIds = item.line.match(/\b[A-Z]{2,}\d[A-Z0-9]*(?:-[A-Z0-9]+)*\b/g) || [];
      return !lineModelIds.some(model => !modelIds.some(queryModel => queryModel.toLowerCase() === model.toLowerCase()));
    });
  }
  const scored = candidates.map(({ line, index }) => ({
    line,
    index,
    score: matchedTerms.reduce((sum, term) => sum + (line.toLocaleLowerCase().includes(term) ? 1 : 0), 0),
  })).filter(item => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = scored.slice(0, exactModelLines.length ? 4 : 2)
    .sort((a, b) => a.index - b.index).map(item => item.line);
  return `${sourceTitle ? `${sourceTitle} ` : ''}${selected.join(' ')}`.replace(/\s+/g, ' ').slice(0, 600);
}

/** Search only documents in the immutable release manifest. Hits are context, never match evidence. */
export function searchWikiDocuments(query: string, documents: WikiDocument[], limit = 8): WikiSearchHit[] {
  const groups = queryTermGroups(query);
  if (!groups.direct.length && !groups.semantic.length) return [];
  // The first identifier follows the app's query convention: a part number
  // may be followed by package/spec codes (for example DFN3X3-8).
  const requestedModels = queryModelIdentifiers(query).slice(0, 1);
  // Ethernet standard names can share a prefix while describing different
  // link types (for example 1000BASE-T and 1000BASE-T1). A prefix match must
  // not treat a longer standard token as evidence for the requested one.
  const requestedEthernetStandard = queryEthernetStandards(query)[0];
  const requestedCategory = isMcuResourceContext(query)
    ? { categories: ['MCU/DSP'], hint: 'MCU/DSP' } : queryCategoryProfile(query);
  const modelEligibleDocuments = requestedModels.length
    ? documents.filter(document => requestedModels.some(model => containsExactIdentifier(document.content, model)))
    : documents;
  const eligibleDocuments = requestedEthernetStandard
    ? modelEligibleDocuments.filter(document => containsExactIdentifier(document.content, requestedEthernetStandard))
    : modelEligibleDocuments;
  const scopedDocuments = !requestedModels.length && (requestedCategory.categories.length || requestedCategory.hint)
    ? eligibleDocuments.filter(document => {
      const profile = documentCategoryProfile(document);
      if (!profile.categories.length && !profile.hint) return false;
      if (requestedCategory.hint && profile.hint && requestedCategory.hint !== profile.hint) return false;
      if (requestedCategory.categories.length && profile.categories.length
        && !requestedCategory.categories.some(queryCategory => profile.categories
          .some(documentCategory => compatibleCategory(queryCategory, documentCategory)))) return false;
      return true;
    })
    : eligibleDocuments;
  const scored = scopedDocuments.flatMap(document => {
    const haystack = document.content.toLocaleLowerCase();
    const directMatches = groups.direct.filter(term => haystack.includes(term));
    const semanticEvidence = groups.semantic.map(group => {
      let sourceMatchesConcept = false;
      try {
        sourceMatchesConcept = new RegExp(group.sourceRegex, 'i').test(document.content);
      } catch {
        sourceMatchesConcept = false;
      }
      const matched = sourceMatchesConcept
        ? group.aliases.filter(alias => containsAlias(haystack, alias))
        : [];
      // Count one alias concept once for ranking, even when the page repeats it.
      return { rankTerm: matched[0], anchorTerm: group.anchorSnippet ? matched[0] : undefined,
        snippetTerms: matched.flatMap(alias => terms(alias)) };
    });
    // A registered concept query (for example CMTI / 共模瞬变抗扰度) must
    // match one of that concept's complete aliases. Character bigrams such as
    // "共模" alone are too broad and can otherwise pull in common-mode voltage
    // tables that say nothing about transient immunity.
    if (groups.semantic.length && !semanticEvidence.some(match => match.rankTerm)) return [];
    const matchedTerms = [...new Set([...directMatches, ...semanticEvidence.flatMap(match =>
      match.rankTerm ? [match.rankTerm] : [])])];
    if (!matchedTerms.length) return [];
    const snippetTerms = [...new Set([...directMatches, ...semanticEvidence.flatMap(match => match.snippetTerms)])];
    const snippet = bestSnippet(document.content, snippetTerms, query,
      semanticEvidence.flatMap(match => match.anchorTerm ? [match.anchorTerm] : []));
    if (!snippet) return [];
    return [{ path: document.path, sha256: document.sha256, sourceType: document.sourceType,
      snippet, matchedTerms, contextOnly: true as const }];
  }).sort((a, b) => b.matchedTerms.length - a.matchedTerms.length
    || Number(b.sourceType === 'vendor') - Number(a.sourceType === 'vendor')
    || a.path.localeCompare(b.path));

  // Exact-model queries may intentionally need both the vendor row and its
  // compiled fact page for source verification; preserve those distinct views.
  if (requestedModels.length) return scored.slice(0, Math.max(1, Math.min(20, limit)));

  // A fact page often mirrors the same row table as its vendor-authored Wiki
  // source. Returning both wastes result slots and can make one source look
  // like independent corroboration. Keep one hit per mirrored path, preferring
  // the vendor page (the source of truth); non-mirrored fact/reference pages
  // remain independently searchable.
  const unique: WikiSearchHit[] = [];
  const indexBySource = new Map<string, number>();
  for (const hit of scored) {
    const sourceKey = hit.path.replace(/^wiki\/facts\//, 'wiki/vendors/');
    const previousIndex = indexBySource.get(sourceKey);
    if (previousIndex === undefined) {
      indexBySource.set(sourceKey, unique.length);
      unique.push(hit);
    } else if (unique[previousIndex].sourceType === 'fact' && hit.sourceType === 'vendor') {
      unique[previousIndex] = hit;
    }
  }
  return unique.slice(0, Math.max(1, Math.min(20, limit)));
}

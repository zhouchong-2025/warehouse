type CatalogSearchProduct = {
  part_number?: string;
  _section?: string;
  _sections?: string[];
  _params?: string;
  _detail_intro?: string;
  _detail_features?: string;
  _detail_apps?: string;
  _search_context?: { text: string; source: { selectionUse: 'context_only' } };
};

/** Model-row catalog text is searchable; shared prose remains reference context. */
export function catalogSearchFields(product: CatalogSearchProduct): {
  sourceText: string;
  contextText: string;
} {
  return {
    sourceText: [product.part_number, product._section, ...(product._sections || []), product._params]
      .filter(Boolean).join(' ').toLowerCase(),
    contextText: (product._search_context?.source.selectionUse === 'context_only'
      ? product._search_context.text
      : [product._detail_intro, product._detail_features, product._detail_apps].filter(Boolean).join(' '))
      .toLowerCase(),
  };
}

/** This tie-breaker reads the exact model's published parameter row. */
export function hasSourceTwoPointFiveGigabit(product: CatalogSearchProduct): boolean {
  return /(?<![a-z0-9])2\.5g(?:e|phy)?(?![a-z0-9])/i.test(product._params || '');
}

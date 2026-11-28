export type WikiSearchHit = {
  path: string;
  sha256: string;
  sourceType: 'vendor' | 'fact' | 'reference';
  snippet: string;
  matchedTerms: string[];
  contextOnly: true;
};

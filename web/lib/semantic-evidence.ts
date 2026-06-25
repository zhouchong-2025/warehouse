export type SemanticEvidenceRule = {
  tag: string;
  dimension: string;
  strength: string;
  include: string[];
  exclude: string[];
  fields: string[];
  auto: boolean;
  aliases: string[];
  regex: string;
  keywords: string;
  query_regex?: string;
  _lineno: number;
};

export type SemanticParserRule = {
  tag: string;
  pattern: RegExp;
  dimension: string;
  strength: string;
};

import { GENERATED_SEMANTIC_EVIDENCE_RULES } from './semantic-evidence.generated';

export function loadSemanticEvidenceRules(): SemanticEvidenceRule[] {
  return GENERATED_SEMANTIC_EVIDENCE_RULES;
}

export function buildSemanticAliasMap(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const rule of loadSemanticEvidenceRules()) {
    if (!rule.aliases.length) continue;
    out[rule.tag] = Array.from(new Set(rule.aliases.map((s) => s.toLowerCase())));
  }
  return out;
}

export function semanticRulesForTag(tag: string): SemanticEvidenceRule[] {
  return loadSemanticEvidenceRules().filter((r) => r.tag === tag);
}

export function buildSemanticParserRules(): SemanticParserRule[] {
  return loadSemanticEvidenceRules()
    .filter((r) => r.query_regex && r.query_regex.trim())
    .map((r) => ({
      tag: r.tag,
      pattern: new RegExp(r.query_regex!, 'i'),
      dimension: r.dimension,
      strength: r.strength,
    }));
}

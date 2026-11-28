/** Declarative LLM constraints. Model output is data and is never executed. */
export interface ParameterRule {
  field: string;
  operator: 'equals' | 'token' | 'contains';
  value: string;
}

export function parseParameterRules(value: unknown, tags: string[]): Record<string, ParameterRule> {
  const rules: Record<string, ParameterRule> = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return rules;
  for (const [tag, candidate] of Object.entries(value).slice(0, 32)) {
    if (!tags.includes(tag) || !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const rule = candidate as Record<string, unknown>;
    if (typeof rule.field !== 'string' || !normalize(rule.field) || rule.field.length > 80) continue;
    if (typeof rule.value !== 'string' || !normalize(rule.value) || rule.value.length > 120) continue;
    if (rule.operator !== 'equals' && rule.operator !== 'token' && rule.operator !== 'contains') continue;
    rules[tag] = { field: rule.field.trim(), operator: rule.operator, value: rule.value.trim() };
  }
  return rules;
}

const normalize = (value: string) => value.toLowerCase().replace(/[\s\-‐‑–—]/g, '');

export function matchesParameterRule(rule: ParameterRule, params: string): boolean {
  const expected = normalize(rule.value);
  for (const entry of params.split('|')) {
    const colon = entry.search(/[:：]/);
    if (colon < 0 || normalize(entry.slice(0, colon)) !== normalize(rule.field)) continue;
    const value = entry.slice(colon + 1).trim();
    if (rule.operator === 'equals' && normalize(value) === expected) return true;
    if (rule.operator === 'contains' && normalize(value).includes(expected)) return true;
    // Fixed tokenization prevents SOP8 matching SOP16 or MSL1 matching MSL10.
    if (rule.operator === 'token' && value.split(/[^\p{L}\p{N}\-‐‑–—]+/u).some(token => normalize(token) === expected)) return true;
  }
  return false;
}

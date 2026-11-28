import { tagSatisfied } from './constraint-match';
import { reviewedIsolationSource } from './source-facts';

type ExclusionProduct = Parameters<typeof tagSatisfied>[0];

const ISOLATION_TAGS = new Set([
  '隔离', '5kvrms隔离', '3kvrms隔离', '隔离栅极驱动', '隔离电源',
  '隔离放大器', '隔离i2c', '隔离can', '隔离rs485',
]);

/** Exclude only when a source-backed product identity or fact proves the negated property. */
export function matchesExplicitExclusion(product: ExclusionProduct, tags: string[]): boolean {
  if (!tags.length) return false;
  const section = String(product._section || '').replace(/\s+/g, '').toLowerCase();
  for (const rawTag of tags) {
    const tag = rawTag.toLowerCase();
    if (ISOLATION_TAGS.has(tag)) {
      // A primary category is source-rebuilt per model. The prefix matters:
      // "非隔离栅极驱动" must never satisfy the excluded "隔离" term.
      if (!/非隔离|不隔离/.test(section)
        && (section.includes('隔离') || reviewedIsolationSource(product) !== null)) return true;
      continue;
    }
    // Other negated terms must not inherit unsupported legacy feature tokens.
    if (tagSatisfied({ ...product, _features: '' }, rawTag)) return true;
  }
  return false;
}

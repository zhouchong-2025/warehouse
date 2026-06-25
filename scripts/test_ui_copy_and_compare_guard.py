#!/usr/bin/env python3
from pathlib import Path

root = Path('/Users/zhouchong/Projects/warehouse')
page = (root / 'web/app/page.tsx').read_text()
compare = (root / 'web/app/compare/page.tsx').read_text()

assert '便宜运放' not in page, 'homepage should not suggest 便宜运放'
assert '4 vendors' not in page, 'footer vendor count must not be hardcoded to 4'
assert '{vendors.length} vendors' in page, 'footer should use dynamic grouped vendor count'
assert 'function toDisplayValue(value: unknown): string | null' in compare, 'compare page must normalize values before rendering'
assert 'toDisplayValue(product[param])' in compare, 'compare page cells must render normalized scalar values'
assert 'product[param] || "—"' not in compare, 'compare page should not render raw object values directly'

print('✅ UI copy and compare render guard passed')

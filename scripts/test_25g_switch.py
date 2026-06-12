#!/usr/bin/env python3
"""Verify '2.5g switch' search."""
import json
data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

features = ["2.5G", "交换机"]
print(f'Query: "2.5g switch" → features: {features}')
print()

results = []
for vk, vd in data.items():
    for p in vd['products']:
        ft = p.get('_features','')
        score = sum(3 for f in features if f.lower() in ft.lower())
        if all(f.lower() in ft.lower() for f in features):
            score += 20
        if score > 0:
            results.append((score, vd['name'], p['part_number'], ft))
results.sort(reverse=True)

strong = [r for r in results if r[0] >= 23]
print(f'Strong matches (s>=23): {len(strong)}')
for s, v, pn, ft in strong:
    print(f'  ✅ [{v}] {pn:20s} s={s:.0f} | {ft}')

print(f'\nPartial matches: {len(results)-len(strong)}')
for s, v, pn, ft in results[len(strong):len(strong)+6]:
    print(f'     [{v}] {pn:20s} s={s:.0f} | {ft}')

# Check YT9215S specifically
for r in results:
    if 'YT9215S' in r[2]:
        print(f'\n  ⚠️ YT9215S appears s={r[0]}' if r[0] >= 23 else f'\n  ✅ YT9215S correctly excluded (s={r[0]})')
        break

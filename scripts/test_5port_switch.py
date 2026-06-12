#!/usr/bin/env python3
"""Verify '5口千兆交换机' search — simulate LLM output + data match."""
import json

data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

# Simulate expected LLM output for "我需要一个5口的千兆交换机，推荐型号"
features = ["千兆", "交换机", "5口"]
print(f'Query: "我需要一个5口的千兆交换机，推荐型号"')
print(f'LLM expected: {features}')
print()

results = []
for vk, vd in data.items():
    for p in vd['products']:
        ft = p.get('_features','')
        score = sum(3 for f in features if f.lower() in ft.lower())
        if all(f.lower() in ft.lower() for f in features):
            score += 20
        if score > 0:
            results.append((score, vd['name'], p['part_number'], ft, p.get('_params','')[:80]))
results.sort(reverse=True)

strong = [r for r in results if r[0] >= 23]
print(f'强匹配 (s>=23): {len(strong)}')
for s, v, pn, ft, params in strong:
    print(f'  ✅ [{v}] {pn:20s} s={s:.0f} | {ft}')

print(f'\n部分匹配: {len(results)-len(strong)}')
for s, v, pn, ft, params in results[len(strong):len(strong)+5]:
    print(f'     [{v}] {pn:20s} s={s:.0f} | {ft}')

# Check YT9215 series specifically
print()
for target in ['YT9215S','YT9215RB','YT9215RBH','YT9215SC','YT9215SCH']:
    for r in results:
        if target in r[2]:
            m = '✅' if r[0] >= 23 else '⚠️'
            print(f'  {m} {target}: s={r[0]:.0f}')
            break
    else:
        print(f'  ❌ {target}: NOT IN RESULTS')

# Check YT8511H (should NOT appear)
for r in results:
    if 'YT8511H' in r[2]:
        print(f'  ❌ YT8511H FALSELY APPEARS s={r[0]}')
        break
else:
    print(f'  ✅ YT8511H correctly excluded')

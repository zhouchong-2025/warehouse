#!/usr/bin/env python3
"""Test the LLM interpretation + search for '推荐车载百兆 phy，tx 接口'."""
import json

DATA = json.load(open("/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json"))

# Simulate: the LLM interpret endpoint should return these features
features = ["百兆", "车规AEC-Q100", "100FX"]
query = "推荐车载百兆 phy，tx 接口"

print(f"Query: {query}")
print(f"Expected LLM features: {features}")
print()

# Search all products
results = []
for vk, vd in DATA.items():
    for p in vd["products"]:
        ft_str = p.get("_features", "")
        params_str = p.get("_params", "")
        pn = p["part_number"]
        
        # Scored search
        score = 0
        for f in features:
            if f.lower() in ft_str.lower():
                score += 3
        
        # EVERY check (all features must match)
        all_match = all(f.lower() in ft_str.lower() for f in features)
        if all_match:
            score += 20
        
        if score > 0:
            results.append((score, vd["name"], pn, ft_str, params_str[:80]))

results.sort(reverse=True)

print(f"Results: {len(results)}")
for score, vendor, pn, ft, params in results[:8]:
    marker = "✅" if score >= 26 else "⚠️" if score >= 6 else "  "
    print(f"  {marker} [{vendor}] {pn:20s} s={score:.0f} | features: {ft}")
    print(f"      params: {params}")

# Show specifically YT8522A vs YT8010A
print()
for pn in ("YT8522A", "YT8010A"):
    for vk, vd in DATA.items():
        for p in vd["products"]:
            if p["part_number"] == pn:
                ft = p.get("_features", "")
                score = sum(3 for f in features if f.lower() in ft.lower())
                all_match = all(f.lower() in ft.lower() for f in features)
                if all_match: score += 20
                status = "✅ MATCH" if all_match else "❌ EXCLUDED (no 100FX)"
                print(f"  {status}: [{vd['name']}] {pn} s={score} features={ft}")
                break

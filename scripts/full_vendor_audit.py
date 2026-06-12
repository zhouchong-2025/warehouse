#!/usr/bin/env python3
"""Full-vendor data quality scan + FAE-grade search audit."""
import json, re
from collections import Counter

DATA_PATH = "/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json"
data = json.load(open(DATA_PATH))

print("=" * 60)
print("DATA QUALITY SCAN")
print("=" * 60)

# 1. Per-vendor stats
for slug, vd in data.items():
    products = vd["products"]
    feat_tags = Counter()
    no_features = 0
    garbage = []
    
    for p in products:
        ft = p.get("_features", "")
        if not ft.strip():
            no_features += 1
        for tag in ft.split():
            if tag: feat_tags[tag] += 1
        # Check for suspicious products
        pn = p["part_number"]
        if re.match(r'^\d', pn) or len(pn) < 3:
            garbage.append(pn)
        if any(kw in pn.lower() for kw in ['none', 'null', 'part', '选型']):
            garbage.append(pn)
    
    print(f"\n{vd['name']} ({slug}): {len(products)} products")
    print(f"  No features: {no_features}")
    if garbage:
        print(f"  Garbage: {garbage}")
    print(f"  Top tags: {feat_tags.most_common(12)}")
    
    # Check schema label sanity
    sample = products[0] if products else None
    if sample:
        params = sample.get("_params", "")
        labels = re.findall(r'([^:|]+):', params)
        print(f"  Schema labels: {labels[:8]}")

# 2. Feature tag consistency check
print(f"\n{'='*60}")
print("FEATURE TAG INVENTORY")
print("="*60)
all_tags = Counter()
for slug, vd in data.items():
    for p in vd["products"]:
        for tag in p.get("_features", "").split():
            if tag: all_tags[tag] += 1

print(f"Unique tags: {len(all_tags)}")
print(f"All tags: {dict(all_tags.most_common())}")

# 3. Find products with suspicious/conflicting tags
print(f"\n{'='*60}")
print("SUSPICIOUS TAGS CHECK")
print("="*60)
for slug, vd in data.items():
    for p in vd["products"]:
        ft = p.get("_features", "")
        tags = set(ft.split())
        # Check: 百兆 + 千兆
        if "百兆" in tags and "千兆" in tags:
            print(f"  [{vd['name']}] {p['part_number']}: both 百兆+千兆")
        # Check: 车规AEC-Q100 + 工业级
        if "车规AEC-Q100" in tags and "工业级" in tags:
            print(f"  [{vd['name']}] {p['part_number']}: both 车规+工业级")
        if "车规AEC-Q100" in tags and "消费级" in tags:
            print(f"  [{vd['name']}] {p['part_number']}: both 车规+消费级")
        # Check: 100FX + T1 PHY
        if "100FX" in tags and "T1 PHY" in tags:
            print(f"  [{vd['name']}] {p['part_number']}: both 100FX+T1 PHY")

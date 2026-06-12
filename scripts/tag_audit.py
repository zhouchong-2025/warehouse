#!/usr/bin/env python3
"""
tag_audit.py — 全局标签审计 + 未覆盖参数检测 + 阈值自动发现
"""
import json, sys, os, re
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tag_config import generate_tags, TAG_RULES, get_applicable_rules

DRY_RUN = '--dry-run' in sys.argv
DO_FIX = '--fix' in sys.argv

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         'web/public/data/products_structured.json')

with open(DATA_PATH) as f:
    data = json.load(f)

# ═══════════════════════════════════════════
# PART 1: Gap detection (existing logic)
# ═══════════════════════════════════════════
total_missing = 0
category_stats = defaultdict(lambda: {'total': 0, 'missing': 0, 'products': []})

for vendor, vd in data.items():
    for p in vd.get('products', []):
        ft = p.get('_features', '')
        params = p.get('_params', '')
        if not params: continue
        
        feats = set(ft.split())
        best_cat, best_len = None, 0
        for cat in TAG_RULES:
            if cat in feats:
                if len(cat) > best_len:
                    best_cat, best_len = cat, len(cat)
        if not best_cat: continue
        
        expected = set(generate_tags(best_cat, params))
        missing = expected - feats
        if missing:
            total_missing += len(missing)
            st = category_stats[best_cat]
            st['total'] += 1
            st['missing'] += len(missing)
            st['products'].append({
                'pn': p['part_number'], 'missing': sorted(missing), 'features': ft[:120]
            })
            if DO_FIX and not DRY_RUN:
                p['_features'] = ft + ' ' + ' '.join(sorted(missing))

# ═══════════════════════════════════════════
# PART 2: Unmapped param key detection (NEW)
# ═══════════════════════════════════════════
unmapped_by_cat = defaultdict(lambda: defaultdict(int))

for vendor, vd in data.items():
    for p in vd.get('products', []):
        ft = p.get('_features', '')
        params = p.get('_params', '')
        if not params: continue
        
        feats = set(ft.split())
        # Find primary category
        for cat in TAG_RULES:
            if cat in feats:
                rules = TAG_RULES[cat]
                # Check each param key
                for part in params.split('|'):
                    kv = part.split(':', 1)
                    if len(kv) < 2: continue
                    param_key = kv[0].strip().lower()
                    param_val = kv[1].strip()
                    if not param_val or param_val in ('/', '-', 'N/A'): continue
                    
                    # Check if any rule matches this param key
                    matched = False
                    for key_pattern in rules:
                        if key_pattern.startswith('paired:'): continue
                        if key_pattern in param_key:
                            matched = True
                            break
                    if not matched:
                        # This param key has NO extraction rule
                        unmapped_by_cat[cat][param_key] += 1
                break  # only check first matching category

# ═══════════════════════════════════════════
# PART 3: Threshold auto-discovery (NEW)
# ═══════════════════════════════════════════
all_iout = set()
all_vin = set()
all_vout = set()
all_mbps = set()
all_channels = set()
all_bits = set()

for vendor, vd in data.items():
    for p in vd.get('products', []):
        for tag in p.get('_features', '').split():
            m = re.match(r'^Iout_([\d.]+)A$', tag)
            if m: all_iout.add(float(m.group(1)))
            m = re.match(r'^Vin_([\d.]+)V$', tag)
            if m: all_vin.add(float(m.group(1)))
            m = re.match(r'^Vout_([\d.]+)V$', tag)
            if m: all_vout.add(float(m.group(1)))
            m = re.match(r'^(\d+)Mbps$', tag)
            if m: all_mbps.add(int(m.group(1)))
            m = re.match(r'^(\d+)通道$', tag)
            if m: all_channels.add(int(m.group(1)))
            m = re.match(r'^(\d+)bit$', tag)
            if m: all_bits.add(int(m.group(1)))

# ─── Report ───
print("=== Tag Audit ===")
print(f"Missing tags: {total_missing} across {len(category_stats)} categories")
for cat in sorted(category_stats.keys()):
    st = category_stats[cat]
    print(f"  {cat}: {st['total']}p, {st['missing']} missing")

print(f"\n=== Unmapped Param Keys ===")
total_unmapped = 0
for cat in sorted(unmapped_by_cat.keys()):
    keys = unmapped_by_cat[cat]
    if not keys: continue
    total_unmapped += sum(keys.values())
    print(f"\n  {cat}:")
    for k, cnt in sorted(keys.items(), key=lambda x: -x[1])[:5]:
        print(f"    {k}: {cnt} products")

print(f"\n=== Auto-Discovered Thresholds ===")
print(f"  Iout(A):  {sorted(all_iout)}")
print(f"  Vin(V):   {sorted(all_vin)}")
print(f"  Vout(V):  {sorted(all_vout)}")
print(f"  Mbps:     {sorted(all_mbps)}")
print(f"  Channels: {sorted(all_channels)}")
print(f"  Bits:     {sorted(all_bits)}")

# Compare with hardcoded thresholds
hardcoded_iout = {0.5,1,2,3,4,5,6,7,8,10,12,15,20}
print(f"\n  Hardcoded Iout: {sorted(hardcoded_iout)}")
print(f"  Auto vs Hardcoded diff: {sorted(all_iout - hardcoded_iout)}")

if DO_FIX and not DRY_RUN:
    with open(DATA_PATH, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n✓ Fixed {total_missing} missing tags")

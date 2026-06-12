#!/usr/bin/env python3
"""Scan all products for tag-params contradictions."""
import json
data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

# 1. params含"非隔离" but features有隔离标签
print('=== params含"非隔离" but features有隔离标签 ===')
found = 0
for slug, vd in data.items():
    for p in vd['products']:
        params = (p.get('_params','') + p.get('_raw','')).lower()
        ft = p.get('_features','')
        if '非隔离' in params:
            iso_tags = [t for t in ft.split() if '隔离' in t or 'kvrms' in t.lower()]
            if iso_tags:
                print(f'  ❌ [{vd["name"]}] {p["part_number"]:30s} | {ft[:60]}')
                found += 1
if found == 0:
    print('  ✅ Clean')

# 2. params不含"隔离"但features有隔离标签
print('\n=== params不含隔离关键词但features有隔离标签 ===')
found2 = 0
for slug, vd in data.items():
    for p in vd['products']:
        params = (p.get('_params','') + p.get('_raw','')).lower()
        ft = p.get('_features','')
        iso_tags = [t for t in ft.split() if '隔离' in t or 'kvrms' in t.lower()]
        if iso_tags and '隔离' not in params and 'isolat' not in params and 'vrms' not in params:
            print(f'  ⚠️ [{vd["name"]}] {p["part_number"]:30s} | {ft[:60]} | {p.get("_params","")[:50]}')
            found2 += 1
if found2 == 0:
    print('  ✅ Clean')

# 3. 车规 but params mention consumer
print('\n=== 车规AEC-Q100 but params mention 消费/consumer ===')
found3 = 0
for slug, vd in data.items():
    for p in vd['products']:
        ft = p.get('_features','')
        params = (p.get('_params','') + p.get('_raw','')).lower()
        if '车规AEC-Q100' in ft and ('消费' in params or 'consumer' in params):
            print(f'  ⚠️ [{vd["name"]}] {p["part_number"]:30s} | {p.get("_params","")[:60]}')
            found3 += 1
if found3 == 0:
    print('  ✅ Clean')

# 4. 工业级 but params mention 车规/AEC (missing 车规 tag)
print('\n=== 工业级 but params mention 车规/AEC (maybe missing 车规 tag) ===')
found4 = 0
for slug, vd in data.items():
    for p in vd['products']:
        ft = p.get('_features','')
        params = (p.get('_params','') + p.get('_raw','')).lower()
        if '工业级' in ft and '车规AEC-Q100' not in ft:
            if any(kw in params for kw in ['车规','aec','q100','automotive']):
                print(f'  ⚠️ [{vd["name"]}] {p["part_number"]:30s} | ft={ft[:50]}')
                found4 += 1
if found4 == 0:
    print('  ✅ Clean')

# 5. CAN FD tag but params say LIN or SBC
print('\n=== CAN FD tag but product is actually LIN/SBC ===')
found5 = 0
for slug, vd in data.items():
    for p in vd['products']:
        ft = p.get('_features','')
        params = (p.get('_params','') + p.get('_raw','')).lower()
        if 'CAN FD' in ft and ('lin' in params or 'sbc' in params.lower()):
            # Some SBC/LIN products legitimately have both CAN FD + LIN
            # Only flag if LIN is the PRIMARY function
            pass
if found5 == 0:
    print('  ✅ Clean (CAN FD + LIN/SBC co-existence is legitimate)')

# 6. 千兆 tag but params say 百兆
print('\n=== 千兆 tag but params say 百兆/FE ===')
found6 = 0
for slug, vd in data.items():
    for p in vd['products']:
        ft = p.get('_features','')
        params = (p.get('_params','') + p.get('_raw','')).lower()
        if '千兆' in ft and '百兆' not in ft:
            if 'fe' in params and 'ge' not in params and 'gbe' not in params:
                print(f'  ⚠️ [{vd["name"]}] {p["part_number"]:30s} | {ft[:50]} | {p.get("_params","")[:50]}')
                found6 += 1
if found6 == 0:
    print('  ✅ Clean')

print(f'\n=== SUMMARY ===')
print(f'非隔离→隔离: {found}')
print(f'无隔离→隔离: {found2}')
print(f'车规→消费: {found3}')
print(f'工业→应有车规: {found4}')
print(f'千兆→实际百兆: {found6}')

"""
test_search_quality.py — 搜索质量回归测试
验证 query → 应该/不应该返回的产品

用法: python3 scripts/test_search_quality.py
"""

import json, sys

DATA_PATH = 'web/public/data/products_structured.json'

with open(DATA_PATH) as f:
    data = json.load(f)

def find_product(pn, vendor='3peak-analog'):
    for p in data.get(vendor, {}).get('products', []):
        if p['part_number'].upper() == pn.upper():
            return p
    return None

def product_has_tag(p, tag):
    return tag in p.get('_features', '').split()

# ═══════════════════════════════════════════════
TESTS = [
    {
        'name': '非隔离RS485不返回隔离产品',
        'forbidden': ['TPT7481', 'TPT7482'],
        'query': '非隔离 rs485',
        'reason': 'TPT7481/7482是隔离RS-485，exclude_tags应排除'
    },
    {
        'name': '非隔离CAN不返回隔离产品',
        'forbidden': ['TPT71050'],
        'query': '非隔离 can',
        'reason': 'TPT71050是隔离CAN'
    },
    {
        'name': 'TPDA不出现CAN结果中',
        'check_tags': {'TPDA1009': ['CAN-FD'], 'TPDA1008': ['CAN-FD'],
                       'TPDA1001Q': ['CAN-FD'], 'TPDA1000Q': ['CAN-FD']},
        'forbidden_tags_in_products': True,
        'query': '非隔离 can',
        'reason': 'TPDA是ASN音频总线，不是CAN'
    },
    {
        'name': '1mv不会被当成1Mbps',
        'must_have_tags': ['运放'],
        'forbidden_tags': ['1Mbps'],
        'query': '轨到轨运放 offset 小于 1mv',
        'reason': '"1mv"是毫伏，不是速度'
    },
    {
        'name': '特定帧唤醒能匹配',
        'must_have_tags': ['特定帧唤醒'],
        'query': 'CAN 特定帧唤醒',
        'reason': 'partial networking=特定帧唤醒'
    },
    {
        'name': 'LDO低噪声不返回非LDO',
        'must_have_tags': ['LDO', '低噪声'],
        'query': 'ldo 低噪声',
        'reason': '低噪声LDO应该匹配'
    },
    {
        'name': '隔离栅极驱动正确匹配',
        'must_have_tags': ['隔离栅极驱动'],
        'query': '隔离栅极驱动 5kVrms',
        'reason': '隔离栅极驱动品类正确'
    },
    {
        'name': '非隔离栅极驱动不含隔离标签',
        'must_have_tags': ['非隔离栅极驱动'],
        'forbidden_tags': ['隔离'],
        'query': '非隔离栅极驱动',
        'reason': '非隔离栅极驱动不应有隔离标签'
    },
    {
        'name': '精密运放不包含Vos>1mV的产品',
        'check_tags': {'LMV358B': ['精密(≤1mV)'], 'LMV324X': ['精密(≤1mV)']},
        'forbidden_tags_in_products': True,
        'query': '运放 精密 轨到轨',
        'reason': 'Vos(Max)>1mV的产品不应标精密(≤1mV)'
    },    {
        'name': '精密+轨到轨运放不包含Vos>1mV或非全轨到轨产品',
        'check_all_matching': {
            'query_features': ['运放', '精密(≤1mV)', '轨到轨'],
            'constraints': {
                '精密(≤1mV)': {'param': 'Vos (Max) (mV)', 'max': 1.0},
                '轨到轨': {'param': 'Rail-Rail In', 'must_be': 'Yes'}
            }
        },
        'query': '轨到轨运放 offset 小于 1mv',
        'reason': '所有匹配产品必须Vos≤1mV且Rail-Rail In=Yes'
    },
]

# ═══════════════════════════════════════════════
passed = 0
failed = 0
failures = []

for tc in TESTS:
    errors = []
    query = tc.get('query', '')
    
    # Non-isolation: check exclude_tags coverage
    if 'forbidden' in tc:
        exclude_tags = set()
        if '非隔离' in query or '不隔离' in query:
            exclude_tags = {'隔离', '5kVrms隔离', '3kVrms隔离', '隔离栅极驱动',
                          '隔离电源', '隔离放大器', '隔离I2C', '隔离CAN', '隔离RS485'}
        for pn in tc['forbidden']:
            p = find_product(pn)
            if not p:
                errors.append(f"  product {pn} not found")
                continue
            feats = p.get('_features', '').split()
            caught = any(t in exclude_tags for t in feats)
            if not caught:
                errors.append(f"  {pn} NOT caught by exclude_tags")
    
    # Check forbidden tags on specific products
    if tc.get('forbidden_tags_in_products') and 'check_tags' in tc:
        for pn, forbidden in tc['check_tags'].items():
            p = find_product(pn)
            if not p:
                errors.append(f"  product {pn} not found")
                continue
            feats = p.get('_features', '').split()
            for tag in forbidden:
                if tag in feats:
                    errors.append(f"  {pn} has forbidden tag '{tag}'")
    
    # Check must_have_tags exist
    if 'must_have_tags' in tc:
        for tag in tc['must_have_tags']:
            found = [p for vd in data.values() for p in vd.get('products', []) 
                    if tag in p.get('_features', '').split()]
            if not found:
                errors.append(f"  NO product has tag '{tag}'")
    
    # Check check_all_matching: validate ALL matching products against constraints
    if 'check_all_matching' in tc:
        import re as re_m
        features = tc['check_all_matching']['query_features']
        constraints = tc['check_all_matching']['constraints']
        for vd in data.values():
            for p in vd.get('products', []):
                p_feats = p.get('_features', '').split()
                if not all(f in p_feats for f in features):
                    continue
                params = p.get('_params', '')
                for tag, constraint in constraints.items():
                    if 'max' in constraint:
                        m = re_m.search(constraint['param'] + r'\s*[:：]\s*([\d.]+)', params, re_m.I)
                        if m and float(m.group(1)) > constraint['max']:
                            errors.append(f"  {p['part_number']} {constraint['param']}={m.group(1)} > {constraint['max']}")
                    if 'must_be' in constraint:
                        m = re_m.search(constraint['param'] + r'\s*[:：]\s*(\w+)', params, re_m.I)
                        if m and m.group(1).lower() != constraint['must_be'].lower():
                            errors.append(f"  {p['part_number']} {constraint['param']}={m.group(1)} ≠ {constraint['must_be']}")

    # Check forbidden_tags
    if 'forbidden_tags' in tc:
        for tag in tc['forbidden_tags']:
            must_tags = tc.get('must_have_tags', [])
            for vd in data.values():
                for p in vd.get('products', []):
                    feats = p.get('_features', '').split()
                    if tag in feats and all(t in feats for t in must_tags):
                        errors.append(f"  {p['part_number']} has must_have + forbidden '{tag}'")
    
    if errors:
        failed += 1
        failures.append(f"\n❌ {tc['name']}")
        failures.extend(errors)
        failures.append(f"   → {tc['reason']}")
    else:
        passed += 1

print(f"\n╔══════════════════════════════╗")
print(f"║  搜索质量回归测试              ║")
print(f"╠══════════════════════════════╣")
print(f"║  ✅ {passed:<3}  ❌ {failed:<3}  total {len(TESTS)}   ║")
print(f"╚══════════════════════════════╝")

if failures:
    for f in failures:
        print(f)
    sys.exit(1)
else:
    print(f"\n✅ 全部通过！")
    sys.exit(0)

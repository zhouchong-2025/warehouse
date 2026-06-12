#!/usr/bin/env python3
"""Audit: check if any product has tags that don't match its _raw text at all."""
import json, re

data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

# These tags require strong evidence in _raw
HIGH_BAR_TAGS = {
    '隔离电源': [r'push.pull.*open.loop', r'isolated.buck', r'isolated.output', r'isolated.dcdc', r'isolated.converter'],
    '隔离栅极驱动': [r'isolated.gate', r'reinforced.*driver', r'隔离栅极'],
    'CAN FD': [r'\bcan\b.*(fd|transc|收发)', r'can fd', r'bus.fault'],
    'RS-485': [r'half.duplex', r'full.duplex', r'rs.485'],
    '数字隔离器': [r'digital.isolat', r'数字隔离'],
    '隔离放大器': [r'isolated.amplif', r'隔离放大'],
}

print('=== PRODUCTS WITH TAGS NOT SUPPORTED BY _raw ===')
issues = 0
for slug, vd in data.items():
    for p in vd['products']:
        raw = (p.get('_raw','') or '').lower()
        ft = p.get('_features','')
        pn = p['part_number']
        
        for tag, patterns in HIGH_BAR_TAGS.items():
            if tag not in ft:
                continue
            # Check if any pattern matches _raw
            if not any(re.search(pat, raw) for pat in patterns):
                issues += 1
                if issues <= 20:
                    print(f'  ❌ [{vd["name"]}] {pn:25s} tag={tag} | raw={p.get("_raw","")[:60]}')

print(f'\nTotal issues: {issues}')

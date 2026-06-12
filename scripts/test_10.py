#!/usr/bin/env python3
"""10 comprehensive search tests"""
import json, urllib.request, sys

QUERIES = [
    # 1. CAN bus
    "can fd 5mbps 车规",
    # 2. SBC
    "sbc 车规",
    # 3. RS-232 with driver/receiver count
    "rs232 3发5收",
    # 4. PoE
    "以太网供电",
    # 5. Isolated gate driver
    "隔离栅极驱动 车规 5a",
    # 6. LIN transceiver
    "lin 低功耗",
    # 7. Level translator
    "10兆 电平转换",
    # 8. Op-amp
    "精密运放 低功耗",
    # 9. DCDC boost
    "升压 输入5v 输出12v",
    # 10. Video filter
    "视频滤波 1080p",
]

API = 'http://localhost:3000/api/interpret'
data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

for i, q in enumerate(QUERIES, 1):
    print(f'=== TEST {i}: "{q}" ===')
    
    # Call LLM
    req = urllib.request.Request(API, data=json.dumps({'query': q}).encode(),
                                  headers={'Content-Type': 'application/json'})
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=30).read())
    except Exception as e:
        print(f'  API ERROR: {e}')
        continue
    
    features = resp.get('features', [])
    confidence = resp.get('confidence', '?')
    suggestions = resp.get('suggestions', [])
    explanation = resp.get('explanation', '')[:100]
    
    print(f'  LLM: {features}')
    print(f'  Confidence: {confidence}')
    print(f'  Reason: {explanation}')
    
    # Match products
    feats_lower = [f.lower() for f in features]
    matches = []
    for slug, vd in data.items():
        for p in vd['products']:
            ft = (p.get('_features','')).lower()
            if all(f in ft for f in feats_lower):
                matches.append((p['part_number'], vd.get('name', slug)))
    
    if matches:
        print(f'  ✅ Matches ({len(matches)}):')
        for pn, vn in matches[:8]:
            print(f'     {pn} [{vn}]')
        if len(matches) > 8:
            print(f'     ... +{len(matches)-8} more')
    else:
        print(f'  ❌ 0 matches')
        if suggestions:
            for s in suggestions[:3]:
                print(f'     💡 {s.get("text","")[:100]}')
    
    print()

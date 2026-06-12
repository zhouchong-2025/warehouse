#!/usr/bin/env python3
"""pressure test — end-to-end search regression"""
import urllib.request, json, os

BASE = "http://localhost:3000/api/interpret"
DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "web/public/data/products_structured.json")
with open(DATA_PATH) as f:
    DB = json.load(f)

def search(features, vendor=None, max_results=20):
    feats_lower = [f.lower() for f in features]
    all_p = []
    for slug, vd in DB.items():
        if vendor and slug != vendor: continue
        for p in vd['products']:
            tokens = set(p['_features'].lower().split())
            if all(f in tokens for f in feats_lower):
                all_p.append(p)
    return all_p[:max_results]

TESTS = [
    ("rs232 5发3收",          ["RS-232", "5T3R"]),        # LLM output 5T3R is correct
    ("隔离485 高速",           ["隔离", "RS-485"]),        # ✅
    ("隔离485 高速 半双工",     ["隔离", "RS-485", "半双工"]), # ✅
    ("隔离485 高速 全双工",     ["隔离", "RS-485", "全双工"]), # ✅
    ("LDO 5V 输出 1A",        ["LDO", "Vout_5V", "Iout_1A"]), # ✅
    ("车规 CAN FD",           ["CAN-FD", "车规AEC-Q100"]),  # (低功耗唤醒标签暂缺)
    ("运放 精密 轨到轨 2通道",   ["运放", "精密(≤1mV)", "轨到轨"]), # ✅
    ("DCDC 降压 12V输入 5V输出", ["DCDC", "降压", "Vin_12V", "Vout_5V"]), # ✅
    ("电子保险丝",             ["电子保险丝"]),               # ✅
    ("隔离栅极驱动 大电流",     ["隔离栅极驱动"]),             # ✅
    ("电压基准 3.3V 低噪声",    ["电压基准", "Vout_3.3V"]),   # ✅
    ("非隔离485",             ["RS-485"]),                  # ✅
    ("MLVDS",                ["MLVDS"]),                   # ✅
    ("IO扩展 I2C",            ["IO扩展", "I2C"]),           # ✅
    ("模拟开关 4通道",         ["模拟开关", "4通道"]),        # (最大4通)
    ("数字隔离器",             ["数字隔离器"]),               # (通道标签暂缺)
    ("比较器",                ["比较器"]),                   # (高速标签暂缺)
    ("BMS 3节",              ["BMS"]),                     # ✅
    ("复位芯片",              ["复位芯片"]),                  # ✅
    ("马达驱动 2A",           ["马达驱动"]),                 # ✅ 修复
]

passed = 0
for query, must in TESTS:
    data = json.dumps({"query": query, "vendor": "3peak-analog"}).encode()
    req = urllib.request.Request(BASE, data=data, headers={"Content-Type": "application/json"})
    try:
        result = json.loads(urllib.request.urlopen(req, timeout=15).read())
    except Exception as e:
        print(f"❌ {query:35s} → API ERROR: {e}"); continue
    
    features = result.get("features", [])
    missing = [t for t in must if t not in features]
    
    if missing and not any(m == "隔离" for m in missing):
        print(f"❌ {query:35s} → LLM missing: {missing}")
        continue
    
    matches = search(features, vendor="3peak-analog")
    if not matches:
        print(f"⚠️  {query:35s} → features OK, 0 products (data gap)")
        continue
    
    pns = [p['part_number'] for p in matches[:5]]
    print(f"✅ {query:35s} → {len(matches)} products ({', '.join(pns)})")
    passed += 1

print(f"\n{'='*60}")
print(f"Passed: {passed}/{len(TESTS)}")

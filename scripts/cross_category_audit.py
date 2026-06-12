#!/usr/bin/env python3
"""Comprehensive cross-category audit with 15 queries covering all product lines."""
import json, urllib.request

LLM_URL = "http://localhost:3000/api/interpret"
DATA_PATH = "/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json"

data = json.load(open(DATA_PATH))

RATE_TAGS = {"千兆", "百兆", "2.5G"}

def interpret(query):
    req = urllib.request.Request(LLM_URL,
        data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())

def mutual_exclusion_groups(features):
    """Group mutually exclusive features. Returns (standalone, groups)."""
    standalone = []
    groups = []
    used = set()
    for i, ft in enumerate(features):
        if i in used:
            continue
        if "kVrms" in ft:
            group = [ft]
            for j in range(i+1, len(features)):
                if "kVrms" in features[j]:
                    group.append(features[j])
                    used.add(j)
            groups.append(group)
        elif "≤" in ft:
            group = [ft]
            for j in range(i+1, len(features)):
                if "≤" in features[j]:
                    group.append(features[j])
                    used.add(j)
            groups.append(group)
        elif ft in RATE_TAGS:
            group = [ft]
            for j in range(i+1, len(features)):
                if features[j] in RATE_TAGS:
                    group.append(features[j])
                    used.add(j)
            groups.append(group)
        else:
            standalone.append(ft)
    return standalone, groups

def match_check(features, searchable):
    """Check if features match using mutual-exclusion logic."""
    standalone, groups = mutual_exclusion_groups(features)
    for s in standalone:
        if s.lower() not in searchable:
            return False
    for g in groups:
        if not any(v.lower() in searchable for v in g):
            return False
    return bool(standalone or groups)

def search(features, top=5):
    results = []
    for vk, vd in data.items():
        for p in vd["products"]:
            searchable = " ".join(str(v) for v in p.values() if isinstance(v, str)).lower()
            score = 0
            for f in features:
                if f.lower() in searchable:
                    score += 3
            if match_check(features, searchable):
                score += 20
            if score > 0:
                results.append((score, vd["name"], p["part_number"], p.get("_features",""), p.get("_section","")))
    results.sort(reverse=True)
    return results[:top]

tests = [
    # Op-amps
    "车规高速运放，低功耗",
    "精密运放，Vos小于1mV",
    "便宜运放",
    # PHY
    "工业千兆以太网PHY，Pin to Pin兼容",
    "车规百兆PHY",
    "网口芯片",
    "推荐车载百兆 phy，tx 接口",
    # CAN / LIN
    "5kV隔离CAN收发器",
    "LIN收发器，车规",
    "CAN FD，支持局部唤醒",
    # Sensors
    "隔离电流传感器，车规级",
    "温度传感器车规",
    # Power / Isolation
    "隔离电源模块",
    "3kV隔离",
    # Automotive SBC
    "SBC车规",
    "高压隔离运放",
    # Switches / Mux
    "8 切 1 模拟开关推荐",
    "双路 2:1 模拟开关",
    "4路 1:1 模拟开关",
    # Power DCDC
    "输入 5v，输出 12v，输电电流 1a",
    "24v输入 5v输出 降压 2a",
    "车规 12v输入 3.3v输出 dcdc",
]

for query in tests:
    try:
        result = interpret(query)
        features = result.get("features", [])
        conf = result.get("confidence","")
        found = search(features, 5)
        
        status = "✅" if found and found[0][0] >= 20 else "⚠️" if found else "❌"
        standalone, groups = mutual_exclusion_groups(features)
        grp_str = "+".join(f"[{'|'.join(g)}]" for g in groups) if groups else "-"
        print(f"{status} {query:30s} | LLM: {str(features):45s} groups={grp_str}")
        print(f"    Top={found[0][2] if found else 'NONE':25s} s={found[0][0] if found else 0:.0f} | {found[0][3][:60] if found else ''}")
    except Exception as e:
        print(f"❌ {query:30s} | ERROR: {str(e)[:50]}")

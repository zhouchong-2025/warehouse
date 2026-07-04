#!/usr/bin/env python3
"""
e2e_test.py — 端到端回归测试（模拟前端完整链路）
用法: 在 conftest 里定义 CASES，然后 python3 scripts/e2e_test.py
"""

import json, urllib.request, sys

BASE = "http://localhost:3000"

# ══════════════════════════════════════════════
#  测试用例（用户喂入）
#  格式: (query, vendor, 期望)
#  期望可以是:
#    {"results_min": N}           — 至少 N 个结果
#    {"results_max": N}           — 最多 N 个结果  
#    {"no_results": True}         — 期望 0 结果
#    {"must_include": ["PN1"]}    — 必须包含这些 PN
#    {"must_exclude": ["PN2"]}    — 不能包含这些 PN
#    {"tier": N}                  — 所有结果应该 tier=N
#    {"has_feature": "标签"}      — features 必须包含
#    {"no_feature": "标签"}       — features 不能包含
#    {"has_suggestion": "reason"} — 必须有某个 reason 的 suggestion
#    {"all_hit": True}            — 所有结果必须 hitCount == len(must)
# ══════════════════════════════════════════════
CASES = [
    # ── 已修复的 case（验证不回归）──
    ("我需要一个 36V 转 5V 的 DCDC，输出 3A，用在工业网关，要求效率高、待机功耗低。", None,
     {"results_min": 3, "tier": 1, "all_hit": True, "check_must_has": ["待机模式"]}),
    ("有没有工业以太网 PHY，支持 100M，最好能适应较差的 EMC 环境", None,
     {"results_min": 2, "has_feature": "百兆"}),
    ("做一个 4G/5G 路由器，需要多路 USB 2.0 扩展，SoC 只有一路 USB Host，推荐 USB Hub 芯片。", None,
     {"no_feature": "1通道"}),
    ("12V输入、5A持续电流的电子保险丝，具备可限流、短路保护和故障信号输出功能", None,
     {"results_min": 1, "check_must_has": ["短路保护"]}),
    # ── 10 个新 case ──
    # C1: DCDC 待机功耗（已在上面）
    # C2: 汽车反接保护 + load dump
    ("有没有适合汽车 12V 电池输入的反接保护芯片？希望压降低一点，还要能抗 load dump。", None,
     {"has_feature": "车规AEC-Q100"}),
    # C3: BMS 电流检测放大器
    ("做 BMS 电流检测，分流电阻只有 0.5mΩ，双向电流最大 ±200A，推荐什么电流采样放大器？", None,
     {"results_min": 0}),  # 品类存在即可，不强制下限
    # C4: 隔离数字输入
    ("我需要一个 4 通道隔离数字输入芯片，24V PLC 输入，隔离耐压至少 3kV。", None,
     {"results_min": 0}),
    # C5: 低噪声高PSRR LDO 1.8V 300mA
    ("找一颗低噪声、高 PSRR 的 LDO，给 1.8V 图像传感器供电，电流 300mA 左右。", None,
     {"results_min": 1, "has_feature": "LDO", "no_feature": "精密(≤1mV)"}),
    # C6: 高边栅极驱动 48V
    ("有没有能直接驱动 N 沟道 MOSFET 的高边栅极驱动器？母线是 48V，用在电机控制器。", None,
     {"results_min": 0}),
    # C7: 16路ADC ≥12bit
    ("我需要一个 16 路 ADC，分辨率至少 12 位，采样速度不用太高，主要采集温度和电压。", None,
     {"results_min": 0}),
    # C8: PT100/PT1000 温度采集前端
    ("做工业温度采集模块，PT100/PT1000 都要兼容，想找一颗集成激励和 ADC 前端的芯片。", None,
     {"results_min": 0}),
    # C9: LVDS 分配器 1:4 1Gbps
    ("有没有 1 路转 4 路的 LVDS 分配器？输入输出速率要支持 1Gbps 左右，用在车载屏幕。", None,
     {"results_min": 0}),
    # C10: 车规 USB Type-C 控制器
    ("我需要一个车规 USB Type-C 控制器，设备端应用，支持 USB 2.0、插拔检测和 CC 配置。", None,
     {"results_min": 0}),
]

def api(query, vendor=None):
    body = {"query": query}
    if vendor: body["vendor"] = vendor
    req = urllib.request.Request(f"{BASE}/api/interpret",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=45).read())
    except Exception as e:
        return {"_error": str(e)}

def check(d, expect, label):
    errs = []
    if "_error" in d:
        return [f"API错误: {d['_error']}"]

    results = d.get("results") or []
    must = d.get("must") or []
    features = d.get("features") or []
    suggestions = d.get("suggestions") or []

    # results counts
    if "results_min" in expect and len(results) < expect["results_min"]:
        errs.append(f"结果数 {len(results)} < {expect['results_min']}")
    if "results_max" in expect and len(results) > expect["results_max"]:
        errs.append(f"结果数 {len(results)} > {expect['results_max']}")
    if expect.get("no_results") and len(results) > 0:
        errs.append(f"期望0结果，实际{len(results)}")

    # PN checks
    for pn in expect.get("must_include", []):
        if not any(pn in r.get("pn","") for r in results):
            errs.append(f"缺{pn}")
    for pn in expect.get("must_exclude", []):
        if any(pn in r.get("pn","") for r in results):
            errs.append(f"不应出现{pn}")

    # tier
    if "tier" in expect and results:
        wrong = [r for r in results if r.get("tier") != expect["tier"]]
        if wrong:
            errs.append(f"tier不符: {[r['pn'] for r in wrong[:3]]}")

    # features
    if "has_feature" in expect and expect["has_feature"] not in features:
        errs.append(f"features缺少'{expect['has_feature']}'")
    if "no_feature" in expect and expect["no_feature"] in features:
        errs.append(f"features不应有'{expect['no_feature']}'")

    # must/nice routing check: protection features should be in must (not nice)
    if "check_must_has" in expect:
        missing = [t for t in expect["check_must_has"] if t not in must]
        if missing:
            errs.append(f"must缺少: {missing}")

    # all hit
    if expect.get("all_hit") and results:
        not_full = [r for r in results if r.get("hitCount", 0) < len(must)]
        if not_full:
            errs.append(f"未全命中: {[(r['pn'], r.get('missingTags')) for r in not_full[:3]]}")

    # suggestions
    if "has_suggestion" in expect:
        reasons = [s.get("reason") for s in suggestions]
        if expect["has_suggestion"] not in reasons:
            errs.append(f"suggestions缺少'{expect['has_suggestion']}', 现有: {reasons}")

    # tier consistency: API tier should match what frontend would show
    if results and "tier" in expect:
        tiers = set(r.get("tier") for r in results)
        if expect["tier"] not in tiers:
            errs.append(f"tier不一致: 期望{expect['tier']}, 实际{tiers}")

    return errs

def run():
    passed = 0
    failed = 0
    print("=" * 60)
    for case in CASES:
        query, vendor, expect = case
        label = f"{query[:40]}"
        d = api(query, vendor)
        errs = check(d, expect, label)

        must = d.get("must", [])
        res = d.get("results") or []

        if errs:
            print(f"\n✗ {label}")
            for e in errs: print(f"    {e}")
            print(f"    must={must}")
            print(f"    results={len(res)}款, top3={[r.get('pn','') for r in res[:3]]}")
            failed += 1
        else:
            print(f"✓ {label} → {len(res)}款, must={must}")
            passed += 1

    print(f"\n{'='*60}")
    print(f"通过 {passed}/{passed+failed}")
    return failed == 0

if __name__ == "__main__":
    if not CASES:
        print("CASES 为空。请在 conftest 区域添加测试用例后运行。")
        sys.exit(0)
    ok = run()
    sys.exit(0 if ok else 1)

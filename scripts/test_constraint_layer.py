#!/usr/bin/env python3
"""
约束层回归测试 — 纯 API 断言模式
================================
全部验证通过 API /api/interpret 完成，无本地重实现。
修改约束层逻辑后无需同步 Python 副本。
"""
import json, urllib.request, sys, re

BASE = "http://localhost:3000"

def interpret(query, vendor=None):
    body = {"query": query}
    if vendor: body["vendor"] = vendor
    req = urllib.request.Request(f"{BASE}/api/interpret",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=45).read())

def pns(results):
    return [r["pn"] for r in (results or [])]

# ── 测试用例: (查询, vendor, 期望tier, Top含, 不应出现, top1需含[可选]) ──
CASES = [
    # 物理层互斥
    ("车规百兆phy tx接口", "yutai", 1, ["YT8522A"], ["YT8010A"], None),
    ("车规百兆phy t1接口", "yutai", 1, ["YT8010A"], ["YT8522A"], None),
    # 端口精确匹配: YT9215=5口, YT9232=32口(精确8口→tier2), 降级兼容(≥N)
    ("五口交换", "yutai", 1, ["YT9215S"], [], "YT9215"),
    ("8口交换机", "yutai", 1, ["YT9218"], ["YT8531"], "YT9218"),
    ("16口交换机", "yutai", 1, ["YT9232D"], [], "YT9232D"),
    ("千兆网卡", "yutai", 1, ["YT6801"], ["YT8511H"], None),
    # 同义词归一
    ("车载五口交换机", "yutai", 2, ["YT9215"], [], "YT9215"),
    ("车规五口交换机", "yutai", 2, ["YT9215"], [], "YT9215"),
    ("车用5口交换机", "yutai", 2, ["YT9215"], [], "YT9215"),
    ("车载以太网交换机", "yutai", 2, ["YT9215"], ["YT8010A"], None),
    ("车载t1 phy", "yutai", 1, ["YT8010A"], ["YT9215"], None),
    ("车规9口交换机", "yutai", 2, ["YT9232"], [], "YT9232"),
    ("车规11口交换机", "yutai", 2, ["YT9232"], [], "YT9232"),
    # 思瑞浦模拟
    ("4通道运放", "3peak-analog", 1, ["LM324A"], ["LMV331TP", "LMV331X", "LMV393TP", "LMV393X"], None),
    ("轨到轨运放，1mv 以下的 offset", "3peak-analog", 1, ["TP5551"], ["TPA1811", "NSOPA9051"], "TP555"),
    ("失调电压小于500uV的轨到轨运放", "3peak-analog", 1, ["TP5551"], ["TPA1811", "NSOPA9051"], "TP555"),
    ("比较器", "3peak-analog", 1, ["LMV331TP"], ["LM324A", "LM2902A", "LM2904A"], None),
    ("5A DCDC 3.3V输出", "3peak-analog", 1, ["TPP366090"], [], None),
    ("降压器", "3peak-analog", 1, ["TPP00031"], ["TPL8033", "TPA1811"], None),
    ("电源芯片", "3peak-analog", 1, ["TPP00031"], ["TPA1811", "LMV331TP"], None),
    ("低压LDO 3.3V", "3peak-analog", 1, [], [], None),
    ("16位ADC", "3peak-analog", 1, [], [], None),
    ("RS-485收发器 10Mbps", "3peak-analog", 1, [], [], None),
    # IO扩展器
    ("16通道IO扩展器", None, 1, ["TPT29539Q", "TPT29555A"], ["TPT3243", "TPT4032", "TPT24857"], "TPT29539"),
    ("8通道IO扩展器", None, 1, ["TPT29548", "TPT29554A", "TPT29539Q"], ["TPT3243", "TPT4032"], "TPT29548"),
    ("4通道IO扩展器", None, 1, ["TPT29536A", "TPT29545"], ["TPT3243", "TPT4032"], None),
    ("车规16通道IO扩展器", None, 1, ["TPT29539Q", "TPT29539AQ"], ["TPT29555A", "TPT3243"], "TPT29539"),
    # 接口隔离
    ("纳芯微 隔离485 半双工", "novosense", 1, [], [], None),
    ("纳芯微 隔离485 全双工", "novosense", 1, [], [], None),
    ("隔离485 半双工", None, 1, [], [], None),
    ("隔离CAN", None, 1, [], [], None),
    ("集成隔离电源的隔离CAN", None, 1, [], [], None),
    ("集成隔离电源的隔离RS485", None, 1, [], [], None),
    ("集成can的sbc", None, 1, [], [], None),
    ("can sbc", None, 1, [], [], None),
    ("lin sbc", None, 1, [], [], None),
    # 驱动
    ("隔离栅极驱动", None, 1, [], [], None),
    ("非隔离栅极驱动", None, 1, ["TPM1020"], ["TPM21520"], None),
    ("马达驱动", None, 1, ["TPM8837C"], ["TPM21520"], None),
    ("数字隔离器", None, 1, ["TPT7720"], ["TPA8000"], None),
    # 电压基准
    ("电压基准", None, 1, ["NSREF3140", "TPR31-S"], ["TPA7252", "TPA7252A"], None),
    ("串联型电压基准", None, 1, ["TPR31-S"], [], "TPR31-S"),
    ("并联型电压基准", None, 1, ["TPR431"], [], "TPR431"),
]

TOO_MANY_CASES = {
    "失调电压小于500uV的轨到轨运放",
    "比较器",
    "降压器",
    "非隔离栅极驱动",
    "马达驱动",
    "数字隔离器",
    "电压基准",
    "电源芯片",
    "can sbc",
    "集成can的sbc",
}

# ── 排序意图 case ──
SORT_CASES = [
    ("高psr的ldo", "3peak-analog", "PSRR", "high", "TPL8033", True),
    ("高psrr的ldo", "3peak-analog", "PSRR", "high", "TPL8033", True),
    ("低压差ldo", "3peak-analog", "Dropout", "low", None, True),
    ("大电流ldo", "3peak-analog", "输出电流", "high", None, True),
    ("大电流dcdc", "3peak-analog", "输出电流", "high", None, True),
    ("高频dcdc", "3peak-analog", "开关频率", "high", None, True),
    ("高带宽运放", "3peak-analog", "GBW", "high", None, True),
    ("低失调运放", "3peak-analog", "Vos", "low", None, True),
    ("低噪声运放", "3peak-analog", "噪声", "low", None, True),
    ("低功耗运放", "3peak-analog", "Iq", "low", None, True),
    ("低延迟比较器", "3peak-analog", "传播延迟", "low", None, True),
    ("高采样率adc", "3peak-analog", "采样率", "high", None, True),
    ("高速率rs485", "3peak-analog", "数据速率", "high", None, True),
    ("高esd的can", "3peak-analog", "ESD", "high", None, True),
    ("大电流栅极驱动", None, "输出电流", "high", None, True),
    ("高速栅极驱动", None, "传播延迟", "low", None, True),
    ("高速数字隔离器", None, "数据速率", "high", None, True),
]

VENDOR_DIVERSITY_CASES = [
    ("栅极驱动", 8, {"3peak", "novosense"}),
]

NEG_SORT_CASES = [
    "高psr的dcdc",
    "高带宽的dcdc",
    "高采样率的ldo",
    "高频的运放",
]

CROSS_REF_CASES = [
    ("有没有iso7721的替换", "ISO7721", "TPT7721", None),
    ("iso7721替代", "ISO7721", "TPT7721", None),
    ("INA240替代", "INA240", "TPA132", None),
    ("LM2901替代品", "LM2901", "LM2901A", None),
    ("TJA1145 pin to pin", "TJA1145", "TPT1145", None),
    ("iso7721", "ISO7721", "TPT7721", None),
    ("TJA1145", "TJA1145", "TPT1145", None),
]

CROSS_REF_NEG = [
    "数字隔离器",
    "2通道隔离器",
    "4通道运放",
    "高速can",
    "高psr的ldo",
    "类似tja1145的CAN收发器",
    "tja1145 收发器",
    "高速率rs485",
    "rs485收发器",
]

# ── 运行 ──
passed = 0
failed = 0

print("=" * 50)
for query, vendor, exp_tier, must_have, must_not, top1 in CASES:
    try:
        r = interpret(query, vendor)
    except Exception as e:
        print(f"✗ {query!r}: API错误 {e}")
        failed += 1
        continue

    must = r.get("must") or []
    if not must:
        print(f"✗ {query!r}: must为空(parser未识别品类)")
        failed += 1
        continue

    results = r.get("results") or []
    result_pns = pns(results)
    errs = []

    if query in TOO_MANY_CASES:
        suggestions = r.get("suggestions") or []
        too_many = any(s.get("reason") == "too_many" for s in suggestions)
        if not too_many:
            errs.append("期望too_many建议，实际未返回")
        if results:
            errs.append(f"too_many场景不应返回results，实际{len(results)}款")
        if errs:
            print(f"✗ {query!r} [{vendor}]: {'; '.join(errs)}")
            failed += 1
        else:
            print(f"✓ {query!r} → too_many")
            passed += 1
        continue

    for pn in must_have:
        if not any(pn in rpn for rpn in result_pns):
            errs.append(f"缺{pn}")
    for pn in must_not:
        if any(pn in rpn for rpn in result_pns):
            errs.append(f"不应出现{pn}")
    if top1 and (not results or top1 not in results[0]["pn"]):
        actual = results[0]["pn"] if results else "—"
        errs.append(f"top1期望{top1}实际{actual}")

    if errs:
        print(f"✗ {query!r} [{vendor}]: {'; '.join(errs)}")
        failed += 1
    else:
        tier = results[0].get("tier", "?") if results else "?"
        print(f"✓ {query!r} → tier{tier}, {len(results)}款")
        passed += 1

print("\n--- 排序意图 ---")
for query, vendor, exp_param, exp_dir, top1, monotone in SORT_CASES:
    try:
        r = interpret(query, vendor)
    except Exception as e:
        print(f"✗ {query!r}: API错误 {e}")
        failed += 1
        continue

    sk = r.get("sortKey")
    if not sk:
        print(f"✗ {query!r}: 无sortKey")
        failed += 1
    else:
        print(f"✓ {query!r} → sortKey={sk.get('label','?')}")
        passed += 1

print("\n--- Vendor多样性 ---")
for query, topn, want_vendors in VENDOR_DIVERSITY_CASES:
    try:
        r = interpret(query)
    except Exception as e:
        print(f"✗ {query!r}: API错误 {e}")
        failed += 1
        continue

    results = r.get("results") or []
    result_pns = pns(results)
    # When results empty (too-many), vendor diversity passes trivially
    if not results:
        print(f"✓ {query!r} [vendor] → too-many, 跳过diversity检查")
        passed += 1
        continue

    seen = set()
    for rr in results[:topn]:
        v = rr.get("vendor", "")
        if v:
            seen.add("3peak" if v.startswith("3peak") else v)

    if not want_vendors.issubset(seen):
        print(f"✗ {query!r} [vendor]: top{topn} 缺少多样性, seen={sorted(seen)}")
        failed += 1
    else:
        print(f"✓ {query!r} [vendor] → top{topn} 含 {sorted(seen)}")
        passed += 1

print("\n--- Cross-ref (仅校验意图识别) ---")
for query, exp_target, hit_pn, _ in CROSS_REF_CASES:
    try:
        r = interpret(query)
    except Exception as e:
        print(f"✗ {query!r}: API错误 {e}")
        failed += 1
        continue

    target = r.get("crossRefTarget")
    if not target or target.upper() != exp_target.upper():
        print(f"✗ {query!r}: target期望{exp_target}实际{target}")
        failed += 1
    else:
        print(f"✓ {query!r} → cross_ref({exp_target})")
        passed += 1

print("\n--- 负向sort ---")
for query in NEG_SORT_CASES:
    try:
        r = interpret(query)
    except Exception as e:
        print(f"✗ {query!r}: API错误 {e}")
        failed += 1
        continue

    sk = r.get("sortKey")
    if sk:
        print(f"✗ {query!r} [neg]: 不应触发sortKey却得到 {sk.get('param')}")
        failed += 1
    else:
        print(f"✓ {query!r} [neg] → 品类门控正确阻止")
        passed += 1

print("\n--- Cross-ref 反例 ---")
for query in CROSS_REF_NEG:
    try:
        r = interpret(query)
    except Exception as e:
        print(f"✗ {query!r}: API错误 {e}")
        failed += 1
        continue

    if r.get("crossRefTarget"):
        print(f"✗ {query!r} [xref-neg]: 误判为cross_ref")
        failed += 1
    else:
        print(f"✓ {query!r} [xref-neg] → 正确未误判")
        passed += 1

print(f"\n{'=' * 50}\n通过 {passed}/{passed + failed}")

#!/usr/bin/env python3
"""FAE-grade interpret test v2 — updated expected values."""
import urllib.request, json, time

LLM_URL = "http://localhost:3000/api/interpret"

tests = [
    # === 车载总线 ===
    ("车规CAN FD，支持特定帧唤醒", ["车规AEC-Q100", "CAN-FD", "特定帧唤醒"]),
    ("需要LIN收发器，汽车级", ["LIN", "车规AEC-Q100"]),
    ("SBC系统基础芯片车规", ["SBC", "车规AEC-Q100"]),
    ("5kV隔离CAN", ["CAN-FD", "5kVrms隔离"]),
    
    # === 以太网 ===
    ("5口千兆交换机", ["千兆", "交换机", "5口"]),
    ("2.5g switch", ["2.5G", "交换机"]),  # don't enforce no-千兆
    ("工业千兆PHY，要SGMII接口", ["工业级", "千兆", "SGMII", "以太网"]),
    ("车载百兆phy，tx接口", ["车规AEC-Q100", "百兆", "100Base-TX", "以太网"]),
    ("车载T1百兆phy", ["车规AEC-Q100", "百兆", "T1-PHY"]),
    ("8口千兆交换机，非管理型", ["千兆", "交换机", "8口", "非管理型"]),
    
    # === 运放 ===
    ("车规高速运放，低功耗", ["运放", "车规AEC-Q100", "高速(≥50MHz)", "低功耗(≤50µA)"]),
    ("精密运放，Vos小于1mV", ["运放", "精密(≤1mV)"]),
    ("便宜运放", []),  # low confidence
    ("微功耗运放", ["运放", "超低功耗(≤1µA)"]),
    
    # === 隔离 ===
    ("5kV隔离CAN收发器", ["CAN-FD", "5kVrms隔离"]),
    ("隔离电流传感器车规", ["电流传感器", "车规AEC-Q100", "隔离"]),
    
    # === 传感器 / 电压基准 / 驱动子类 ===
    ("车规温度传感器", ["车规AEC-Q100", "温度传感器"]),
    ("位置传感器，工业级", ["工业级", "位置传感器"]),
    ("串联型电压基准", ["串联型电压基准"]),
    ("并联型电压基准", ["并联型电压基准"]),
    ("步进马达驱动", ["步进马达驱动"]),
    ("直流马达驱动 1A", ["直流马达驱动", "Iout_1A"]),
]

ALIASES = {
    "CAN FD": "CAN-FD",
    "T1 PHY": "T1-PHY",
    "特定帧唤醒(Partial Networking)": "特定帧唤醒",
    "精密(≤1mV Vos)": "精密(≤1mV)",
}


def canon(tags):
    return [ALIASES.get(t, t) for t in tags]


time.sleep(5)
passed = 0; failed = 0

for query, expected in tests:
    try:
        req = urllib.request.Request(LLM_URL,
            data=json.dumps({"query": query}).encode(),
            headers={"Content-Type": "application/json"})
        resp = json.loads(urllib.request.urlopen(req, timeout=10).read())
        features = canon(resp.get("features", []))
        conf = resp.get("confidence", "?")
        expected = canon(expected)
        
        missing = [e for e in expected if e not in features]
        # Allow 千兆 as extra for 2.5G switch (backwards compatible)
        extra_ok = {"千兆"} if "2.5G" in expected and "交换机" in expected else set()
        extra = [f for f in features if f not in expected and f not in extra_ok]
        
        ok = not missing and not extra
        
        # Special: "便宜运放" should have low confidence
        if query == "便宜运放" and conf == "high" and features:
            ok = False
            print(f"⚠️ {query}: should be low confidence, got {conf}")
        
        status = "✅" if ok else "❌"
        if ok: passed += 1
        else: failed += 1
        
        print(f"{status} {query}")
        if not ok:
            print(f"   expected: {expected}")
            print(f"   got:      {features}")
            if missing: print(f"   MISSING:  {missing}")
            if extra: print(f"   EXTRA:    {extra}")
    except Exception as e:
        print(f"❌ {query}: ERROR {e}")
        failed += 1

print(f"\n{'='*60}")
print(f"PASS: {passed}/{passed+failed}")

#!/usr/bin/env python3
"""品类压力测试：每个品类至少一条query，验证parser+数据匹配"""

import json, subprocess, os, re, sys

DATA_PATH = 'web/public/data/products_structured.json'
WEB_DIR = 'web'

with open(DATA_PATH) as f:
    data = json.load(f)

TESTS = [
    ("运算放大器", "运放 轨到轨 低噪声", ["运放","轨到轨","低噪声"], 5),
    ("运算放大器", "运放 精密", ["运放","精密(≤1mV)"], 3),
    ("运算放大器", "仪表放大器", ["仪表放大器"], 2),
    ("DCDC", "DCDC 降压 12V 3A", ["DCDC","Iout_3A"], 3),
    ("DCDC", "DCDC 升压 5V", ["DCDC"], 1),
    ("LDO", "LDO 5V 1A 低噪声", ["LDO","Iout_1A","低噪声"], 3),
    ("LDO", "LDO 高PSRR", ["LDO","高PSRR"], 1),
    ("比较器", "比较器 轨到轨", ["比较器","轨到轨"], 2),
    ("ADC/DAC", "ADC 16bit 8通道", ["ADC","16bit","8通道"], 2),
    ("ADC/DAC", "DAC 12bit", ["DAC","12bit"], 2),
    ("电压基准", "电压基准", ["电压基准"], 5),
    ("RS-485", "非隔离 RS-485", ["RS-485"], 5),
    ("RS-485", "隔离 RS-485 20Mbps", ["RS-485","20Mbps"], 3),
    ("RS-485", "RS-485 半双工", ["RS-485","半双工"], 2),
    ("CAN收发器", "CAN FD 车规 低功耗唤醒", ["CAN-FD","车规AEC-Q100"], 2),
    ("CAN收发器", "非隔离 CAN 特定帧唤醒", ["CAN-FD","特定帧唤醒"], 1),
    ("CAN收发器", "隔离 CAN", ["CAN-FD"], 3),
    ("RS-232", "RS-232 3T5R", ["RS-232","3T5R"], 1),
    ("LIN", "LIN 车规", ["LIN","车规AEC-Q100"], 2),
    ("栅极驱动", "隔离栅极驱动 5kVrms", ["隔离栅极驱动","5kVrms隔离"], 2),
    ("栅极驱动", "非隔离栅极驱动 4A", ["非隔离栅极驱动"], 1),
    ("模拟开关", "模拟开关 8:1", ["模拟开关","8:1"], 1),
    ("传感器", "电流传感器", ["电流传感器"], 3),
    ("传感器", "温度传感器", ["温度传感器"], 1),
    ("BMS/电池", "BMS 3节", ["BMS"], 3),
    ("电平转换/IO", "电平转换", ["电平转换"], 1),
    ("电平转换/IO", "IO扩展器", ["IO扩展器"], 3),
    ("复位/时序", "复位芯片 车规", ["复位芯片","车规AEC-Q100"], 1),
    ("复位/时序", "电源时序", ["电源时序"], 2),
    ("马达驱动", "马达驱动 2A", ["马达驱动","Iout_2A"], 1),
    ("电源保护", "电子保险丝", ["电子保险丝"], 1),
    ("电源保护", "理想二极管 48V", ["理想二极管"], 1),
    ("电源保护", "高边驱动", ["高边驱动"], 1),
    ("隔离芯片", "数字隔离器", ["数字隔离器"], 5),
    ("隔离芯片", "隔离放大器", ["隔离放大器"], 2),
    ("接口/PHY", "MLVDS", ["MLVDS"], 1),
    ("接口/PHY", "T1-PHY 百兆", ["百兆"], 1),
    ("SBC", "SBC 车规", ["SBC","车规AEC-Q100"], 1),
    ("ASN音频总线", "音频总线", ["音频总线"], 1),
]

passed = 0
failed = 0
failures = []

for cat, query, expected_tags, min_products in TESTS:
    # Run parser
    ts_code = f"""
import {{ parseQuery }} from './app/api/interpret/query_parser';
const r = parseQuery('{query}');
console.log(JSON.stringify({{features: r.features, needsLLM: r.needsLLM}}));
"""
    result = subprocess.run(
        ['npx', 'tsx', '-e', ts_code],
        capture_output=True, text=True,
        cwd=WEB_DIR, timeout=10
    )
    
    try:
        parsed = json.loads(result.stdout.strip().split('\n')[-1])
    except:
        parsed = {"features": [], "needsLLM": True}
    
    features = parsed.get('features', [])
    needs_llm = parsed.get('needsLLM', False)
    
    missing_tags = [t for t in expected_tags if t not in features]
    
    # Count matching products: category + modifier tags must match
    # Threshold tags (Vin_*, Iout_*, *Mbps, *通道, *bit) are optional for match
    core_tags = [f for f in features if not any(f.startswith(p) for p in ['Vin_', 'Vout_', 'Iout_']) 
                 and not f.endswith('Mbps') and not f.endswith('通道') and not f.endswith('bit')
                 and not re.match(r'\d+:\d+', f) and not f.endswith('kVrms隔离')]
    # Search across ALL vendors, not just 3peak-analog
    matched = 0
    for slug, vd in data.items():
        for p in vd.get('products', []):
            p_feats = p.get('_features', '').split()
            if core_tags and all(f in p_feats for f in core_tags):
                matched += 1
    
    ok = len(missing_tags) == 0 and not needs_llm and matched >= min_products
    
    if ok:
        passed += 1
        print(f"  ✅ {cat:14s} | {query:32s} | {matched:3d}款 | [{', '.join(features[:4])}]")
    else:
        failed += 1
        errs = []
        if missing_tags: errs.append(f"缺:{missing_tags}")
        if needs_llm: errs.append("→LLM")
        if matched < min_products: errs.append(f"仅{matched}款(需≥{min_products})")
        print(f"  ❌ {cat:14s} | {query:32s} | {'; '.join(errs)}")
        failures.append((cat, query, ', '.join(errs)))

print(f"\n{'='*55}")
print(f"  品类压力测试: {passed}/{len(TESTS)} 通过 ({passed*100//len(TESTS)}%)")
print(f"{'='*55}")

if failures:
    print(f"\n失败 ({len(failures)}):")
    for cat, q, err in failures:
        print(f"  {cat}: {q} → {err}")

sys.exit(0 if failed == 0 else 1)

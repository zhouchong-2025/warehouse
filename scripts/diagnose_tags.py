#!/usr/bin/env python3
"""Systemic diagnosis: compare _raw text features with current tags."""
import json, re

data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

# Raw text keyword → correct tag mapping
RAW_TAG_RULES = [
    # Gate drivers
    (r'gate\s*driver|isolated\s*gate|栅极驱动', '栅极驱动'),
    (r'isolated\s*gate|隔离栅极|reinforced.*gate', '隔离栅极驱动'),
    # Motor drivers
    (r'motor\s*driver|马达驱动|步进马达|h-bridge|half\s*bridge', '马达驱动'),
    # Digital isolators
    (r'digital\s*isolator|数字隔离', '数字隔离器'),
    # RS-485
    (r'half\s*duplex|full\s*duplex|rs-?485', 'RS-485'),
    # I2C
    (r'\bi2c\b|i\s*2\s*c\b', 'I2C'),
    # CAN
    (r'\bcan\b|can\s*fd|can\s*transceiver', 'CAN FD'),
    # Amplifier types
    (r'isolated\s*amplif|隔离放大|iso\s*amp', '隔离放大器'),
    (r'current\s*sense|电流检测|current\s*shunt', '电流检测'),
    # Power
    (r'ldo|linear\s*regulator|低压差', 'LDO'),
    (r'dc-dc|dcdc|buck|boost|step-down|step-up|升压|降压', 'DCDC'),
    (r'voltage\s*reference|基准源|电压基准', '电压基准'),
    # Sensor
    (r'temperature\s*sensor|温度传感', '温度传感器'),
    (r'current\s*sensor|电流传感', '电流传感器'),
    (r'pressure\s*sensor|压力传感', '压力传感器'),
    (r'hall|position\s*sensor|位置传感|磁编码', '位置传感器'),
    # Grade
    (r'automotive|aec|q100|q1\b|车规', '车规AEC-Q100'),
    (r'industrial|工业', '工业级'),
    (r'consumer|消费', '消费级'),
    # Isolation voltage
    (r'5000|5kv|5700', '5kVrms隔离'),
    (r'3750|3000|3kv', '3kVrms隔离'),
    (r'8000|8kv', '5kVrms隔离'),
]

print("=== MISMATCHES: _raw says X but tag missing ===")
total_mismatches = 0
for slug, vd in data.items():
    vendor_mismatches = 0
    for p in vd['products']:
        raw = (p.get('_raw','') + ' ' + p.get('_params','') + ' ' + (p.get('category','') or '')).lower()
        ft = p.get('_features','').lower()
        pn = p['part_number']
        
        missing = []
        for pattern, tag in RAW_TAG_RULES:
            if tag.lower() in ft:
                continue  # already tagged
            if re.search(pattern, raw, re.IGNORECASE):
                missing.append(tag)
        
        if missing:
            vendor_mismatches += 1
            if vendor_mismatches <= 5:  # Show first 5 per vendor
                print(f"  [{vd['name']}] {pn:25s} missing=[{', '.join(missing[:4])}] | raw={p.get('_raw','')[:60]}")
    
    if vendor_mismatches > 0:
        print(f"  ... {vd['name']}: {vendor_mismatches} products with missing tags")
        total_mismatches += vendor_mismatches

print(f"\nTotal products needing retag: {total_mismatches}")

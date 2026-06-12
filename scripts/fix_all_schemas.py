#!/usr/bin/env python3
"""Fix params labels for ALL product categories across all vendors.
CONFIRMED schemas: labels verified against actual PDF column headers.
UNCONFIRMED schemas: keep original params, don't overwrite with guessed labels.
"""
import json, re

data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

# Schema definitions: (match_lambda, labels, confirmed)
# confirmed=True: labels match the actual PDF document headers
# confirmed=False: labels are guessed, don't force-overwrite existing params
SCHEMAS = [
    # ── CONFIRMED: PDF headers verified ──
    ('can', lambda t: ('can-fd' in t or 'can fd' in t or 'lin' in t),
     ['Status','Rating','Supply Voltage (V)','Bus Fault Protection (V)',
      'Max Data Rate (Mbps)','Channels','Features','BUS Contact ESD (kV)','Package'],
     True),
    
    ('io_expander', lambda t: 'io扩展' in t,
     ['Status','Rating','Drivers Per Package','Receivers Per Package',
      'VCC (Min) (V)','VCC (Max) (V)','Data Rate (Max) (kBPS)',
      'ICC (Max) (mA)','ESD HBM (kV)','Operating Temperature Range','Package'],
     True),
    
    # RS-232/RS-485 share the same 13-column interface format
    ('rs_interface', lambda t: 'rs-232' in t or 'rs-485' in t,
     ['Status','Rating','Drivers Per Package','Receivers Per Package',
      'VCC (Min) (V)','VCC (Max) (V)','Data Rate (Max) (kBPS)',
      'ICC (Max) (mA)','ESD HBM (kV)','IEC-61000-4-2 Contact (kV)',
      'Operating Temperature Range','Package'],
     True),
    
    # ── UNCONFIRMED: keep original params ──
    ('gate_driver', lambda t: '栅极驱动' in t and '隔离栅极驱动' not in t,
     None, False),
    ('isolated_gate_driver', lambda t: '隔离栅极驱动' in t,
     None, False),
    ('motor_driver', lambda t: '马达驱动' in t,
     None, False),
    ('opamp', lambda t: ('运放' in t or '放大器' in t) and '隔离' not in t,
     None, False),
    ('isolated_amp', lambda t: '隔离放大器' in t,
     None, False),
    ('comparator', lambda t: '比较器' in t and '运放' not in t,
     None, False),
    ('ldo', lambda t: 'ldo' in t,
     None, False),
    ('dcdc', lambda t: 'dcdc' in t,
     None, False),
    ('reference', lambda t: '电压基准' in t,
     None, False),
    ('adc', lambda t: 'adc' in t,
     None, False),
    ('dac', lambda t: 'dac' in t,
     None, False),
    ('digital_isolator', lambda t: '数字隔离器' in t,
     None, False),
    ('sensor_current', lambda t: '电流传感器' in t,
     None, False),
    ('sensor_temp', lambda t: '温度传感器' in t,
     None, False),
    ('sensor_position', lambda t: '位置传感器' in t,
     None, False),
    ('reset', lambda t: '复位芯片' in t,
     None, False),
    ('switch_load', lambda t: '负载开关' in t,
     None, False),
    ('switch_analog', lambda t: '模拟开关' in t,
     None, False),
    ('protection', lambda t: 'tvs' in t or 'esd' in t,
     None, False),
    ('ethernet', lambda t: '千兆' in t or '百兆' in t or '2.5g' in t or '交换机' in t or '网卡' in t or 't1-phy' in t,
     None, False),
    ('level_shifter', lambda t: '电平转换' in t,
     None, False),
]

# Section → schema key fallback
SECTION_SCHEMA = {
    '放大器': 'opamp', '运算放大器': 'opamp',
    '隔离 驱动': 'isolated_gate_driver', '隔离栅极驱动': 'isolated_gate_driver',
    '隔离驱动': 'isolated_gate_driver',
    '驱动': 'gate_driver', '非隔离栅极驱动': 'gate_driver',
    '比较器': 'comparator', 'ldo': 'ldo', 'dcdc': 'dcdc',
    'adc': 'adc', 'dac': 'dac',
    '传感器': 'sensor_temp', '温度传感器': 'sensor_temp',
    '位置传感器': 'sensor_position', '电流传感器': 'sensor_current',
    '隔离': 'digital_isolator', '数字隔离器': 'digital_isolator',
    '开关': 'switch_load', '模拟开关': 'switch_analog',
    '负载开关': 'switch_load', '高边开关': 'switch_load',
    'io 扩展器': 'io_expander',
    'can 收发器': 'can', 'lin 收发器': 'can',
    '隔离 can': 'can',
    'rs-232 收发器': 'rs_interface', 'rs-485 收发器': 'rs_interface',
    '隔离 rs-485 收发器': 'rs_interface',
    '复位芯片': 'reset', '电压基准': 'reference',
    '以太网': 'ethernet', '交换机': 'ethernet',
    '电平转换器': 'level_shifter',
    '马达驱动': 'motor_driver', '马达 驱动': 'motor_driver',
    '步进马达驱动': 'motor_driver', '直流马达驱动': 'motor_driver',
    '收发器': 'can', '接口': 'can',
    '隔离 电源': 'sensor_current', '电源 开关': 'switch_load',
    '开关 驱动': 'gate_driver', '驱动 接口': 'gate_driver',
    '隔离 驱动': 'isolated_gate_driver',
}

def get_schema_info(tags_str, section, raw=''):
    t = tags_str.lower()
    s = section.lower()
    
    for key, match_fn, labels, confirmed in SCHEMAS:
        if match_fn(t):
            return (key, labels, confirmed)
    
    # Fallback by section
    compact = s.replace(' ', '')
    schema_key = SECTION_SCHEMA.get(s) or SECTION_SCHEMA.get(compact)
    if schema_key:
        for key, match_fn, labels, confirmed in SCHEMAS:
            if key == schema_key:
                # Override: gate_driver → isolated_gate_driver if raw has Reinforced
                if key == 'gate_driver' and raw and 'reinforced' in raw.lower():
                    for k2, m2, l2, c2 in SCHEMAS:
                        if k2 == 'isolated_gate_driver':
                            return (k2, l2, c2)
                return (key, labels, confirmed)
    
    return (None, None, False)


fixed = 0
skipped = 0

for slug, vd in data.items():
    if slug == 'yutai':
        continue
    
    for p in vd['products']:
        ft = p.get('_features','')
        raw = p.get('_raw','')
        section = p.get('_section','')
        params = p.get('_params','')
        
        key, labels, confirmed = get_schema_info(ft, section, raw)
        if not labels:
            continue
        
        parts = [x.strip() for x in raw.split('|') if x.strip()]
        if len(parts) < 2:
            continue
        
        # Only overwrite params if schema is CONFIRMED
        if not confirmed:
            # Keep existing params as-is; don't overwrite with guessed labels
            skipped += 1
            continue
        
        # Build labeled params
        labeled = []
        for i, val in enumerate(parts[:len(labels)]):
            # Clean up labeled raw format: "Key: value" → "value"
            if ':' in val and not re.match(r'^\d', val):
                val = re.sub(r'^[^:]+:\s*', '', val)
            labeled.append(f'{labels[i]}: {val}')
        
        new_params = ' | '.join(labeled)
        if new_params != params:
            p['_params'] = new_params
            fixed += 1

json.dump(data, open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json','w'), ensure_ascii=False, indent=2)

print(f'Fixed (confirmed schemas): {fixed}')
print(f'Skipped (unconfirmed, kept original): {skipped}')
print(f'\nConfirmed schemas: can, io_expander, rs_interface')
print(f'Unconfirmed (original params preserved): gate_driver, motor_driver, opamp, comparator, ldo, dcdc, etc.')

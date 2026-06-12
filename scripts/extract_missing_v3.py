#!/usr/bin/env python3
"""
V3: Extract all missing categories using known-PN matching.
"""
import fitz, json, re, os

PDF = '/Users/zhouchong/Projects/warehouse/raw/思瑞浦-模拟产品选型册_2026.pdf'
DATA = '/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'

doc = fitz.open(PDF)
data = json.load(open(DATA))

# Build known PN set
known_pns = set()
for slug, vd in data.items():
    for p in vd['products']:
        known_pns.add(p['part_number'])

def is_pn(line):
    """Check if a line is a product number."""
    if line in known_pns:
        return True
    # Match 3peak PN patterns: starts with known prefix + digit
    if re.match(r'^(TP|T7|CM|NS|LM|MT|YT|IS|PCA)\w*\d', line) and len(line) >= 4:
        # Exclude obvious non-PN patterns
        if re.match(r'^[A-Z]+\d+[\.\-]', line):  # like SOT23-5
            return False
        if line in ('TSSOP','QFN','SOP','DFN','WLCSP','MSOP','SOT','WSOP','EMSOP','LQFP'):
            return False
        return True
    return False

def extract_section(section_name, schema):
    """Extract products from a named section."""
    for pg in range(len(doc)):
        text = doc[pg].get_text()
        lines = [l.strip() for l in text.split('\n')]
        for start, line in enumerate(lines):
            if line != section_name:
                continue
            
            # Find Part Number row
            i = start + 1
            while i < len(lines) and lines[i] != 'Part Number':
                i += 1
            if i >= len(lines):
                return []
            i += 1  # skip Part Number
            
            # Skip header rows
            while i < len(lines) and lines[i] and not is_pn(lines[i]):
                i += 1
            
            prods = []
            cp = None; cv = []
            
            while i < len(lines):
                l = lines[i]
                
                # Stop at next Chinese section header
                if l and re.match(r'^[\u4e00-\u9fff]+$', l) and len(l) <= 30:
                    if l != section_name and 'Part Number' not in l and 'CATALOG' not in l:
                        if cp and len(cv) >= len(schema):
                            prods.append((cp, cv[:len(schema)]))
                        return prods
                
                if not l:
                    i += 1; continue
                
                if is_pn(l):
                    if cp and len(cv) >= len(schema):
                        prods.append((cp, cv[:len(schema)]))
                    cp = l; cv = []
                elif cp is not None and len(cv) < len(schema):
                    cv.append(l)
                
                i += 1
            
            if cp and len(cv) >= len(schema):
                prods.append((cp, cv[:len(schema)]))
            return prods
    return []

def build(pn, vals, schema):
    labeled = [f'{schema[i]}: {vals[i]}' for i in range(len(vals))]
    return {
        'part_number': pn,
        '_params': ' | '.join(labeled),
        '_raw': ' | '.join(vals),
    }

# ── All sections to extract ──
SECTIONS = [
    ('匹配电阻网络', ['Status','Rating','Product Family','Resistor Config','Working Voltage Max (V)',
        'Resistor Matching Max (%)','Matching Temp Drift (ppm/C)','Matching for CMRR Max (%)','Package'],
     '匹配电阻', '匹配电阻网络'),
    
    ('传感器接口', ['Status','Rating','VDD (V)','Description','Package'],
     '传感器接口', '传感器接口'),
    
    ('高边驱动', ['Status','Rating','Temperature Range (C)','Package'],
     '高边驱动', '高边驱动'),
    
    ('电池监控', ['Status','Rating','Device Type','Description','Max Series Cells',
        'Accuracy','Vin Max (V)','Comm Interface','Operating Temp (C)','Package'],
     '电池监控', '电池监控'),
    
    ('电子保险丝', ['Status','Rating','Vin Min (V)','Vin Max (V)','Ron Typ (mOhm)','Channels',
        'Current Limit Type','Ilimit Min (mA)','Ilimit Max (mA)','Ilimit Accuracy',
        'Current Sense Accuracy','Temperature Range (C)','Package'],
     '电子保险丝', '电子保险丝'),
    
    ('理想二极管|ORing 控制器', ['Status','Rating','Vin Min (V)','Vin Max (V)','Channels',
        'Iq Typ (uA)','Iq Max (uA)','IGATE Source Typ (uA)','IGATE Source Min (uA)',
        'IGATE Sink Typ (mA)','Temperature Range (C)','Package'],
     '理想二极管', '理想二极管'),
    
    ('电源时序控制', ['Status','Rating','VCC (V)','Timing Control','Power-up Sequence',
        'Power-down Sequence','Open-Drain Output','Output Voltage (V)','Channels',
        'Junction Temp (C)','Package'],
     '电源时序', '电源时序控制'),
    
    ('与门', ['Status','Rating','Technology Family','Channels','Supply Range (V)',
        'Input Type','Output Type','DC Drive Strength (mA)','Operating Temp (C)','Package'],
     '逻辑门', '逻辑门'),
    
    ('自动方向', ['Status','Rating','Technology Family','Channels','Supply Range (V)',
        'Input Type','Output Type','DC Drive Strength (mA)','Operating Temp (C)','Package'],
     '逻辑门', '逻辑门'),
    
    ('收发器', ['Status','Rating','Subcategory','Technology Family','Master/Slave',
        'Function','TDM Ports','PDM Ports','Supply Voltage (V)','Maximum Nodes',
        'MSL','Temperature Range (C)','Package'],
     '音频总线', '收发器'),
    
    # BMS
    ('电池均衡IC', ['Status','Rating','Balancing Start-up Voltage (V)',
        'Balancing Recovery Voltage (V)','Balancing Start-up Delay (mS)',
        'Standby Voltage (V)','Output Logic','Package'],
     'BMS', '电池均衡IC'),
    
    ('3~16 节-全功能保护', ['Status','Rating','Overcharge Detection (V)',
        'Overcharge Release (V)','Overdischarge Detection (V)',
        'Overdischarge Release (V)','Discharge Overcurrent Detection (V)',
        'Load Short-circuit Detection (V)','Charge Overcurrent Detection (V)',
        'Sleep Function','Low Voltage Charging Prohibition',
        'Temperature Protection','Package'],
     'BMS', '电池保护'),
    
    ('2~16 节-次级保护', ['Status','Rating','Overcharge Detection (V)',
        'Overcharge Release (V)','Overcharge Delay (S)',
        'Overdischarge Detection (V)','Overdischarge Release (V)',
        'Overdischarge Delay (S)','CO Output','DO Output','Output Logic',
        'Output High Level Voltage (V)','Open-circuit Protection',
        'LDO Output Voltage (V)','Temperature Protection','Package'],
     'BMS', '电池保护'),
    
    ('1 节-检测MOS', ['Status','Rating','Overcharge Detection (V)',
        'Overcharge Release (V)','Overdischarge Detection (V)',
        'Overdischarge Release (V)','Discharge Overcurrent Detection (V)',
        'Load Short-circuit Detection (V)','Charge Overcurrent Detection (V)',
        'Overcharge Delay (mS)','Overdischarge Delay (mS)',
        'Discharge Overcurrent Delay (mS)','Charge Overcurrent Delay (mS)',
        'Load Short Delay (mS)','0V Battery Charging','Function',
        'Sleep Function','Package'],
     'BMS', '电池保护'),
    
    ('1 节-检测Rsense', ['Status','Rating','Overcharge Detection (V)',
        'Overcharge Release (V)','Overdischarge Detection (V)',
        'Overdischarge Release (V)','Discharge Overcurrent Detection (V)',
        'Load Short-circuit Detection (V)','Charge Overcurrent Detection (V)',
        'Overcharge Delay (mS)','Overdischarge Delay (mS)',
        'Discharge Overcurrent Delay (mS)','Charge Overcurrent Delay (mS)',
        'Load Short Delay (mS)','0V Battery Charging','Function',
        'Sleep Function','Package'],
     'BMS', '电池保护'),
    
    ('1 节-复合IC', ['Status','Rating','Overcharge Detection (V)',
        'Overcharge Release (V)','Overdischarge Detection (V)',
        'Overdischarge Release (V)','Discharge Overcurrent Detection (A)',
        'Load Short-circuit Detection (A)','Charge Overcurrent Detection (A)',
        'Overcharge Delay (mS)','Overdischarge Delay (mS)',
        'Discharge Overcurrent Delay (mS)','Charge Overcurrent Delay (mS)',
        'Load Short Delay (mS)','0V Battery Charging','Function',
        'Sleep Function','Package'],
     'BMS', '电池保护'),
]

# ── MAIN ──
target_slug = None
for slug, vd in data.items():
    if '3peak' in slug and 'analog' in slug:
        target_slug = slug
        break

print(f'Target: {target_slug} ({len(data[target_slug]["products"])} existing)')

total_new = 0
existing_pns = set(p['part_number'] for p in data[target_slug]['products'])

for sec_name, schema, tag, sec_label in SECTIONS:
    prods = extract_section(sec_name, schema)
    print(f'  [{sec_name}]: {len(prods)} products', end='')
    
    new_count = 0
    for pn, vals in prods:
        prod_data = build(pn, vals, schema)
        if pn in existing_pns:
            for p in data[target_slug]['products']:
                if p['part_number'] == pn:
                    if 'Param' in p.get('_params',''):
                        p['_params'] = prod_data['_params']
                        p['_raw'] = prod_data['_raw']
                    p['_section'] = sec_label
                    feats = [f for f in p['_features'].split() if f not in ('EMI滤波器',)]
                    if tag not in feats:
                        feats.append(tag)
                    p['_features'] = ' '.join(feats)
                    break
        else:
            new_prod = {
                'part_number': pn,
                '_features': f'工业级 {tag}',
                '_params': prod_data['_params'],
                '_raw': prod_data['_raw'],
                '_section': sec_label,
            }
            data[target_slug]['products'].append(new_prod)
            existing_pns.add(pn)
            new_count += 1
    
    if new_count:
        print(f' ({new_count} new)')
    else:
        print()
    total_new += new_count

# Also need to fix TPDA1000Q/TPDA1001Q → 音频总线
for p in data[target_slug]['products']:
    if p['part_number'].startswith('TPDA100'):
        feats = [f for f in p['_features'].split() if f not in ('LIN','ADC')]
        if '音频总线' not in feats:
            feats.append('音频总线')
        p['_features'] = ' '.join(feats)
        p['_section'] = '收发器'
        print(f'  Fix: {p["part_number"]} → 音频总线')

json.dump(data, open(DATA, 'w'), ensure_ascii=False, indent=2)
print(f'\nTotal new: {total_new}, Total: {len(data[target_slug]["products"])}')
doc.close()

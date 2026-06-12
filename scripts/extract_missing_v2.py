#!/usr/bin/env python3
"""
V2: Extract all missing categories with robust section finding.
"""
import fitz, json, re, os

PDF = '/Users/zhouchong/Projects/warehouse/raw/思瑞浦-模拟产品选型册_2026.pdf'
DATA = '/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'

doc = fitz.open(PDF)

# ── Helper ──
def find_section(doc, section_name):
    """Find the page index and line offset where a section starts."""
    for pg in range(len(doc)):
        text = doc[pg].get_text()
        lines = [l.strip() for l in text.split('\n')]
        for i, line in enumerate(lines):
            if line == section_name:
                return pg, i, lines
    return None, None, None

def extract_table(section_name, schema, tag, sec_label):
    """Generic table extractor."""
    pg, start, lines = find_section(doc, section_name)
    if pg is None:
        print(f'  [{section_name}] NOT FOUND')
        return []
    
    print(f'  [{section_name}] page {pg+1}, line {start}')
    
    # Find Part Number row
    i = start + 1
    while i < len(lines) and lines[i] != 'Part Number':
        i += 1
    if i >= len(lines):
        print(f'    No Part Number found')
        return []
    
    # Skip header rows until first product PN
    i += 1
    while i < len(lines) and lines[i] and not re.match(r'^[A-Z]{2,}\d', lines[i]) and not re.match(r'^CM\d', lines[i]):
        i += 1
    
    products = []
    current_pn = None
    current_vals = []
    
    while i < len(lines):
        line = lines[i]
        
        # Handle page boundary: if current_pn and we see a new section header
        if line and re.match(r'^[\u4e00-\u9fff]', line):
            if line == section_name:
                i += 1
                continue
            if 'Part Number' in line:
                i += 1
                continue
            # Check if this is truly a new section
            if len(line) <= 40 and not re.match(r'^[\d\s\.\-～~]+$', line):
                # Save product and stop
                if current_pn and len(current_vals) >= len(schema):
                    products.append(build(current_pn, current_vals[:len(schema)], schema))
                break
        
        if not line:
            i += 1
            continue
        
        # Product PN detection
        if re.match(r'^[A-Z]{2,}\d', line) or re.match(r'^CM\d', line):
            if current_pn and len(current_vals) >= len(schema):
                products.append(build(current_pn, current_vals[:len(schema)], schema))
            current_pn = line
            current_vals = []
        elif current_pn is not None and len(current_vals) < len(schema):
            current_vals.append(line)
        
        i += 1
    
    # Last product
    if current_pn and len(current_vals) >= len(schema):
        products.append(build(current_pn, current_vals[:len(schema)], schema))
    
    return products

def build(pn, vals, schema):
    labeled = []
    for idx, val in enumerate(vals):
        if idx < len(schema):
            labeled.append('{}: {}'.format(schema[idx], val))
    return {
        'part_number': pn,
        '_params': ' | '.join(labeled),
        '_raw': ' | '.join(vals),
    }

# ── All sections ──
SECTIONS = [
    ('匹配电阻网络',
     ['Status','Rating','Product Family','Resistor Config','Working Voltage Max (V)',
      'Resistor Matching Max (%)','Resistor Matching Temp Drift (ppm/C)',
      'Matching for CMRR Max (%)','Package'],
     '匹配电阻', '匹配电阻网络'),
    
    ('传感器接口',
     ['Status','Rating','VDD (V)','Description','Package'],
     '传感器接口', '传感器接口'),
    
    ('高边驱动',
     ['Status','Rating','Temperature Range (C)','Package'],
     '高边驱动', '高边驱动'),
    
    ('电池监控',
     ['Status','Rating','Device Type','Description','Max Series Cells',
      'Accuracy','Vin Max (V)','Comm Interface','Operating Temp (C)','Package'],
     '电池监控', '电池监控'),
    
    ('电子保险丝',
     ['Status','Rating','Vin Min (V)','Vin Max (V)','Ron Typ (mOhm)','Channels',
      'Current Limit Type','Ilimit Min (mA)','Ilimit Max (mA)',
      'Ilimit Accuracy','Current Sense Accuracy','Temperature Range (C)','Package'],
     '电子保险丝', '电子保险丝'),
    
    ('理想二极管|ORing 控制器',
     ['Status','Rating','Vin Min (V)','Vin Max (V)','Channels','Iq Typ (uA)',
      'Iq Max (uA)','IGATE Source Typ (uA)','IGATE Source Min (uA)',
      'IGATE Sink Typ (mA)','Temperature Range (C)','Package'],
     '理想二极管', '理想二极管'),
    
    ('电源时序控制',
     ['Status','Rating','VCC (V)','Timing Control','Power-up Sequence',
      'Power-down Sequence','Open-Drain Output','Output Voltage (V)',
      'Channels','Junction Temp (C)','Package'],
     '电源时序', '电源时序控制'),
    
    ('与门',
     ['Status','Rating','Technology Family','Channels','Supply Range (V)',
      'Input Type','Output Type','DC Drive Strength (mA)',
      'Operating Temp (C)','Package'],
     '逻辑门', '逻辑门'),
    
    ('自动方向',
     ['Status','Rating','Technology Family','Channels','Supply Range (V)',
      'Input Type','Output Type','DC Drive Strength (mA)',
      'Operating Temp (C)','Package'],
     '逻辑门', '逻辑门'),
    
    ('收发器',
     ['Status','Rating','Subcategory','Technology Family','Master/Slave',
      'Function','TDM Ports','PDM Ports','Supply Voltage (V)',
      'Maximum Nodes','MSL','Temperature Range (C)','Package'],
     '音频总线', '收发器'),
    
    ('电池均衡IC',
     ['Status','Rating','Balancing Start-up Voltage (V)','Balancing Recovery Voltage (V)',
      'Balancing Start-up Delay (mS)','Standby Voltage (V)','Output Logic','Package'],
     'BMS', '电池均衡IC'),
]

# ── Special: 3~16节全功能保护 ──
SECTIONS.append(('3~16 节-全功能保护',
     ['Status','Rating','Overcharge Detection (V)','Overcharge Release (V)',
      'Overdischarge Detection (V)','Overdischarge Release (V)',
      'Discharge Overcurrent Detection (V)','Load Short-circuit Detection (V)',
      'Charge Overcurrent Detection (V)','Sleep Function',
      'Low Voltage Charging Prohibition','Temperature Protection','Package'],
     'BMS', '电池保护'))

# ── 2~16节次级保护 ──
SECTIONS.append(('2~16 节-次级保护',
     ['Status','Rating','Overcharge Detection (V)','Overcharge Release (V)',
      'Overcharge Delay (S)','Overdischarge Detection (V)',
      'Overdischarge Release (V)','Overdischarge Delay (S)',
      'CO Output','DO Output','Output Logic',
      'Output High Level Voltage (V)','Open-circuit Protection',
      'LDO Output Voltage (V)','Temperature Protection','Package'],
     'BMS', '电池保护'))

# ── BMS 1节系列 (complex multi-line schemas, need special handling) ──
def extract_bms_1cell(section_name, schema, tag):
    """Special extractor for 1-cell BMS tables with multi-line headers."""
    pg, start, lines = find_section(doc, section_name)
    if pg is None:
        print(f'  [{section_name}] NOT FOUND')
        return []
    
    print(f'  [{section_name}] page {pg+1} (simple extraction)')
    
    # For BMS 1-cell, just collect all PNs and values
    products = []
    i = start + 1
    in_data = False
    current_pn = None
    current_vals = []
    
    while i < len(lines):
        line = lines[i]
        
        # Skip header area
        if not in_data:
            if line == 'Part Number':
                in_data = True
            i += 1
            continue
        
        # Stop at next section
        if line and re.match(r'^[\u4e00-\u9fff]', line) and len(line) <= 30:
            if line != section_name and 'Part Number' not in line:
                if current_pn and len(current_vals) >= len(schema):
                    products.append(build(current_pn, current_vals[:len(schema)], schema))
                break
        
        if not line:
            i += 1
            continue
        
        if re.match(r'^[A-Z]{2,}\d', line) or re.match(r'^CM\d', line):
            if current_pn and len(current_vals) >= len(schema):
                products.append(build(current_pn, current_vals[:len(schema)], schema))
            current_pn = line
            current_vals = []
        elif current_pn is not None:
            # Skip multi-line header fragments
            if not re.match(r'^[\(（]', line) and not re.match(r'^(voltage|detection|release|circuiting|Delay)', line.lower()):
                current_vals.append(line)
        
        i += 1
    
    if current_pn and len(current_vals) >= len(schema):
        products.append(build(current_pn, current_vals[:len(schema)], schema))
    
    return products

# Simplified schemas for 1-cell BMS
BMS_DETECT_MOS = ['Status','Rating','Overcharge Detection (V)','Overcharge Release (V)',
    'Overdischarge Detection (V)','Overdischarge Release (V)',
    'Discharge Overcurrent Detection (V)','Load Short-circuit Detection (V)',
    'Charge Overcurrent Detection (V)','Overcharge Delay (mS)',
    'Overdischarge Delay (mS)','Discharge Overcurrent Delay (mS)',
    'Charge Overcurrent Delay (mS)','Load Short Delay (mS)',
    '0V Battery Charging','Function','Sleep Function','Package']

BMS_DETECT_RSENSE = ['Status','Rating','Overcharge Detection (V)','Overcharge Release (V)',
    'Overdischarge Detection (V)','Overdischarge Release (V)',
    'Discharge Overcurrent Detection (V)','Load Short-circuit Detection (V)',
    'Charge Overcurrent Detection (V)','Overcharge Delay (mS)',
    'Overdischarge Delay (mS)','Discharge Overcurrent Delay (mS)',
    'Charge Overcurrent Delay (mS)','Load Short Delay (mS)',
    '0V Battery Charging','Function','Sleep Function','Package']

BMS_COMPOSITE = ['Status','Rating','Overcharge Detection (V)','Overcharge Release (V)',
    'Overdischarge Detection (V)','Overdischarge Release (V)',
    'Discharge Overcurrent Detection (A)','Load Short-circuit Detection (A)',
    'Charge Overcurrent Detection (A)','Overcharge Delay (mS)',
    'Overdischarge Delay (mS)','Discharge Overcurrent Delay (mS)',
    'Charge Overcurrent Delay (mS)','Load Short Delay (mS)',
    '0V Battery Charging','Function','Sleep Function','Package']

SECTIONS.append(('1 节-检测MOS', BMS_DETECT_MOS, 'BMS', '电池保护'))
SECTIONS.append(('1 节-检测Rsense', BMS_DETECT_RSENSE, 'BMS', '电池保护'))
SECTIONS.append(('1 节-复合IC', BMS_COMPOSITE, 'BMS', '电池保护'))

# ── MAIN ──
data = json.load(open(DATA))
target_slug = None
for slug, vd in data.items():
    if '3peak' in slug and 'analog' in slug:
        target_slug = slug
        break

print(f'Target: {target_slug} ({len(data[target_slug]["products"])} existing)')

total_new = 0
existing_pns = {p['part_number'] for p in data[target_slug]['products']}

for sec_name, schema, tag, sec_label in SECTIONS:
    if '1 节-' in sec_name:
        prods = extract_bms_1cell(sec_name, schema, tag)
    else:
        prods = extract_table(sec_name, schema, tag, sec_label)
    
    new_count = 0
    for prod in prods:
        pn = prod['part_number']
        if pn in existing_pns:
            for p in data[target_slug]['products']:
                if p['part_number'] == pn:
                    if 'Param' in p.get('_params',''):
                        p['_params'] = prod['_params']
                        p['_raw'] = prod['_raw']
                    p['_section'] = sec_label
                    feats = p['_features'].split()
                    if tag not in feats:
                        feats.append(tag)
                    p['_features'] = ' '.join(feats)
                    break
        else:
            new_prod = {
                'part_number': pn,
                '_features': f'工业级 {tag}',
                '_params': prod['_params'],
                '_raw': prod['_raw'],
                '_section': sec_label,
            }
            data[target_slug]['products'].append(new_prod)
            existing_pns.add(pn)
            new_count += 1
    
    total_new += new_count
    if prods:
        print(f'    → {len(prods)} products ({new_count} new)')

json.dump(data, open(DATA, 'w'), ensure_ascii=False, indent=2)
print(f'\nTotal new: {total_new}, Total now: {len(data[target_slug]["products"])}')
doc.close()

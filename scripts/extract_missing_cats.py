#!/usr/bin/env python3
"""
Extract all missing categories from 思瑞浦-模拟 PDF.
Categories: 匹配电阻, 传感器接口, 高边驱动, 电池监控, 电子保险丝,
            理想二极管, 电源时序, 逻辑门, BMS系列
"""
import fitz, json, re, os, sys

PDF = '/Users/zhouchong/Projects/warehouse/raw/思瑞浦-模拟产品选型册_2026.pdf'
DATA = '/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'
DRY_RUN = '--dry-run' in sys.argv

# ── Section definitions: (section_name, page_num, schema, tag, vendor_section) ──
SECTIONS = [
    # (name, page_1indexed, column_schema, category_tag, section_label)
    ('匹配电阻网络', 20,
     ['Status','Rating','Product Family','Resistor Config','Working Voltage Max (V)',
      'Resistor Matching Max (%)','Resistor Matching Temp Drift (ppm/C)',
      'Matching for CMRR Max (%)','Package'],
     '匹配电阻', '匹配电阻网络'),
    
    ('传感器接口', 21,
     ['Status','Rating','VDD (V)','Description','Package'],
     '传感器接口', '传感器接口'),
    
    ('高边驱动', 22,
     ['Status','Rating','Temperature Range (C)','Package'],
     '高边驱动', '高边驱动'),
    
    ('电池监控', 22,
     ['Status','Rating','Device Type','Description','Max Series Cells',
      'Accuracy','Vin Max (V)','Comm Interface','Operating Temp (C)','Package'],
     '电池监控', '电池监控'),
    
    ('电子保险丝', 46,
     ['Status','Rating','Vin Min (V)','Vin Max (V)','Ron Typ (mOhm)','Channels',
      'Current Limit Type','Ilimit Min (mA)','Ilimit Max (mA)',
      'Ilimit Accuracy','Current Sense Accuracy','Temperature Range (C)','Package'],
     '电子保险丝', '电子保险丝'),
    
    ('理想二极管|ORing 控制器', 46,
     ['Status','Rating','Vin Min (V)','Vin Max (V)','Channels','Iq Typ (uA)',
      'Iq Max (uA)','IGATE Source Typ (uA)','IGATE Source Min (uA)',
      'IGATE Sink Typ (mA)','Temperature Range (C)','Package'],
     '理想二极管', '理想二极管'),
    
    ('电源时序控制', 47,
     ['Status','Rating','VCC (V)','Timing Control','Power-up Sequence',
      'Power-down Sequence','Open-Drain Output','Output Voltage (V)',
      'Channels','Junction Temp (C)','Package'],
     '电源时序', '电源时序控制'),
    
    ('与门', 49,
     ['Status','Rating','Technology Family','Channels','Supply Range (V)',
      'Input Type','Output Type','DC Drive Strength (mA)',
      'Operating Temp (C)','Package'],
     '逻辑门', '逻辑门'),
    
    ('自动方向', 49,
     ['Status','Rating','Technology Family','Channels','Supply Range (V)',
      'Input Type','Output Type','DC Drive Strength (mA)',
      'Operating Temp (C)','Package'],
     '逻辑门', '逻辑门'),
]

# ── Helper: extract products from a clean table section ──
def extract_products(doc, page_1idx, section_name, schema):
    """Parse products from a single-page section with simple layout."""
    page = doc[page_1idx - 1]
    text = page.get_text()
    lines = [l.strip() for l in text.split('\n')]
    
    # Find section start
    start = None
    for i, line in enumerate(lines):
        if line == section_name:
            start = i
            break
    if start is None:
        print(f'  WARNING: section "{section_name}" not found on page {page_1idx}')
        return []
    
    # Skip past Part Number and header rows
    i = start + 1
    while i < len(lines) and lines[i] == 'Part Number':
        i += 1
        # Skip multi-line header
        while i < len(lines) and lines[i] and not re.match(r'^[A-Z]{2,}[\d]', lines[i]):
            i += 1
    
    products = []
    current_pn = None
    current_vals = []
    
    while i < len(lines):
        line = lines[i]
        if not line:
            i += 1
            continue
        
        # Check if this is a new section header
        if re.match(r'^[\u4e00-\u9fff]', line) and 'Part Number' not in line:
            # Save current product if any
            if current_pn and len(current_vals) >= len(schema):
                products.append(build_product(current_pn, current_vals[:len(schema)], schema))
            current_pn = None
            current_vals = []
            break
        
        # Check if this is a product PN
        if re.match(r'^[A-Z]{2,}[\d]', line) or re.match(r'^CM\d+', line):
            # Save previous product
            if current_pn and len(current_vals) >= len(schema):
                products.append(build_product(current_pn, current_vals[:len(schema)], schema))
            current_pn = line
            current_vals = []
        elif current_pn is not None:
            # Skip sub-header rows (like 'detection voltage')
            if len(current_vals) < len(schema):
                current_vals.append(line)
        
        i += 1
    
    # Save last product
    if current_pn and len(current_vals) >= len(schema):
        products.append(build_product(current_pn, current_vals[:len(schema)], schema))
    
    return products

def build_product(pn, vals, schema):
    labeled = []
    for idx, val in enumerate(vals):
        if idx < len(schema):
            labeled.append('{}: {}'.format(schema[idx], val))
    return {
        'part_number': pn,
        '_params': ' | '.join(labeled),
        '_raw': ' | '.join(vals),
    }

# ── Main ──
doc = fitz.open(PDF)
data = json.load(open(DATA))

# Find or create 3peak-analog vendor entry
target_slug = None
for slug, vd in data.items():
    if '3peak' in slug and 'analog' in slug:
        target_slug = slug
        break

if not target_slug:
    print('ERROR: 3peak-analog not found')
    sys.exit(1)

print(f'Target vendor: {target_slug} ({data[target_slug]["name"]})')
print(f'Existing products: {len(data[target_slug]["products"])}')

total_new = 0
for sec_name, page, schema, tag, sec_label in SECTIONS:
    prods = extract_products(doc, page, sec_name, schema)
    new_count = 0
    existing_pns = {p['part_number'] for p in data[target_slug]['products']}
    
    for prod in prods:
        pn = prod['part_number']
        if pn in existing_pns:
            # Update existing product
            for p in data[target_slug]['products']:
                if p['part_number'] == pn:
                    p['_params'] = prod['_params']
                    p['_raw'] = prod['_raw']
                    p['_section'] = sec_label
                    feats = [f for f in p['_features'].split() if f not in ('EMI滤波器',)]
                    if tag not in feats:
                        feats.append(tag)
                    p['_features'] = ' '.join(feats)
                    break
        else:
            # Add new product
            new_prod = {
                'part_number': pn,
                '_features': f'工业级 {tag}',
                '_params': prod['_params'],
                '_raw': prod['_raw'],
                '_section': sec_label,
            }
            data[target_slug]['products'].append(new_prod)
            new_count += 1
    
    total_new += new_count
    print(f'  [{sec_name}] extracted {len(prods)}, new: {new_count}')

# ── Also extract 收发器 (audio bus) section ──
print('\nExtracting 收发器 (audio bus)...')
page = doc[35]  # page 36
text = page.get_text()
lines = [l.strip() for l in text.split('\n')]
for i, line in enumerate(lines):
    if line == '收发器':
        # Schema from PDF: Status, Rating, Subcategory, Tech Family, Master/Slave, 
        # Function, TDM Ports, PDM Ports, Supply Voltage, Max Nodes, MSL, Temp, Package
        schema = ['Status','Rating','Subcategory','Technology Family','Master/Slave',
                  'Function','TDM Ports','PDM Ports','Supply Voltage (V)',
                  'Maximum Nodes','MSL','Temperature Range (C)','Package']
        
        prods = extract_products(doc, 36, '收发器', schema)
        existing_pns = {p['part_number'] for p in data[target_slug]['products']}
        new_count = 0
        
        for prod in prods:
            pn = prod['part_number']
            if pn in existing_pns:
                for p in data[target_slug]['products']:
                    if p['part_number'] == pn:
                        p['_params'] = prod['_params']
                        p['_raw'] = prod['_raw']
                        p['_section'] = '收发器'
                        feats = p['_features'].split()
                        if '音频总线' not in feats:
                            feats.append('音频总线')
                        p['_features'] = ' '.join(feats)
                        break
            else:
                new_prod = {
                    'part_number': pn,
                    '_features': '工业级 音频总线',
                    '_params': prod['_params'],
                    '_raw': prod['_raw'],
                    '_section': '收发器',
                }
                data[target_slug]['products'].append(new_prod)
                new_count += 1
        
        total_new += new_count
        print(f'  [收发器] extracted {len(prods)}, new: {new_count}')
        break

if not DRY_RUN:
    json.dump(data, open(DATA, 'w'), ensure_ascii=False, indent=2)

print(f'\nTotal new products: {total_new}')
print(f'Total in {target_slug}: {len(data[target_slug]["products"])}')

doc.close()

#!/usr/bin/env python3
"""Clean garbage products: package names, signal names, acronyms mistaken as part numbers."""
import json, re

DATA_PATH = '/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'
data = json.load(open(DATA_PATH))

# Known package prefixes (case insensitive substrings in part numbers)
PACKAGE_SUBSTRINGS = [
    'SOT23', 'SOT353', 'SOT363', 'SOT563', 'SOT89', 'SOT143', 'SOT223',
    'QFN', 'DFN', 'SOP', 'SOIC', 'SSOP', 'MSOP', 'TSSOP', 'ETSSOP', 'HTSSOP',
    'WSOP', 'EMSOP', 'ESOP', 'TSOT', 'WLCSP', 'LQFP', 'HLQFP', 'VQFN',
    'TO2', 'LGA', 'BGA', 'CSP', 'SC70', 'HSSOP', 'HMSOP', 'HSOP', 'HM',
]

# Known signal/pin names and acronyms
NON_PRODUCT_WORDS = {
    'YES', 'INL', 'PSM', 'PSR', 'TTL', 'ESD', 'MCU', 'DSP', 'BMS', 'ECU',
    'PWM', 'SPI', 'I2C', 'OTP', 'PGA', 'SAR', 'IIR', 'MFC', 'MUX', 'AMP',
    'VCC', 'GND', 'VDD', 'VIN', 'VBG', 'VCP', 'VLD', 'VIP', 'BAT', 'INH',
    'TXD', 'RXD', 'STB', 'SCK', 'SDA', 'SCL', 'SDO', 'CSB', 'EN1', 'INA',
    'INF', 'SEL', 'FET', 'DIS', 'PRE', 'OOK', 'GH1', 'COT', 'PCM', 'ICL',
    'FS1', 'ADB', 'SSN', 'BST', 'PMU', 'EXC', 'AOP', 'PCH', 'OUT', 'RDI',
    'ISO', 'OWI', 'OSC', 'STA', 'ITA', 'SP1', 'SC3', 'SD6', 'ID0', 'PDU',
    'OBC', 'ABZ', 'POR', 'TRX', 'WPN', 'PLC', 'S2P', 
}

# Patterns that indicate garbage
def is_garbage_product(pn):
    pn_s = pn.strip()
    
    # Pure package codes: SOT23-5, QFN4X4-20, DFN3X3-8, etc.
    # But NOT valid manufacturer products like NSOPA9051 (NSOPA = Novosense op-amp)
    for pat in PACKAGE_SUBSTRINGS:
        idx = pn_s.upper().find(pat)
        if idx >= 0:
            # Check if this is just a package code, not a manufacturer product
            # Real products have prefix before the package substring
            before = pn_s[:idx]
            if len(before) <= 2 and not re.match(r'^[A-Z]{3,}', before):
                # Short or no prefix → likely pure package code
                return True, 'package_code'
    
    # Known non-product words
    if pn_s in NON_PRODUCT_WORDS:
        return True, 'signal_acronym'
    
    # Short uppercase strings (2-3 chars)
    if 2 <= len(pn_s) <= 3 and pn_s == pn_s.upper() and not re.match(r'^[A-Z]{2}\d', pn_s):
        return True, 'too_short'
    
    # Pin references like P17, P01
    if re.match(r'^[A-Z]\d{2}$', pn_s):
        return True, 'pin_ref'
    
    # Pure numbers or starts with digit
    if re.match(r'^\d+[A-Za-z]?$', pn_s):
        return True, 'numeric'
    
    return False, ''

# Scan and clean
removed = []
kept_false_positive = []

for slug, vd in data.items():
    clean_products = []
    for p in vd['products']:
        pn = p['part_number']
        is_gbg, reason = is_garbage_product(pn)
        if is_gbg:
            removed.append((vd['name'], pn, reason, p.get('_raw','')[:40]))
        else:
            clean_products.append(p)
    vd['products'] = clean_products
    vd['productCount'] = len(clean_products)

print(f'Removed {len(removed)} garbage products:')
for vendor, pn, reason, raw in removed:
    print(f'  [{vendor}] {pn:25s} | {reason:20s} | {raw[:50]}')

# Save
json.dump(data, open(DATA_PATH, 'w'), ensure_ascii=False, indent=2)

# Stats
total = sum(v['productCount'] for v in data.values())
print(f'\nNew totals:')
for slug, vd in data.items():
    print(f'  {vd["name"]}: {vd["productCount"]}')
print(f'  TOTAL: {total}')

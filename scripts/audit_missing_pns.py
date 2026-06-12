#!/usr/bin/env python3
"""Cross-check: all part numbers in PDF vs data."""
import json, re, pymupdf
from collections import defaultdict

data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

PDF_FILES = {
    '3peak-analog': '/Users/zhouchong/Projects/warehouse/raw/思瑞浦-模拟产品选型册_2026.pdf',
    '3peak-auto': '/Users/zhouchong/Projects/warehouse/raw/思瑞浦-汽车产品选型册_2026.pdf',
    'novosense': '/Users/zhouchong/Projects/warehouse/raw/纳芯微产品选型指南_202510.pdf',
    'yutai': '/Users/zhouchong/Projects/warehouse/raw/裕太产品选型表 20250312.pdf',
}

def is_valid_pn(s):
    s = s.strip()
    if not s or len(s) < 4: return False
    if re.search(r'[\u4e00-\u9fff]', s): return False
    if not re.search(r'\d', s): return False
    if not re.match(r'^[A-Z][A-Za-z0-9\-\.]+$', s): return False
    # Exclude common non-product strings
    exclude = {'VCC','GND','VDD','VIN','TXD','RXD','SCK','SDA','SCL','MCU','DSP','BMS',
               'ECU','PWM','SPI','I2C','ESD','OTP','PGA','SAR','IIR','MUX','AMP',
               'LDO','DCDC','DAC','ADC','CAN','LIN','PHY','SBC','NIC',
               'YES','INL','PSM','PSR','TTL','PC H','OUT','EN1','INA','INF',
               'SEL','FET','PRE','OOK','GH1','COT','PCM','ICL','FS1','ADB',
               'SSN','BST','PMU','EXC','AOP','RDI','ISO','OWI','OSC','STA',
               'ITA','VBG','VCP','VLD','VIP','BAT','INH','STB','DIS','WPN',
               'TRX','PLC','S2P','ABZ','POR','PDU','OBC'}
    if s.upper() in exclude: return False
    # Exclude package codes
    pkg = ['SOT23','QFN','DFN','SOP','SOIC','SSOP','MSOP','TSSOP','WSOP','EMSOP',
           'ESOP','WLCSP','LQFP','HLQFP','VQFN','SC70','HSSOP','HMSOP','HSOP',
           'HTSSOP','ETSSOP','BGA','CSP','LGA','SMP8','TO247','TO220','TO252','TO263']
    for p in pkg:
        idx = s.upper().find(p)
        if idx >= 0 and len(s[:idx]) <= 1:
            return False
    return True

for slug, pdf_path in PDF_FILES.items():
    if not pdf_path: continue
    name = data[slug]['name']
    print(f'\n=== {name} ({slug}) ===')
    
    doc = pymupdf.open(pdf_path)
    
    # Extract all potential part numbers from PDF text
    pdf_pns = set()
    for page in doc:
        text = page.get_text()
        # Find all uppercase alphanumeric strings
        for m in re.finditer(r'\b([A-Z][A-Za-z0-9\-\.]{3,}(?:-[A-Za-z0-9]+)*)\b', text):
            pn = m.group(1).strip()
            if is_valid_pn(pn):
                pdf_pns.add(pn)
    doc.close()
    
    # Get all part numbers in data
    data_pns = {p['part_number'] for p in data[slug]['products']}
    
    # Products in PDF but NOT in data
    missing = pdf_pns - data_pns
    # Products in data but NOT in PDF
    extra = data_pns - pdf_pns
    
    # Filter missing: only show products that look like real part numbers (not false positives)
    real_missing = []
    for pn in sorted(missing):
        if re.match(r'^[A-Z]{2,}\d+', pn) and len(pn) >= 5:
            real_missing.append(pn)
    
    print(f'  PDF total PNs found: {len(pdf_pns)}')
    print(f'  Data PNs: {len(data_pns)}')
    print(f'  Missing from data (likely real): {len(real_missing)}')
    for pn in real_missing[:20]:
        print(f'    {pn}')
    if len(real_missing) > 20:
        print(f'    ... and {len(real_missing)-20} more')
    
    if extra:
        print(f'  In data but not in PDF text: {len(extra)} (may be duplicates/variants)')

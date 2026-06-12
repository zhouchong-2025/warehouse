#!/usr/bin/env python3
"""Extract missing products from all 4 PDFs using text-based approach."""
import json, re, pymupdf, sys
from pathlib import Path

DATA_PATH = '/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'
data = json.load(open(DATA_PATH))

VENDOR_CONFIG = {
    '3peak-analog': {
        'pdf': '/Users/zhouchong/Projects/warehouse/raw/思瑞浦-模拟产品选型册_2026.pdf',
        'prefixes': ['TPA','TPC','TPD','TPE','TPF','TPH','TPL','TPM','TPP','TPQ','TPR','TPS','TPT','TPV','TPW','LM','TL','T74','TS2','CM1','3P'],
    },
    '3peak-auto': {
        'pdf': '/Users/zhouchong/Projects/warehouse/raw/思瑞浦-汽车产品选型册_2026.pdf',
        'prefixes': ['TPA','TPC','TPD','TPE','TPF','TPH','TPL','TPM','TPP','TPQ','TPR','TPS','TPT','TPV','TPW','LM','TL','T74'],
    },
    'novosense': {
        'pdf': '/Users/zhouchong/Projects/warehouse/raw/纳芯微产品选型指南_202510.pdf',
        'prefixes': ['NS','NST','NSC','NCA','NSM','NSI','NSU','NSD','NSR','NSL','NSE','NSP','NSO','NSP','MT'],
    },
    'yutai': {
        'pdf': '/Users/zhouchong/Projects/warehouse/raw/裕太产品选型表 20250312.pdf',
        'prefixes': ['YT','SZ'],
    },
}

def is_valid_pn(s, prefixes):
    s = s.strip()
    if not s or len(s) < 4: return False
    if re.search(r'[\u4e00-\u9fff]', s): return False
    if not re.search(r'\d', s): return False
    if not re.match(r'^[A-Z][A-Za-z0-9\-\.]+$', s): return False
    if not any(s.startswith(pre) for pre in prefixes): return False
    pkg = ['SOT','QFN','DFN','SOP','SOIC','SSOP','MSOP','TSSOP','WSOP','EMSOP','ESOP','WLCSP','LQFP','HLQFP','VQFN','SC70','BGA','CSP','LGA','TO247','TO220']
    for p in pkg:
        idx = s.upper().find(p)
        if idx >= 0 and len(s[:idx]) <= 1:
            return False
    exclude = {'VCC','GND','VDD','VIN','TXD','RXD','SPI','I2C','ESD','MCU','DSP','BMS','ECU','PWM','LDO','DCDC','DAC','ADC','CAN','LIN','PHY','SBC','NIC','ISO','OSC','AMP','PDU','OBC'}
    if s.upper() in exclude: return False
    return True

def tag_from_text(text):
    t = text.lower()
    tags = set()
    if re.search(r'automotive|aec|q100|车规', t): tags.add('车规AEC-Q100')
    elif re.search(r'industrial|工业', t): tags.add('工业级')
    elif re.search(r'consumer|消费', t): tags.add('消费级')
    if re.search(r'5000|5kv|5700|reinforced', t): tags.add('5kVrms隔离')
    elif re.search(r'3750|3000|3kv', t): tags.add('3kVrms隔离')
    if re.search(r'gate.driver|栅极驱动', t):
        tags.add('栅极驱动')
        if re.search(r'isolated|reinforced|隔离(?!.*非隔离)', t): tags.add('隔离栅极驱动')
    if re.search(r'motor.driver|马达驱动|步进马达|步进电机', t): tags.add('马达驱动')
    if re.search(r'ldo|linear.regulator|低压差', t): tags.add('LDO')
    if re.search(r'dc.dc|dcdc|buck|boost|变换', t): tags.add('DCDC')
    if re.search(r'buck|降压|step.down', t): tags.add('降压')
    if re.search(r'boost|升压|step.up', t): tags.add('升压')
    if re.search(r'comparator|比较器', t): tags.add('比较器')
    if re.search(r'\badc\b|模数转换', t): tags.add('ADC')
    if re.search(r'\bdac\b|数模转换', t): tags.add('DAC')
    if re.search(r'amplif|运放|运算放大', t): tags.add('放大器')
    if re.search(r'isolated.amplif|隔离放大', t): tags.add('隔离放大器')
    if re.search(r'voltage.reference|基准|reference.voltage', t): tags.add('电压基准')
    if re.search(r'can\b.*(fd|transc|收发|bus)', t): tags.add('CAN FD')
    if re.search(r'lin\b.*(收发|transc)', t): tags.add('LIN')
    if re.search(r'rs.?485|half.duplex|full.duplex', t): tags.add('RS-485')
    if re.search(r'digital.isolat|数字隔离', t): tags.add('数字隔离器')
    if re.search(r'temperature.sensor|温度传感', t): tags.add('温度传感器')
    if re.search(r'current.sensor|电流传感', t): tags.add('电流传感器')
    if re.search(r'hall|position.sensor|位置传感|磁编码', t): tags.add('位置传感器')
    if re.search(r'reset|supervisor|看门狗|复位', t): tags.add('复位芯片')
    if re.search(r'load.switch|高边开关|high.side.switch', t): tags.add('负载开关')
    if re.search(r'analog.switch|模拟开关', t): tags.add('模拟开关')
    if re.search(r'isolated.power|隔离电源|push.pull.*open.loop', t): tags.add('隔离电源')
    if re.search(r'tvs|esd.protect|浪涌', t): tags.add('ESD保护')
    return sorted(tags)

total_added = 0
for slug, config in VENDOR_CONFIG.items():
    pdf_path = config['pdf']
    prefixes = config['prefixes']
    vd_name = data[slug]['name']
    
    if not Path(pdf_path).exists():
        print('{}: PDF not found'.format(slug))
        continue
    
    existing_pns = set(p['part_number'] for p in data[slug]['products'])
    doc = pymupdf.open(pdf_path)
    
    new_products = []
    current_section = ''
    
    for page_num in range(len(doc)):
        text = doc[page_num].get_text()
        lines = text.split('\n')
        
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped:
                continue
            if re.search(r'隔离|LDO|DCDC|运放|比较器|基准|马达|栅极|开关|收发器|保护|传感器|PHY|ADC|DAC|放大', stripped) and len(stripped) <= 30:
                if not is_valid_pn(stripped, prefixes):
                    current_section = stripped
            
            if is_valid_pn(stripped, prefixes) and stripped not in existing_pns:
                pn = stripped
                params = []
                j = i + 1
                while j < len(lines) and len(params) < 15:
                    nl = lines[j].strip()
                    if nl and (is_valid_pn(nl, prefixes) or (re.search(r'隔离|LDO|DCDC|运放|比较器', nl) and len(nl) <= 30)):
                        if not is_valid_pn(nl, prefixes):
                            break
                        break
                    if nl and len(nl) < 100:
                        params.append(nl)
                    j += 1
                
                if not params:
                    continue
                
                raw = ' | '.join(params[:12])
                tags = tag_from_text(raw + ' ' + current_section)
                
                new_products.append({
                    'part_number': pn,
                    '_section': current_section,
                    '_raw': raw,
                    '_params': raw,
                    '_features': ' '.join(tags)
                })
                existing_pns.add(pn)
    
    doc.close()
    
    data[slug]['products'].extend(new_products)
    data[slug]['productCount'] = len(data[slug]['products'])
    
    tagged = sum(1 for p in new_products if p.get('_features'))
    print('{}: +{} products ({} tagged)'.format(vd_name, len(new_products), tagged))
    total_added += len(new_products)

# Save
with open(DATA_PATH, 'w') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# Final stats
for slug, vd in data.items():
    print('  {}: {}'.format(vd['name'], vd['productCount']))
total = sum(v['productCount'] for v in data.values())
print('TOTAL: {}'.format(total))
print('Added: {}'.format(total_added))

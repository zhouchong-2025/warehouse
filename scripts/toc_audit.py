#!/usr/bin/env python3
"""
TOC-based Global Audit: cross-reference PDF table of contents against database.
Outputs every gap: missing products, wrong tags, wrong schemas, missing schemas.
"""
import fitz, json, re, os
from collections import defaultdict

PDF = '/Users/zhouchong/Projects/warehouse/raw/思瑞浦-模拟产品选型册_2026.pdf'
DATA = '/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'

# ── Step 1: Parse TOC from page 2-3 ──
doc = fitz.open(PDF)

toc_entries = []
for pg in [1, 2]:  # pages 2-3 (0-indexed)
    text = doc[pg].get_text()
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    for line in lines:
        # TOC entry pattern: Chinese text with optional English, page number at end
        m = re.match(r'^(.+?)\s*\.{2,}\s*(\d+)$', line)
        if m:
            toc_entries.append((m.group(1), int(m.group(2))))
        # Also catch section headers without page numbers (category groups)
        elif re.match(r'^[\u4e00-\u9fff]+$', line) and len(line) <= 20:
            # Check if next line has a sub-entry
            pass

print('TOC entries:', len(toc_entries))
for name, page in toc_entries:
    print(f'  [{page}] {name}')

# ── Step 2: Map TOC categories to tags ──
TOC_TO_TAG = {
    '高压运算放大器(Vs ＞10V)': '运放',
    '低压运算放大器(Vs ＜10V)': '运放',
    '精密运算放大器(Vos ＜＝1mV)': '运放',
    '高速运算放大器(GBW ＞＝50MHz)': '运放',
    '低功耗运算放大器 (Iq Per Ch <= 50μa)': '运放',
    '小尺寸封装运算放大器 (DFN, QFN, Wafer-Level CSP)': '运放',
    '音频线路驱动': '音频功放',
    '视频滤波驱动': '视频滤波',
    '隔离放大器和调制器': '隔离放大器',
    '比较器': '比较器',
    '电流信号检测放大器': '电流检测',
    '仪表放大器': '放大器',
    '差动放大器': '放大器',
    '对数放大器': '放大器',
    '带电压基准的放大器': '放大器',
    '匹配电阻网络': '匹配电阻',
    '传感器接口': '传感器接口',
    '线性充电芯片': '电池充电',
    '高边驱动': '高边驱动',
    '电池监控': '电池监控',
    '精密数模转换器(DAC)': 'DAC',
    '精密模数转换器（ADC）': 'ADC',
    '高速数模转换器（DAC）': 'DAC',
    '高速模数转换器（ADC）': 'ADC',
    '数字式电流/功率检测器': '电流检测',
    '多通道可配置模数/数模转换器': 'ADC',
    '温度传感器': '温度传感器',
    '宽压降压变换器': '降压',
    '中压降压变换器': '降压',
    '低压降压变换器': '降压',
    '功率级DrMOS': 'DCDC',
    '升压变换器': '升压',
    '以太网供电': '以太网供电',
    '隔离电源': '隔离电源',
    '直流马达驱动': '马达驱动',
    '步进马达驱动': '马达驱动',
    '隔离栅极驱动': '隔离栅极驱动',
    '非隔离栅极驱动': '栅极驱动',
    '高压模拟开关': '模拟开关',
    '低压模拟开关': '模拟开关',
    '电平转换器': '电平转换',
    'IO 扩展器': 'IO扩展',
    'CAN 收发器': 'CAN-FD',
    'LIN 收发器': 'LIN',
    'RS232 收发器': 'RS-232',
    'RS485 收发器': 'RS-485',
    'SBC': 'SBC',
    'MLVDS': 'MLVDS',
    '高速数据复用器/解复用器': 'MLVDS',
    '收发器': '音频总线',
    '数字隔离器': '数字隔离器',
    '隔离RS485': 'RS-485',
    '隔离CAN': 'CAN-FD',
    '隔离I2C': 'I2C',
    '低压LDO': 'LDO',
    '高压 LDO': 'LDO',
    '并联型电压基准': '电压基准',
    '串联型电压基准': '电压基准',
    '电子保险丝': '电子保险丝',
    '理想二极管|ORing 控制器': '理想二极管',
    '高边开关': '高边开关',
    '负载开关': '负载开关',
    '电源时序控制': '电源时序',
    '复位芯片': '复位芯片',
    '集成看门狗的复位芯片': '复位芯片',
    '与门': '逻辑门',
    '自动方向': '逻辑门',
    '1 节-检测MOS': 'BMS',
    '1 节-检测Rsense': 'BMS',
    '1 节-复合IC': 'BMS',
    '3~16 节-全功能保护': 'BMS',
    '2~16 节-次级保护': 'BMS',
    '电池均衡IC': 'BMS',
}

# ── Step 3: Load database ──
data = json.load(open(DATA))
all_products = []
for slug, vd in data.items():
    for p in vd['products']:
        all_products.append({
            'pn': p['part_number'],
            'slug': slug,
            'vendor': vd.get('name', slug),
            'features': p.get('_features',''),
            'params': p.get('_params',''),
            'section': p.get('_section',''),
            'has_paramn': 'Param' in p.get('_params',''),
        })

# ── Step 4: Check each TOC category ──
KNOWN_TAGS = set(TOC_TO_TAG.values())

print('\n═══════════════════════════════════')
print('GAP REPORT')
print('═══════════════════════════════════')

issues = defaultdict(list)

for toc_name, page in toc_entries:
    expected_tag = TOC_TO_TAG.get(toc_name)
    if not expected_tag:
        issues['NO_MAPPING'].append(toc_name)
        continue
    
    # Count products with this tag (from 思瑞浦-模拟)
    matching = [p for p in all_products if expected_tag in p['features'].split() and '3peak' in p['slug']]
    if not matching:
        issues['EMPTY_CATEGORY'].append(f'{toc_name} → tag={expected_tag}: 0 products')
        continue
    
    # Check for issues
    paramn_count = sum(1 for p in matching if p['has_paramn'])
    if paramn_count > 0:
        issues['PARAMN'].append(f'{toc_name} ({len(matching)} products): {paramn_count} ParamN')
    
    # Check section mismatch
    wrong_section = sum(1 for p in matching if toc_name not in p['section'] and expected_tag not in p['section'])
    if wrong_section > len(matching) * 0.3:
        issues['WRONG_SECTION'].append(f'{toc_name}: {wrong_section}/{len(matching)} wrong section')

# Check if TOC_TAG values exist in database
for tag in sorted(KNOWN_TAGS):
    count = sum(1 for p in all_products if tag in p['features'].split())
    print(f'  Tag [{tag}]: {count} products total')

print(f'\n--- GAPS ({sum(len(v) for v in issues.values())} issues) ---')
for category, items in sorted(issues.items()):
    print(f'\n[{category}] ({len(items)}):')
    for item in items[:20]:
        print(f'  {item}')
    if len(items) > 20:
        print(f'  ... +{len(items)-20}')

doc.close()

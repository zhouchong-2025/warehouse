#!/usr/bin/env python3
"""
Systematic multi-line value detection:
For every PDF section, count header columns vs actual product values.
Flag any product where the count doesn't match — indicates multi-line cells.
"""
import fitz, json, re, os
from collections import defaultdict

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
    if line in known_pns:
        return True
    if re.match(r'^(TP|T7|CM|NS|LM|MT|YT|IS|PCA)\w*\d', line) and len(line) >= 4:
        if re.match(r'^[A-Z]+\d+[\.\-]', line):
            return False
        if line in ('TSSOP','QFN','SOP','DFN','WLCSP','MSOP','SOT','WSOP','EMSOP','LQFP'):
            return False
        return True
    return False

def get_section_info(doc, section_name):
    """Get header count and product value counts for a section."""
    for pg in range(len(doc)):
        text = doc[pg].get_text()
        lines = [l.strip() for l in text.split('\n')]
        for start, line in enumerate(lines):
            if line != section_name:
                continue
            
            # Find Part Number
            i = start + 1
            while i < len(lines) and lines[i] != 'Part Number':
                i += 1
            if i >= len(lines):
                return None, None, []
            
            # Count header columns
            header_start = i + 1
            header_count = 0
            j = header_start
            while j < len(lines) and lines[j] and not is_pn(lines[j]):
                # Count distinct header labels (skip empty/continuation lines)
                if lines[j] and not re.match(r'^[\(（]', lines[j]):
                    header_count += 1
                j += 1
            
            # Extract products and their value counts
            products = []
            i = j  # first PN
            cp = None; cv = 0
            
            while i < len(lines):
                l = lines[i]
                
                # Stop at next section
                if l and re.match(r'^[\u4e00-\u9fff]+$', l) and len(l) <= 30:
                    if l != section_name and 'Part Number' not in l and 'CATALOG' not in l:
                        if cp:
                            products.append((cp, cv))
                        return header_count, products, lines[start:i]
                
                if not l:
                    i += 1; continue
                
                if is_pn(l):
                    if cp:
                        products.append((cp, cv))
                    cp = l; cv = 0
                elif cp is not None:
                    cv += 1
                
                i += 1
            
            if cp:
                products.append((cp, cv))
            return header_count, products, lines[start:i]
    return None, None, []

# ── Scan all TOC sections ──
TOC_SECTIONS = [
    '高压运算放大器(Vs ＞10V)', '低压运算放大器(Vs ＜10V)', '精密运算放大器(Vos ＜＝1mV)',
    '高速运算放大器(GBW ＞＝50MHz)', '低功耗运算放大器 (Iq Per Ch <= 50μa)',
    '小尺寸封装运算放大器 (DFN, QFN, Wafer-Level CSP)', '音频线路驱动', '视频滤波驱动',
    '隔离放大器和调制器', '比较器', '电流信号检测放大器', '仪表放大器', '差动放大器',
    '对数放大器', '带电压基准的放大器', '匹配电阻网络', '传感器接口',
    '线性充电芯片', '高边驱动', '电池监控',
    '精密数模转换器(DAC)', '精密模数转换器（ADC）', '高速数模转换器（DAC）',
    '高速模数转换器（ADC）', '数字式电流/功率检测器', '多通道可配置模数/数模转换器',
    '温度传感器', '宽压降压变换器', '中压降压变换器', '低压降压变换器',
    '功率级DrMOS', '升压变换器', '以太网供电', '隔离电源',
    '直流马达驱动', '步进马达驱动', '隔离栅极驱动', '非隔离栅极驱动',
    '高压模拟开关', '低压模拟开关', '电平转换器', 'IO 扩展器',
    'CAN 收发器', 'LIN 收发器', 'RS232 收发器', 'RS485 收发器',
    'SBC', 'MLVDS', '高速数据复用器/解复用器', '收发器',
    '数字隔离器', '隔离RS485', '隔离CAN', '隔离I2C',
    '低压LDO', '高压 LDO', '并联型电压基准', '串联型电压基准',
    '电子保险丝', '理想二极管|ORing 控制器', '高边开关', '负载开关',
    '电源时序控制', '复位芯片', '集成看门狗的复位芯片',
    '与门', '自动方向',
]

TOC_SECTIONS_2 = [
    '1 节-检测MOS', '1 节-检测Rsense', '1 节-复合IC',
    '3~16 节-全功能保护', '2~16 节-次级保护', '电池均衡IC',
]

print('=== Multi-line value detection ===')
issues = []

for sec in TOC_SECTIONS + TOC_SECTIONS_2:
    headers, products, lines = get_section_info(doc, sec)
    if headers is None:
        continue
    
    # Expected value count = headers - 1 (minus Part Number column)
    expected = headers - 1
    
    mismatches = [(pn, count) for pn, count in products if count != expected and count > 0]
    
    if mismatches:
        issues.append((sec, expected, mismatches))
        print(f'  [{sec}] expected {expected} values:')
        for pn, count in mismatches:
            diff = count - expected
            print(f'    {pn}: got {count} values (diff={diff:+d})')

print(f'\nTotal sections with multi-line issues: {len(issues)}')

doc.close()

#!/usr/bin/env python3
"""
TOC-driven product extraction from 3PEAK PDFs. V2: multi-line product format.

PN Format: One product spans N+1 lines (PN + N data values)
"""
import pymupdf, json, re, argparse, os
from collections import defaultdict, Counter

PN_PAT = re.compile(r'^(?=.*[A-Z])[A-Z0-9]{2,}\d[\w\-]*$')  # Requires at least one letter
PKG_PAT = re.compile(
    r'^(DFN|QFN|SOT|SOP|TSSOP|MSOP|EMSOP|WLCSP|LQFP|TO|ETSSOP|CSP|SC|SOIC|SSOP|HTSSOP|VSSOP)'
    r'\d+[\w\-]*$'
    r'|^(TQFP|WSOP|ESOP|QSOP|TSOT|SO)\d+[\w\-]*$'
)
FAKES = {'RS232', 'RS485', 'SOP18', 'OP14', 'OT89-3', 'TSOT23-6'}

# Sections whose products need the "隔离" compound tag
ISOLATION_SECTIONS = {
    "数字隔离器", "隔离RS485", "隔离CAN", "隔离I2C",
    "隔离电源", "隔离栅极驱动", "隔离放大器和调制器",
}

# For these sections, prepend "隔离" to the tag if not already present
def build_features(grade, tag, section):
    if section in ISOLATION_SECTIONS and not tag.startswith("隔离"):
        return f"{grade} 隔离 {tag}"
    return f"{grade} {tag}"

SECTION_TAG = {
    "高压运算放大器(Vs＞10V)": "运放", "低压运算放大器(Vs＜10V)": "运放",
    "精密运算放大器(Vos ＜＝1mV)": "运放", "高速运算放大器(GBW＞＝50MHz)": "运放",
    "低功耗运算放大器 (Iq Per Ch <= 50μa)": "运放",
    "小尺寸封装运算放大器 (DFN, QFN, Wafer-Level CSP)": "运放",
    "音频线路驱动": "音频功放", "视频滤波驱动": "视频滤波",
    "隔离放大器和调制器": "隔离放大器", "比较器": "比较器",
    "电流信号检测放大器": "电流传感器", "仪表放大器": "仪表放大器",
    "差动放大器": "差动放大器", "对数放大器": "对数放大器",
    "带电压基准的放大器": "电压基准放大器", "匹配电阻网络": "匹配电阻",
    "传感器接口": "传感器接口",
    "线性充电芯片": "线性充电", "高边驱动": "高边驱动", "电池监控": "电池监控",
    "精密数模转换器(DAC)": "DAC", "精密模数转换器（ADC）": "ADC",
    "高速数模转换器（DAC）": "DAC", "高速模数转换器（ADC）": "ADC",
    "数字式电流/功率检测器": "电流传感器",
    "多通道可配置模数/数模转换器": "ADC", "温度传感器": "温度传感器",
    "CAN收发器": "CAN-FD", "LIN收发器": "LIN",
    "RS232收发器": "RS-232", "RS485收发器": "RS-485",
    "SBC": "SBC", "MLVDS": "MLVDS",
    "高速数据复用器/解复用器": "高速数据复用器", "收发器": "CAN-FD",
    "高压模拟开关": "模拟开关", "低压模拟开关": "模拟开关",
    "电平转换器": "电平转换器", "IO 扩展器": "IO扩展器",
    "数字隔离器": "数字隔离器", "隔离RS485": "RS-485",
    "隔离CAN": "CAN-FD", "隔离I2C": "隔离I2C",
    "隔离电源": "隔离电源", "隔离栅极驱动": "隔离栅极驱动",
    "隔离放大器和调制器": "隔离放大器",
    "宽压降压变换器": "DCDC", "中压降压变换器": "DCDC",
    "低压降压变换器": "DCDC", "升压变换器": "DCDC",
    "功率级DrMOS": "DCDC", "以太网供电": "PoE",
    "直流马达驱动": "马达驱动", "步进马达驱动": "马达驱动",
    "非隔离栅极驱动": "非隔离栅极驱动",
    "低压LDO": "LDO", "高压 LDO": "LDO",
    "并联型电压基准": "电压基准", "串联型电压基准": "电压基准",
    "电子保险丝": "电子保险丝", "理想二极管|ORing 控制器": "理想二极管",
    "高边开关": "负载开关", "负载开关": "负载开关",
    "电源时序控制": "电源时序", "复位芯片": "复位芯片",
    "集成看门狗的复位芯片": "复位芯片",
    "与门": "逻辑门", "自动方向": "逻辑门",
    "1节-检测MOS": "BMS", "1节-检测Rsense": "BMS",
    "1节-复合IC": "BMS", "3~16节-全功能保护": "BMS",
    "2~16节-次级保护": "BMS", "电池均衡IC": "BMS",
}

PREFIX_TAG = {
    "TPF": "视频滤波", "TPD160": "高速数据复用器", "TPD100": "音频功放",
    "TPDA": "音频总线",
    "TPT102": "LIN", "TPT103": "LIN",
    "TPT9H": "MLVDS", "TPT9L": "MLVDS",
    "LM": "比较器", "TS": "比较器", "CM": "BMS",
    "TPH": "DCDC", "TPE": "PoE", "TPT762": "数字隔离器",
    "TPT293": "电平转换器", "TPA6": "电流传感器",
    "TPB405": "线性充电", "TPF605": "音频功放",
    "TPM120": "马达驱动", "TPM883": "马达驱动",
    "TPQ05": "负载开关", "TPK103": "电源时序",
    "TPS05P": "电子保险丝", "TPS24": "理想二极管",
    "TPT726": "隔离I2C", "TPB762": "高边驱动",
    "TPM235": "非隔离栅极驱动", "TPM215": "隔离栅极驱动",
    "T74": "逻辑门", "TPC": "DCDC",
    "TPT201": "电平转换器", "TPT202": "电平转换器",
}


def fuzzy(s):
    return s.replace(' ', '').replace('\u3000', '')


def extract_from_pdf(pdf_path):
    doc = pymupdf.open(pdf_path)
    toc = doc.get_toc()
    
    entries = [(lvl, title, page) for lvl, title, page in toc
               if lvl > 1 and title not in ('目录 CATALOG',)]
    children = defaultdict(list)
    for i, (lvl, title, pg) in enumerate(entries):
        for j in range(i - 1, -1, -1):
            pl, pt, pp = entries[j]
            if pl < lvl:
                children[pt].append(title)
                break
    leaf = [(lvl, t, pg) for lvl, t, pg in entries
            if t not in children or not children[t]]
    sorted_leaf = sorted(leaf, key=lambda x: x[2])
    
    # Build page→section mapping — each section owns pages from its start
    # to the next section's start page (or end of PDF for the last section)
    page_section = {}
    for i, (lvl, t, sp) in enumerate(sorted_leaf):
        next_sp = sorted_leaf[i + 1][2] if i + 1 < len(sorted_leaf) else len(doc) + 1
        # Only assign pages the current section actually starts at
        # This prevents earlier sections from claiming pages that overlap
        if sp - 1 not in page_section and sp - 1 < len(doc):
            page_section[sp - 1] = t
        # For multi-page sections, also claim intermediate pages
        for pg in range(sp, min(next_sp, len(doc) + 1)):
            pg_idx = pg - 1
            if pg_idx < len(doc) and pg_idx not in page_section:
                page_section[pg_idx] = t

    all_products = {}

    for pg_idx in range(len(doc)):
        default_section = page_section.get(pg_idx, 'unknown')
        
        text = doc[pg_idx].get_text()
        lines = text.split('\n')
        
        # Override: if page starts with a known section title, use that instead
        for line in lines[:5]:  # Check first 5 lines for a section title
            stripped = line.strip()
            if not stripped: continue
            for _, t2, _ in leaf:
                if fuzzy(stripped) == fuzzy(t2):
                    default_section = t2
                    break
            else:
                continue
            break
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Determine section context: look backward for the nearest section title
            section = default_section
            for j in range(i-1, max(0, i-20), -1):
                lj = lines[j].strip()
                if not lj: continue
                for _, t2, _ in leaf:
                    if fuzzy(lj) == fuzzy(t2) and t2 != default_section:
                        section = t2
                        break
                if section != default_section:
                    break
            
            tag = SECTION_TAG.get(section, '通用')
            if 'Part Number' not in line and line != 'WPN':
                i += 1
                continue
            
            pn_header_idx = i
            i += 1
            
            # Collect header lines until we hit a PN
            headers = []
            while i < len(lines):
                li = lines[i].strip()
                if not li:
                    i += 1
                    continue
                if PN_PAT.match(li) and not PKG_PAT.match(li):
                    break  # Found first product PN
                if 'Part Number' in li or li == 'WPN':
                    break  # Another header block
                headers.append(li)
                i += 1
            
            if not headers:
                continue
            
            # Now parse products: each product = PN line + N data lines
            while i < len(lines):
                li = lines[i].strip()
                if not li:
                    i += 1
                    continue
                
                # Stop if we hit another section
                if any(fuzzy(li) == fuzzy(t2) for _, t2, _ in leaf if t2 != section):
                    break
                if 'Part Number' in li or li == 'WPN':
                    break
                
                if not PN_PAT.match(li) or PKG_PAT.match(li) or li in FAKES:
                    i += 1
                    continue
                
                pn = li
                i += 1
                
                # Collect data values for this product
                # Read up to len(headers) values, or until next PN / section
                data_values = []
                while i < len(lines) and len(data_values) < len(headers):
                    li2 = lines[i].strip()
                    i += 1
                    if not li2:
                        continue  # Skip empty lines between values
                    if PN_PAT.match(li2) and not PKG_PAT.match(li2):
                        i -= 1  # Backtrack — next product
                        break
                    if 'Part Number' in li2 or li2 == 'WPN':
                        i -= 1  # Next header block
                        break
                    # Also stop if this looks like a section title
                    if len(li2) > 3 and len(li2) < 50:
                        is_section = False
                        for _, t2, _ in leaf:
                            if fuzzy(li2) == fuzzy(t2) and t2 != section:
                                is_section = True
                                break
                        if is_section:
                            i -= 1
                            break
                    data_values.append(li2)
                
                if not data_values:
                    continue  # genuinely no data — skip
                
                # Handle partial data: if data_values < len(headers), still keep it
                # (products at page boundaries may have incomplete data)
                
                # Determine grade
                combined = ' '.join(data_values).lower()
                grade = '车规AEC-Q100' if ('automotive' in combined or 'q100' in combined) else '工业级'
                
                # Build params: pair each header with its value (best effort)
                params_parts = []
                for k, h in enumerate(headers):
                    val = data_values[k] if k < len(data_values) else ''
                    params_parts.append(f'{h}: {val}')
                
                all_products[pn] = {
                    'part_number': pn,
                    '_features': build_features(grade, tag, section),
                    '_raw': ' | '.join(data_values),
                    '_params': ' | '.join(params_parts),
                    '_section': section,
                }
            
            i += 1

    # Apply PN prefix overrides
    for pn, prod in all_products.items():
        parts = prod['_features'].split()
        current_tag = parts[-1] if len(parts) > 1 else parts[0]
        grade = parts[0] if parts else '工业级'
        for prefix in sorted(PREFIX_TAG.keys(), key=len, reverse=True):
            if pn.startswith(prefix):
                new_tag = PREFIX_TAG[prefix]
                if new_tag != current_tag:
                    prod['_features'] = f'{grade} {new_tag}'
                break

    return list(all_products.values())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', required=True)
    parser.add_argument('--vendor', required=True)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    
    print(f"Extracting: {args.pdf}")
    products = extract_from_pdf(args.pdf)
    
    td = Counter()
    empty_params = 0
    for p in products:
        parts = p['_features'].split()
        td[parts[-1]] += 1
        if not p.get('_params', ''): empty_params += 1
    
    print(f"Total: {len(products)} | Empty params: {empty_params}")
    for tag, cnt in td.most_common(): print(f"  {tag:16s}: {cnt:3d}")
    
    if args.dry_run:
        print("\n[dry-run]")
        return
    
    data_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             'web/public/data/products_structured.json')
    with open(data_path) as f: data = json.load(f)
    data[args.vendor] = {'name': data.get(args.vendor, {}).get('name', args.vendor),
                          'productCount': len(products), 'products': products}
    with open(data_path, 'w') as f: json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n✓ Saved {len(products)} products")


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""extract_auto: 思瑞浦-汽车产品选型册 适配器
Flat table format: 产品类别 | 产品型号 | 状态 | 封装 | 产品描述 | 可替代产品 | 应用领域
"""
import pymupdf, json, re, argparse, os

PN_PAT = re.compile(r'^(?=.*[A-Z])[A-Z0-9]{2,}\d[\w\-]*$')
PKG_PAT = re.compile(r'^(DFN|QFN|SOP|TSSOP|MSOP|EMSOP|WLCSP|LQFP|TO|ETSSOP|CSP|SC|SOIC|SSOP|HTSSOP|VSSOP|SOT|TQFP|WSOP)\d')

CATEGORY_MAP = {
    '比较器': '比较器', '运算放大器': '运放', '电压基准': '电压基准',
    'LDO': 'LDO', '复位芯片': '复位芯片', '模拟开关': '模拟开关',
    '电平转换': '电平转换器', '隔离': '数字隔离器',
    'CAN': 'CAN-FD', 'LIN': 'LIN', 'SBC': 'SBC',
    '马达驱动': '马达驱动', '栅极驱动': '栅极驱动',
    '电流检测': '电流传感器', '温度传感器': '温度传感器',
}

# Known PN prefixes → additional tags
PREFIX_EXTRA = {
    'TPA5': '运放', 'TPA2': '运放', 'LM': '比较器',
    'TPT104': 'CAN-FD', 'TPT102': 'LIN',
}

GRADE_MAP = {'量产': '工业级', '车规': '车规AEC-Q100'}

def extract(pdf_path):
    doc = pymupdf.open(pdf_path)
    products = {}
    
    for pg_idx in range(len(doc)):
        text = doc[pg_idx].get_text()
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        i = 0
        while i < len(lines):
            line = lines[i]
            # Look for category header that matches a known category
            cat = None
            for kw in CATEGORY_MAP:
                if kw in line and len(line) < 10:
                    cat = CATEGORY_MAP.get(kw, kw)
                    break
            if not cat:
                # Check if line looks like a product category from the TOC
                i += 1
                continue
            
            i += 1
            # Now parse products under this category
            while i < len(lines):
                li = lines[i]
                # Check if we hit a new category
                is_new_cat = False
                for kw in CATEGORY_MAP:
                    if kw in li and len(li) < 10 and i < len(lines) - 1:
                        # Verify next line looks like a PN
                        nxt = lines[i+1] if i+1 < len(lines) else ''
                        if PN_PAT.match(nxt) and not PKG_PAT.match(nxt):
                            is_new_cat = True
                            break
                if is_new_cat:
                    break
                
                if not PN_PAT.match(li) or PKG_PAT.match(li):
                    i += 1
                    continue
                
                pn = li
                i += 1
                
                # Collect the 6 remaining fields (状态, 封装, 产品描述, 可替代产品, 应用领域)
                fields = []
                while i < len(lines) and len(fields) < 6:
                    fl = lines[i]
                    if PN_PAT.match(fl) and not PKG_PAT.match(fl):
                        break  # next PN, stop collecting
                    # Check if this is a new category
                    is_new = False
                    for kw in CATEGORY_MAP:
                        if kw in fl and len(fl) < 10:
                            is_new = True
                            break
                    if is_new:
                        break
                    fields.append(fl)
                    i += 1
                
                if len(fields) < 3:
                    continue
                
                status = fields[0] if len(fields) > 0 else ''
                pkg = fields[1] if len(fields) > 1 else ''
                desc = fields[2] if len(fields) > 2 else ''
                alt = fields[3] if len(fields) > 3 else ''
                app = fields[4] if len(fields) > 4 else ''
                
                grade = '车规AEC-Q100'  # automotive catalog is all automotive
                # Build features
                feat_parts = [grade, cat]
                
                # Add extra tags from description
                desc_lower = desc.lower()
                if 'comparator' in desc_lower:
                    if '比较器' not in feat_parts: feat_parts.append('比较器')
                if 'op' in desc_lower or 'amplifier' in desc_lower:
                    if '运放' not in feat_parts: feat_parts.append('运放')
                if 'ldo' in desc_lower or 'linear regulator' in desc_lower:
                    if 'LDO' not in feat_parts: feat_parts.append('LDO')
                
                # Prefix-based extra tags
                for pf, tag in PREFIX_EXTRA.items():
                    if pn.startswith(pf) and tag not in feat_parts:
                        feat_parts.append(tag)
                
                feat = ' '.join(feat_parts)
                
                params_parts = [
                    f'Status: {status}',
                    f'Package: {pkg}',
                    f'Description: {desc}',
                ]
                if alt and alt != '/':
                    params_parts.append(f'Alternate: {alt}')
                if app and app != '/':
                    params_parts.append(f'Application: {app}')
                
                products[pn] = {
                    'part_number': pn,
                    '_features': feat,
                    '_raw': ' | '.join([status, pkg, desc, alt, app]),
                    '_params': ' | '.join(params_parts),
                    '_section': cat
                }
    
    return list(products.values())

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--pdf', required=True)
    p.add_argument('--vendor', required=True)
    p.add_argument('--dry-run', action='store_true')
    a = p.parse_args()
    
    prods = extract(a.pdf)
    print(f"Total: {len(prods)}")
    
    if a.dry_run:
        from collections import Counter
        td = Counter()
        for x in prods:
            ft = x['_features'].split()
            td[ft[-1] if ft else '?'] += 1
        for t, c in td.most_common(20):
            print(f"  {t:12s}: {c:3d}")
        return
    
    dp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      'web/public/data/products_structured.json')
    with open(dp) as f:
        d = json.load(f)
    d[a.vendor] = {
        'name': d.get(a.vendor, {}).get('name', a.vendor),
        'productCount': len(prods),
        'products': prods
    }
    with open(dp, 'w') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(f"\n✓ Saved {len(prods)} products")

if __name__ == '__main__':
    main()

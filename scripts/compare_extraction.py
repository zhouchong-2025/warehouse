#!/usr/bin/env python3
"""
compare_extraction.py — 新旧提取数据对比工具

对比 .pre_coord.bak (旧v4提取) vs 当前 products_structured.json (新坐标法提取)
输出:
  - 产品总数变化
  - 碎片表头率对比 (30%→目标<1%)
  - 每section款数变化
  - 丢失/新增PN清单
  - 参数质量对比

用法:
  python3 scripts/compare_extraction.py
"""

import json, sys, os
from collections import Counter, defaultdict

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "web", "public", "data")

OLD_PATH = os.path.join(DATA_DIR, "products_structured.json.pre_coord.bak")
NEW_PATH = os.path.join(DATA_DIR, "products_structured.json")

# ▶ 碎片表头判定模式
FRAG_PATTERNS = [
    r'^\s*\(.*\)\s*$',           # 纯括号: (V), (typ), (MHz), (max)
    r'^\s*\(.*\)\s*\(.*\)\s*$',  # 双括号: (typ) (μA)
    r'^\(V\)$', r'^\(℃\)$', r'^\(mA\)$', r'^\(μA\)$',
    r'^\(MHz\)$', r'^\(kHz\)$', r'^\(Mbps\)$',
    r'^\(typ\)$', r'^\(max\)$', r'^\(min\)$',
    r'^\(Typ\)$', r'^\(Max\)$', r'^\(Min\)$',
    r'^\s*to\s*$', r'^\s*at\s*$', r'^\s*=\s*$',
    r'^\s*Voltage:\s*$', r'^\s*Channels:\s*$', r'^\s*channel\s*\(.*$',
    r'^\s*at\s+G=\d+.*$',
]
# 合法短列名白名单(不是碎片)
VALID_SHORT = {'CH', 'INL', 'DNL', 'SNR', 'GBW', 'VIN', 'VDD', 'VCC', 'VEE',
               'Ron', 'Iq', 'Ib', 'Vos', 'BW', 'THD', 'MP', 'MSL'}

import re

def is_fragment(col_name):
    """判断单个列名是否为碎片"""
    col = col_name.strip()
    if not col:
        return True
    if col in VALID_SHORT:
        return False
    # 含中文的列名不是碎片(中文表头都是完整的)
    if re.search(r'[\u4e00-\u9fff]', col):
        return False
    if len(col) <= 2 and col.upper() == col:
        return True  # 纯大写短串可能是碎片(除白名单)
    for pat in FRAG_PATTERNS:
        if re.match(pat, col):
            return True
    return False

def count_fragments(product):
    """统计单个产品的碎片列名数"""
    params = product.get('_params', '')
    if not params:
        return 0, 0, []
    parts = params.split(' | ')
    total = 0
    frag = 0
    frag_names = []
    for part in parts:
        if ': ' in part or ':' in part:
            total += 1
            col_name = part.split(':', 1)[0].strip()
            if is_fragment(col_name):
                frag += 1
                frag_names.append(col_name)
    return total, frag, frag_names

def load_products(filepath):
    with open(filepath) as f:
        data = json.load(f)
    vendor_data = data.get('3peak-analog', {})
    if isinstance(vendor_data, dict):
        return vendor_data.get('products', [])
    return vendor_data

def main():
    old = load_products(OLD_PATH)
    new = load_products(NEW_PATH)

    print("=" * 70)
    print("新旧提取数据对比报告")
    print("=" * 70)

    # ─── 1. 产品总数 ───
    print(f"\n📊 产品总数")
    print(f"  旧(v4): {len(old)} 款")
    print(f"  新(坐标法): {len(new)} 款")
    print(f"  变化: {len(new) - len(old):+d} 款")

    # ─── 2. 碎片表头率 ───
    print(f"\n📊 碎片表头率")
    old_frag_count = 0
    old_frag_products = []
    for p in old:
        total, frag, names = count_fragments(p)
        if frag > 0:
            old_frag_count += 1
            old_frag_products.append((p['part_number'], p.get('_section', '?'), frag, total, names[:5]))
    
    new_frag_count = 0
    new_frag_products = []
    for p in new:
        total, frag, names = count_fragments(p)
        if frag > 0:
            new_frag_count += 1
            new_frag_products.append((p['part_number'], p.get('_section', '?'), frag, total, names[:5]))

    print(f"  旧(v4): {old_frag_count}/{len(old)} = {old_frag_count/len(old)*100:.1f}%")
    print(f"  新(坐标法): {new_frag_count}/{len(new)} = {new_frag_count/len(new)*100:.1f}%")

    if new_frag_count > 0 and len(new) > 0:
        pct = new_frag_count/len(new)*100
        status = "✅ 达标" if pct < 1.0 else "⚠️ 需排查"
        print(f"  碎片率: {pct:.1f}% {status}")
        if new_frag_products:
            print(f"  残留碎片产品 (前10):")
            for pn, sec, f, t, names in new_frag_products[:10]:
                print(f"    {pn} [{sec}] {f}/{t}: {names}")

    # ─── 3. PN 对比 ───
    old_pns = {p['part_number'] for p in old}
    new_pns = {p['part_number'] for p in new}
    lost = old_pns - new_pns
    gained = new_pns - old_pns
    common = old_pns & new_pns

    print(f"\n📊 PN 对比")
    print(f"  共有: {len(common)} 款")
    print(f"  丢失(旧有新无): {len(lost)} 款")
    if lost:
        # 找出丢失的PN的section
        lost_info = [(pn, next((p.get('_section','?') for p in old if p['part_number']==pn), '?')) for pn in lost]
        for pn, sec in sorted(lost_info):
            print(f"    {pn} [{sec}]")
    print(f"  新增(新有旧无): {len(gained)} 款")
    if gained:
        gained_info = [(pn, next((p.get('_section','?') for p in new if p['part_number']==pn), '?')) for pn in gained]
        for pn, sec in sorted(gained_info)[:20]:
            print(f"    {pn} [{sec}]")
        if len(gained) > 20:
            print(f"    ... 共 {len(gained)} 款新增")

    # ─── 4. Section 款数对比 ───
    print(f"\n📊 Section 款数变化 (Top 20 差异)")
    old_secs = Counter(p.get('_section', '?') for p in old)
    new_secs = Counter(p.get('_section', '?') for p in new)
    all_secs = set(list(old_secs.keys()) + list(new_secs.keys()))
    diffs = []
    for sec in all_secs:
        o = old_secs.get(sec, 0)
        n = new_secs.get(sec, 0)
        if o != n:
            diffs.append((sec, o, n, n - o))
    diffs.sort(key=lambda x: abs(x[3]), reverse=True)
    for sec, o, n, d in diffs[:20]:
        print(f"  {sec}: {o}→{n} ({d:+d})")

    # ─── 5. 参数质量对比 (共有PN) ───
    print(f"\n📊 参数质量对比 (共有PN的 _params 长度)")
    old_params = {p['part_number']: p.get('_params', '') for p in old}
    new_params = {p['part_number']: p.get('_params', '') for p in new}
    
    old_len_sum = 0
    new_len_sum = 0
    improved = 0
    degraded = 0
    for pn in common:
        ol = len(old_params.get(pn, ''))
        nl = len(new_params.get(pn, ''))
        old_len_sum += ol
        new_len_sum += nl
        if nl > ol:
            improved += 1
        elif nl < ol:
            degraded += 1
    
    if common:
        print(f"  旧平均 _params 长度: {old_len_sum/len(common):.0f} 字符")
        print(f"  新平均 _params 长度: {new_len_sum/len(common):.0f} 字符")
        print(f"  参数更完整: {improved} 款 | 参数减少: {degraded} 款")

    # ─── 6. 多重分类统计 ───
    multi_new = sum(1 for p in new if len(p.get('_sections', [])) > 1)
    print(f"\n📊 多重分类")
    print(f"  新数据多分类产品: {multi_new} 款")

    # ─── 总结 ───
    print(f"\n{'=' * 70}")
    print("总结")
    print(f"{'=' * 70}")
    print(f"  产品总数: {len(old)} → {len(new)} ({len(new)-len(old):+d})")
    print(f"  碎片表头: {old_frag_count/len(old)*100:.1f}% → {new_frag_count/len(new)*100:.1f}%")
    print(f"  丢失PN: {len(lost)} | 新增PN: {len(gained)}")
    print(f"  多分类: {multi_new} 款")

if __name__ == '__main__':
    main()

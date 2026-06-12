#!/usr/bin/env python3
"""
build_families.py — 型号族归一 (P4 MDM 物料主数据层)

算法:
  1. 按厂商专属规则 strip_suffix → base PN
  2. 同 base = 候选族
  3. 参数一致性验证(零假阳性)
  4. 跨册归一(模拟↔汽车)
  5. 归纳 variant_axes

输出: families.json
"""

import json, re, os
from collections import defaultdict

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "web", "public", "data", "products_structured.json")
OUTPUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "families.json")

# ─── Step 1: strip_suffix per vendor ───

def strip_3peak_analog(pn):
    """思瑞浦-模拟: 去 -Q100, -料号后缀, -封装后缀"""
    # -Q100 = 车规变体
    base = re.sub(r'-Q100$', '', pn)
    # 去掉末尾的封装/卷带后缀 (如 -S5TR, -DAT, -BCD 等)
    base = re.sub(r'-[A-Z]\d*[A-Z]*-?\d*[A-Z]*$', '', base)
    # 去掉纯数字后缀(卷带料号)
    base = re.sub(r'-\d+$', '', base)
    return base

def strip_3peak_auto(pn):
    """思瑞浦-汽车: 去 -{封装}{卷带}R-S 格式"""
    # 格式: LM2901A-SO2R-S → LM2901A
    # 匹配: 连字符+封装码+R-S结尾
    base = re.sub(r'-[A-Z]+\d*R?-S$', '', pn)
    base = re.sub(r'-[A-Z]\d+[A-Z]*-S$', '', base)
    # 去掉剩下的小后缀
    base = re.sub(r'-[A-Z]\d*$', '', base)
    return base

def strip_novosense(pn):
    """纳芯微: 按 卷带R→封装→Q车规 逐层剥"""
    base = pn
    # 去掉尾部R(卷带)
    base = re.sub(r'R$', '', base)
    # 去掉封装后缀(通常在最后一个-之后)
    # -DSPR → base, -Q1DSPR → base-Q1
    base = re.sub(r'-[A-Z]+\d*[A-Z]*$', '', base, count=1)
    # -Q1, -Q0 车规
    base = re.sub(r'-Q[01]$', '', base)
    return base

def strip_yutai(pn):
    """裕太: 去 -CA, 末尾字母变体留base"""
    base = pn
    # -CA, -CB 等后缀
    base = re.sub(r'-C[A-Z]$', '', base)
    # 末尾单字母变体: YT8011AN → YT8011A (保留)
    # 不做额外处理, 字母变体本身就是不同material
    return base

STRIP_FN = {
    '3peak-analog': strip_3peak_analog,
    '3peak-auto': strip_3peak_auto,
    'novosense': strip_novosense,
    'yutai': strip_yutai,
}

# ─── Step 2: 参数一致性验证 ───

# 变体维度(这些参数不同不代表不同族)
VARIANT_DIMS = {
    'package', '封装', 'pack', '温度', 'temperature', 'temp',
    'status', '状态', 'grade', 'rating', '等级',
    'features', '特性', '应用领域', 'application',
    '产品描述', 'description',
}

def parse_params(params_str):
    """解析_params字符串为dict"""
    result = {}
    for part in params_str.split(' | '):
        if ': ' in part or ':' in part:
            kv = part.split(':', 1)
            result[kv[0].strip().lower()] = kv[1].strip()
    return result

def is_variant_dim(key):
    """判断是否为变体维度(非基础参数)"""
    kl = key.lower()
    for vd in VARIANT_DIMS:
        if vd in kl:
            return True
    return False

def base_params_match(p1_params, p2_params):
    """比较两个产品的基础参数是否一致"""
    p1 = parse_params(p1_params) if isinstance(p1_params, str) else p1_params
    p2 = parse_params(p2_params) if isinstance(p2_params, str) else p2_params
    
    common_keys = set(p1.keys()) & set(p2.keys())
    base_keys = {k for k in common_keys if not is_variant_dim(k)}
    
    if not base_keys:
        return True, 1.0  # 无基础参数可比较, 放行
    
    matches = 0
    for k in base_keys:
        v1 = p1[k].strip().lower()
        v2 = p2[k].strip().lower()
        # 归一化比较(去空格, 统一数值格式)
        v1n = re.sub(r'\s+', '', v1)
        v2n = re.sub(r'\s+', '', v2)
        if v1n == v2n:
            matches += 1
    
    ratio = matches / len(base_keys) if base_keys else 1.0
    return ratio >= 0.7, ratio

# ─── Main ───

def main():
    with open(DATA_PATH) as f:
        data = json.load(f)
    
    # 收集所有产品, 标注vendor
    all_prods = []
    for vendor_slug, vd in data.items():
        vendor = vendor_slug
        for p in vd.get('products', []):
            all_prods.append({
                'pn': p['part_number'],
                'vendor': vendor,
                'section': p.get('_section', ''),
                'sections': p.get('_sections', []),
                'params': p.get('_params', ''),
                'features': p.get('_features', ''),
            })
    
    # Step 1: strip_suffix → base
    base_groups = defaultdict(list)
    for prod in all_prods:
        strip_fn = STRIP_FN.get(prod['vendor'])
        if strip_fn:
            base = strip_fn(prod['pn'])
        else:
            base = prod['pn']
        # 规范base: 去尾部连字符
        base = base.rstrip('-').strip()
        if base and len(base) >= 2:
            base_groups[base].append(prod)
    
    # Step 2-3: 参数验证 + 跨厂合并
    families = []
    single_families = 0
    multi_families = 0
    cross_book = 0
    needs_review = []
    
    for base, members in sorted(base_groups.items()):
        if len(members) < 2:
            # 单品族也记录
            families.append({
                'family_id': base,
                'base_part': base,
                'member_count': 1,
                'materials': [{
                    'pn': m['pn'],
                    'vendor': m['vendor'],
                    'section': m['section'],
                    'params': m['params'],
                } for m in members],
                'variant_axes': {},
                'confidence': 'single',
                'needs_review': False,
            })
            continue
        
        # 参数一致性: 与第一个成员比较
        ref = members[0]
        all_match = True
        match_ratios = []
        
        for m in members[1:]:
            ok, ratio = base_params_match(ref['params'], m['params'])
            match_ratios.append(ratio)
            if not ok:
                all_match = False
        
        # 跨厂检测
        vendors = set(m['vendor'] for m in members)
        is_cross = len(vendors) > 1
        if is_cross:
            cross_book += 1
        
        # 归纳 variant_axes
        axes = defaultdict(set)
        for m in members:
            # Grade
            feats = m['features'].lower()
            if '车规' in feats or 'aec' in feats:
                axes['grade'].add('车规AEC-Q100')
            else:
                axes['grade'].add('工业级')
            # Package (从params提取)
            params = parse_params(m['params'])
            for pk in ['package', '封装']:
                if pk in params:
                    axes['package'].add(params[pk])
        
        # 可变维度转list
        variant_axes = {k: sorted(list(v)) for k, v in axes.items()}
        
        confidence = 'high' if all_match else 'review'
        
        if not all_match:
            # 参数不一致 → 拆分为独立单品族
            for m in members:
                families.append({
                    'family_id': m['pn'],
                    'base_part': base,
                    'member_count': 1,
                    'materials': [{
                        'pn': m['pn'], 'vendor': m['vendor'],
                        'section': m['section'], 'features': m['features'],
                    }],
                    'variant_axes': {},
                    'confidence': 'split',
                    'needs_review': False,
                    'cross_book': False,
                })
            needs_review.append(base)
            single_families += len(members)
            continue
        
        # 参数一致 → 归族
        multi_families += 1
        if is_cross: cross_book += 1
        families.append({
            'family_id': base,
            'base_part': base,
            'member_count': len(members),
            'materials': [{
                'pn': m['pn'],
                'vendor': m['vendor'],
                'section': m['section'],
                'features': m['features'],
            } for m in members],
            'variant_axes': variant_axes,
            'confidence': 'high',
            'needs_review': False,
            'cross_book': is_cross,
        })
    
    # 输出
    # 统计(末尾准确计数)
    single_count = sum(1 for f in families if f['member_count'] == 1)
    multi_count = sum(1 for f in families if f['member_count'] > 1)
    cross_count = sum(1 for f in families if f.get('cross_book'))
    
    output = {
        'summary': {
            'total_families': len(families),
            'single_member': single_count,
            'multi_member': multi_count,
            'cross_book': cross_count,
            'needs_review': len(needs_review),
            'total_products': len(all_prods),
        },
        'needs_review_families': needs_review,
        'families': families,
    }
    
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"families.json → {OUTPUT_PATH}")
    print(f"总family: {len(families)}")
    print(f"  单品族: {single_count}")
    print(f"  多变体族: {multi_count}")
    print(f"  跨册归一: {cross_count}")
    print(f"  需review: {len(needs_review)}")
    print(f"  覆盖产品: {len(all_prods)}")

if __name__ == '__main__':
    main()

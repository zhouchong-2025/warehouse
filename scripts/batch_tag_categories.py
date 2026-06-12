#!/usr/bin/env python3
"""Batch-tag all products based on category field + add missing FAE tags."""
import json, re

DATA_PATH = '/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'
data = json.load(open(DATA_PATH))

# Category → tag mapping (FAE-grade)
CATEGORY_TAG_MAP = {
    '隔离放大器和调制器': ['隔离放大器'],
    '隔离栅极驱动': ['隔离栅极驱动', '栅极驱动'],
    '数字隔离器': ['数字隔离器'],
    '高压LDO': ['LDO', '高压(≥30V)'],
    '低压LDO': ['LDO'],
    '降压变换器': ['DCDC', '降压'],
    '升压变换器': ['DCDC', '升压'],
    '串联型电压基准': ['电压基准'],
    '并联型电压基准': ['电压基准'],
    '高精度ADC': ['ADC'],
    '比较器': ['比较器'],
    '复位芯片': ['复位芯片'],
    'IO 扩展器': ['IO扩展'],
    '步进马达驱动': ['马达驱动'],
    '高边开关': ['负载开关', '高边开关'],
    '低压模拟开关': ['模拟开关'],
    '非隔离栅极驱动': ['栅极驱动'],
    '电流信号检测放大器': ['电流检测', '放大器'],
    '微功耗放大器': ['运放', '超低功耗(≤1µA)', '放大器'],
    '零漂运算放大器': ['运放', '精密(≤1mV Vos)', '放大器'],
    '低压运算放大器': ['运放', '放大器'],
    '高压运算放大器': ['运放', '高压(≥30V)', '放大器'],
    'CAN 收发器': ['CAN FD'],
    'LIN 收发器': ['LIN'],
}

# Section keyword → tag mapping (when category is missing)
SECTION_TAG_MAP = {
    'LDO': ['LDO'],
    'DCDC': ['DCDC'],
    '比较器': ['比较器'],
    'ADC': ['ADC'],
    'DAC': ['DAC'],
    '马达': ['马达驱动'],
    '驱动': [],  # too broad, skip
    '开关': [],  # too broad
    '接口': [],  # too broad
}

def merge_tags(existing, new_tags):
    """Merge tags, avoiding duplicates and keeping existing ones."""
    current = set(existing.split()) if existing.strip() else set()
    for t in new_tags:
        if t not in current:
            current.add(t)
    return ' '.join(sorted(current))

tagged_count = 0
for slug, vd in data.items():
    for p in vd['products']:
        cat = p.get('category', '')
        section = p.get('_section', '')
        part = p.get('_raw', '') + ' ' + p.get('_params', '')
        existing_ft = p.get('_features', '')
        
        new_tags = set()
        
        # 1. Category-based tagging
        for cat_key, tags in CATEGORY_TAG_MAP.items():
            if cat_key in cat:
                for t in tags:
                    new_tags.add(t)
        
        # 2. Section-based supplement (when category didn't cover it)
        if not new_tags:
            for sec_key, tags in SECTION_TAG_MAP.items():
                if sec_key in section and tags:
                    for t in tags:
                        new_tags.add(t)
        
        # 3. Existing tags that should be preserved
        # (grade tags like 工业级/车规/消费级, specific features like 轨到轨 etc.)
        
        if new_tags:
            merged = merge_tags(existing_ft, new_tags)
            if merged != existing_ft:
                p['_features'] = merged
                tagged_count += 1

# Fix split tags: CAN+FD, T1+PHY, 特定帧唤醒, 精密(≤1mV
for slug, vd in data.items():
    for p in vd['products']:
        ft = p.get('_features', '')
        # Fix CAN FD splitting
        if ' CAN ' in ft and ' FD ' in ft:
            ft = ft.replace(' CAN ', ' ').replace(' FD ', ' ') + ' CAN FD'
        elif ' CAN' in ft.split() and 'FD' in ft.split():
            ft = ft.replace(' CAN ', ' ').replace(' FD ', ' ') + ' CAN FD'
        # Fix T1 PHY
        if ' T1 ' in ft and ' PHY ' in ft:
            ft = ft.replace(' T1 ', ' ').replace(' PHY ', ' ') + ' T1 PHY'
        # Fix 特定帧唤醒(Partial Networking)
        if '特定帧唤醒(Partial' in ft:
            ft = ft.replace('特定帧唤醒(Partial', '').replace('Networking)', '') + ' 特定帧唤醒(Partial Networking)'
        # Fix 精密(≤1mV Vos)
        if '精密(≤1mV' in ft:
            ft = ft.replace('精密(≤1mV', '').replace('Vos)', '') + ' 精密(≤1mV Vos)'
        # Clean up double spaces
        ft = ' '.join(ft.split())
        p['_features'] = ft

json.dump(data, open(DATA_PATH, 'w'), ensure_ascii=False, indent=2)

# Stats
for slug, vd in data.items():
    no_ft = sum(1 for p in vd['products'] if not p.get('_features','').strip())
    nm = vd['name']
    pc = vd['productCount']
    print(f'{nm}: {pc} products, {no_ft} untagged')

# New tag inventory
all_tags = set()
for vd in data.values():
    for p in vd['products']:
        for t in p.get('_features','').split():
            if t: all_tags.add(t)
print(f'\nNew tags ({len(all_tags)}): {sorted(all_tags)}')
print(f'\nTagged {tagged_count} products')

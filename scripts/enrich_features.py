#!/usr/bin/env python3
"""
enrich_features.py — 从 _params/_detail 散文提取结构化 _features token

Phase 1 (确定性): 用 EVIDENCE_RULES 的 textPattern 直接匹配。
Phase 2 (LLM 兜底): 对 pattern 未覆盖的语义特征，LLM 批量提取。
"""

import json, sys, os

DATA_PATH = "web/public/data/products_structured.json"
BACKUP_PATH = "web/public/data/products_structured.json.bak"

# ── 确定性规则（与 constraint-match.ts EVIDENCE_RULES 同步） ──
# 格式: (feature_tag, regex_pattern)
DETERMINISTIC_RULES = [
    # Protection features
    ("短路保护", r"短路|short[\s-]?circuit|scp"),
    ("过温保护", r"过温|过热|thermal[\s-]?shutdown|otp"),
    ("开路诊断", r"开路(?!诊断)|open[\s-]?load|open[\s-]?drain"),
    ("过载保护", r"过载|over[\s-]?load"),
    ("过流保护", r"过流|over[\s-]?current|ocp"),
    ("DESAT保护", r"desat|退饱和|去饱和"),
    # Functional features
    ("米勒钳位", r"miller[\s-]?clamp|米勒钳位"),
    # Wake/sleep features
    ("唤醒", r"wake|wake[\s-]?up"),
    ("待机模式", r"standby|sleep|待机|休眠|slp\b|inh\b|low\s*iq|psm|pulse\s*skip|低静态|低待机|burst\s*mode"),
    ("使能", r"enable|en\b"),
    ("PGOOD", r"power[\s-]?good|pg\b"),
    ("软启动", r"soft[\s-]?start|ss\b"),
    ("同步整流", r"sync(?:hronous)?[\s-]?rectif"),
    ("扩频", r"spread[\s-]?spectrum|dither"),
    ("外部同步", r"external[\s-]?sync|ext[\s-]?clk"),
    ("推挽/开漏", r"push[\s-]?pull|open[\s-]?drain|推挽|开漏"),
    ("可调输出", r"adjustable|可调"),
    ("轨到轨", r"rail[\s-]?rail|轨到轨|rrio"),  # 见下方特殊处理：排除 Rail-Rail In: No
    ("半双工", r"半双工|half[\s-]?duplex"),
    ("全双工", r"全双工|full[\s-]?duplex"),
    # Speed indicators (from prose → into _features)
    ("百兆", r"\bfe\s+phy\b|百兆|100base-tx"),
    ("千兆", r"\bge\s+phy\b|千兆|gigabit\s+ethernet|1000base-t"),
    ("2.5G", r"2\.5g\w*\s*(?:phy|以太网)|2500base"),
]

import re

def load_data():
    with open(DATA_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_data(data):
    with open(DATA_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def enrich_product(product, stats):
    """Extract features from _params and _detail prose and add to _features."""
    params = (product.get('_params', '') or '').lower()
    detail = ((product.get('_detail_intro', '') or '') + ' ' +
              (product.get('_detail_features', '') or '')).lower()
    all_text = params + ' ' + detail

    features = set((product.get('_features', '') or '').lower().split())
    added = []

    for tag, pattern_str in DETERMINISTIC_RULES:
        if tag.lower() in features:
            continue  # already has it
        if re.search(pattern_str, all_text, re.IGNORECASE):
            # 轨到轨特殊处理：Rail-Rail In: No → 非全轨到轨，跳过
            if tag == '轨到轨' and re.search(r'rail[\s-]rail\s*(?:in|输入)[\s:]*no[\s,]*to[\s-]*v[\s-]*only', all_text, re.IGNORECASE):
                continue
            features.add(tag.lower())
            added.append(tag)

    if added:
        product['_features'] = ' '.join(sorted(features))
        stats['total_added'] += len(added)
        stats['products_modified'] += 1
        stats['by_tag'] = stats.get('by_tag', {})
        for t in added:
            stats['by_tag'][t] = stats['by_tag'].get(t, 0) + 1

    return bool(added)

def main():
    print("Loading data...")
    data = load_data()

    # Backup
    if not os.path.exists(BACKUP_PATH):
        import shutil
        shutil.copy2(DATA_PATH, BACKUP_PATH)
        print(f"Backup: {BACKUP_PATH}")

    stats = {'total_added': 0, 'products_modified': 0}
    total = 0

    for vendor, blob in data.items():
        for product in blob.get('products', []):
            total += 1
            enrich_product(product, stats)

    print(f"\nScanned {total} products across {len(data)} vendors")
    print(f"Modified {stats['products_modified']} products")
    print(f"Added {stats['total_added']} feature tokens")
    print(f"\nBreakdown:")
    for tag, count in sorted(stats.get('by_tag', {}).items(), key=lambda x: -x[1]):
        print(f"  {tag}: {count}")

    save_data(data)
    print(f"\nSaved to {DATA_PATH}")

if __name__ == '__main__':
    main()

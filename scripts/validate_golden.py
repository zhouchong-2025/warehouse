#!/usr/bin/env python3
"""
Golden standard validator — checks extracted products against manually-verified data.

Usage:
  python3 scripts/validate_golden.py [--vendor 3peak-analog]
"""

import json, sys, os
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

GOLDEN_PATH = os.path.join(SCRIPT_DIR, 'golden_standard.json')
DATA_PATH = os.path.join(PROJECT_ROOT, 'web/public/data/products_structured.json')


def main(vendor='3peak-analog'):
    with open(GOLDEN_PATH) as f:
        golden = json.load(f)
    
    with open(DATA_PATH) as f:
        data = json.load(f)
    
    products = {p['part_number']: p for p in data.get(vendor, {}).get('products', [])}
    
    golden_prods = golden['products']
    total = len(golden_prods)
    passed = 0
    missing = 0
    section_mismatch = 0
    tag_mismatch = 0
    
    issues_by_category = defaultdict(list)
    
    for pn, expected in golden_prods.items():
        if pn not in products:
            missing += 1
            issues_by_category[expected.get('tag', '?')].append(f'{pn}: 缺失')
            continue
        
        actual = products[pn]
        errors = []
        
        # Check section
        if expected.get('section') and actual.get('_section', '') != expected['section']:
            errors.append(f'section: 期望"{expected["section"]}", 实际"{actual.get("_section","")}"')
            section_mismatch += 1
        
        # Check tag
        expected_tag = expected['tag']
        actual_features = actual.get('_features', '')
        if expected_tag not in actual_features:
            errors.append(f'tag: 期望含"{expected_tag}", 实际"{actual_features}"')
            tag_mismatch += 1
        
        if errors:
            issues_by_category[expected_tag].append(f'{pn}: {"; ".join(errors)}')
        else:
            passed += 1
    
    # Report
    print(f"Golden Standard: {total} products")
    print(f"  ✓ 通过: {passed}")
    print(f"  ✗ 缺失: {missing}")
    print(f"  ✗ section 不匹配: {section_mismatch}")
    print(f"  ✗ tag 不匹配: {tag_mismatch}")
    print(f"  准确率: {100*passed//total}%")
    
    if issues_by_category:
        print(f"\n问题详情 (按品类):")
        for cat, issues in sorted(issues_by_category.items()):
            print(f"  [{cat}]")
            for issue in issues:
                print(f"    {issue}")
    
    return passed == total


if __name__ == '__main__':
    vendor = sys.argv[1] if len(sys.argv) > 1 else '3peak-analog'
    ok = main(vendor)
    sys.exit(0 if ok else 1)

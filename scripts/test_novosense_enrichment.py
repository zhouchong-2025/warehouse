#!/usr/bin/env python3
"""Regression checks for Novosense table extraction + detail-page merge."""

from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'web' / 'public' / 'data' / 'products_structured.json'


def load_products():
    data = json.loads(DATA.read_text())
    prods = data['novosense']['products']
    return {p['part_number']: p for p in prods}, prods


def assert_has_param(prod, key, expected_substr):
    params = prod.get('_params', '')
    needle = f'{key}: '
    if needle not in params:
        raise AssertionError(f"{prod['part_number']} missing param key: {key}")
    if expected_substr not in params:
        raise AssertionError(f"{prod['part_number']} param {key} missing value fragment: {expected_substr}")


def main():
    idx, prods = load_products()

    nca1043 = idx['NCA1043B-Q1']
    assert_has_param(nca1043, 'VIO 电压(V)', '2.8~5.5')
    assert_has_param(nca1043, '低功耗模式', 'Standby/Sleep')
    assert_has_param(nca1043, 'AEC-Q100', 'Yes')
    assert_has_param(nca1043, '封装类型', 'SOP14/DFN14')
    assert_has_param(nca1043, 'MSL', 'SOP14-MSL3')
    if '振铃抑制' not in nca1043.get('_features', ''):
        raise AssertionError('NCA1043B-Q1 missing 振铃抑制 tag')
    if '高EMC' not in nca1043.get('_features', ''):
        raise AssertionError('NCA1043B-Q1 missing 高EMC tag')
    if '高ESD' not in nca1043.get('_features', ''):
        raise AssertionError('NCA1043B-Q1 missing 高ESD tag')
    if '_detail_intro' not in nca1043 or '振铃抑制' not in nca1043['_detail_intro']:
        raise AssertionError('NCA1043B-Q1 missing merged detail intro')

    nca1462 = idx['NCA1462-Q1']
    if 'SIC' not in nca1462.get('_features', ''):
        raise AssertionError('NCA1462-Q1 missing SIC tag')

    conflict = [p['part_number'] for p in prods if '工业级' in p.get('_features', '') and '车规AEC-Q100' in p.get('_features', '')]
    if conflict:
        raise AssertionError(f'grade conflict remains: {len(conflict)} products, sample={conflict[:8]}')

    merged_detail = [p['part_number'] for p in prods if p.get('_detail_intro') or p.get('_detail_features') or p.get('_detail_apps')]
    if len(merged_detail) < 20:
        raise AssertionError(f'expected >=20 merged detail pages, got {len(merged_detail)}')

    print(f'✅ Novosense enrichment checks passed: detail_pages={len(merged_detail)}, products={len(prods)}')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
import ast
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path('/Users/zhouchong/Projects/warehouse')
DATA = ROOT / 'web/public/data/products_structured.json'
AUTOFIX = ROOT / 'scripts/autofix.py'


def load_section_map():
    text = AUTOFIX.read_text()
    m = re.search(r'SECTION_TO_TAG\s*=\s*\{', text)
    assert m, 'SECTION_TO_TAG not found'
    start = m.end() - 1
    level = 0
    end = None
    for i, ch in enumerate(text[start:], start):
        if ch == '{':
            level += 1
        elif ch == '}':
            level -= 1
            if level == 0:
                end = i + 1
                break
    assert end, 'SECTION_TO_TAG not closed'
    return ast.literal_eval(text[start:end])


SECTION_TO_TAG = load_section_map()


def sec_tag(sec: str):
    if sec in SECTION_TO_TAG:
        return SECTION_TO_TAG[sec]
    return SECTION_TO_TAG.get(sec.replace(' ', ''))


def main():
    obj = json.loads(DATA.read_text())
    nov = obj['novosense']['products']

    canonical_mismatch = []
    sensor_interface_contamination = []
    isolated_gate_digital_contamination = []
    low_side_motor_isolated_contamination = []

    sensor_endpoints = {
        '温度传感器', '电流传感器', '压力传感器', '位置传感器', '速度传感器',
        '线性位置传感器', '霍尔角度编码器', '磁阻角度编码器', '霍尔开关/锁存器', '磁阻开关/锁存器',
    }
    position_generic_leaks = []
    sensor_subcategory_mismatch = []

    for p in nov:
        sec = p.get('_section', '')
        secs = p.get('_sections') or []
        feats = set(str(p.get('_features', '')).split())
        if secs and sec_tag(secs[0]) and sec_tag(sec) != sec_tag(secs[0]):
            canonical_mismatch.append((p['part_number'], sec, secs[0], sec_tag(sec), sec_tag(secs[0])))
        if sec_tag(sec) == '传感器接口' and any(t in feats for t in sensor_endpoints):
            sensor_interface_contamination.append((p['part_number'], sec, sorted(feats & sensor_endpoints)))
        sensor_tag = sec_tag(sec)
        if sensor_tag in {'霍尔角度编码器', '磁阻角度编码器', '霍尔开关/锁存器', '磁阻开关/锁存器'} and '位置传感器' in feats:
            position_generic_leaks.append((p['part_number'], sec, sensor_tag))
        if sensor_tag in {'线性位置传感器', '霍尔角度编码器', '磁阻角度编码器', '霍尔开关/锁存器', '磁阻开关/锁存器'} and sensor_tag not in feats:
            sensor_subcategory_mismatch.append((p['part_number'], sec, sensor_tag, sorted(feats & sensor_endpoints)))
        if sec_tag(sec) == '隔离栅极驱动' and '数字隔离器' in feats:
            isolated_gate_digital_contamination.append((p['part_number'], sec))
        if sec_tag(sec) in {'非隔离栅极驱动', '低边驱动', '马达驱动'} and '隔离栅极驱动' in feats:
            low_side_motor_isolated_contamination.append((p['part_number'], sec))

    assert not canonical_mismatch, canonical_mismatch[:20]
    assert not sensor_interface_contamination, sensor_interface_contamination[:20]
    assert not position_generic_leaks, position_generic_leaks[:20]
    assert not sensor_subcategory_mismatch, sensor_subcategory_mismatch[:20]
    assert not isolated_gate_digital_contamination, isolated_gate_digital_contamination[:20]
    assert not low_side_motor_isolated_contamination, low_side_motor_isolated_contamination[:20]

    pn_to_sec = {p['part_number']: p.get('_section', '') for p in nov}
    assert sec_tag(pn_to_sec['NSI6651ASC-DSWR']) == '隔离栅极驱动'
    assert sec_tag(pn_to_sec['NSD7310-DHSPR']) == '马达驱动'
    assert sec_tag(pn_to_sec['NSD12416-Q1SPR']) == '低边驱动'
    assert sec_tag(pn_to_sec['NSC6272']) == '传感器接口'
    assert sec_tag(pn_to_sec['MT6826S']) == '磁阻角度编码器'
    assert sec_tag(pn_to_sec['NSM3011']) == '霍尔角度编码器'
    assert sec_tag(pn_to_sec['MT9105']) == '线性位置传感器'
    assert sec_tag(pn_to_sec['NSI1050C-DDBR']) == '隔离CAN'

    counts = Counter(sec_tag(p.get('_section', '')) or 'UNMAPPED' for p in nov)
    print('✅ novosense full-category audit passed')
    for key in ['隔离栅极驱动', '非隔离栅极驱动', '低边驱动', '马达驱动', '传感器接口', '隔离CAN', '隔离放大器', '隔离ADC', '数字隔离器', '线性位置传感器', '霍尔角度编码器', '磁阻角度编码器']:
        print(f'{key}:', counts.get(key, 0))


if __name__ == '__main__':
    main()

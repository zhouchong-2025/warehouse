#!/usr/bin/env python3
import json
import urllib.request
from pathlib import Path

DATA = Path('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json')
URL = 'http://127.0.0.1:3000/api/interpret'


def call(query: str):
    req = urllib.request.Request(
        URL,
        data=json.dumps({'query': query}).encode(),
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


def main():
    obj = json.loads(DATA.read_text())
    bad_can = []
    bad_adc = []
    good_amp = []
    for vendor, v in obj.items():
        for prod in v['products']:
            pn = prod.get('part_number', '')
            sec = prod.get('_section', '')
            feats = set(str(prod.get('_features', '')).split())
            if '隔离CAN' in sec and '隔离放大器' in feats:
                bad_can.append(pn)
            if '隔离ADC' in sec and '隔离放大器' in feats:
                bad_adc.append(pn)
            if ('隔离电流放大器' in sec or '隔离电压放大器' in sec or '隔离放大器和调制器' in sec) and '隔离放大器' in feats:
                good_amp.append(pn)

    assert not bad_can, f'isolated CAN contaminated with 隔离放大器: {bad_can[:10]}'
    assert not bad_adc, f'isolated ADC contaminated with 隔离放大器: {bad_adc[:10]}'
    assert good_amp, 'expected real isolated amplifiers to remain tagged'

    payload = call('隔离放大器')
    assert payload.get('must') == ['隔离放大器'], payload
    suggestions = payload.get('suggestions') or []
    text = '\n'.join(s.get('text', '') for s in suggestions)
    assert 'NSI1050' not in text and 'NSI1042' not in text, text

    amp_products = []
    for vendor, v in obj.items():
        for prod in v['products']:
            feats = set(str(prod.get('_features', '')).split())
            if '隔离放大器' in feats:
                amp_products.append(prod.get('part_number'))
    assert 'TPA8000' in amp_products, amp_products[:20]
    assert not any(pn.startswith(('NSI104', 'NSI105')) for pn in amp_products), amp_products

    print('✅ isolation subcategory audit passed')
    print('real isolated amplifier samples=', good_amp[:8])
    print('isolated amplifier corpus size=', len(amp_products), 'sample=', amp_products[:10])


if __name__ == '__main__':
    main()

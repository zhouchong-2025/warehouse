#!/usr/bin/env python3
import json
import urllib.request
from pathlib import Path

URL = 'http://127.0.0.1:3000/api/interpret'
DATA = Path('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json')

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
    target = None
    for vendor, bucket in obj.items():
        for prod in bucket['products']:
            if prod.get('part_number') == 'YT9232D':
                target = prod
                break
        if target:
            break
    assert target is not None, 'YT9232D not found in corpus'
    feats = str(target.get('_features', ''))
    assert '24口交换机' in feats, f'YT9232D should carry 24口交换机 tag, got: {feats}'

    res = call('16口交换机')
    must = res.get('must') or []
    assert must == ['交换机', '16口'], f'unexpected must: {must}'

    suggestions = res.get('suggestions') or []
    if suggestions:
        text = '\n'.join(s.get('text', '') for s in suggestions)
        assert 'YT9215' not in text, f'16口 switch suggestion should not prefer 5口 parts: {text}'
        assert 'YT9232D' in text, f'if suggestions exist they should mention YT9232D: {text}'

    print('✅ switch port downgrade recommendation regression passed')
    print('YT9232D features=', feats)
    print('must=', must, 'suggestions=', suggestions)

if __name__ == '__main__':
    main()

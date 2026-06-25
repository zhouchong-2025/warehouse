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


def exact_match_count(features):
    data = json.loads(DATA.read_text())
    all_products = []
    for vendor in data.values():
        all_products.extend(vendor['products'])
    cnt = 0
    sample = []
    wanted = [f.lower() for f in features]
    for p in all_products:
        ft = str(p.get('_features', '')).lower()
        if all(w in ft.split() for w in wanted):
            cnt += 1
            if len(sample) < 5:
                sample.append(p.get('part_number'))
    return cnt, sample


def main():
    generic = call('SBC 推荐')
    must = generic.get('must') or []
    assert 'SBC' in must, generic
    assert 'CAN-FD' not in must and 'LIN' not in must, generic
    generic_hits, generic_sample = exact_match_count(must)
    assert generic_hits > 0, (generic, generic_hits, generic_sample)

    can_sbc = call('can sbc 推荐')
    can_must = can_sbc.get('must') or []
    assert 'SBC' in can_must and 'CAN-FD' in can_must, can_sbc
    assert 'LIN' not in can_must, can_sbc
    can_hits, can_sample = exact_match_count(can_must)
    assert can_hits > 0, (can_sbc, can_hits, can_sample)

    lin_sbc = call('lin sbc 推荐')
    lin_must = lin_sbc.get('must') or []
    assert 'SBC' in lin_must and 'LIN' in lin_must, lin_sbc
    assert 'CAN-FD' not in lin_must, lin_sbc
    lin_hits, lin_sample = exact_match_count(lin_must)
    assert lin_hits > 0, (lin_sbc, lin_hits, lin_sample)

    print('✅ SBC recommendation regression passed')
    print('generic must=', must, 'hits=', generic_hits, 'sample=', generic_sample)
    print('can sbc must=', can_must, 'hits=', can_hits, 'sample=', can_sample)
    print('lin sbc must=', lin_must, 'hits=', lin_hits, 'sample=', lin_sample)


if __name__ == '__main__':
    main()

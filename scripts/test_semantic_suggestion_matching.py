#!/usr/bin/env python3
import json
import urllib.request

URL = 'http://127.0.0.1:3000/api/interpret'


def call(query: str):
    req = urllib.request.Request(
        URL,
        data=json.dumps({'query': query}).encode(),
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


def first_text(payload):
    suggestions = payload.get('suggestions') or []
    assert suggestions, f'no suggestions for payload: {payload}'
    return suggestions[0].get('text', '')


def main():
    q1 = call('16口车规交换机')
    t1 = first_text(q1)
    assert '匹配交换机、16口' in t1, t1
    assert '缺少车规AEC-Q100' in t1, t1
    assert '缺少车规AEC-Q100、16口' not in t1, t1

    q2 = call('9口车规交换机')
    t2 = first_text(q2)
    assert '匹配交换机、9口' in t2, t2
    assert '缺少车规AEC-Q100' in t2, t2
    assert '缺少车规AEC-Q100、9口' not in t2, t2

    q3 = call('50Mbps隔离485')
    texts = '\n'.join(s.get('text', '') for s in (q3.get('suggestions') or []))
    assert '去掉「50Mbps」可匹配：TPT7481、TPT7482、TPT7487、TPT7488。' in texts, texts
    assert 'NSI84085' not in texts, texts

    print('✅ semantic suggestion matching regression passed')
    print('16口车规交换机 ->', t1)
    print('9口车规交换机 ->', t2)
    print('50Mbps隔离485 ->', texts)


if __name__ == '__main__':
    main()

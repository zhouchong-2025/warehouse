import json, urllib.request
for q in ['运放 4通道', 'LDO 3.3V 1A', '模拟开关']:
    r = json.loads(urllib.request.urlopen(urllib.request.Request(
        'http://localhost:3000/api/interpret',
        data=json.dumps({'query':q}).encode(),
        headers={'Content-Type':'application/json'}), timeout=30).read())
    print(f"=== {q} ===")
    results = r.get('results', [])
    print(f"  results: {len(results)}")
    for t in results[:5]:
        print(f"  {t['pn']:20s} tier={t.get('tier')} pref={t.get('preferred','?')}")

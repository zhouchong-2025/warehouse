import json, urllib.request
for q in ['隔离485 半双工','车规百兆phy tx接口','八切一模拟开关 2通道','48V 转 5V DC-DC 1A']:
    r = json.loads(urllib.request.urlopen(urllib.request.Request(
        'http://localhost:3000/api/interpret',
        data=json.dumps({'query':q}).encode(),
        headers={'Content-Type':'application/json'}), timeout=30).read())
    print(f"{q}: must={r.get('must')} results={len(r.get('results',[]))}")

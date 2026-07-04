import json, urllib.request
tests = [
    'serdes 高速接口',
    'USXGMII 以太网',
    '有没有车规以太网 PHY，支持 100BASE-T1，接口接 RGMII 或 RMII',
]
for q in tests:
    r = json.loads(urllib.request.urlopen(urllib.request.Request(
        'http://localhost:3000/api/interpret',
        data=json.dumps({'query':q}).encode(),
        headers={'Content-Type':'application/json'}), timeout=30).read())
    n = len(r.get('results',[]))
    print(f'{q}: must={r.get("must")} results={n}')

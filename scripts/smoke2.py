import json, urllib.request

BASE = "http://localhost:3000"
def interpret(query, vendor=None):
    body = {"query": query}
    if vendor: body["vendor"] = vendor
    req = urllib.request.Request(f"{BASE}/api/interpret",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=45).read())

tests = [
    "八切一模拟开关 2通道",
    "车规百兆 phy", 
    "48V 转 5V DC-DC 1A",
    "隔离485 半双工",
    "隔离CAN",
    "串联型电压基准",
]
for q in tests:
    r = interpret(q)
    results = r.get('results', [])
    print(f"{q}: must={r.get('must')} tier={r.get('tier', '?')} count={len(results)}")
    for t in results[:2]:
        print(f"  {t.get('pn','?')} tier={t.get('tier','?')} miss={t.get('missingTags','?')}")

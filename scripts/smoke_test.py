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
    ("八切一模拟开关 2通道", None, None),
    ("车规百兆 phy", None, "YT8522A"),
    ("48V 转 5V DC-DC 1A", None, "NSR10A11"),
]
for q, v, expected in tests:
    r = interpret(q, v)
    has = any(expected in x.get('pn','') for x in (r.get('results') or [])) if expected else None
    print(f"  {q}: must={r.get('must')} results={len(r.get('results') or [])} has_{expected}={has}")

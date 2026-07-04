import json, urllib.request

BASE = "http://localhost:3000"
def interpret(query, vendor=None):
    body = {"query": query}
    if vendor: body["vendor"] = vendor
    req = urllib.request.Request(f"{BASE}/api/interpret",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=45).read())

for q in ['车规百兆 phy', '车规百兆phy tx接口', '百兆phy']:
    r = interpret(q)
    print(f"\n=== '{q}' ===")
    print(f"  must: {r.get('must')}")
    print(f"  nice: {r.get('nice')}")
    print(f"  results: {len(r.get('results', []))}")
    for t in (r.get('results') or [])[:5]:
        print(f"    {t['pn']} tier={t.get('tier')} miss={t.get('missingTags')}")
    if not r.get('results'):
        print(f"  suggestions: {r.get('suggestions')}")

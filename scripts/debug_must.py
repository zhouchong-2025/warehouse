#!/usr/bin/env python3
import json, urllib.request

BASE = "http://localhost:3000"
def interpret(query):
    body = {"query": query}
    req = urllib.request.Request(f"{BASE}/api/interpret",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=45).read())

for q in ["八切一模拟开关 2通道", "模拟开关 8:1 2通道", "模拟开关 2通道"]:
    r = interpret(q)
    print(f"'{q}': must={r['must']} hitCounts={[res.get('hitCount') for res in r.get('results',[])[:3]]}")

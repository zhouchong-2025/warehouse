#!/usr/bin/env python3
import json, urllib.request

BASE = "http://localhost:3000"
def interpret(query, vendor=None):
    body = {"query": query}
    if vendor: body["vendor"] = vendor
    req = urllib.request.Request(f"{BASE}/api/interpret",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=45).read())

r = interpret("八切一开关，2 通道")

# Print all top-level keys
print("Top-level keys:", list(r.keys()))
print()

# Print must and related fields
print("must:", r.get('must'))
print("nice:", r.get('nice'))
print("features:", r.get('features'))
print("mustMeta:", r.get('mustMeta'))
print("category_hint:", r.get('category_hint'))
print("confidence:", r.get('confidence'))
print("intent:", r.get('intent'))
print()

# Print results
results = r.get('results', [])
print(f"Results: {len(results)}")
for t in results[:3]:
    print(f"  {t}")

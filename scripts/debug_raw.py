#!/usr/bin/env python3
import http.client, json

conn = http.client.HTTPConnection("localhost", 3000, timeout=30)
body = json.dumps({"query": "八切一开关，2 通道"})
conn.request("POST", "/api/interpret", body, {"Content-Type": "application/json"})
resp = conn.getresponse()
raw = resp.read().decode()
conn.close()

d = json.loads(raw)
print("must:", d.get('must'))
print("mustMeta:", d.get('mustMeta'))
print()
print("FULL RESPONSE KEYS:", sorted(d.keys()))
print()
# Check if there's a nested must somewhere
for k, v in d.items():
    if isinstance(v, dict) and 'must' in v:
        print(f"  NESTED: d['{k}'].must =", v['must'])

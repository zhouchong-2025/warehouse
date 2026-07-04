import json, urllib.request

def interpret(query):
    body = json.dumps({"query": query}).encode()
    req = urllib.request.Request("http://localhost:3000/api/interpret", data=body,
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=45).read())

r = interpret("八切一开关，2 通道")
for k in ['_debug_must_after_merge', '_debug_must_after_mc', '_debug_must_before_rescue', '_debug_must']:
    v = r.get(k)
    if v:
        print(f"{k}: {v}")
print(f"must: {r.get('must')}")

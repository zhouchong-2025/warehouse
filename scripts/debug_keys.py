import json, urllib.request
r = json.loads(urllib.request.urlopen(urllib.request.Request(
    'http://localhost:3000/api/interpret',
    data=json.dumps({'query':'八切一开关，2 通道'}).encode(),
    headers={'Content-Type':'application/json'}), timeout=45).read())
keys = [k for k in r.keys() if k.startswith('_debug') or k.startswith('_turbopack')]
for k in sorted(keys):
    print(f'{k}: {r[k]}')

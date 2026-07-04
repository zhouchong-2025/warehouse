import json, urllib.request
r = json.loads(urllib.request.urlopen(
    urllib.request.Request('http://localhost:3000/api/interpret',
        data=json.dumps({'query':'八切一开关，2 通道'}).encode(),
        headers={'Content-Type':'application/json'}),
    timeout=45).read())
print('_debug_must_after_merge:', r.get('_debug_must_after_merge'))
print('_debug_must (at return):', r.get('_debug_must'))
print('must:', r.get('must'))

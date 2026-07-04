import json, urllib.request
r = json.loads(urllib.request.urlopen(urllib.request.Request(
    'http://localhost:3000/api/interpret',
    data=json.dumps({'query':'隔离485 半双工'}).encode(),
    headers={'Content-Type':'application/json'}), timeout=25).read())
print('features:', r.get('features'))
print('must:', r.get('must'))
print('nice:', r.get('nice'))
print('results:', r.get('results'))
print('suggestions:', r.get('suggestions'))
print()
print('All top-level keys:', sorted(r.keys()))

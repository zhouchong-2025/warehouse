import json, urllib.request
r = json.loads(urllib.request.urlopen(urllib.request.Request(
    'http://localhost:3000/api/interpret',
    data=json.dumps({'query':'隔离485 半双工'}).encode(),
    headers={'Content-Type':'application/json'}), timeout=25).read())
print('results:', len(r.get('results',[])), 'suggestions:', len(r.get('suggestions',[])))
print('must:', r.get('must'))

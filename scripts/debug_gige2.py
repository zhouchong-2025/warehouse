import json, urllib.request
r = json.loads(urllib.request.urlopen(urllib.request.Request(
    'http://localhost:3000/api/interpret',
    data=json.dumps({'query':'千兆 phy'}).encode(),
    headers={'Content-Type':'application/json'}), timeout=30).read())
print('must:', r.get('must'))
print('nice:', r.get('nice'))
print('features:', r.get('features'))
print('results:', len(r.get('results',[])))
print('suggestions:', r.get('suggestions'))
print()
# Compare with 以太网 alone
r2 = json.loads(urllib.request.urlopen(urllib.request.Request(
    'http://localhost:3000/api/interpret',
    data=json.dumps({'query':'以太网'}).encode(),
    headers={'Content-Type':'application/json'}), timeout=30).read())
print('以太网: must=%s nice=%s results=%d' % (r2.get('must'), r2.get('nice'), len(r2.get('results',[]))))

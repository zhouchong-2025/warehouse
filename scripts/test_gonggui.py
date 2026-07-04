import json, urllib.request

# Test 1: 工规 recognition
for q in ['工规千兆 phy', '工规 千兆 phy']:
    r = json.loads(urllib.request.urlopen(urllib.request.Request(
        'http://localhost:3000/api/interpret',
        data=json.dumps({'query':q}).encode(),
        headers={'Content-Type':'application/json'}), timeout=30).read())
    print(f"'{q}': must={r.get('must')} nice={r.get('nice')} features={r.get('features')}")
    results = r.get('results', [])
    for t in results[:3]:
        print(f"  {t['pn']} pref={t.get('preferred','?')}")

# Test 2: verify preferred label only on preferred PNs
print()
r2 = json.loads(urllib.request.urlopen(urllib.request.Request(
    'http://localhost:3000/api/interpret',
    data=json.dumps({'query':'千兆 phy'}).encode(),
    headers={'Content-Type':'application/json'}), timeout=30).read())
results2 = r2.get('results', [])
pref_count = sum(1 for t in results2 if t.get('preferred'))
non_pref_count = sum(1 for t in results2 if not t.get('preferred'))
print(f"千兆 phy: {len(results2)} results, {pref_count} preferred, {non_pref_count} non-preferred")
for t in results2[:8]:
    print(f"  {t['pn']:20s} pref={t.get('preferred','?')}")

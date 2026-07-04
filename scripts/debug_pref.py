import json, urllib.request

# Check preferred list
with open('/Users/zhouchong/Projects/warehouse/web/public/data/preferred_pns.json') as f:
    preferred = json.load(f)

# Look for YT8521, YT8531 variants
for pn in sorted(preferred.keys()):
    if 'YT85' in pn or 'YT852' in pn or 'YT853' in pn:
        print(f'  preferred: {pn}')

print()

# Test the API
r = json.loads(urllib.request.urlopen(urllib.request.Request(
    'http://localhost:3000/api/interpret',
    data=json.dumps({'query':'千兆 phy'}).encode(),
    headers={'Content-Type':'application/json'}), timeout=30).read())
print(f'must: {r.get("must")}')
print(f'nice: {r.get("nice")}')
print(f'results: {len(r.get("results",[]))}')
for t in (r.get('results') or [])[:8]:
    print(f'  {t["pn"]:20s} tier={t.get("tier")} pref={t.get("preferred","?")}')

import json, urllib.request
# Quick test to see if applyConstraints works at all
for q in ['隔离485 半双工', '以太网', '千兆 phy']:
    r = json.loads(urllib.request.urlopen(urllib.request.Request(
        'http://localhost:3000/api/interpret',
        data=json.dumps({'query':q}).encode(),
        headers={'Content-Type':'application/json'}), timeout=30).read())
    print(f'{q}: must={r.get("must")} nice={r.get("nice")} results={len(r.get("results",[]))}')

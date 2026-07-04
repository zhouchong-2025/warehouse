#!/usr/bin/env python3
import urllib.request, json

r = json.loads(urllib.request.urlopen(
    urllib.request.Request('http://localhost:3000/api/interpret',
        data=json.dumps({'query':'八切一开关，2 通道'}).encode(),
        headers={'Content-Type':'application/json'}),
    timeout=30).read())

print("must:", repr(r['must']))
print("mustMeta:", r.get('mustMeta'))
print()

# Check: does result.must match result.mustMeta tags?
mm_tags = [m['tag'] for m in (r.get('mustMeta') or [])]
must_tags = r.get('must') or []
print("must tags:", must_tags)
print("mustMeta tags:", mm_tags)
print("Diff (in meta not in must):", [t for t in mm_tags if t not in must_tags])

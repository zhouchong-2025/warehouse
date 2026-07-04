import json, urllib.request
r = json.loads(urllib.request.urlopen(urllib.request.Request(
    'http://localhost:3000/api/interpret',
    data=json.dumps({'query':'有没有车规以太网 PHY，支持 100BASE-T1，接口接 RGMII 或 RMII，用在域控制器和摄像头网关。'}).encode(),
    headers={'Content-Type':'application/json'}), timeout=45).read())
print('must:', r.get('must'))
print('nice:', r.get('nice'))
print()
for t in (r.get('results') or [])[:8]:
    d = t.get('downgradeHits', {})
    dstr = ','.join(f'{k}→{v}' for k,v in (d or {}).items()) if d else '-'
    print(f'  {t["pn"]:20s} tier={t["tier"]} hit={t["hitCount"]} miss={t.get("missingTags")} downgrade={dstr}')
print()
print('suggestions:', r.get('suggestions'))

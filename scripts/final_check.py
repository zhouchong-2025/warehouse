import json, urllib.request
q = '有没有车规以太网 PHY，支持 100BASE-T1，接口接 RGMII 或 RMII，用在域控制器和摄像头网关。'
r = json.loads(urllib.request.urlopen(urllib.request.Request(
    'http://localhost:3000/api/interpret',
    data=json.dumps({'query':q}).encode(),
    headers={'Content-Type':'application/json'}), timeout=30).read())
print('must:', r.get('must'))
for t in (r.get('results') or []):
    d = t.get('downgradeHits',{})
    dh = ','.join(f'{k}→{v}' for k,v in (d or {}).items()) if d else '-'
    print(f'  {t["pn"]:15s} tier={t.get("tier")} hit={t.get("hitCount")} dw={dh}')

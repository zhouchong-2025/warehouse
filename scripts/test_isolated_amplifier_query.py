#!/usr/bin/env python3
import json
from pathlib import Path
import subprocess

root = Path('/Users/zhouchong/Projects/warehouse')
cmd = r'''npx tsx -e "import fs from 'fs'; import { parseQuery } from './web/app/api/interpret/query_parser'; import { scoreByConstraints } from './web/app/api/interpret/constraint-match'; const data=JSON.parse(fs.readFileSync('./web/public/data/products_structured.json','utf8')); const queries=['隔离运放','隔离调制器']; const products=Object.entries(data).flatMap(([vendor,v]) => v.products.map((p:any)=>({vendor, product:p}))); const out=[]; for (const text of queries) { const q=parseQuery(text); const scored=scoreByConstraints(products.map(({product}:any)=>product), q.must || q.features || [], q.nice || [], q.mustMeta || []).sort((a,b)=>b.score-a.score).slice(0,5).map((s:any)=>({pn:s.product.part_number, hit:s.mustHit, miss:s.mustMiss, score:s.score})); out.push({text, parsed:q, top:scored}); } console.log(JSON.stringify(out, null, 2));"'''
res = subprocess.run(cmd, shell=True, cwd=root, text=True, capture_output=True)
if res.returncode != 0:
    raise SystemExit(res.stderr or res.stdout)
arr = json.loads(res.stdout)
for item in arr:
    parsed = item['parsed']
    top = item['top']
    assert '隔离放大器' in parsed.get('features', []), item
    assert '运放' not in parsed.get('features', []), item
    assert 'ADC' not in parsed.get('features', []), item
    assert top, f"no scored results for {item['text']}"
    assert top[0]['pn'] == 'TPA8000', item
    assert '隔离放大器' in top[0]['hit'], top[0]
print('✅ isolated amplifier alias regression passed ' + ', '.join(f"{x['text']}→{x['top'][0]['pn']}" for x in arr))

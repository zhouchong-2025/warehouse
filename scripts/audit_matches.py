#!/usr/bin/env python3
"""Audit all products for misleading full-match scenarios."""
import json

with open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json') as f:
    data = json.load(f)

issues = []

for vendor, vdata in data.items():
    for p in vdata['products']:
        feats = (p.get('_features', '') or '').lower()
        tokens = feats.split()
        pn = p['part_number']
        
        # 1. Has both 百兆 and 千兆 tags
        if '百兆' in tokens and '千兆' in tokens:
            issues.append(f'{vendor}/{pn}: 同时有百兆和千兆标签 → {feats[:100]}')
        
        # 2. Has both 消费级 and 工业级 tags
        if '消费级' in tokens and '工业级' in tokens:
            issues.append(f'{vendor}/{pn}: 同时有消费级和工业级标签 → {feats[:100]}')
        
        # 3. Has 2.5G but also tagged as 千兆 (ambiguous)
        if '2.5g' in tokens and '千兆' in tokens:
            issues.append(f'{vendor}/{pn}: 2.5G产品标记为千兆 → {feats[:100]}')

        # 4. Has "千兆" but params suggest otherwise
        params = (p.get('_params', '') or '').lower()
        if '千兆' in tokens and ('100base' in params or '百兆' in params) and '2.5g' not in tokens:
            issues.append(f'{vendor}/{pn}: 标记千兆但 _params 含百兆/100base → {params[:120]}')
        
        # 5. Section says one thing, features say another
        section = (p.get('_section', '') or '').lower()
        if '消费' in section and '工业级' in tokens:
            issues.append(f'{vendor}/{pn}: _section含消费但features标记工业级 → section={section[:60]}')
        if '工业' in section and '消费级' in tokens:
            issues.append(f'{vendor}/{pn}: _section含工业但features标记消费级 → section={section[:60]}')

print(f'Total issues found: {len(issues)}')
for i in issues[:30]:
    print(f'  {i}')
if len(issues) > 30:
    print(f'  ... and {len(issues)-30} more')

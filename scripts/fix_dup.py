#!/usr/bin/env python3
with open('/Users/zhouchong/Projects/warehouse/web/app/api/interpret/route.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
removed = False
for line in lines:
    if 'const mustMetaByTag = new Map(((result.mustMeta || []) as any[]).map((m) => [m.tag, m]));' in line:
        if removed:
            continue
        removed = True
    new_lines.append(line)

with open('/Users/zhouchong/Projects/warehouse/web/app/api/interpret/route.ts', 'w') as f:
    f.writelines(new_lines)
print(f'Done: {len(lines)} -> {len(new_lines)}')

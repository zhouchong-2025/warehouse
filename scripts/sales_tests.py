#!/usr/bin/env python3
"""Sales/Non-technical search acceptance tests."""
import json

data = json.load(open('/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json'))

def search_all(query, vendors=None):
    """Search across all products for a keyword."""
    results = []
    for vk, vd in data.items():
        if vendors and vk not in vendors:
            continue
        for p in vd['products']:
            p_str = json.dumps(p, ensure_ascii=False).lower()
            if query.lower() in p_str:
                results.append((vd['name'], p))
    return results

def banner(title):
    print(f"\n{'='*65}")
    print(f"  {title}")
    print(f"{'='*65}")

# ============================================================
# SALES QUERY TESTS
# ============================================================

# Test 1: "便宜的" / "常用的" — vague cost/common terms
banner("TEST S1: 销售说'便宜的运放' → 应该返回低功耗低成本的")
# Strategy: "便宜" maps to low Iq, basic specs, industrial rating
results = search_all('便宜')
print(f"  Direct '便宜' hits: {len(results)}")
# Try synonyms
for term in ['低功耗', 'low power', '通用', 'general', '低成本']:
    r = search_all(term)
    print(f"  '{term}' hits: {len(r)}")

# Show what "通用" returns
results = search_all('通用')
print(f"\n  '通用' top results:")
for vname, p in results[:6]:
    desc = p.get('description', '') or p.get('产品描述', '')
    print(f"  [{vname}] {p['part_number']:20s} | {desc[:50]}")

# Test 2: "省电的芯片"
banner("TEST S2: 客户说'省电的芯片' → 应该返回低Iq产品")
results = search_all('省电')
print(f"  Direct '省电' hits: {len(results)}")
results = search_all('低功耗')
print(f"  '低功耗' hits: {len(results)}")
results = search_all('low power')
print(f"  'low power' hits: {len(results)}")

# Test 3: "小封装的"
banner("TEST S3: 客户要'小封装的芯片'")
results = search_all('小封装')
print(f"  '小封装' hits: {len(results)}")
# Check: do SOT23, DFN, QFN show up?
for pkg in ['SOT23', 'SOT353', 'DFN', 'QFN', 'WLCSP']:
    r = search_all(pkg.lower())
    print(f"  Package '{pkg}' hits: {len(r)}")

# Test 4: "汽车用的" / "车规"
banner("TEST S4: 销售问'汽车用的芯片有哪些'")
for term in ['汽车', '车规', 'automotive', 'AEC', 'Q100', 'Q1']:
    r = search_all(term)
    print(f"  '{term}' hits: {len(r)}")

# Test 5: "网口芯片" / "以太网芯片"
banner("TEST S5: 客户说'我要网口芯片' — 非专业术语映射")
for term in ['网口', '以太网', 'ethernet', 'PHY', 'phy']:
    r = search_all(term)
    print(f"  '{term}' hits: {len(r)}")

# Test 6: "和XX兼容的" / "替代XX"
banner("TEST S6: 替代型号搜索 — '替代LM358'")
for term in ['LM358', 'LM2904', 'RTL8211', 'AR8035', 'DP83848']:
    r = search_all(term)
    found = []
    for vname, p in r:
        if term.lower() not in p.get('part_number', '').lower():
            found.append((vname, p))
    print(f"  '{term}' — {len(r)} total hits, {len(found)} alternatives found")
    for vname, p in found[:3]:
        desc = p.get('description', '') or p.get('产品描述', '') or p.get('note', '')
        alt = p.get('alternatives', '') or p.get('可替代产品', '')
        print(f"    [{vname}] {p['part_number']:20s} | alt={alt[:40]} | {desc[:40]}")

# Test 7: "高速的"
banner("TEST S7: '高速的芯片' → 应该映射到高GBW/高速率")
for term in ['高速', 'high speed', 'high-speed']:
    r = search_all(term)
    print(f"  '{term}' hits: {len(r)}")
# Show what "高速" matches
r = search_all('高速')
for vname, p in r[:5]:
    print(f"  [{vname}] {p['part_number']:20s} | {p.get('description','')[:60]}")

# Test 8: "隔离的" / "安全的"
banner("TEST S8: '隔离的芯片' — 安规需求")
for term in ['隔离', 'isolation', 'isolated']:
    r = search_all(term)
    print(f"  '{term}' hits: {len(r)}")

# ============================================================
# GAP ANALYSIS
# ============================================================
banner("GAP ANALYSIS: 哪些销售术语没有命中")

# Terms that likely FAIL
no_hit_terms = {
    '高性价比': '应该引导到基础型/量产/低价位产品 → 需映射到 status=量产 + 通用系列',
    '主流': '应该引导到量产状态的大路货 → 需映射到 status=Production',
    '进口替代': '应该引导到国产替代型号 → 需在数据中增加国产替代标注',
    '样品': '销售常问能申请样品吗 → 需映射到 status≠停产',
    '交期': '客户关心货期 → 需映射到 status=量产',
    '大批量': '量产需求 → 需映射到 status=量产',
    '工业级': '已存在于rating/温度范围字段, 但搜索用的是中文 → 检查命中率',
}

for term, suggestion in no_hit_terms.items():
    r = search_all(term)
    status = f"✓ {len(r)} hits" if r else f"✗ 0 hits — {suggestion}"
    print(f"  '{term}': {status}")

# Check "工业级"
r = search_all('工业级')
print(f"\n  '工业级' detail: {len(r)} hits")
r = search_all('industrial')
print(f"  'industrial' detail: {len(r)} hits")

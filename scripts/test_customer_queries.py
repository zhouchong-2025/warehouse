#!/usr/bin/env python3
"""
test_customer_queries.py — 客户/销售真实需求测试

模拟客户和销售实际可能输入的查询，验证系统全链路可靠性：
  query → parser → must/nice → 产品匹配 → 排序 → 前端交付

覆盖维度:
  A. 自然语言 (有...吗/帮我找/推荐)
  B. 技术参数 (LDO 5V 1A / 隔离485 20Mbps)
  C. Technology 维度 (霍尔/磁阻/SIC/特定帧唤醒)
  D. Vendor 限定 (纳芯微/3peak/思瑞浦)
  E. 边界/负面 (不应误推荐)
  F. 回归保护 (修过的bug)
  G. 中英混合

用法:
  python3 scripts/test_customer_queries.py [--verbose] [--mode direct|api]
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, List, Any, Optional

from category_test_utils import interpret_query, parse_case_file, split_csv, load_data, parse_bool

DEFAULT_CASES = Path(__file__).resolve().parent.parent / "tests/customer_query_matrix.txt"
VERBOSE = "--verbose" in sys.argv

# Vendor group mapping
VENDOR_GROUPS = {
    '3peak': ['3peak-analog', '3peak-auto'],
    'novosense': ['novosense'],
    'all': None,
}


def resolve_pool(data: dict, pool_name: str = "all") -> List[dict]:
    """Resolve vendor pool to product list."""
    if pool_name == 'all':
        products = []
        for vd in data.values():
            if isinstance(vd, dict):
                products.extend(vd.get('products', []))
        return products
    keys = VENDOR_GROUPS.get(pool_name, [pool_name])
    products = []
    for k in keys:
        if k in data and isinstance(data[k], dict):
            products.extend(data[k].get('products', []))
    return products


def match_score(product: dict, must: List[str]) -> int:
    """Count must tags satisfied by product (token match in _features)."""
    feats = set((product.get('_features', '') or '').lower().split())
    return sum(1 for m in must if m.lower() in feats)


def search_products(products: List[dict], must: List[str], vendor: str) -> List[dict]:
    """Search and score products by must tag matching."""
    # Vendor prefix map for direct mode filtering
    VENDOR_PREFIXES: Dict[str, list] = {
        'novosense': ['NSI', 'NSM', 'NSP', 'NSIP', 'NCA', 'NST'],
        '3peak': ['TP', 'TPL', 'TPP', 'TPT', 'TPA', 'TPH', 'TPC', 'TPM'],
        '思瑞浦': ['TP', 'TPL', 'TPP', 'TPT', 'TPA', 'TPH', 'TPC', 'TPM'],
        '纳芯微': ['NSI', 'NSM', 'NSP', 'NSIP', 'NCA', 'NST'],
    }
    scored = []
    for p in products:
        pn = p.get('part_number', '')
        # Vendor filter
        if vendor:
            prefixes = VENDOR_PREFIXES.get(vendor, [])
            if prefixes and not any(pn.upper().startswith(p.upper()) for p in prefixes):
                continue

        hit = match_score(p, must)
        if hit > 0 or not must:  # at least one must hit or no must
            scored.append({
                'pn': p.get('part_number', '?'),
                'hit': hit,
                'must_total': len(must),
                'score': hit * 10,
            })

    scored.sort(key=lambda x: (-x['score'], -x['hit']))
    return scored


def main() -> int:
    mode = "direct"
    case_path = DEFAULT_CASES

    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--mode" and i + 1 < len(sys.argv):
            mode = sys.argv[i + 1]
            i += 2
        elif not sys.argv[i].startswith("--") and Path(sys.argv[i]).exists():
            case_path = Path(sys.argv[i])
            i += 1
        else:
            i += 1

    cases = parse_case_file(case_path)
    data = load_data()
    all_products = resolve_pool(data)

    passed = failed = skipped = 0
    sections = {}

    print(f"Customer Query Matrix: {case_path} | mode={mode}")
    print("=" * 72)

    for row in cases:
        query = row["query"]
        line = row["__line__"]
        note = row.get("note", "")
        expect_must = split_csv(row.get("expect_must"))
        expect_hint = row.get("expect_hint", "")
        expect_vendor_key = row.get("expect_vendor", "").lower()
        must_have = split_csv(row.get("must_have"))
        must_not = split_csv(row.get("must_not"))
        top_contains = split_csv(row.get("top_contains"))
        min_results_str = row.get("min_results", "0")
        min_results = int(min_results_str) if min_results_str.isdigit() else 0
        reference_only = parse_bool(row.get("reference_only", "false"))
        errors = []

        # Determine section from note
        section = note.split(":")[0] if ":" in note else note[:30]

        # Step 1: Parse query
        try:
            parsed = interpret_query(query, mode=mode)
        except Exception as e:
            print(f"✗ L{line} [{section}] {query}: PARSER ERROR {e}")
            failed += 1
            continue

        must = parsed.get("must") or []
        nice = parsed.get("nice") or []
        hint = parsed.get("category_hint") or ""
        vendor = (parsed.get("vendor") or "").lower()
        if not vendor:
            # Fallback: extract vendor from query text (direct mode doesn't parse vendor)
            for vk in ['novosense', '纳芯微', '3peak', '思瑞浦']:
                if vk.lower() in query.lower():
                    vendor = vk
                    break
        # Normalize Chinese vendor names to data keys
        VENDOR_NORM = {'纳芯微': 'novosense', '思瑞浦': '3peak'}
        vendor = VENDOR_NORM.get(vendor, vendor)

        # Check expect_must (each expected tag must be in must)
        for m in expect_must:
            if m not in must:
                errors.append(f"缺must={m}")

        # Check expect_hint
        if expect_hint and hint != expect_hint:
            errors.append(f"hint={hint}≠{expect_hint}")

        # Step 2: Search products
        # Use vendor-aware pool if vendor detected
        pool_name = vendor if vendor else "all"
        pool = resolve_pool(data, pool_name) if vendor else all_products
        results = search_products(pool, must, vendor)

        result_pns = [r['pn'] for r in results]
        full_matches = [r for r in results if r['hit'] == r['must_total'] and r['must_total'] > 0]

        # Step 3: Verify results

        # must_have
        for pn in must_have:
            if pn not in result_pns:
                errors.append(f"缺PN={pn}")

        # must_not
        for pn in must_not:
            if pn in result_pns:
                idx = result_pns.index(pn)
                errors.append(f"不应有PN={pn}(排第{idx + 1})")

        # top_contains
        if top_contains and results:
            top_pn = results[0]['pn']
            if not any(top_pn.startswith(prefix) for prefix in top_contains):
                errors.append(f"top={top_pn}不含{','.join(top_contains)}")

        # min_results
        if min_results > 0 and len(results) < min_results:
            errors.append(f"结果数{len(results)}<{min_results}")

        # reference_only
        if reference_only:
            if full_matches:
                errors.append(f"应有0全命中,实际{len(full_matches)}: {','.join(r['pn'] for r in full_matches[:5])}")

        # Output
        if errors:
            print(f"✗ L{line} [{section}] {query}")
            for e in errors:
                print(f"    {e}")
            if VERBOSE:
                print(f"    must={must} nice={nice} hint={hint} vendor={vendor}")
                print(f"    results({len(results)}): {','.join(result_pns[:5])}...")
            sections.setdefault(section, []).append(False)
            failed += 1
        else:
            full_hit_count = len(full_matches)
            icon = "✓" if full_hit_count > 0 else ("△" if reference_only else "○")
            detail = f"全{full_hit_count}" if not reference_only else "参考料模式"
            print(f"{icon} L{line} [{section}] {query} → {len(results)}结果 {detail}")
            if VERBOSE:
                print(f"    must={must}")
                if full_matches:
                    print(f"    全命中: {','.join(r['pn'] for r in full_matches[:5])}")
                else:
                    print(f"    最近: {','.join(result_pns[:3])}")
            sections.setdefault(section, []).append(True)
            passed += 1

    # Summary per section
    print("=" * 72)
    print(f"{'Section':<30} {'Pass':>5} {'Fail':>5}")
    print("-" * 42)
    total_p = total_f = 0
    for sec, results in sections.items():
        p = sum(1 for r in results if r)
        f = sum(1 for r in results if not r)
        print(f"{sec[:30]:<30} {p:>5} {f:>5}")
        total_p += p
        total_f += f
    print("-" * 42)
    print(f"{'TOTAL':<30} {total_p:>5} {total_f:>5}")

    total = passed + failed + skipped
    summary = f"PASS {passed}/{total}"
    if failed:
        summary += f" FAIL {failed}"
    if skipped:
        summary += f" SKIP {skipped}"
    print(f"\n{summary}")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

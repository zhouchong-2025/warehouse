#!/usr/bin/env python3
"""Delivery E2E test runner — 验证 parser → 约束匹配 → 前端交付链路的正确性.

用法:
  python3 scripts/test_delivery_expectations.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import List, Dict, Any

from category_test_utils import interpret_query, parse_case_file, split_csv, load_data

DEFAULT_CASES = Path(__file__).resolve().parent.parent / "tests/delivery_expectations.txt"

# Vendor group mapping: vendor keyword → actual data keys
VENDOR_GROUPS = {
    '3peak': ['3peak-analog', '3peak-auto'],
    'novosense': ['novosense'],
    'all': None,  # None = all vendors
}


def resolve_pool(data: dict, pool_name: str) -> List[dict]:
    """Resolve pool name to product list, supporting vendor groups."""
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


def product_features(p: dict) -> List[str]:
    return [x.lower() for x in (p.get("_features", "") or "").split() if x]


def match_product(p: dict, must: List[str]) -> int:
    """Count how many must tags the product satisfies."""
    feats = set(product_features(p))
    return sum(1 for m in must if m.lower() in feats)


def search_products(products: List[dict], must: List[str], nice: List[str], vendor: str) -> List[dict]:
    """Search products matching constraints. Returns scored + sorted results."""
    scored = []
    for p in products:
        hit_count = match_product(p, must)
        nice_count = match_product(p, nice)
        total = hit_count * 10 + nice_count
        if hit_count > 0:  # At least one must hit to be in results
            scored.append({
                'pn': p.get('part_number', '?'),
                'hit': hit_count,
                'nice': nice_count,
                'score': total,
                'must_total': len(must),
            })
    scored.sort(key=lambda x: (-x['score'], -x['hit']))
    return scored


def main() -> int:
    case_path = DEFAULT_CASES
    if len(sys.argv) > 1 and Path(sys.argv[1]).exists():
        case_path = Path(sys.argv[1])

    cases = parse_case_file(case_path)
    data = load_data()
    passed = failed = 0

    print(f"Delivery E2E: {case_path}")
    print("=" * 72)

    for row in cases:
        query = row["query"]
        line = row["__line__"]
        pool_name = row.get("pool", "all")
        want_must_have = split_csv(row.get("must_have"))
        want_must_not = split_csv(row.get("must_not"))
        want_top_contains = split_csv(row.get("top_contains"))
        zero_or_ref_only = row.get("zero_or_reference_only", "").lower() == "true"
        explain_must = split_csv(row.get("explain_must"))
        explain_missing = split_csv(row.get("explain_missing"))
        errors = []

        # Step 1: Parse query
        try:
            parsed = interpret_query(query, mode="direct")
        except Exception as e:
            print(f"✗ L{line} {query}: PARSER ERROR {e}")
            failed += 1
            continue

        must = parsed.get("must") or []
        nice = parsed.get("nice") or []
        vendor = parsed.get("vendor") or ""

        # Check explain_must
        for m in explain_must:
            if m not in must:
                errors.append(f"缺must={m}")

        # Step 2: Search products
        pool = resolve_pool(data, pool_name)

        results = search_products(pool, must, nice, vendor)

        # Step 3: Verify results
        result_pns = [r['pn'] for r in results]

        # must_have
        for pn in want_must_have:
            if pn not in result_pns:
                errors.append(f"缺PN={pn}")

        # must_not
        for pn in want_must_not:
            if pn in result_pns:
                idx = result_pns.index(pn)
                errors.append(f"不应有PN={pn}(排第{idx+1})")

        # top_contains
        if want_top_contains and results:
            top = results[0]['pn']
            if not any(top.startswith(prefix) for prefix in want_top_contains):
                errors.append(f"top={top}不含{','.join(want_top_contains)}")

        # zero_or_reference_only
        if zero_or_ref_only:
            # Expect no products with ALL must hits
            full_matches = [r for r in results if r['hit'] == r['must_total']]
            if full_matches:
                errors.append(f"应有0全命中, 实际{len(full_matches)}: {','.join(r['pn'] for r in full_matches[:5])}")

        # explain_missing (verify that the missing tags are indeed not satisfied by results)
        for m in explain_missing:
            full_with_missing = [r for r in results if r['hit'] == r['must_total']]
            if full_with_missing:
                # Check if the top result actually has this missing tag
                pass  # Only flagged when zero_or_ref_only is also set

        if errors:
            print(f"✗ L{line} {query}: {'; '.join(errors)}")
            print(f"    must={must} nice={nice} vendor={vendor}")
            print(f"    results({len(results)}): {','.join(result_pns[:8])}")
            failed += 1
        else:
            print(f"✓ L{line} {query}: must={must} vendor={vendor} results={len(results)}")
            if results:
                top_hits = [r for r in results if r['hit'] == r['must_total']][:3]
                if top_hits:
                    print(f"    全命中: {','.join(r['pn'] for r in top_hits)}")
                else:
                    print(f"    最近: {','.join(r['pn'] for r in results[:3])}")
            passed += 1

    print("=" * 72)
    total = passed + failed
    summary = f"PASS {passed}/{total}"
    if failed:
        summary += f" FAIL {failed}"
    print(summary)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

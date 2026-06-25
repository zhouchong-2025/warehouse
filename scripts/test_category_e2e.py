#!/usr/bin/env python3
"""Config-driven category E2E-lite runner.

Default mode=direct:
- parseQuery directly from source
- reuse constraint matcher clone from scripts/test_constraint_layer.py

Optional mode=api:
- read /api/interpret from a live local server
- still reuse the same matcher clone for deterministic ranking verification
"""

from __future__ import annotations

import sys
from pathlib import Path

from category_test_utils import interpret_query, load_data, parse_case_file, product_pool, split_csv

sys.path.insert(0, str(Path(__file__).resolve().parent))
import test_constraint_layer as ctl

DEFAULT_CASES = Path(__file__).resolve().parent.parent / "tests/category_e2e_sample.txt"


def main() -> int:
    case_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CASES
    mode = sys.argv[2] if len(sys.argv) > 2 else "direct"
    cases = parse_case_file(case_path)
    data = load_data()
    passed = failed = 0

    print(f"Category E2E-lite: {case_path} | mode={mode}")
    print("=" * 72)

    for row in cases:
        line = row["__line__"]
        query = row["query"]
        pool = row.get("pool", "all")
        expected_tier = int(row["tier"])
        must_have = split_csv(row.get("must_have"))
        must_not = split_csv(row.get("must_not"))
        top1_contains = row.get("top1_contains", "")
        scan_top = int(row.get("scan_top", "20"))
        errors = []

        try:
            parsed = interpret_query(query, mode=mode)
        except Exception as e:
            print(f"✗ L{line} {query}: interpret ERROR {e}")
            failed += 1
            continue

        must = parsed.get("must") or []
        nice = parsed.get("nice") or []
        meta = parsed.get("mustMeta") or []
        sort_key = parsed.get("sortKey")
        hint = parsed.get("category_hint") or ""

        if not must:
            print(f"✗ L{line} {query}: must为空，无法进行约束验证")
            failed += 1
            continue

        try:
            prods = product_pool(data, pool)
        except Exception as e:
            print(f"✗ L{line} {query}: pool ERROR {e}")
            failed += 1
            continue

        tier, items = ctl.apply_constraints(prods, must, nice, meta, sort_key)
        top = [it["pn"] for it in items[:scan_top]]
        top_join = " ".join(top)

        if tier != expected_tier:
            errors.append(f"tier={tier}≠{expected_tier}")
        for pn in must_have:
            if pn not in top_join:
                errors.append(f"top{scan_top}缺{pn}")
        for pn in must_not:
            if pn in top_join:
                errors.append(f"top{scan_top}不应出现{pn}")
        if top1_contains and items:
            if top1_contains not in items[0]["pn"]:
                errors.append(f"top1={items[0]['pn']} 不含 {top1_contains}")

        if errors:
            print(f"✗ L{line} {query}: {'; '.join(errors)}")
            print(f"    hint={hint} must={must} nice={nice} top={top[:8]}")
            failed += 1
        else:
            print(f"✓ L{line} {query}: hint={hint} tier={tier} top={top[:5]}")
            passed += 1

    print("=" * 72)
    print(f"PASS {passed}/{passed + failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

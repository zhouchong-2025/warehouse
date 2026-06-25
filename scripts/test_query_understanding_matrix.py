#!/usr/bin/env python3
"""Query understanding matrix runner — 测试 parser/API 对用户 query 的语义理解.

用法:
  python3 scripts/test_query_understanding_matrix.py --mode direct
  python3 scripts/test_query_understanding_matrix.py --mode api
"""

from __future__ import annotations

import sys
from pathlib import Path

from category_test_utils import interpret_query, parse_bool, parse_case_file, split_csv

DEFAULT_CASES = Path(__file__).resolve().parent.parent / "tests/query_understanding_matrix.txt"


def main() -> int:
    mode = "direct"
    case_path = DEFAULT_CASES

    # Parse args: --mode api|direct, optional custom case file
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
    passed = failed = skipped = 0

    print(f"Query Understanding Matrix: {case_path} | mode={mode}")
    print("=" * 72)

    for row in cases:
        query = row["query"]
        line = row["__line__"]
        want_vendor = row.get("expect_vendor", "")
        want_must = split_csv(row.get("expect_must"))
        want_nice = split_csv(row.get("expect_nice"))
        want_hint = row.get("expect_hint", "")
        forbid_must = split_csv(row.get("forbid_must"))
        errors = []

        try:
            got = interpret_query(query, mode=mode)
        except Exception as e:
            print(f"✗ L{line} {query}: ERROR {e}")
            failed += 1
            continue

        must = got.get("must") or []
        nice = got.get("nice") or []
        hint = got.get("category_hint") or ""
        vendor = got.get("vendor") or ""

        # Check expect_vendor (API mode only; direct mode parseQuery has no vendor)
        if want_vendor and mode == "api":
            if vendor.lower() != want_vendor.lower():
                errors.append(f"vendor={vendor}≠{want_vendor}")

        for item in want_must:
            if item not in must:
                errors.append(f"缺must={item}")

        for item in want_nice:
            if item not in nice:
                errors.append(f"缺nice={item}")

        for item in forbid_must:
            if item in must:
                errors.append(f"误must={item}")

        if want_hint and hint != want_hint:
            errors.append(f"hint={hint}≠{want_hint}")

        if errors:
            status = "✗"
            if mode == "api" and want_vendor and vendor.lower() != want_vendor.lower():
                pass  # already in errors
            print(f"{status} L{line} {query}: {'; '.join(errors)}")
            print(f"    got must={must} nice={nice} hint={hint} vendor={vendor}")
            failed += 1
        else:
            print(f"✓ L{line} {query}: hint={hint} must={must} nice={nice} vendor={vendor}")
            passed += 1

    print("=" * 72)
    total = passed + failed + skipped
    summary = f"PASS {passed}/{total}"
    if skipped:
        summary += f" SKIP {skipped}"
    if failed:
        summary += f" FAIL {failed}"
    print(summary)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

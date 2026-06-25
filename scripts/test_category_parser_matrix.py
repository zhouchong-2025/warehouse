#!/usr/bin/env python3
"""Config-driven parser matrix runner (small-sample first, expandable later)."""

from __future__ import annotations

import sys
from pathlib import Path

from category_test_utils import interpret_query, parse_bool, parse_case_file, split_csv

DEFAULT_CASES = Path(__file__).resolve().parent.parent / "tests/category_parser_sample.txt"


def main() -> int:
    case_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CASES
    mode = sys.argv[2] if len(sys.argv) > 2 else "direct"
    cases = parse_case_file(case_path)
    passed = failed = 0

    print(f"Parser matrix: {case_path} | mode={mode}")
    print("=" * 72)

    for row in cases:
        query = row["query"]
        line = row["__line__"]
        want_features = split_csv(row.get("expect_features"))
        want_must = split_csv(row.get("expect_must"))
        want_nice = split_csv(row.get("expect_nice"))
        want_hint = row.get("expect_hint", "")
        want_needs_llm = parse_bool(row.get("needs_llm", "false"))
        errors = []
        try:
            got = interpret_query(query, mode=mode)
        except Exception as e:
            print(f"✗ L{line} {query}: ERROR {e}")
            failed += 1
            continue

        features = got.get("features") or []
        must = got.get("must") or []
        nice = got.get("nice") or []
        hint = got.get("category_hint") or ""
        needs_llm = bool(got.get("needsLLM"))

        for item in want_features:
            if item not in features:
                errors.append(f"缺feature={item}")
        for item in want_must:
            if item not in must:
                errors.append(f"缺must={item}")
        for item in want_nice:
            if item not in nice:
                errors.append(f"缺nice={item}")
        if want_hint and hint != want_hint:
            errors.append(f"hint={hint}≠{want_hint}")
        if needs_llm != want_needs_llm:
            errors.append(f"needsLLM={needs_llm}≠{want_needs_llm}")

        if errors:
            print(f"✗ L{line} {query}: {'; '.join(errors)}")
            print(f"    got features={features} must={must} nice={nice} hint={hint} needsLLM={needs_llm}")
            failed += 1
        else:
            print(f"✓ L{line} {query}: hint={hint} must={must} nice={nice}")
            passed += 1

    print("=" * 72)
    print(f"PASS {passed}/{passed + failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

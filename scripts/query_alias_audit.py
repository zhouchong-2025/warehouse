#!/usr/bin/env python3
"""Audit query aliases against canonical category tags and representative products.

目的：系统性发现“用户常见叫法”与“数据 canonical tag / family”不一致导致的漏召回。
默认读取 tests/query_alias_audit_cases.txt，输出每个 query 的：
- parse must/features/category_hint
- canonical tag 在全库命中数
- representative PN 是否位于 canonical 池
- 是否出现误解标签

默认文本输出；失败时 exit 1，便于纳入回归或 CI。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List

from category_test_utils import (
    DATA_PATH,
    load_data,
    parse_case_file,
    product_features,
    interpret_query,
    split_csv,
)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CASES = ROOT / "tests/query_alias_audit_cases.txt"


def find_products_with_all_tags(data: dict, tags: List[str]) -> list[dict]:
    hits: list[dict] = []
    wanted = [t for t in tags if t]
    for vendor_key, vd in data.items():
        for p in vd.get("products", []):
            feats = set(product_features(p))
            if all(tag in feats for tag in wanted):
                hits.append({
                    "vendor": vendor_key,
                    "part_number": p.get("part_number", ""),
                    "features": p.get("_features", ""),
                    "section": p.get("_section", ""),
                })
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cases", nargs="?", default=str(DEFAULT_CASES), help="case file path")
    ap.add_argument("--mode", choices=["direct", "api"], default="direct", help="interpret mode")
    ap.add_argument("--show-passing", action="store_true", help="print passing rows too")
    args = ap.parse_args()

    case_path = Path(args.cases)
    rows = parse_case_file(case_path)
    data = load_data()

    print(f"Alias audit cases: {case_path}")
    print(f"Data: {DATA_PATH}")
    print(f"Mode: {args.mode}")
    print("=" * 88)

    passed = failed = 0
    for row in rows:
        query = row["query"]
        line = row.get("__line__", "?")
        expect_must = split_csv(row.get("expect_must"))
        expect_hint = row.get("expect_hint", "")
        forbid = split_csv(row.get("forbid"))
        required_pn = split_csv(row.get("required_pn"))

        problems: list[str] = []
        try:
            got = interpret_query(query, mode=args.mode)
            features = got.get("features") or []
            must = got.get("must") or []
            hint = got.get("category_hint") or ""
            searchable = must or features
            corpus_hits = find_products_with_all_tags(data, expect_must or searchable)
            corpus_pns = {x["part_number"] for x in corpus_hits}
            top_preview = ", ".join(x["part_number"] for x in corpus_hits[:5]) or "NONE"

            for tag in expect_must:
                if tag not in searchable:
                    problems.append(f"missing canonical tag {tag!r} in parse result {searchable}")
            if expect_hint and hint != expect_hint:
                problems.append(f"category_hint={hint!r} != {expect_hint!r}")
            for bad in forbid:
                if bad in features or bad in must:
                    problems.append(f"forbidden tag leaked into parse result: {bad}")
            if not corpus_hits:
                problems.append(f"no products found for canonical tags {expect_must or searchable}")
            for pn in required_pn:
                if pn not in corpus_pns:
                    problems.append(f"representative PN missing from canonical pool: {pn}")

            ok = not problems
            status = "✓" if ok else "✗"
            if ok:
                passed += 1
            else:
                failed += 1

            if ok and not args.show_passing:
                continue

            print(f"{status} L{line} {query}")
            print(f"   parsed must={must} features={features} hint={hint}")
            print(f"   corpus hits={len(corpus_hits)} sample={top_preview}")
            if problems:
                for p in problems:
                    print(f"   {p}")
        except Exception as exc:
            failed += 1
            print(f"✗ L{line} {query}")
            print(f"   ERROR: {exc}")

    print("=" * 88)
    print(f"PASS {passed}/{passed + failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Config-driven category invariants runner."""

from __future__ import annotations

import sys
from pathlib import Path

from category_test_utils import (
    has_any_numeric_key,
    load_data,
    parse_case_file,
    product_features,
    split_csv,
)

DEFAULT_CASES = Path(__file__).resolve().parent.parent / "tests/category_invariants_sample.txt"


def matching_products(products, include_tag: str):
    return [p for p in products if include_tag in product_features(p)]


def main() -> int:
    case_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CASES
    cases = parse_case_file(case_path)
    data = load_data()
    products = [p for vd in data.values() for p in vd.get("products", [])]
    passed = failed = 0

    print(f"Category invariants: {case_path}")
    print("=" * 72)

    for row in cases:
        line = row["__line__"]
        kind = row["kind"]
        category = row.get("category", "")
        errors = []

        if kind == "tag_count":
            tag = row["tag"]
            minimum = int(row["min"])
            matched = matching_products(products, tag)
            if len(matched) < minimum:
                errors.append(f"tag={tag} 仅{len(matched)}款，需≥{minimum}")
            label = f"{category} tag_count {tag}"

        elif kind == "forbid_overlap":
            include = row["include"]
            forbid = split_csv(row.get("forbid"))
            matched = matching_products(products, include)
            bad = []
            for p in matched:
                feats = set(product_features(p))
                hit = [f for f in forbid if f in feats]
                if hit:
                    bad.append(f"{p['part_number']}:{','.join(hit)}")
            if bad:
                errors.append(" overlap=" + "; ".join(bad[:8]))
            label = f"{category} forbid_overlap {include}"

        elif kind == "numeric_coverage":
            tag = row["tag"]
            keys_any = split_csv(row.get("keys_any"))
            min_ratio = float(row["min_ratio"])
            matched = matching_products(products, tag)
            good = [p for p in matched if has_any_numeric_key(p, keys_any)]
            ratio = (len(good) / len(matched)) if matched else 0.0
            if ratio < min_ratio:
                errors.append(f"tag={tag} 数值覆盖率{ratio:.1%}，需≥{min_ratio:.1%}")
            label = f"{category} numeric_coverage {tag}"

        elif kind == "sample_has_tags":
            pn = row["pn"]
            tags = split_csv(row.get("tags"))
            found = None
            for p in products:
                if p.get("part_number", "").upper() == pn.upper():
                    found = p
                    break
            if not found:
                errors.append(f"找不到PN={pn}")
            else:
                feats = set(product_features(found))
                for tag in tags:
                    if tag not in feats:
                        errors.append(f"{pn} 缺tag={tag}")
            label = f"{category} sample_has_tags {pn}"

        else:
            print(f"✗ L{line}: unknown kind={kind}")
            failed += 1
            continue

        if errors:
            print(f"✗ L{line} {label}: {'; '.join(errors)}")
            failed += 1
        else:
            print(f"✓ L{line} {label}")
            passed += 1

    print("=" * 72)
    print(f"PASS {passed}/{passed + failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
audit_tag_coverage.py — 全局标签覆盖审计

用宽泛关键词扫全库所有文本字段，找出"有概念相关词但没有对应标签"的产品。
与 audit_detail_evidence_tags.py 互补：
  - detail_evidence: 精确regex → auto-fix (零假阳性)
  - tag_coverage:    宽泛关键词 → 发现覆盖盲区 (允许假阳性, 人工判断)

用法:
  python3 scripts/audit_tag_coverage.py [--verbose]
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import List

from semantic_registry import DEFAULT_REGISTRY_PATH, filter_rules_with_keywords

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "web" / "public" / "data" / "products_structured.json"
RULES_PATH = DEFAULT_REGISTRY_PATH
REPORTS_DIR = ROOT / "reports"

VERBOSE = "--verbose" in sys.argv
ALL_FIELDS = ["_section", "_params", "_raw", "_detail_intro", "_detail_features", "_detail_apps", "_features"]


def product_has_include(product: dict, includes: List[str]) -> bool:
    if not includes:
        return True
    feats = set((product.get("_features") or "").split())
    return any(inc in feats for inc in includes)


def build_text_blob(product: dict) -> str:
    parts = []
    for field in ALL_FIELDS:
        val = product.get(field, "") or ""
        if val:
            parts.append(val)
    return " ".join(parts)


def main() -> int:
    data = json.loads(DATA_PATH.read_text())
    rules = filter_rules_with_keywords(RULES_PATH)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    findings = []
    total_checked = 0

    for rule in rules:
        tag = str(rule["tag"])
        keywords_re = str(rule.get("keywords", ""))
        includes = list(rule.get("include", []))
        excludes = list(rule.get("exclude", []))
        dimension = str(rule.get("dimension", "?"))
        strength = str(rule.get("strength", "nice"))

        if not keywords_re:
            continue
        # sort_hint 语义（如低噪声/高PSRR）本来就设计成运行时证据/排序意图，
        # 不要求回填到 _features；继续把它们算作 coverage gap 只会污染报告。
        if strength == "sort_hint":
            continue

        regex = re.compile(keywords_re, re.IGNORECASE)
        tag_matches = []

        for vendor_name, vendor_data in data.items():
            if not isinstance(vendor_data, dict):
                continue
            for product in vendor_data.get("products", []):
                total_checked += 1
                pn = product.get("part_number", "?")

                if includes and not product_has_include(product, includes):
                    continue
                if excludes and product_has_include(product, excludes):
                    continue

                feats = set((product.get("_features") or "").split())
                if tag in feats:
                    continue

                blob = build_text_blob(product)
                matches = regex.findall(blob)
                if matches:
                    hit_fields = []
                    for field in ALL_FIELDS:
                        val = product.get(field, "") or ""
                        if val and regex.search(val):
                            hit_fields.append(field)

                    normalized_matches = []
                    for m in matches:
                        if isinstance(m, tuple):
                            m = next((x for x in m if x), '')
                        m = str(m).strip()
                        if m and m not in normalized_matches:
                            normalized_matches.append(m)

                    tag_matches.append({
                        "vendor": vendor_name,
                        "pn": pn,
                        "tag": tag,
                        "dimension": dimension,
                        "strength": strength,
                        "matches": normalized_matches[:5],
                        "hit_fields": hit_fields,
                        "section": product.get("_section", ""),
                        "features": product.get("_features", ""),
                    })

        if tag_matches:
            findings.extend(tag_matches)
            print(f"\n{'='*60}")
            print(f"  {tag} ({dimension}): {len(tag_matches)} 个覆盖盲区")
            print(f"{'='*60}")
            for f in tag_matches[:30]:
                print(f"  [{f['vendor']}] {f['pn']}")
                print(f"    命中词: {', '.join(f['matches'][:3])}")
                print(f"    命中字段: {', '.join(f['hit_fields'])}")
                print(f"    features: {f['features'][:100]}")
                if VERBOSE:
                    print(f"    section: {f['section']}")
                print()
            if len(tag_matches) > 30:
                print(f"  ... and {len(tag_matches) - 30} more")

    print(f"\n{'='*60}")
    print(f"  总产品数: {total_checked}")
    total_findings = len(findings)
    print(f"  覆盖盲区总数: {total_findings}")
    if total_findings == 0:
        print("  ✅ 所有标签覆盖无盲区")
    else:
        print("  ⚠️  需要检查以上产品是否应补标签")
        print("\n  建议操作:")
        print("    1. 审查盲区产品, 判断是否为真实遗漏")
        print("    2. 如是, 扩展 config/semantic_evidence_rules.txt 的 regex/keywords")
        print("    3. 运行 autofix + validate + 本审计确认归零")
    print(f"{'='*60}")

    report_path = REPORTS_DIR / "tag_coverage_audit.md"
    with open(report_path, "w") as f:
        f.write("# Tag Coverage Audit Report\n\n")
        f.write("Generated by `scripts/audit_tag_coverage.py`\n\n")
        f.write(f"Source registry: `{RULES_PATH}`\n\n")
        f.write("## Summary\n\n")
        f.write(f"- Products scanned: {total_checked}\n")
        f.write(f"- Coverage gaps found: {total_findings}\n\n")

        by_tag = defaultdict(list)
        for finding in findings:
            by_tag[finding["tag"]].append(finding)

        for tag, items in sorted(by_tag.items()):
            f.write(f"## {tag} ({len(items)} gaps)\n\n")
            f.write("| PN | Vendor | Section | Hit Fields | Matched Keywords |\n")
            f.write("|---|---|---|---|---|\n")
            for item in items[:50]:
                hit = ", ".join(item["hit_fields"][:2])
                kw = ", ".join(item["matches"][:3])
                f.write(f"| {item['pn']} | {item['vendor']} | {item['section'][:40]} | {hit} | {kw} |\n")
            f.write("\n")

    print(f"\n  registry: {RULES_PATH}")
    print(f"  完整报告: {report_path}")
    return 0 if total_findings == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

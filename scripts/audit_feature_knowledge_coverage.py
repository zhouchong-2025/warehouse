#!/usr/bin/env python3
"""Audit whether product _features have corresponding search/interpretation knowledge assets.

Outputs:
- reports/feature_knowledge_audit_YYYYMMDD.md
- reports/feature_knowledge_audit_YYYYMMDD.tsv (with BOM for Excel)

Knowledge assets checked:
- LLM prompt available tags in web/app/api/interpret/route.ts
- deterministic parser explicit `tag:` entries in query_parser.ts
- semantic registry tags in config/semantic_evidence_rules.txt
- UI category badges and constrained category whitelist in web/app/page.tsx
- autofix CATEGORY_WHITELIST
- validate.py category/tag mappings
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import pathlib
import re
from typing import Dict, Iterable, Set

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_route_available_tags(text: str) -> Set[str]:
    m = re.search(r"== 可用标签 ==\n(.*?)\n\n==", text, re.S)
    if not m:
        return set()
    return {x.strip() for x in re.split(r"[,，]", m.group(1).strip()) if x.strip()}


def parse_ts_tag_fields(text: str) -> Set[str]:
    return set(re.findall(r"tag:\s*['\"]([^'\"]+)['\"]", text))


def parse_semantic_registry(text: str) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        rec: Dict[str, str] = {}
        for part in line.split("|"):
            if "=" in part:
                k, v = part.split("=", 1)
                rec[k.strip()] = v.strip()
        if rec.get("tag"):
            out[rec["tag"]] = rec
    return out


def parse_quoted_array_constant(text: str, name: str) -> Set[str]:
    m = re.search(rf"{re.escape(name)}\s*=\s*\[(.*?)\]", text, re.S)
    if not m:
        return set()
    return set(re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)))


def parse_new_set(text: str, name: str) -> Set[str]:
    m = re.search(rf"{re.escape(name)}\s*=\s*new Set\(\[(.*?)\]\)", text, re.S)
    if not m:
        return set()
    return set(re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)))


def parse_category_whitelists(text: str) -> Set[str]:
    out: Set[str] = set()
    for m in re.finditer(r"CATEGORY_WHITELIST\s*=\s*\{(.*?)\}", text, re.S):
        out |= set(re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)))
    return out


def parse_validate_tags(text: str) -> Set[str]:
    out: Set[str] = set()
    for m in re.finditer(r"CATEGORY_TAGS\s*=\s*\[(.*?)\]", text, re.S):
        out |= set(re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)))
    # TAG_MAP / dict literal category mappings
    for m in re.finditer(r"['\"]([^'\"]+)['\"]\s*:\s*['\"]([^'\"]+)['\"]", text):
        out.add(m.group(1))
        out.add(m.group(2))
    return out


def classify_tag(t: str, known_category_like: Set[str], semantic: Set[str]) -> str:
    if re.search(r"^(Vin_|Vout_|Iout_)", t):
        return "参数/规格tag"
    if re.search(r"^(\d+(?:\.\d+)?)(Mbps|bit|通道|口|A)$", t):
        return "参数/规格tag"
    if re.match(r"^\d+T\d+R$", t) or re.match(r"^\d+:\d+$", t):
        return "参数/规格tag"
    if t in semantic:
        return "语义证据tag"
    if t in known_category_like:
        return "品类/等级/结构tag"
    if re.search(r"[a-zA-Z]", t) and len(t) > 12:
        return "英文描述/可能噪声"
    return "未归类/待判断"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", default=dt.datetime.now().strftime("%Y%m%d"))
    ap.add_argument("--top", type=int, default=120)
    args = ap.parse_args()

    data = json.loads(read(ROOT / "web/public/data/products_structured.json"))
    products = []
    for vendor, vd in data.items():
        for p in vd.get("products", []):
            products.append((vendor, p))

    tag_counts = collections.Counter()
    tag_vendors = collections.defaultdict(collections.Counter)
    tag_sections = collections.defaultdict(collections.Counter)
    tag_examples = {}
    no_features = []
    for vendor, p in products:
        toks = [x for x in str(p.get("_features", "")).split() if x]
        if not toks:
            no_features.append((vendor, p.get("part_number"), p.get("_section")))
        for t in toks:
            tag_counts[t] += 1
            tag_vendors[t][vendor] += 1
            tag_sections[t][str(p.get("_section", "") or "")] += 1
            tag_examples.setdefault(t, (vendor, p.get("part_number"), p.get("_section")))

    route_tags = parse_route_available_tags(read(ROOT / "web/app/api/interpret/route.ts"))
    parser_tags = parse_ts_tag_fields(read(ROOT / "web/app/api/interpret/query_parser.ts"))
    sem_meta = parse_semantic_registry(read(ROOT / "config/semantic_evidence_rules.txt"))
    sem_tags = set(sem_meta)
    page = read(ROOT / "web/app/page.tsx")
    ui_tags = parse_quoted_array_constant(page, "CATEGORY_BADGE_PRIORITY")
    constrained = parse_new_set(page, "CONSTRAINED_CATEGORIES")
    whitelist = parse_category_whitelists(read(ROOT / "scripts/autofix.py"))
    validate_tags = parse_validate_tags(read(ROOT / "scripts/validate.py"))

    known_category_like = parser_tags | ui_tags | whitelist | validate_tags | route_tags | constrained
    kb_union = known_category_like | sem_tags
    product_tags = set(tag_counts)

    missing_prompt = sorted(product_tags - route_tags, key=lambda t: (-tag_counts[t], t))
    missing_any = sorted(product_tags - kb_union, key=lambda t: (-tag_counts[t], t))
    prompt_actionable = [
        t for t in missing_prompt
        if t in (parser_tags | ui_tags | whitelist | validate_tags | sem_tags | constrained)
        and classify_tag(t, known_category_like, sem_tags) != "参数/规格tag"
    ]

    missing_prompt_by_type = collections.defaultdict(list)
    for t in missing_prompt:
        missing_prompt_by_type[classify_tag(t, known_category_like, sem_tags)].append(t)
    missing_any_by_type = collections.defaultdict(list)
    for t in missing_any:
        missing_any_by_type[classify_tag(t, known_category_like, sem_tags)].append(t)

    section_stats = []
    for sec in sorted(set(str(p.get("_section", "") or "") for _, p in products)):
        sec_products = [(v, p) for v, p in products if str(p.get("_section", "") or "") == sec]
        sec_tags = collections.Counter()
        for _, p in sec_products:
            sec_tags.update(str(p.get("_features", "")).split())
        unknown = [(t, c) for t, c in sec_tags.most_common() if t not in kb_union]
        if unknown:
            section_stats.append((sec, len(sec_products), unknown[:8]))
    section_stats.sort(key=lambda x: (sum(c for _, c in x[2]), x[1]), reverse=True)

    lines = []
    lines.append(f"# Feature 知识库进入度全局审计 - {dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")
    lines.append(f"产品总数: {len(products)}")
    lines.append(f"无 _features 产品: {len(no_features)}")
    lines.append(f"唯一 _features tag: {len(tag_counts)}")
    lines.append(f"LLM prompt 可用标签: {len(route_tags)}")
    lines.append(f"parser 显式 tag: {len(parser_tags)}")
    lines.append(f"semantic registry tag: {len(sem_tags)}")
    lines.append(f"UI category badge tag: {len(ui_tags)}")
    lines.append(f"CONSTRAINED_CATEGORIES: {len(constrained)}")
    lines.append(f"autofix whitelist tag: {len(whitelist)}")
    lines.append(f"validate/tag-map tag: {len(validate_tags)}")
    lines.append(f"知识库并集覆盖 tag: {len(kb_union & product_tags)}/{len(product_tags)}")
    lines.append(f"未进入 LLM prompt 的产品 tag: {len(missing_prompt)}")
    lines.append(f"未进入任何已解析知识资产的产品 tag: {len(missing_any)}")
    lines.append("")
    lines.append("## 未进入 LLM prompt 分桶")
    for typ, tags in sorted(missing_prompt_by_type.items(), key=lambda kv: -len(kv[1])):
        sample = tags[:40]
        lines.append(f"- {typ}: {len(tags)} tags; top: " + ", ".join(f"{t}({tag_counts[t]})" for t in sample))
    lines.append("")
    lines.append("## 未进入任何知识资产分桶")
    for typ, tags in sorted(missing_any_by_type.items(), key=lambda kv: -len(kv[1])):
        sample = tags[:60]
        lines.append(f"- {typ}: {len(tags)} tags; top: " + ", ".join(f"{t}({tag_counts[t]})" for t in sample))
    lines.append("")
    lines.append("## prompt 缺口中最适合补入知识库的结构/语义 tag")
    for t in prompt_actionable[: args.top]:
        ex = tag_examples[t]
        lines.append(
            f"- {t}: {tag_counts[t]} products; parser={t in parser_tags}; semantic={t in sem_tags}; "
            f"ui={t in ui_tags}; constrained={t in constrained}; whitelist={t in whitelist}; validate={t in validate_tags}; "
            f"example={ex[0]}/{ex[1]}/{ex[2]}"
        )
    lines.append("")
    lines.append("## 有未知 tag 的 section top buckets")
    for sec, n, unknown in section_stats[:80]:
        lines.append(f"- {sec or '(empty)'}: products={n}, unknown=" + ", ".join(f"{t}({c})" for t, c in unknown))
    lines.append("")
    lines.append("## 所有产品 feature tag 明细")
    for t, c in sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        ex = tag_examples[t]
        lines.append(
            f"{t}\t{c}\tprompt={t in route_tags}\tparser={t in parser_tags}\tsemantic={t in sem_tags}"
            f"\tui={t in ui_tags}\tconstrained={t in constrained}\twhite={t in whitelist}\tvalidate={t in validate_tags}"
            f"\texample={ex[0]}/{ex[1]}/{ex[2]}"
        )

    out_dir = ROOT / "reports"
    out_dir.mkdir(exist_ok=True)
    md = out_dir / f"feature_knowledge_audit_{args.date}.md"
    tsv = out_dir / f"feature_knowledge_audit_{args.date}.tsv"
    md.write_text("\n".join(lines), encoding="utf-8")
    with tsv.open("w", encoding="utf-8") as f:
        f.write("\ufefftag\tcount\ttype\tin_prompt\tin_parser\tin_semantic\tin_ui_badge\tin_constrained_categories\tin_whitelist\tin_validate\tvendors\tsections\texample_vendor\texample_pn\texample_section\n")
        for t, c in sorted(tag_counts.items(), key=lambda kv: (-kv[1], kv[0])):
            ex = tag_examples[t]
            vendors = ";".join(f"{k}:{v}" for k, v in tag_vendors[t].most_common())
            sections = ";".join(f"{k}:{v}" for k, v in tag_sections[t].most_common(8))
            f.write("\t".join(map(str, [
                t, c, classify_tag(t, known_category_like, sem_tags), t in route_tags, t in parser_tags,
                t in sem_tags, t in ui_tags, t in constrained, t in whitelist, t in validate_tags,
                vendors, sections, ex[0], ex[1], ex[2],
            ])) + "\n")

    print(f"产品总数={len(products)}, 无_features={len(no_features)}, 唯一tag={len(tag_counts)}")
    print(f"知识库并集覆盖={len(kb_union & product_tags)}/{len(product_tags)}")
    print(f"未进LLM prompt={len(missing_prompt)}; 未进任何知识资产={len(missing_any)}")
    print("prompt_actionable=" + ", ".join(f"{t}({tag_counts[t]})" for t in prompt_actionable[:30]))
    print("unknown_any=" + ", ".join(f"{t}({tag_counts[t]})" for t in missing_any[:30]))
    print(f"report={md}")
    print(f"tsv={tsv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

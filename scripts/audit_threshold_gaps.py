#!/usr/bin/env python3
"""
audit_threshold_gaps.py — 跨品类阈值错题排查

验证约束层的数值比较是否对所有品类生效:
  例如: 搜 "LDO 1A" → TPL6305(Iout=3A) 应通过 Iout>=1A 判定出现
  如果产品满足数值约束但缺阈值 token, 且不出现在结果中 → 错题

用法:
  python3 scripts/audit_threshold_gaps.py [--verbose]
"""

from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Any

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "web" / "public" / "data" / "products_structured.json"
RULES_PATH = ROOT / "config" / "threshold_gap_audit.txt"
REPORTS_DIR = ROOT / "reports"

VERBOSE = "--verbose" in sys.argv


def load_rules(path: Path) -> List[dict]:
    rules = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [seg.strip() for seg in line.split("|") if seg.strip()]
        row: Dict[str, str] = {}
        for part in parts:
            if "=" not in part:
                continue
            k, v = part.split("=", 1)
            row[k.strip()] = v.strip()
        if "category" in row and "query" in row:
            rules.append(row)
    return rules


def parse_numeric(val: Any) -> float | None:
    """Extract numeric value from params_numeric entry."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, dict):
        v = val.get("value")
        if v is not None and not (isinstance(v, float) and v != v):  # not NaN
            return float(v)
    return None


def get_iout_max(product: dict) -> float | None:
    """Get max output current from _params_numeric (replicates ioutMaxOf)."""
    pn = product.get("_params_numeric", {})
    best = None
    for key, raw_val in pn.items():
        kl = key.lower()
        if not (("output" in kl or "输出" in kl) and ("current" in kl or "电流" in kl or "__a_" in kl or "__ma_" in kl)):
            continue
        num = parse_numeric(raw_val)
        if num is None:
            continue
        # Handle unit: mA → A
        unit = str(raw_val.get("unit", "")).lower() if isinstance(raw_val, dict) else ""
        raw = str(raw_val.get("raw", "")).lower() if isinstance(raw_val, dict) else ""
        if "ma" in unit or "ma" in raw or "__ma_" in kl:
            num /= 1000
        elif "μa" in unit or "ua" in unit or "μa" in raw or "__ua_" in kl:
            num /= 1000000
        best = max(best, num) if best is not None else num
    if best is not None:
        return best
    # Fallback: parse from features
    feats = (product.get("_features", "") or "").lower().split()
    for f in feats:
        m = re.match(r"^iout_([\d.]+)a$", f)
        if m:
            val = float(m.group(1))
            best = max(best, val) if best is not None else val
    return best


def get_vin_range(product: dict) -> tuple[float, float] | None:
    """Get Vin range from _params_numeric."""
    pn = product.get("_params_numeric", {})
    min_vin = max_vin = None
    for key, raw_val in pn.items():
        kl = key.lower()
        num = parse_numeric(raw_val)
        if num is None:
            continue
        if ("minimum_input" in kl or "最小输入" in kl) and ("voltage" in kl or "电压" in kl or "__v_" in kl):
            min_vin = min(min_vin, num) if min_vin is not None else num
        elif ("maximum_input" in kl or "最大输入" in kl) and ("voltage" in kl or "电压" in kl or "__v_" in kl):
            max_vin = max(max_vin, num) if max_vin is not None else num
    if min_vin is not None and max_vin is not None:
        return (min(min_vin, max_vin), max(min_vin, max_vin))
    if min_vin is not None:
        return (min_vin, float("inf"))
    if max_vin is not None:
        return (0, max_vin)
    # Fallback: parse Vin tags from features
    feats = (product.get("_features", "") or "").lower().split()
    vins = []
    for f in feats:
        m = re.match(r"^vin_([\d.]+)v$", f)
        if m:
            vins.append(float(m.group(1)))
    if len(vins) >= 2:
        return (min(vins), max(vins))
    if len(vins) == 1:
        return (0, vins[0])
    return None


def check_numeric(product: dict, family: str, threshold: float) -> bool:
    """Check if product satisfies threshold via numeric comparison."""
    if family == "Iout":
        val = get_iout_max(product)
        return val is not None and val >= threshold
    if family == "Mbps":
        pn = product.get("_params_numeric", {})
        for key, raw_val in pn.items():
            kl = key.lower()
            if "data_rate" in kl or "码流" in kl or "速率" in kl or "mbps" in kl:
                num = parse_numeric(raw_val)
                if num is not None and num >= threshold:
                    return True
        # Fallback: parse from features
        feats = (product.get("_features", "") or "").lower().split()
        for f in feats:
            m = re.match(r"^([\d.]+)mbps$", f)
            if m and float(m.group(1)) >= threshold:
                return True
        return False
    if family == "通道":
        feats = (product.get("_features", "") or "").lower().split()
        for f in feats:
            m = re.match(r"^(\d+)通道$", f)
            if m and int(m.group(1)) >= threshold:
                return True
        return False
    if family == "bit":
        feats = (product.get("_features", "") or "").lower().split()
        for f in feats:
            m = re.match(r"^(\d+)bit$", f)
            if m and int(m.group(1)) >= threshold:
                return True
        return False
    if family == "端口":
        feats = (product.get("_features", "") or "").lower().split()
        for f in feats:
            m = re.match(r"^(\d+)口$", f)
            if m and int(m.group(1)) >= threshold:
                return True
        return False
    if family == "Vin":
        rng = get_vin_range(product)
        return rng is not None and rng[0] <= threshold <= rng[1]
    return False


def has_token(product: dict, token: str) -> bool:
    """Check if product has exact token in features."""
    feats = (product.get("_features", "") or "").lower().split()
    return token.lower() in feats


def main() -> int:
    data = json.loads(DATA_PATH.read_text())
    rules = load_rules(RULES_PATH)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    all_products = []
    for vn, vd in data.items():
        if not isinstance(vd, dict):
            continue
        for p in vd.get("products", []):
            all_products.append({"vendor": vn, **p})

    total_gaps = 0
    results_by_cat = defaultdict(list)

    for rule in rules:
        category = rule["category"]
        family = rule["param_family"]
        threshold = float(rule["threshold"])

        # Step 1: Find products that have the category tag
        cat_products = [p for p in all_products if category in (p.get("_features", "") or "").split()]

        # Step 2: Find products that match numerically (≥ threshold)
        numeric_match = [p for p in cat_products if check_numeric(p, family, threshold)]

        # Step 3: Among numeric matches, which ones lack the token?
        def _fmt_token(fam: str, th: float) -> str:
            t = int(th) if th == int(th) else th
            if fam == "Iout": return f"Iout_{t}A"
            if fam == "Vin": return f"Vin_{t}V"
            if fam == "Mbps": return f"{t}Mbps"
            if fam == "通道": return f"{t}通道"
            if fam == "bit": return f"{t}bit"
            if fam == "端口": return f"{t}口"
            return ""
        token = _fmt_token(family, threshold)

        missing_token = [p for p in numeric_match if not has_token(p, token)]
        have_token = len(numeric_match) - len(missing_token)

        gaps = len(missing_token)
        total_gaps += gaps

        icon = "⚠️" if gaps > 0 else "✅"
        print(f"\n{icon} {category} | {family}≥{threshold} | token={token}")
        print(f"   品类产品: {len(cat_products)}  数值满足: {len(numeric_match)}  有token: {have_token}  缺token: {gaps}")

        if gaps > 0 and VERBOSE:
            for p in missing_token[:5]:
                feats = p.get("_features", "")
                # Show relevant tags
                relevant = [f for f in feats.split() if family.lower() in f.lower() or (
                    family == "Mbps" and f.endswith("mbps")
                ) or (
                    family == "通道" and f.endswith("通道")
                ) or (
                    family == "bit" and f.endswith("bit")
                ) or (
                    family == "端口" and f.endswith("口")
                )]
                print(f"     {p['vendor']}/{p['part_number']}: {relevant}")

        if gaps == 0 and cat_products:
            results_by_cat[category].append({"status": "ok", "family": family, "threshold": threshold})
        elif gaps > 0:
            results_by_cat[category].append({"status": "gap", "family": family, "threshold": threshold, "gaps": gaps, "products": missing_token})

    # Summary
    print(f"\n{'='*60}")
    print(f"  错题总数: {total_gaps}")
    if total_gaps == 0:
        print(f"  ✅ 所有品类阈值比较无盲区")
    else:
        print(f"  ⚠️  以上产品满足数值约束但缺阈值 token")
        print(f"  影响: 旧架构(textSearch初筛)会漏掉这些产品")
        print(f"  新架构(全量约束层): 数值比较生效, 不再依赖 token")
    print(f"{'='*60}")

    # Write report
    report_path = REPORTS_DIR / "threshold_gap_audit.md"
    with open(report_path, "w") as f:
        f.write("# Threshold Gap Audit Report\n\n")
        f.write("验证约束层数值比较是否覆盖所有品类的阈值查询。\n\n")
        f.write("## Summary\n\n")
        f.write("| Category | Parameter | Products | Numeric Match | Missing Token |\n")
        f.write("|---|---|---|---|---|\n")
        # Use results already computed in the main loop
        for cat, entries in sorted(results_by_cat.items()):
            for e in entries:
                fam = e['family']
                th = e['threshold']
                if e['status'] == 'gap':
                    f.write(f"| {cat} | {fam}≥{th} | - | - | {e['gaps']} |\n")
                else:
                    f.write(f"| {cat} | {fam}≥{th} | - | - | 0 ✅ |\n")

    print(f"\n  完整报告: {report_path}")
    return 0 if total_gaps == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

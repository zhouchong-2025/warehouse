#!/usr/bin/env python3
"""
enrich_novosense_details.py — 从纳芯微PDF提取产品介绍页，注入到 products_structured.json

用法:
  python3 scripts/enrich_novosense_details.py              # 全量重建（清旧detail + 补新品）
  python3 scripts/enrich_novosense_details.py --dry-run     # 试运行
"""
from __future__ import annotations

import json
import sys
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_coord import extract_novosense

ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = ROOT / "raw" / "纳芯微产品选型指南_202510.pdf"
DATA_PATH = ROOT / "web" / "public" / "data" / "products_structured.json"
BACKUP_PATH = ROOT / "web" / "public" / "data" / "products_structured.json.bak"

DRY_RUN = "--dry-run" in sys.argv


def main():
    print("=== 步骤 1: 从 PDF 提取纳芯微数据（含 detail 页） ===")
    all_products, seccols = extract_novosense(str(PDF_PATH))
    print(f"  提取到 {len(all_products)} 个产品")
    detail_count = sum(1 for p in all_products.values() if p.get('_detail_intro'))
    print(f"  其中 {detail_count} 个有产品介绍页")

    print("\n=== 步骤 2: 重建纳芯微数据 ===")
    data = json.loads(DATA_PATH.read_text())
    novosense_data = data.get("novosense", {})
    existing_products = novosense_data.get("products", [])

    # Build lookup by PN
    existing_by_pn = {}
    for p in existing_products:
        pn = p.get("part_number", "")
        if pn:
            existing_by_pn[pn] = p

    # ── Clear ALL existing detail fields (so corrected data overwrites) ──
    cleared_count = 0
    for p in existing_products:
        for field in ["_detail_intro", "_detail_features", "_detail_apps"]:
            if p.get(field):
                p[field] = ""
                cleared_count += 1
    print(f"  清空旧 detail 字段: {cleared_count}")

    # ── Merge: update existing + add new products ──
    matched = 0
    new_detail_count = 0
    new_products_added = 0

    for pn, ext_prod in all_products.items():
        if pn in existing_by_pn:
            matched += 1
            prod = existing_by_pn[pn]
            for field in ["_detail_intro", "_detail_features", "_detail_apps"]:
                val = ext_prod.get(field, "")
                if val:
                    prod[field] = val
                    new_detail_count += 1
            # Also sync selection table params if extract_coord has better data
            #   (fixes missing columns from extract_universal, e.g. Jitter for speed sensors)
            for field in ["_params", "_raw"]:
                ext_val = ext_prod.get(field, "")
                cur_val = prod.get(field, "")
                if ext_val and len(ext_val) > len(cur_val or ""):
                    prod[field] = ext_val
                    new_detail_count += 1
        else:
            # New product — add to list, but only if it has params (real table product)
            if ext_prod.get("_params"):
                ext_prod["part_number"] = pn
                existing_products.append(ext_prod)
                new_products_added += 1

    # Update product count
    novosense_data["productCount"] = len(existing_products)

    actual_enriched = sum(
        1 for p in existing_products
        if p.get("_detail_intro") or p.get("_detail_features") or p.get("_detail_apps")
    )

    print(f"  旧产品: {len(existing_by_pn)} 匹配: {matched}")
    print(f"  新增产品: {new_products_added}")
    print(f"  产品总数: {len(existing_products)}")
    print(f"  注入 detail 字段: {new_detail_count}")
    print(f"  有 detail 的产品: {actual_enriched}")

    if DRY_RUN:
        print("\n  (DRY RUN)")
        for p in existing_products[:3]:
            if p.get("_detail_intro"):
                print(f"\n  Sample: {p['part_number']}")
                print(f"    _detail_intro: {(p['_detail_intro'] or '')[:150]}")
        return 0

    print("\n=== 步骤 3: 保存 ===")
    shutil.copy2(DATA_PATH, BACKUP_PATH)
    print(f"  备份: {BACKUP_PATH}")

    json.dump(data, open(DATA_PATH, "w"), ensure_ascii=False, indent=2)
    print(f"  保存: {DATA_PATH}")

    # Show samples
    print("\n=== 富化样例 ===")
    for pn in ["NSM2012P", "NSM2115", "NSOPA8011"]:
        for p in existing_products:
            if p.get("part_number") == pn:
                print(f"\n  {pn}:")
                print(f"    intro: {(p.get('_detail_intro','') or '')[:180]}")
                print(f"    features: {(p.get('_detail_features','') or '')[:180]}")
                apps = (p.get('_detail_apps','') or '')[:120]
                print(f"    apps: {apps}")
                break

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

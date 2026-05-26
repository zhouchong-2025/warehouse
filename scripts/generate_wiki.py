#!/usr/bin/env python3
"""
Generate wiki pages from structured product data.
- entities/: one page per product with [[wikilinks]] to concepts
- concepts/: one page per feature tag with product lists
- index.md: updated catalog
"""
import json
from pathlib import Path
from collections import defaultdict

DATA_PATH = Path("/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json")
WIKI_DIR = Path("/Users/zhouchong/Projects/warehouse/wiki")

data = json.loads(DATA_PATH.read_text())

# ── Generate entity pages ──
entities_dir = WIKI_DIR / "entities"
entities_dir.mkdir(exist_ok=True)

for vk, vd in data.items():
    vendor_dir = entities_dir / vk
    vendor_dir.mkdir(exist_ok=True)
    
    for p in vd["products"][:100]:
        pn = p["part_number"]
        features = p.get("_features", "").split()
        section = p.get("_section", "")
        
        concept_links = []
        for f in features:
            slug = f.replace(" ", "-").replace("(", "").replace(")", "")
            slug = slug.replace("<=", "le").replace(">=", "ge").lower()
            concept_links.append("[[concepts/" + slug + "]]")
        
        content = "---\n"
        content += "title: " + pn + "\n"
        content += "vendor: " + vd["name"] + "\n"
        content += "created: 2026-05-25\n"
        content += "type: entity\n"
        content += "tags: [" + ", ".join(features[:5]) + "]\n"
        content += "---\n\n"
        content += "# " + pn + "\n\n"
        content += "**厂商**: " + vd["name"] + "\n"
        content += "**分类**: " + section + "\n\n"
        content += "## 特征\n"
        content += " ".join(concept_links) if concept_links else "无标签"
        content += "\n\n## 原始参数\n```\n"
        content += p.get("_params", "无") + "\n```\n\n"
        content += "## 关联\n- 同系列产品见 [[index]]\n"
        
        (vendor_dir / (pn + ".md")).write_text(content)

print("Entity pages generated")

# ── Generate concept pages ──
concepts_dir = WIKI_DIR / "concepts"
concepts_dir.mkdir(exist_ok=True)

feature_products = defaultdict(list)
for vk, vd in data.items():
    for p in vd["products"]:
        for f in p.get("_features", "").split():
            if f:
                feature_products[f].append((vd["name"], p["part_number"]))

for feature, products in sorted(feature_products.items()):
    slug = feature.replace(" ", "-").replace("(", "").replace(")", "")
    slug = slug.replace("<=", "le").replace(">=", "ge").lower()
    
    by_vendor = defaultdict(list)
    for vname, pn in products:
        by_vendor[vname].append(pn)
    
    product_lines = []
    for vname, pns in sorted(by_vendor.items()):
        vendor_slug = vname.replace(" ", "-").lower()
        for pn in pns[:20]:
            product_lines.append("  - [[entities/" + vendor_slug + "/" + pn + "]]")
    
    content = "---\n"
    content += "title: " + feature + "\n"
    content += "created: 2026-05-25\n"
    content += "type: concept\n"
    content += "tags: [feature]\n"
    content += "---\n\n"
    content += "# " + feature + "\n\n"
    content += "**产品数量**: " + str(len(products)) + "\n"
    content += "**厂商覆盖**: " + str(len(by_vendor)) + "\n\n"
    content += "## 关联产品\n\n"
    content += "\n".join(product_lines[:50]) + "\n"
    
    (concepts_dir / (slug + ".md")).write_text(content)

print("Concept pages: " + str(len(feature_products)))

# ── Update index.md ──
total_e = sum(min(100, vd["productCount"]) for vd in data.values())

idx = "# Wiki Index\n\n"
idx += "> 半导体芯片选型知识库\n"
idx += "> Last updated: 2026-05-25 | Entities: " + str(total_e)
idx += " | Concepts: " + str(len(feature_products)) + "\n\n"
idx += "## Entities\n\n"

for vk, vd in data.items():
    idx += "### " + vd["name"] + " (" + str(vd["productCount"]) + " products)\n"
    for p in vd["products"][:10]:
        idx += "- [[entities/" + vk + "/" + p["part_number"] + "]]"
        idx += " — " + p.get("_section", "") + "\n"
    idx += "\n"

idx += "## Concepts\n\n"
for feature in sorted(feature_products.keys()):
    slug = feature.replace(" ", "-").replace("(", "").replace(")", "")
    slug = slug.replace("<=", "le").replace(">=", "ge").lower()
    idx += "- [[concepts/" + slug + "]]"
    idx += " — " + feature + " (" + str(len(feature_products[feature])) + " products)\n"

(WIKI_DIR / "index.md").write_text(idx)

# ── Update log.md ──
with open(WIKI_DIR / "log.md", "a") as f:
    f.write("\n## [2026-05-25] generate | Wiki populated\n")
    f.write("- Entity pages: " + str(total_e) + " across " + str(len(data)) + " vendors\n")
    f.write("- Concept pages: " + str(len(feature_products)) + " feature tags\n")
    f.write("- index.md updated with full catalog\n")

print("index.md updated")
print("log.md appended")
print("\nWiki ready. Open wiki/ in Obsidian for graph view.")

#!/usr/bin/env python3
"""Re-extract Yutai only with corrected schema, using table + post-fix for merged cells."""
import json, re, time, sys
sys.path.insert(0, "/Users/zhouchong/Projects/warehouse/scripts")
from extract_llm import tag_batch
import pymupdf
from pathlib import Path

RAW_DIR = Path("/Users/zhouchong/Projects/warehouse/raw")
DATA_PATH = Path("/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json")
BATCH_SIZE = 15

def norm(v): return str(v).strip().replace("\n", " ") if v else ""

SCHEMA = ['系列','简介','封装','制程','状态','工作环境温度','端口','接口','Note']

pdf_path = RAW_DIR / "裕太产品选型表 20250312.pdf"
doc = pymupdf.open(str(pdf_path))

# Use table extraction, then fix merged-cell artifacts
tables = doc[0].find_tables()
data = tables.tables[0].extract()
header = data[1]  # ['80系列/车规', '简介', '封装', '制程', '状态', '工作环境温度', '端口', '接口', 'Note']
print(f"Table: {len(data)} rows, header={header}")

products = []
current_series = ""

for row in data:
    if not row or not any(row): continue
    first = str(row[0]).strip() if row[0] else ""
    
    # Skip title and header rows
    if "选型" in first or "简介" in first or first == "80系列/车规":
        continue
    
    # Series header rows
    if re.search(r'系列', first) and len(first) <= 25:
        current_series = first
        continue
    
    # Must have a valid part number in col 0
    if not re.match(r'^[A-Z0-9][A-Za-z0-9\-\.]{2,}$', first):
        continue
    
    # Check for merged-cell artifacts (doubled text like "YYTT" or "GGPPHHYY")
    row_text = " ".join(str(c) for c in row if c)
    if any(kw in row_text for kw in ['工消业费级级', 'GGPPHHYY', 'Glit4eG', 'tlus']):
        continue  # Skip garbled merged rows — they're duplicates of correctly parsed rows
    
    part = first
    param_pairs = []
    for i, val in enumerate(row):
        if val and i > 0:
            label = SCHEMA[i] if i < len(SCHEMA) else f"c{i}"
            param_pairs.append(f"{label}: {norm(val)}")
    labeled_str = " | ".join(param_pairs[:9])
    desc_parts = [norm(val) for i, val in enumerate(row) if val and i > 0]
    
    p = {
        "part_number": part,
        "_section": "PHY " + current_series,
        "_params": labeled_str,
        "_raw": " | ".join(desc_parts[:10]),
        "category": current_series,
    }
    products.append(p)

doc.close()

# Remove duplicates
seen = set()
products = [p for p in products if not (p["part_number"] in seen or seen.add(p["part_number"]))]
print(f"  Extracted: {len(products)}")

# Check key products
for p in products:
    if p["part_number"] in ("YT8522A","YT8010A","YT8522H","YT8821C","YT8824C","YT8824H","YT8825HC","YT8821H"):
        print(f"  {p['part_number']:15s} {p['_params'][:100]}")

# LLM tag
print("\nLLM tagging...")
tagged_total = 0
for i in range(0, len(products), BATCH_SIZE):
    batch = products[i:i+BATCH_SIZE]
    print(f"  Batch {i//BATCH_SIZE+1}/{(len(products)-1)//BATCH_SIZE+1} ({len(batch)})...")
    tag_map = tag_batch(batch, "裕太微")
    for p in batch:
        p["_features"] = " ".join(tag_map.get(p["part_number"], []))
        if p.get("_features"):
            tagged_total += 1
    if i + BATCH_SIZE < len(products):
        time.sleep(0.5)

print(f"  Tagged: {tagged_total}/{len(products)}")

# Merge into existing
existing = json.loads(DATA_PATH.read_text())
existing["yutai"] = {"name": "裕太微", "productCount": len(products), "products": products}
DATA_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
total = sum(v["productCount"] for v in existing.values())
print(f"\nSaved. Total: {total} products")

# Final verification
for p in products:
    if p["part_number"] in ("YT8522A","YT8010A","YT8522H"):
        print(f"\n=== {p['part_number']} ===")
        print(f"  _params: {p['_params']}")
        print(f"  _features: {p.get('_features','')}")

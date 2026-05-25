#!/usr/bin/env python3
"""
Extract structured product data using pymupdf find_tables().
Maps each product row to its column header for full parameter extraction.
"""
import pymupdf
import json
import re
from pathlib import Path
from collections import defaultdict

RAW_DIR = Path("/Users/zhouchong/Projects/warehouse/raw")
OUT_DIR = Path("/Users/zhouchong/Projects/warehouse/web/public/data")

# Column header pattern — these appear as multi-line merged cells
# We normalize to single-line column names
COLUMN_MAP_20 = [
    "part_number", "status", "rating", "channels", "supply_v_min", "supply_v_max",
    "iq_per_ch_ua", "gbw_mhz", "slew_rate_v_us", "rail_in", "rail_out",
    "ishort_ma", "vos_max_mv", "offset_drift_uv_c", "ib_typ_pa",
    "vn_1khz_nv_rt_hz", "noise_01_10hz_uvpp", "temp_range_c", "features", "package"
]

COLUMN_MAP_21 = [
    "part_number", "status", "rating", "channels", "supply_v_min", "supply_v_max",
    "iq_per_ch_ua", "gbw_mhz", "slew_rate_v_us", "rail_in", "rail_out",
    "ishort_ma", "vos_max_mv", "offset_drift_uv_c", "ib_typ_pa",
    "vn_1khz_nv_rt_hz", "noise_01_10hz_uvpp", "shutdown", "temp_range_c", "features", "package"
]

def normalize_col(val):
    """Clean cell values."""
    if val is None:
        return ""
    return str(val).strip().replace("\n", " ")

def parse_page_tables(doc, page_num, col_map):
    """Extract all product rows from a page."""
    page = doc[page_num]
    tables = page.find_tables()
    products = []
    
    for table in tables.tables:
        data = table.extract()
        if not data:
            continue
        for row in data:
            if not row or not row[0]:
                continue
            part = str(row[0]).strip()
            # Skip header rows and non-product rows
            if not re.match(r'^[A-Z0-9]', part):
                continue
            if 'Part Number' in part or 'Supply' in part or 'Number of' in part:
                continue
            
            product = {}
            for i, col_name in enumerate(col_map):
                if i < len(row):
                    product[col_name] = normalize_col(row[i])
                else:
                    product[col_name] = ""
            products.append(product)
    
    return products

def extract_vendor(pdf_path, vendor_name):
    """Extract all products from a vendor PDF."""
    doc = pymupdf.open(str(pdf_path))
    all_products = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        tables = page.find_tables()
        if not tables.tables:
            continue
        
        # Detect column count from first table
        first_data = tables.tables[0].extract()
        if not first_data:
            continue
        
        # Find a product row to determine actual columns
        ncols = 0
        for row in first_data:
            part = str(row[0]).strip() if row else ""
            if re.match(r'^[A-Z][A-Z0-9]{2,}', part) and 'Part' not in part:
                ncols = len(row)
                break
        
        if ncols < 15:
            continue  # Not a product table
        
        col_map = COLUMN_MAP_20 if ncols <= 20 else COLUMN_MAP_21
        
        for table in tables.tables:
            data = table.extract()
            for row in data:
                if not row or not row[0]:
                    continue
                part = str(row[0]).strip()
                if not re.match(r'^[A-Z][A-Z0-9]{2,}', part):
                    continue
                if 'Part Number' in part or 'Supply' in part or 'Number of' in part:
                    continue
                
                product = {"vendor": vendor_name, "part_number": part}
                for i, col_name in enumerate(col_map):
                    if i < len(row):
                        product[col_name] = normalize_col(row[i])
                    else:
                        product[col_name] = ""
                all_products.append(product)
    
    doc.close()
    return all_products

# Process all vendors
vendor_configs = [
    ("思瑞浦-模拟产品选型册_2026.pdf", "3PEAK-Analog"),
    ("思瑞浦-汽车产品选型册_2026.pdf", "3PEAK-Auto"),
    ("纳芯微产品选型指南_202510.pdf", "Novosense"),
    ("裕太产品选型表 20250312.pdf", "Yutai"),
]

all_data = {}
for filename, vendor in vendor_configs:
    pdf_path = RAW_DIR / filename
    if not pdf_path.exists():
        print(f"  SKIP {filename} — not found")
        continue
    
    print(f"Extracting {filename}...")
    products = extract_vendor(pdf_path, vendor)
    
    # Deduplicate by part_number
    seen = set()
    unique = []
    for p in products:
        if p["part_number"] not in seen:
            seen.add(p["part_number"])
            unique.append(p)
    
    all_data[vendor] = {
        "name": vendor,
        "source": filename,
        "productCount": len(unique),
        "products": unique,
    }
    print(f"  → {len(unique)} unique products")

# Save
OUT_DIR.mkdir(parents=True, exist_ok=True)
out_path = OUT_DIR / "products_structured.json"
with open(out_path, "w") as f:
    json.dump(all_data, f, ensure_ascii=False, indent=2)

print(f"\nSaved to {out_path}")
total = sum(v["productCount"] for v in all_data.values())
print(f"Total structured products: {total}")

# Show sample
for vendor, data in all_data.items():
    if data["products"]:
        print(f"\n{vendor} sample:")
        p = data["products"][0]
        for k, v in p.items():
            if v:
                print(f"  {k}: {v}")
        break

#!/usr/bin/env python3
"""
Universal structured product extraction.
Handles ANY table format — auto-detects headers and extracts all product rows.
"""
import pymupdf
import json
import re
from pathlib import Path

RAW_DIR = Path("/Users/zhouchong/Projects/warehouse/raw")
OUT_PATH = Path("/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json")

def norm(v):
    return str(v).strip().replace("\n", " ") if v else ""

def is_header_row(row):
    """Detect if a row is a table header."""
    if not row or not row[0]:
        return True
    first = str(row[0]).strip().lower()
    # Direct header patterns
    if first in ("part number", "产品型号", "产品类别"):
        return True
    # Check if first cell contains multiple header-like terms (multi-line merged header)
    row_str = " ".join(str(c).lower() for c in row if c)
    header_terms = ["supply", "voltage", "number of", "iq per", "gbw", "slew", "vos", "产品型号"]
    return sum(1 for t in header_terms if t in row_str) >= 3

def is_part_number(s):
    """Strict part number detection."""
    s = s.strip()
    if not s or len(s) < 3:
        return False
    # Must be ASCII-only, no Chinese
    if re.search(r'[\u4e00-\u9fff]', s):
        return False
    # Blacklist generic terms
    blacklist = {
        "can", "lin", "sbc", "phy", "dcdc", "adc", "dac", "ldo", "pmic",
        "part", "产品", "型号", "类别", "简介", "封装", "制程", "状态", "端口", "接口",
        "收发器", "传感器", "隔离器", "驱动器", "放大器", "比较器", "转换器",
        "开关", "运放", "网卡", "交换机", "none",
    }
    if s.lower() in blacklist:
        return False
    if any(kw in s.lower() for kw in ["产品类别", "产品型号", "温度范围", "参数"]):
        return False
    # Must match typical part number pattern
    if not re.match(r'^[A-Z0-9][A-Za-z0-9\-\.]{2,}$', s):
        return False
    # Exclude things that look like values, not part numbers
    if re.match(r'^[\d\.\-\+~°]+$', s):
        return False
    return True

def extract_universal(doc, vendor_name):
    """Extract all products from any table format."""
    products = []
    
    for pn in range(len(doc)):
        page = doc[pn]
        tables = page.find_tables()
        if not tables.tables:
            continue
        
        # Get page text for section detection (first 500 chars)
        page_text = page.get_text()[:500]
        # Extract section hints from page text
        section_hints = []
        for kw in ["CAN", "LIN", "收发器", "放大器", "运放", "比较器", "隔离", "电源", "传感器", "开关", "PHY", "以太网", "马达", "驱动", "ADC", "DAC"]:
            if kw in page_text:
                section_hints.append(kw)
        section_context = " ".join(section_hints[:5]) if section_hints else ""
        
        for table in tables.tables:
            data = table.extract()
            if not data or len(data) < 1:
                continue
            
            # Find header and data rows
            header = None
            data_rows = []
            
            for row in data:
                if not row or not any(row):
                    continue
                if is_header_row(row):
                    header = row
                    continue
                
                # Detect which column has the part number
                part_col = 0
                if row[0] and re.search(r'[\u4e00-\u9fff]', str(row[0])) and len(row) > 1:
                    # First col is Chinese category — check col 1 for part number
                    if row[1] and is_part_number(str(row[1])):
                        part_col = 1
                
                if not row[part_col] or not is_part_number(str(row[part_col])):
                    continue
                
                data_rows.append((row, part_col))
            
            if not data_rows:
                continue
            
            # Build column names from header or use generic names
            max_cols = max(len(r[0]) for r, _ in data_rows)
            if header:
                col_names = [norm(h).replace(" ", "_").replace("(", "").replace(")", "").replace("/", "_").lower()[:40] for h in header]
            else:
                col_names = [f"param_{i}" for i in range(max_cols)]
            
            for row, part_col in data_rows:
                part = str(row[part_col]).strip()
                p = {"part_number": part, "vendor_section": vendor_name}
                if section_context:
                    p["_section"] = section_context
                
                # Auto-detect features from params and add as searchable tags
                all_vals = " ".join(str(v).lower() for v in row if v)
                features = []
                if "can" in all_vals or "tpt1" in part.lower():
                    # Detect CAN FD: explicit "FD", speed >= 5Mbps, or product in CAN section
                    has_fd = ("fd" in all_vals or "5mbps" in all_vals or "8mbps" in all_vals)
                    # Also check: if speed param (col 6 for analog, col 5 for auto) >= 5
                    speed_col = None
                    for i, v in enumerate(row):
                        try:
                            sv = float(str(v).strip())
                            if 5 <= sv <= 20 and i >= 4:
                                speed_col = sv
                                break
                        except:
                            pass
                    if has_fd or speed_col:
                        features.append("CAN FD")
                    if any(kw in all_vals for kw in ["standby", "sleep", "silent", "wake", "partial networking", "特定帧"]):
                        features.append("特定帧唤醒")
                    if "vio" in all_vals:
                        features.append("VIO")
                    if any(kw in all_vals for kw in ["70v", "±70", "-70 to +70"]):
                        features.append("高耐压")
                if features:
                    p["_features"] = " ".join(features)
                
                for i, val in enumerate(row):
                    col_name = col_names[i] if i < len(col_names) else f"param_{i}"
                    col_name = re.sub(r'[^\w]', '_', col_name)[:40]
                    if col_name and col_name != "part_number":
                        p[col_name] = norm(val)
                
                # Add original first col as category if different from part number
                if part_col == 1 and row[0] and str(row[0]).strip():
                    p["category"] = norm(row[0])
                
                products.append(p)
    
    return products

# Process all PDFs
vendor_map = {
    ("思瑞浦-模拟产品选型册_2026.pdf", "3peak-analog", "思瑞浦-模拟"),
    ("思瑞浦-汽车产品选型册_2026.pdf", "3peak-auto", "思瑞浦-汽车"),
    ("纳芯微产品选型指南_202510.pdf", "novosense", "纳芯微"),
    ("裕太产品选型表 20250312.pdf", "yutai", "裕太微"),
}

all_data = {}
for filename, slug, name in vendor_map:
    pdf_path = RAW_DIR / filename
    if not pdf_path.exists():
        continue
    
    print(f"Extracting {filename}...")
    doc = pymupdf.open(str(pdf_path))
    products = extract_universal(doc, name)
    doc.close()
    
    # Deduplicate
    seen = set()
    unique = []
    for p in products:
        if p["part_number"] not in seen:
            seen.add(p["part_number"])
            unique.append(p)
    
    all_data[slug] = {"name": name, "productCount": len(unique), "products": unique}
    print(f"  → {len(unique)} products")

# Save
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUT_PATH.write_text(json.dumps(all_data, ensure_ascii=False, indent=2))
total = sum(v["productCount"] for v in all_data.values())
print(f"\nSaved: {OUT_PATH} ({total} total)")

# Verify CAN products in analog
analog = all_data.get("3peak-analog", {}).get("products", [])
cans = [p for p in analog if "can" in json.dumps(p, ensure_ascii=False).lower() or "tpt1" in p["part_number"].lower()]
print(f"\n3PEAK Analog CAN/transceiver products: {len(cans)}")
for p in cans[:8]:
    print(f"  {p['part_number']:20s} | {json.dumps({k:v for k,v in p.items() if k not in ('part_number','vendor_section') and v}, ensure_ascii=False)[:100]}")

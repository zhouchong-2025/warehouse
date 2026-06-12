#!/usr/bin/env python3
"""Supplement: capture Yutai products lost to merged cells in find_tables()."""
import json, re, pymupdf
from pathlib import Path

DATA_PATH = Path("/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json")

# Load existing Yutai data
existing = json.loads(DATA_PATH.read_text())
yutai_products = existing["yutai"]["products"]
existing_parts = {p["part_number"] for p in yutai_products}

SCHEMA = ['系列','简介','封装','制程','状态','工作环境温度','端口','接口','Note']

def is_part_number(s):
    s = s.strip()
    if not s or len(s) < 3: return False
    if re.search(r'[\u4e00-\u9fff]', s): return False
    blacklist = {'can','lin','sbc','phy','dcdc','adc','dac','ldo','pmic','part','收发器','传感器','隔离器','驱动器','放大器','比较器','转换器','开关','运放','网卡','交换机','none','目前已有','PHY晶圆'}
    if s.lower() in blacklist: return False
    return bool(re.match(r'^[A-Z0-9][A-Za-z0-9\-\.]{2,}$', s))

# Parse raw text to find missing products
doc = pymupdf.open(str(Path("/Users/zhouchong/Projects/warehouse/raw/裕太产品选型表 20250312.pdf")))
text = doc[0].get_text()
doc.close()

lines = text.split("\n")
new_products = []
current_series = ""

# Known products that appear in raw text but NOT in table extraction:
# YT8824H, YT8824C, YT8825H, YT8825C, and switch chips that had garbled descriptions

for i, line in enumerate(lines):
    stripped = line.strip()
    if not stripped:
        continue
    
    # Series detection
    if "系列" in stripped and len(stripped) <= 25 and not is_part_number(stripped):
        current_series = stripped
        continue
    
    # Part number
    if is_part_number(stripped) and stripped not in existing_parts:
        part = stripped
        # Collect following parameter lines
        params = []
        j = i + 1
        while j < len(lines) and len(params) < 10:
            nl = lines[j].strip()
            if nl and (is_part_number(nl) or ("系列" in nl and len(nl) <= 20 and not is_part_number(nl))):
                break  # next product
            if nl and len(nl) < 100:
                params.append(nl)
            j += 1
        
        # Label with schema
        labeled = []
        for si, pv in enumerate(params[:len(SCHEMA)-1]):
            label = SCHEMA[si+1] if si+1 < len(SCHEMA) else f"c{si+1}"
            labeled.append(f"{label}: {pv}")
        param_str = " | ".join(labeled) if labeled else " | ".join(params[:9])
        
        p = {
            "part_number": part,
            "_section": "PHY " + current_series,
            "_params": param_str,
            "_raw": " | ".join(params[:10]),
            "_features": "",
            "category": current_series,
        }
        new_products.append(p)

print(f"Found {len(new_products)} missed products:")
for p in new_products:
    print(f"  {p['part_number']:15s} {p['_params'][:100]}")

if new_products:
    yutai_products.extend(new_products)
    existing["yutai"]["productCount"] = len(yutai_products)
    existing["yutai"]["products"] = yutai_products
    DATA_PATH.write_text(json.dumps(existing, ensure_ascii=False, indent=2))
    print(f"\nUpdated: {len(yutai_products)} total Yutai products")

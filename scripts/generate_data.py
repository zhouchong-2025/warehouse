#!/usr/bin/env python3
"""
Generate structured product data from wiki extracted markdown.
Parses vendor-specific selection tables and outputs a searchable JSON.
"""
import json
import re
from pathlib import Path

WIKI_RAW = Path("/Users/zhouchong/Projects/warehouse/wiki/raw/papers")
OUTPUT = Path("/Users/zhouchong/Projects/warehouse/web/public/data")
OUTPUT.mkdir(parents=True, exist_ok=True)

products = []
vendors_data = {}

def parse_yutai(content: str) -> list:
    """Parse Yutai selection table (structured by series headers)."""
    results = []
    lines = content.split("\n")
    
    current_series = ""
    current_category = ""
    # Skip to product data
    in_data = False
    columns = []
    product_lines = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
            
        # Detect series headers like "80系列/车规" or "81系列/phy系列"
        if re.match(r"^\d+系列", line):
            current_series = line
            current_category = "automotive" if "车规" in line else "industrial"
            continue
            
        # Detect sub-headers like "单口PHY", "2.5GPHY"
        if re.match(r"^(单口|千兆|2\.5G|4口|8口)", line) or "PHY" in line:
            current_category = line
            continue
            
        # Product lines: chip name is alphanumeric starting with YT or SZ
        if re.match(r"^(YT\d|SZ\d)", line):
            product_lines.append(line)
    
    return results

def parse_simple(text: str, vendor: str, source: str) -> list:
    """Simple extraction: find product names and nearby parameter lines."""
    results = []
    lines = text.split("\n")
    
    for i, line in enumerate(lines):
        line = line.strip()
        if not line:
            continue
        
        # Extract any product-like line (chip part numbers)
        # Common patterns: YTxxxx, SZxxx, NSIxxx, TPAxxx, etc.
        pass
    
    return results

# Process each vendor
vendor_map = {
    "裕太产品选型表 20250312": {"vendor": "yutai", "name": "裕太微"},
    "思瑞浦-模拟产品选型册_2026": {"vendor": "3peak-analog", "name": "思瑞浦-模拟"},
    "思瑞浦-汽车产品选型册_2026": {"vendor": "3peak-auto", "name": "思瑞浦-汽车"},
    "纳芯微产品选型指南_202510": {"vendor": "novosense", "name": "纳芯微"},
}

for md_file in sorted(WIKI_RAW.glob("*.md")):
    name = md_file.stem
    content = md_file.read_text()
    
    info = vendor_map.get(name, {"vendor": "unknown", "name": name})
    
    vendor_entry = {
        "slug": info["vendor"],
        "name": info["name"],
        "source": name,
        "totalChars": len(content),
        "pageCount": content.count("## Page "),
        "products": [],
    }
    
    # Extract product chip numbers
    # Match common semiconductor part numbers
    chip_pattern = re.compile(
        r'\b([A-Z]{2,4}\d{3,6}[A-Za-z0-9\-]*)\b',
        re.MULTILINE
    )
    
    seen = set()
    for match in chip_pattern.finditer(content):
        chip = match.group(1)
        if chip in seen:
            continue
        seen.add(chip)
        
        vendor_entry["products"].append({
            "part_number": chip,
            "start": match.start(),
            "end": match.end(),
        })
    
    vendor_entry["productCount"] = len(vendor_entry["products"])
    vendors_data[info["vendor"]] = vendor_entry

# Save
output_path = OUTPUT / "products.json"
output_path.write_text(json.dumps(vendors_data, ensure_ascii=False, indent=2))
print(f"Generated {output_path}")
print(f"Total products found: {sum(v['productCount'] for v in vendors_data.values())}")
for v in vendors_data.values():
    print(f"  {v['name']}: {v['productCount']} products, {v['totalChars']:,} chars, {v['pageCount']} pages")

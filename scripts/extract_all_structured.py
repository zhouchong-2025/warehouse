#!/usr/bin/env python3
"""
Multi-vendor structured product extraction using pymupdf find_tables().
Handles 4 different table formats: 3PEAK Analog, 3PEAK Auto, Novosense, Yutai.
"""
import pymupdf
import json
import re
from pathlib import Path

RAW_DIR = Path("/Users/zhouchong/Projects/warehouse/raw")
OUT_PATH = Path("/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json")

def norm(v):
    return str(v).strip().replace("\n", " ") if v else ""

def is_part_number(s):
    """Check if a string looks like a chip part number."""
    s = s.strip()
    if not s or len(s) < 3:
        return False
    # Blacklist: category headers, generic terms that are not part numbers
    blacklist = {
        "part", "产品", "型号", "类别", "简介", "封装", "制程", "状态", "端口", "接口",
        "can", "lin", "sbc", "phy", "dcdc", "adc", "dac", "ldo", "pmic",
        "收发器", "传感器", "隔离器", "驱动器", "放大器", "比较器", "转换器",
        "开关", "运放", "网卡", "交换机",
    }
    s_lower = s.lower()
    if s_lower in blacklist:
        return False
    if any(kw in s_lower for kw in ["产品类别", "产品型号", "温度", "电压", "电流", "参数"]):
        return False
    return bool(re.match(r'^[A-Z0-9][A-Za-z0-9\-]{2,}$', s)) and not bool(re.search(r'[\u4e00-\u9fff]', s))

def extract_3peak_analog(doc):
    """20/21-column op-amp param table."""
    COL_20 = ["part_number","status","rating","channels","supply_v_min","supply_v_max",
              "iq_per_ch_ua","gbw_mhz","slew_rate_v_us","rail_in","rail_out",
              "ishort_ma","vos_max_mv","offset_drift_uv_c","ib_typ_pa",
              "vn_1khz_nv_rt_hz","noise_01_10hz_uvpp","temp_range_c","features","package"]
    COL_21 = COL_20[:17] + ["shutdown"] + COL_20[17:]
    
    products = []
    for pn in range(len(doc)):
        for table in doc[pn].find_tables().tables:
            data = table.extract()
            for row in data:
                if not row or not row[0]:
                    continue
                part = str(row[0]).strip()
                if not is_part_number(part):
                    continue
                ncols = len(row)
                col_map = COL_21 if ncols >= 21 else COL_20
                p = {}
                for i, name in enumerate(col_map):
                    p[name] = norm(row[i]) if i < ncols else ""
                products.append(p)
    return products

def extract_3peak_auto(doc):
    """7-column product catalog. Skip header rows and non-product data."""
    COL = ["category","part_number","status","package","description","alternatives","application"]
    products = []
    for pn in range(len(doc)):
        for table in doc[pn].find_tables().tables:
            data = table.extract()
            for row in data:
                if not row or len(row) < 2:
                    continue
                part = str(row[1]).strip() if len(row) > 1 else ""
                # Skip header rows
                if part in ("产品型号", "") or "产品类别" in str(row[0]):
                    continue
                if not is_part_number(part):
                    continue
                p = {}
                for i, name in enumerate(COL):
                    p[name] = norm(row[i]) if i < len(row) else ""
                # Filter garbage — valid products have at least a non-empty category and description
                if len(p.get("category", "")) > 30 or len(p.get("description", "")) > 200:
                    continue
                products.append(p)
    return products

def extract_novosense(doc):
    """Novosense has mixed formats. Detect column count per table."""
    products = []
    for pn in range(len(doc)):
        for table in doc[pn].find_tables().tables:
            data = table.extract()
            if not data:
                continue
            
            # Find the header row to detect column names
            header_row = None
            header_idx = -1
            for ri, row in enumerate(data):
                if row and "产品型号" in str(row[0]):
                    header_row = row
                    header_idx = ri
                    break
            
            for ri, row in enumerate(data):
                if ri == header_idx:
                    continue
                if not row or not row[0]:
                    continue
                part = str(row[0]).strip()
                if not is_part_number(part) and not re.match(r'^(NS|MT|NCA|NSI|NSP|NSD)', part):
                    continue
                
                p = {"part_number": part}
                if header_row:
                    for i, col_name in enumerate(header_row):
                        if i < len(row):
                            key = norm(col_name).replace(" ", "_").replace("(", "").replace(")", "").lower()
                            p[key] = norm(row[i])
                else:
                    for i, val in enumerate(row[1:], 1):
                        p[f"param_{i}"] = norm(val)
                products.append(p)
    return products

def extract_yutai(doc):
    """9-column: 产品型号, 简介, 封装, 制程, 状态, 工作环境温度, 端口, 接口, Note"""
    COL = ["part_number","description","package","process_node","status",
           "temp_range","ports","interface","note"]
    products = []
    current_series = ""
    
    for pn in range(len(doc)):
        for table in doc[pn].find_tables().tables:
            data = table.extract()
            for row in data:
                if not row:
                    continue
                part = str(row[0]).strip() if row[0] else ""
                
                # Track series
                if re.match(r'^\d+系列', part):
                    current_series = part
                    continue
                
                if not is_part_number(part):
                    continue
                
                p = {"series": current_series}
                for i, name in enumerate(COL):
                    p[name] = norm(row[i]) if i < len(row) else ""
                products.append(p)
    return products

# Main
all_data = {}

# 3PEAK Analog
doc = pymupdf.open(str(RAW_DIR / "思瑞浦-模拟产品选型册_2026.pdf"))
prods = extract_3peak_analog(doc)
seen = set(); prods = [p for p in prods if not (p["part_number"] in seen or seen.add(p["part_number"]))]
all_data["3peak-analog"] = {"name":"思瑞浦-模拟","productCount":len(prods),"products":prods}
doc.close()
print(f"3PEAK-Analog: {len(prods)} products")

# 3PEAK Auto
doc = pymupdf.open(str(RAW_DIR / "思瑞浦-汽车产品选型册_2026.pdf"))
prods = extract_3peak_auto(doc)
seen = set(); prods = [p for p in prods if not (p["part_number"] in seen or seen.add(p["part_number"]))]
all_data["3peak-auto"] = {"name":"思瑞浦-汽车","productCount":len(prods),"products":prods}
doc.close()
print(f"3PEAK-Auto: {len(prods)} products")

# Novosense
doc = pymupdf.open(str(RAW_DIR / "纳芯微产品选型指南_202510.pdf"))
prods = extract_novosense(doc)
seen = set(); prods = [p for p in prods if not (p["part_number"] in seen or seen.add(p["part_number"]))]
all_data["novosense"] = {"name":"纳芯微","productCount":len(prods),"products":prods}
doc.close()
print(f"Novosense: {len(prods)} products")

# Yutai
doc = pymupdf.open(str(RAW_DIR / "裕太产品选型表 20250312.pdf"))
prods = extract_yutai(doc)
seen = set(); prods = [p for p in prods if not (p["part_number"] in seen or seen.add(p["part_number"]))]
all_data["yutai"] = {"name":"裕太微","productCount":len(prods),"products":prods}
doc.close()
print(f"Yutai: {len(prods)} products")

# Save
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUT_PATH.write_text(json.dumps(all_data, ensure_ascii=False, indent=2))
total = sum(v["productCount"] for v in all_data.values())
print(f"\nSaved: {OUT_PATH}")
print(f"Total structured: {total}")

# Samples
for key, data in all_data.items():
    if data["products"]:
        p = data["products"][0]
        print(f"\n{data['name']} sample: {json.dumps(p, ensure_ascii=False)[:200]}")

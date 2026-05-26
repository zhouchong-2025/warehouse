#!/usr/bin/env python3
"""LLM-powered semantic feature extraction — per-product batch tagging."""
import pymupdf, json, re, time, requests
from pathlib import Path
from collections import defaultdict

RAW_DIR = Path("/Users/zhouchong/Projects/warehouse/raw")
OUT_PATH = Path("/Users/zhouchong/Projects/warehouse/web/public/data/products_structured.json")
KEY = "sk-dc723ac3c6534e2c91ba0574c47c3567"
LLM_URL = "https://api.deepseek.com/v1/chat/completions"
BATCH_SIZE = 15

def norm(v): return str(v).strip().replace("\n", " ") if v else ""

def is_header_row(row):
    if not row or not row[0]: return True
    first = str(row[0]).strip().lower()
    if first in ("part number", "产品型号", "产品类别"): return True
    row_str = " ".join(str(c).lower() for c in row if c)
    return sum(1 for t in ["supply","voltage","number of","iq per","gbw","slew","vos","产品型号"] if t in row_str) >= 3

def is_part_number(s):
    s = s.strip()
    if not s or len(s) < 3: return False
    if re.search(r'[\u4e00-\u9fff]', s): return False
    blacklist = {"can","lin","sbc","phy","dcdc","adc","dac","ldo","pmic","part","收发器","传感器","隔离器","驱动器","放大器","比较器","转换器","开关","运放","网卡","交换机","none"}
    if s.lower() in blacklist: return False
    return bool(re.match(r'^[A-Z0-9][A-Za-z0-9\-\.]{2,}$', s))

def extract_raw(doc, vendor_name):
    products = []
    for pn in range(len(doc)):
        page = doc[pn]
        tables = page.find_tables()
        if not tables.tables: continue
        page_text = page.get_text()[:500]
        section_hints = []
        for kw in ["CAN","LIN","收发器","放大器","运放","比较器","隔离","电源","传感器","开关","PHY","以太网","马达","驱动","ADC","DAC","接口","DCDC","LDO","SBC"]:
            if kw in page_text: section_hints.append(kw)
        ctx = " ".join(section_hints[:5]) if section_hints else ""
        for table in tables.tables:
            data = table.extract()
            if not data: continue
            header = None; data_rows = []
            for row in data:
                if not row or not any(row): continue
                if is_header_row(row): header = row; continue
                part_col = 0
                if row[0] and re.search(r'[\u4e00-\u9fff]', str(row[0])) and len(row) > 1:
                    if row[1] and is_part_number(str(row[1])): part_col = 1
                if not row[part_col] or not is_part_number(str(row[part_col])):
                    full_text = " ".join(str(c) for c in row if c)
                    pn_match = re.search(r'\b([A-Z][A-Z0-9]{2,}[\w\-\.]+(?:-[A-Z0-9]+)+)\b', full_text)
                    if pn_match and is_part_number(pn_match.group(1)):
                        row = [pn_match.group(1)] + [full_text]; part_col = 0
                    else: continue
                data_rows.append((row, part_col))
            if not data_rows: continue
            
            # Build labeled params — use vendor-specific full schema
            if "汽车" in vendor_name:
                schema = ['产品类别','产品型号','状态','封装','产品描述','可替代产品','应用领域']
            else:
                schema = ['Part Number','Status','Rating','Supply Voltage (V)','Bus Fault Protection Voltage (V)','Max Data Rate (Mbps)','Channels','Features','BUS Contact ESD (kV)','Package']
            
            for row, part_col in data_rows:
                part = str(row[part_col]).strip()
                param_pairs = []
                si = 0
                for i, val in enumerate(row):
                    if val and i != part_col:
                        label = schema[i] if i < len(schema) else f"c{i}"
                        param_pairs.append(f"{label}: {norm(val)}")
                labeled_str = " | ".join(param_pairs[:12])
                
                desc_parts = [norm(val) for i, val in enumerate(row) if val and i != part_col]
                p = {"part_number": part, "_section": ctx, "_params": labeled_str, "_raw": " | ".join(desc_parts[:10])}
                if part_col == 1 and row[0]: p["category"] = norm(row[0])
                products.append(p)
    # After table extraction: scan raw text for orphan products not captured by tables
    already = {p["part_number"] for p in products}
    for pn in range(len(doc)):
        text = doc[pn].get_text()
        lines = text.split("\n")
        
        # Detect page-level header: consecutive lines that look like column names
        page_header = []
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped: continue
            # Header lines are short, contain keywords
            if any(kw in stripped.lower() for kw in ["part number","supply","voltage","bus fault","data rate","number of","channel","feature","esd","package","status","rating","温度","电压","封装","接口"]):
                page_header.append(stripped)
            elif page_header and len(page_header) >= 4:
                break  # found enough header lines
            else:
                page_header = []
        
        # Find part numbers with parameter blocks, label with page header
        for m in re.finditer(r'(?:^|\n)([A-Z][A-Z0-9]{2,}[\w\-\.]*(?:-[\w]+)*)\n((?:.+\n?){3,15})', text, re.MULTILINE):
            part = m.group(1).strip()
            if not is_part_number(part) or part in already: continue
            param_block = m.group(2).strip()
            param_lines = [l.strip() for l in param_block.split("\n") if l.strip() and len(l.strip()) < 100]
            
            # Label with vendor schema (same as table extraction)
            if "汽车" in vendor_name:
                schema = ['产品类别','产品型号','状态','封装','产品描述','可替代产品','应用领域']
                # Orphan params: first line is part number, rest are param lines
                labeled = []
                # Check if first line is the part number
                start = 1 if param_lines and part in param_lines[0] else 0
                for j, pl in enumerate(param_lines):
                    si = j + start
                    if si == 0: continue  # part number already stored
                    label = schema[si] if si < len(schema) else f"c{si}"
                    labeled.append(f"{label}: {pl}")
                param_str = " | ".join(labeled) if labeled else " | ".join(param_lines[:10])
            elif page_header and len(page_header) >= 3:
                labeled = []
                for j, pl in enumerate(param_lines[:len(page_header)]):
                    label = page_header[j][:25]
                    labeled.append(f"{label}: {pl}")
                param_str = " | ".join(labeled)
            else:
                param_str = " | ".join(param_lines[:10])
            
            hints = []
            for kw in ["CAN","LIN","收发器","放大器","运放","比较器","隔离","电源","传感器","开关","PHY","以太网","马达","驱动","ADC","DAC","接口","DCDC","LDO","SBC"]:
                if kw in text[:500]: hints.append(kw)
            ctx = " ".join(hints[:5])
            p = {"part_number": part, "_section": ctx, "_params": param_str, "_raw": param_str}
            products.append(p)
            already.add(part)
    # Filter out junk (non-product headers, category labels mistaken as products)
    products = [p for p in products if not any(kw in p.get('_params','') for kw in ['功能框图','封装引脚','Contact 3PEAK','www.3peak'])]
    return products

TAG_PROMPT = """你是半导体产品标注专家。为每个产品输出标签。

标签词汇表（只能从中选择）：
车规AEC-Q100 | 工业级 | 消费级 | CAN FD | 特定帧唤醒(Partial Networking) | 低功耗唤醒 | LIN | VIO | 高耐压 | 轨到轨 | 高速(≥50MHz) | 中速(≥10MHz) | 超低功耗(≤1µA) | 低功耗(≤50µA) | 精密(≤1mV Vos) | 高压(≥30V) | 千兆 | 2.5G | 百兆 | Pin-to-Pin兼容 | 5kVrms隔离 | 3kVrms隔离 | 隔离电源 | 电流传感器 | 温度传感器 | 压力传感器 | 位置传感器

规则：
- CAN FD: 仅CAN收发器(非SBC非LIN)且有速度≥5或明确CAN FD/FD时才加。SBC(含LDO/Watchdog/SPI)即使提到CAN也不加
- 特定帧唤醒: 仅CAN收发器有Selective Wake/Partial Networking时加。SBC/LIN不加
- 低功耗唤醒: Standby/Sleep/Wake pin→低功耗唤醒
- LIN收发器→LIN
- 车用/汽车/Automotive/AEC→车规AEC-Q100
- 工业温度(-40~85)/Industrial→工业级
- 千兆/GE→千兆; 百兆/FE→百兆; 2.5G→2.5G
- P2P/兼容/替代→Pin-to-Pin兼容
- 隔离5000V→5kVrms隔离; 3000V→3kVrms隔离
- 运放GBW≥50→高速(≥50MHz); ≥10→中速(≥10MHz)
- 运放Iq≤1µA→超低功耗(≤1µA); ≤50µA→低功耗(≤50µA)
- 运放Vos≤1mV→精密(≤1mV Vos); Vs≥30V→高压(≥30V)

输出JSON数组：[{"pn":"型号","features":["标签"]}], 不要markdown。"""

def tag_batch(products_batch, vendor_name):
    items = [f"{p['part_number']}: {p.get('_raw','')[:150]}" for p in products_batch]
    user_msg = f"厂商: {vendor_name}\n产品列表:\n" + "\n".join(items) + "\n\n输出每个产品的标签JSON数组。"
    try:
        resp = requests.post(LLM_URL, headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
            json={"model": "deepseek-chat", "messages": [{"role":"system","content":TAG_PROMPT},{"role":"user","content":user_msg}],
            "temperature":0.1, "max_tokens":1000}, timeout=30)
        if resp.status_code != 200: print(f"  LLM error {resp.status_code}"); return {}
        content = resp.json()["choices"][0]["message"]["content"]
        m = re.search(r'\[[\s\S]*\]', content)
        if not m: print(f"  LLM bad format: {content[:200]}"); return {}
        results = json.loads(m.group(0))
        return {r["pn"]: r.get("features",[]) for r in results if isinstance(r, dict) and "pn" in r}
    except Exception as e: print(f"  LLM exception: {e}"); return {}

# ── Main ──
vendor_map = [
    ("思瑞浦-模拟产品选型册_2026.pdf","3peak-analog","思瑞浦-模拟"),
    ("思瑞浦-汽车产品选型册_2026.pdf","3peak-auto","思瑞浦-汽车"),
    ("纳芯微产品选型指南_202510.pdf","novosense","纳芯微"),
    ("裕太产品选型表 20250312.pdf","yutai","裕太微"),
]

all_data = {}
for filename, slug, name in vendor_map:
    pdf_path = RAW_DIR / filename
    if not pdf_path.exists(): continue
    print(f"\n{name}")
    doc = pymupdf.open(str(pdf_path))
    products = extract_raw(doc, name); doc.close()
    seen = set(); products = [p for p in products if not (p["part_number"] in seen or seen.add(p["part_number"]))]
    print(f"  Extracted: {len(products)}")
    for i in range(0, len(products), BATCH_SIZE):
        batch = products[i:i+BATCH_SIZE]
        print(f"  LLM batch {i//BATCH_SIZE+1}/{(len(products)-1)//BATCH_SIZE+1} ({len(batch)})...")
        tag_map = tag_batch(batch, name)
        for p in batch:
            p["_features"] = " ".join(tag_map.get(p["part_number"],[]))
            # Keep _params as-is (already labeled during extraction)
        if i+BATCH_SIZE < len(products): time.sleep(0.5)
    all_data[slug] = {"name":name, "productCount":len(products), "products":products}
    tagged = sum(1 for p in products if p.get("_features"))
    print(f"  Tagged: {tagged}/{len(products)}")

OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
OUT_PATH.write_text(json.dumps(all_data, ensure_ascii=False, indent=2))
total = sum(v["productCount"] for v in all_data.values())
print(f"\nSaved: {OUT_PATH} ({total} total)")
for slug, vd in all_data.items():
    print(f"  {vd['name']}: {vd['productCount']} products")

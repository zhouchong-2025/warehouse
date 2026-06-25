#!/usr/bin/env python3
"""
ChipSelect 全量验证脚本 - 四道检查 + PDF 自审计
用法: python3 scripts/validate.py [--search] [--json]
"""
import json, re, sys, os
from collections import defaultdict

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data", "products_structured.json")
PDF_PATH = os.path.join(os.path.dirname(__file__), "..", "raw", "思瑞浦-模拟产品选型册_2026.pdf")
PROMPT_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "app", "api", "interpret", "route.ts")

CATEGORY_TAGS = [
    '运放','放大器','比较器','LDO','DCDC','升压','降压','CAN-FD','LIN',
    'RS-485','RS-232','I2C','栅极驱动','隔离栅极驱动','马达驱动','模拟开关',
    '负载开关','IO扩展','IO扩展器','数字隔离器','隔离放大器','隔离电源','隔离ADC','隔离I2C','隔离RS485','集成隔离电源的隔离CAN','集成隔离电源的隔离RS485','温度传感器',
    '压力传感器','位置传感器','电流传感器','电流检测放大器','电流功率检测器',
    '电压基准','ADC','DAC',
    '复位芯片','以太网','交换机','网卡','T1-PHY','SGMII','RGMII','QSGMII',
    'PHY',
    '逻辑','电平转换','SBC','100FX','MLVDS','以太网供电',
    'TVS/ESD','EMI滤波器','电池充电','音频功放','音频总线','匹配电阻','传感器接口',
    '高边驱动','高边开关','低边驱动','电池监控','电子保险丝','理想二极管','电源时序','BMS','逻辑门',
    '视频滤波','隔离CAN','LED驱动','MCU/DSP','速度传感器','线性位置传感器',
    '霍尔角度编码器', '磁阻角度编码器', '霍尔开关/锁存器', '磁阻开关/锁存器',
    '固态继电器',
    'PMIC', 'DrMOS', '氮化镓功率芯片',
]

# ── Check 1: Category tags ──
def check_tags(data):
    issues, no_tag = [], []
    for slug, vd in data.items():
        for p in vd['products']:
            if not any(tag in p.get('_features','') for tag in CATEGORY_TAGS):
                no_tag.append((p['part_number'], vd['name']))
    if no_tag:
        issues.append("{} 产品缺品类标签".format(len(no_tag)))
        for pn, vn in no_tag[:10]: issues.append("  {} [{}]".format(pn, vn))
        if len(no_tag) > 10: issues.append("  ... +{}".format(len(no_tag)-10))
    return len(no_tag) == 0, issues, no_tag

# ── Check 1.5: Exclusive category pollution ──
EXCLUSIVE_CATEGORY_GROUPS = [
    ('运放', '比较器'),
]

def check_exclusive_categories(data):
    issues, polluted = [], []
    for slug, vd in data.items():
        for p in vd['products']:
            feats = set((p.get('_features', '') or '').split())
            for group in EXCLUSIVE_CATEGORY_GROUPS:
                hit = [tag for tag in group if tag in feats]
                if len(hit) > 1:
                    polluted.append((p['part_number'], vd['name'], '/'.join(hit), p.get('_section', '')))
    if polluted:
        issues.append("{} 产品存在互斥品类双标".format(len(polluted)))
        for pn, vn, tags, sec in polluted[:10]:
            issues.append("  {} [{}] {} section={}".format(pn, vn, tags, sec))
        if len(polluted) > 10:
            issues.append("  ... +{}".format(len(polluted)-10))
    return len(polluted) == 0, issues, polluted

# ── Check 2: Schema value types ──
def is_numeric_or_range(s):
    s = s.strip().replace('\\u2212', '-').replace('−', '-').replace('–', '-').replace('—', '-')
    if not s or s in ('/','NA','N/A','-','External FET','Isolated Output'): return True
    if s in ('>VIN','VIN~45','VIN~80'): return True
    if re.match(r'^[\d.]+\s*[~\-]\s*[\d.]+', s): return True
    if re.match(r'^[+\-]?\s*[\d.]+', s): return True
    return False

def is_temp(s):
    s = s.strip()
    if not s: return True
    return bool(re.search(r'[°℃]|to\s*[+\-]?\d|~\s*[+\-]?\d', s))

SCHEMA_CHECKS = {
    '栅极驱动': [('Supply Voltage', is_numeric_or_range), ('Peak Current', is_numeric_or_range), ('Temperature Range', is_temp)],
    'CAN': [('Supply Voltage', is_numeric_or_range), ('Bus Fault', is_numeric_or_range), ('Max Data Rate', is_numeric_or_range)],
    '比较器': [('Supply', is_numeric_or_range), ('Delay', is_numeric_or_range)],
    '运放': [('Channels', lambda s: s.strip().isdigit()), ('Supply', is_numeric_or_range), ('GBW', is_numeric_or_range)],
    'LDO': [('Iout', is_numeric_or_range)],
    'DCDC': [('VIN', is_numeric_or_range), ('VOUT', lambda s: True), ('Iout', is_numeric_or_range)],
    '升压': [('VIN', is_numeric_or_range), ('VOUT', lambda s: True)],
    '降压': [('VIN', is_numeric_or_range), ('VOUT', is_numeric_or_range)],
}

def check_schema(data):
    issues, misalign = [], []
    for slug, vd in data.items():
        for p in vd['products']:
            ft, params = p.get('_features',''), p.get('_params','')
            for tag, checks in SCHEMA_CHECKS.items():
                if tag not in ft: continue
                param_dict = {}
                for part in params.split('|'):
                    if ':' in part:
                        k, v = part.split(':', 1)
                        param_dict[k.strip()] = v.strip()
                for col, validator in checks:
                    for pk, pv in param_dict.items():
                        if col in pk and pv and not validator(pv):
                            misalign.append((p['part_number'], vd['name'], tag, pk, pv[:50]))
                            break
    if misalign:
        by_cat = defaultdict(list)
        for item in misalign: by_cat[item[2]].append(item)
        for cat, items in sorted(by_cat.items()):
            issues.append("{}: {} 处列值异常".format(cat, len(items)))
            for pn, vn, _, col, val in items[:3]:
                issues.append("  {} [{}] {}={}".format(pn, vn, col, val))
            if len(items) > 3: issues.append("  ... +{}".format(len(items)-3))
    return len(misalign) == 0, issues, misalign

# ── Check 2.5: ParamN labels (missing proper schema) ──
def check_paramn(data):
    issues, param_products = [], []
    for slug, vd in data.items():
        for p in vd['products']:
            if 'Param1' in p.get('_params',''):
                ft = p.get('_features','')
                # Find which category tag applies
                cat = 'none'
                for tag in CATEGORY_TAGS:
                    if tag in ft:
                        cat = tag
                        break
                param_products.append((p['part_number'], vd['name'], cat))
    
    if param_products:
        by_cat = defaultdict(list)
        for item in param_products:
            by_cat[item[2]].append(item)
        issues.append("{} 产品仍有 ParamN 标签".format(len(param_products)))
        for cat, items in sorted(by_cat.items(), key=lambda x: -len(x[1])):
            issues.append("  {}: {} 款".format(cat, len(items)))
            for pn, vn, _ in items[:3]:
                issues.append("    {} [{}]".format(pn, vn))
            if len(items) > 3:
                issues.append("    ... +{}".format(len(items)-3))
    
    return len(param_products) == 0, issues, param_products

# ── Check 3: PDF Section Coverage (auto-discovery) ──
def check_section_coverage(data):
    issues, missing = [], []
    if not os.path.exists(PDF_PATH):
        issues.append("PDF not found, skip section check")
        return False, issues, []
    
    import pymupdf
    doc = pymupdf.open(PDF_PATH)
    
    # Auto-discover sections
    sections = {}
    current_section = None
    for page in doc:
        text = page.get_text()
        lines = text.split(chr(10))
        for i, line in enumerate(lines):
            ls = line.strip()
            if not ls: continue
            if ls in sections:
                current_section = ls
                continue
            if len(ls) >= 2 and len(ls) <= 40:
                if i+2 < len(lines) and ('Part Number' in lines[i+1] or 'Part Number' in lines[i+2]):
                    sections[ls] = set()
                    current_section = ls
                    continue
            if current_section and re.match(r'^(TP|LM|CM|SN|3P)[A-Z]?\d', ls):
                if not any(c in ls for c in ['(',')','.',',',' ']):
                    sections[current_section].add(ls)
    doc.close()
    
    # Section-to-tag mapping
    TAG_MAP = {
        'CAN 收发器': 'CAN-FD', 'LIN 收发器': 'LIN', 'RS485 收发器': 'RS-485',
        'RS232 收发器': 'RS-232', 'IO 扩展器': 'IO扩展', 'SBC': 'SBC',
        'MLVDS': 'MLVDS', '隔离电源': '隔离电源', '以太网供电': '以太网供电',
        '温度传感器': '温度传感器', '高压模拟开关': '模拟开关', '低压模拟开关': '模拟开关',
        '电平转换器': '电平转换', '逻辑和电平转换器': '电平转换',
        '步进马达驱动': '马达驱动', '直流马达驱动': '马达驱动',
        '隔离栅极驱动': '隔离栅极驱动', '非隔离栅极驱动': '栅极驱动',
        '升压变换器': '升压', '宽压降压变换器': '降压', '中压降压变换器': '降压', '低压降压变换器': '降压',
        '负载开关': '负载开关', '高边开关': '负载开关',
        '比较器': '比较器', '电流信号检测放大器': '电流检测放大器',
        '数字式电流/功率检测器': '电流功率检测器',
        '串联型电压基准': '电压基准', '并联型电压基准': '电压基准',
    }
    
    db_pns = {}
    for slug, vd in data.items():
        for p in vd['products']:
            db_pns[p['part_number']] = p.get('_features','')
    
    for section, pns in sorted(sections.items()):
        tag = TAG_MAP.get(section)
        if not tag: continue
        for pn in pns:
            if pn in db_pns and tag not in db_pns[pn]:
                # SBC products: CAN-FD/LIN/RS-485 are integrated sub-features, not category
                if 'SBC' in db_pns[pn] and tag in ('CAN-FD','LIN','RS-485','RS-232'):
                    continue
                missing.append((pn, section, tag))
    
    if missing:
        by_sec = defaultdict(list)
        for item in missing: by_sec[item[1]].append(item)
        for sec, items in sorted(by_sec.items()):
            issues.append("{}: {} 产品缺「{}」标签".format(sec, len(items), items[0][2]))
            for pn, _, _ in items[:5]: issues.append("  {}".format(pn))
            if len(items) > 5: issues.append("  ... +{}".format(len(items)-5))
    
    return len(missing) == 0, issues, missing

# ── Check 4: LLM Prompt completeness ──
def check_prompt(data):
    issues = []
    if not os.path.exists(PROMPT_PATH):
        issues.append("Prompt file not found")
        return False, issues, []
    
    with open(PROMPT_PATH) as f:
        prompt = f.read()
    
    # Collect all tags actually used in DB
    used_tags = set()
    for slug, vd in data.items():
        for p in vd['products']:
            for t in p.get('_features','').split():
                if any(c in t for c in '_\u4e00-\u9fff'):  # has Chinese or underscore
                    used_tags.add(t)
    
    # Check category tags are in prompt
    missing = []
    for tag in sorted(CATEGORY_TAGS):
        if tag not in prompt:
            missing.append(tag)
    
    if missing:
        issues.append("LLM prompt 缺标签: {}".format(', '.join(missing)))
    
    return len(missing) == 0, issues, missing

# ── Search tests ──
SEARCH_TESTS = [
    ("运放", ["运放"]), ("比较器", ["比较器"]), ("LDO", ["LDO"]),
    ("CAN FD", ["CAN FD"]), ("LIN", ["LIN"]), ("RS-485", ["RS-485"]),
    ("模拟开关", ["模拟开关"]), ("IO 扩展器", ["IO扩展"]),
    ("8:1 模拟开关", ["模拟开关", "8:1"]),
    ("8兆速率 CAN", ["CAN FD", "8Mbps"]),
    ("输入5v输出12v 升压 1a", ["DCDC", "升压", "Vin_5V", "Vout_12V", "Iout_1A"]),
    ("24v输入 5v输出 降压 2a", ["DCDC", "降压", "Vin_24V", "Vout_5V", "Iout_2A"]),
    ("5v输入 0.6v输出 3a", ["DCDC", "降压", "Vin_5V", "Vout_0.6V", "Iout_3A"]),
    ("12v转3.3v 6a", ["DCDC", "降压", "Vin_12V", "Vout_3.3V", "Iout_6A"]),
    ("以太网供电", ["以太网供电"]),
    ("485 1兆速率", ["RS-485", "1Mbps"]),
    ("电平转换 10兆", ["电平转换", "10Mbps"]),
]

SEARCH_URL = "http://localhost:3000/api/interpret"

def check_search():
    import urllib.request
    issues, passed, failed = [], 0, 0
    for query, expected_tags in SEARCH_TESTS:
        try:
            req = urllib.request.Request(SEARCH_URL,
                data=json.dumps({'query': query}).encode(),
                headers={'Content-Type': 'application/json'})
            r = json.loads(urllib.request.urlopen(req, timeout=10).read())
            features = r.get('features', [])
            
            data = json.load(open(DATA_PATH))
            has_match = any(
                all(f.lower() in (p.get('_features','') or '').lower() for f in features)
                for vd in data.values() for p in vd['products']
            )
            if not has_match and not r.get('suggestions'):
                issues.append("FAIL: '{}' → {} 无结果".format(query, features))
                failed += 1
            else:
                passed += 1
        except Exception as e:
            issues.append("ERR: '{}' — {}".format(query, str(e)[:60]))
            failed += 1
    status = failed == 0
    issues.insert(0, "搜索: {} 通过, {} 失败".format(passed, failed))
    return status, issues, (passed, failed)

# ── Main ──
def main():
    use_json = '--json' in sys.argv
    run_search = '--search' in sys.argv
    
    data = json.load(open(DATA_PATH))
    results = {}
    all_oks = []
    
    for name, fn in [('TAGS', check_tags), ('EXCLUSIVE', check_exclusive_categories), ('SCHEMA', check_schema), ('PARAMN', check_paramn), 
                      ('SECTION', check_section_coverage), ('LLM', check_prompt)]:
        ok, issues, detail = fn(data)
        results[name.lower()] = {'ok': ok, 'issues': issues, 'count': len(detail)}
        all_oks.append(ok)
    
    if run_search:
        ok, issues, detail = check_search()
        results['search'] = {'ok': ok, 'issues': issues, 'passed': detail[0], 'failed': detail[1]}
        all_oks.append(ok)
    
    if use_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for name, r in results.items():
            icon = '✅' if r['ok'] else '❌'
            print('{} {}'.format(icon, name.upper()))
            for iss in r.get('issues', []):
                print('  {}'.format(iss))
            print()
        if all(all_oks):
            print('✅ 全部通过')
        else:
            print('❌ 有问题需修复')
    
    return 0 if all(all_oks) else 1

if __name__ == '__main__':
    sys.exit(main())

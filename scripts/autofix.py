#!/usr/bin/env python3
"""
ChipSelect 自动修复脚本 - 基于调试经验提炼
运行: python3 scripts/autofix.py [--dry-run]
"""
import json, re, sys, os
from collections import defaultdict

# Import tag_config as single source of truth for param→tag extraction
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tag_config import generate_tags as tc_generate_tags
from validate_tags import validate_tag

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "public", "data", "products_structured.json")
DRY_RUN = '--dry-run' in sys.argv

data = json.load(open(DATA_PATH))
original = json.load(open(DATA_PATH))  # for diff
fixes = defaultdict(list)

# ═══════════════════════════════════════════
# FIX 1: PN prefix → missing category tag
# ═══════════════════════════════════════════
PREFIX_TAG = {
    'TPT104': 'CAN-FD', 'TPT105': 'CAN-FD', 'TPT114': 'CAN-FD', 'TPT125': 'CAN-FD',
    'TPT133': 'CAN-FD', 'TPT144': 'CAN-FD', 'TPT146': 'CAN-FD', 'TPT710': 'CAN-FD',
    'TPT102': 'LIN', 'TPT103': 'LIN',
    'TPT323': 'RS-232', 'TPT324': 'RS-232', 'TPT333': 'RS-232',
    'TPT748': 'RS-485', 'TPT741': 'RS-485', 'TPT751': 'RS-485',
    'TPT418': 'RS-485', 'TPT48': 'RS-485', 'TPT485': 'RS-485', 'TPT486': 'RS-485',
    'TP84': 'RS-485', 'TPT40': 'RS-485', 'TPT41': 'RS-485',
    'TPT771': '数字隔离器', 'TPT772': '数字隔离器', 'TPT774': '数字隔离器',
    'ISO77': '数字隔离器', 'ISO76': '数字隔离器',
    'TPT295': 'IO扩展', 'TPT296': 'IO扩展',
    'TPT116': 'SBC', 'TPT9H': 'MLVDS', 'TPT1028': 'SBC', 'TPT9L': 'MLVDS',
    'T74L': '电平转换', 'T74A': '电平转换', 'TPT201': '电平转换', 'TPT202': '电平转换',
    'TPW4': '模拟开关', 'TPWH': '模拟开关', 'TPW3': '模拟开关', 'TPW1': '模拟开关',
    'TPM8': '马达驱动', 'TPM88': '马达驱动', 'TPM89': '马达驱动',
    'TPM5': '隔离栅极驱动', 'TPM2': '栅极驱动', 'TPM27': '栅极驱动',
    'TPM102': '栅极驱动', 'TPM202': '栅极驱动', 'TPM275': '栅极驱动',
    'TPQ05': '升压', 'TPQ5': '升压',
    'TPM650': '隔离电源',
    'TPE': '以太网供电',
    'YT86': 'PHY', 'YT85': 'PHY',  # Yutai 86/85 series PHY chips
    'TPTMP': '温度传感器',
    'TPDA': '音频总线',
    'TPS05P': '电子保险丝', 'TPS0': '负载开关', 'TPS2': '负载开关',
    'TPV6': '复位芯片', 'TPV7': '复位芯片', 'TPV8': '复位芯片',
    # CM series: TVS/ESD for 纳芯微, BMS for 思瑞浦-模拟
    # Leave CM tagging to extract_toc.py (TOC-driven is more accurate)
    # 'CM100': 'TVS/ESD', 'CM101': 'TVS/ESD', ... — REMOVED: conflicts with 3peak BMS
    # 纳芯微 NSD 系列禁止再用 PN 前缀猜“隔离栅极驱动”：
    # 同前缀同时覆盖隔离/非隔离栅极驱动、低边驱动、马达驱动、传感器接口，前缀猜测会全族串类。
    # 这些品类统一只信原始 section / _sections 真源，不在这里打前缀品类标签。
    # 纳芯微 运放
    'NSOPA': '运放',
    # 纳芯微 数字隔离器
    'NSI665': '数字隔离器', 'NSI671': '数字隔离器', 'NSI673': '数字隔离器',
    'NSI677': '数字隔离器', 'NSI685': '数字隔离器', 'NSI663': '数字隔离器',
    'NSI820': '数字隔离器', 'NSI821': '数字隔离器', 'NSI826': '数字隔离器',
    'NSI840': '数字隔离器',
    # 纳芯微 隔离电源
    'NSIP60': '隔离电源', 'NSIP32': '隔离电源',
    # 纳芯微 隔离子品类（前缀仅作兜底，具体子品类仍以 section 为权威）
    # NSI104/105 是隔离 CAN 收发器，不是隔离放大器；此前误映射导致“隔离放大器”搜索混入 NSI1042/1050。
    'NSI105': '隔离CAN', 'NSI104': '隔离CAN', 'NSI120': '隔离放大器',
    'NSI131': '隔离放大器',
    # 纳芯微 数字隔离器 (NSI without specific sub-type)
    'NSI664': '数字隔离器',
    # 纳芯微 隔离放大器/调制器
    'NSI130': '隔离放大器',
    # 思瑞浦 EMI 滤波器
    'TPF1': 'EMI滤波器', 'TPF6': 'EMI滤波器', 'TPF11': 'EMI滤波器', 'TPF13': 'EMI滤波器',
    'TPF14': 'EMI滤波器', 'TPF60': 'EMI滤波器', 'TPF63': 'EMI滤波器',
    # 思瑞浦 模拟前端
    'TPAFE': 'ADC', 'TPAEF': 'ADC',
    # 思瑞浦 电池充电
    'TPB40': '电池充电',
    # 思瑞浦 隔离栅极驱动
    'TPM535': '隔离栅极驱动',
    # 思瑞浦 模拟开关
    'TPK10': '模拟开关',
    # ★ 移除 TPB798/TPB771 → LDO 的前缀猜测(2026-06-11): 实测这两个前缀只命中
    #   TPB79818Q/TPB79828Q/TPB7717Q 这些 BMS AFE(_section=电池监控), 全是误标, 零真LDO.
    #   真LDO的标签来自 SECTION_TO_TAG(低压LDO/高压LDO→LDO), 不靠PN前缀. 删PN前缀猜品类铁律.
    #   NOT LDO: TPB798/TPB771/TPB760=电池监控, TPB762=高边驱动
    # 思瑞浦 IO 扩展器 (all I2C-based)
    'TPT295': 'IO扩展', 'TPT296': 'IO扩展',
    # 思瑞浦 / 通用 运放
    # 仅保留已验证为单一品类的精确前缀；移除 LM290/LM324/LM321/LMV3/LMV9 这类宽前缀猜测。
    # 根因：同前缀覆盖运放/比较器多个族，和 section 真源叠加后会产出“运放+比较器”双标污染。
    'TS250': '隔离放大器', 'TLV900': '运放', 'LM358': '运放',
    'TP07': '运放', 'TP12': '运放', 'TP15': '运放', 'TP17': '运放',
    'TP22': '运放', 'TP25': '运放', 'TPH2': '运放',
    'SNA00': '运放',
    # ★ 移除 MT520/MT530 → DCDC 的前缀猜测(2026-06-18): 实测仅命中 MT5201/MT5301，
    #   它们是“位置传感器专用芯片”，detail 明确为位置传感器信号处理/驱动芯片，并非 DCDC.
    #   真品类由 section 真源决定，不能靠 MT52*/53* 宽前缀猜 DCDC.
    # 纳芯微 电流传感器
    'NSC28': '电流传感器', 'NSC627': '电流传感器',
    'NSC62': '电流传感器',
    # 纳芯微 栅极驱动
    'NSDRV': '栅极驱动',
    # 纳芯微 数字隔离器
    'NSI822': '数字隔离器', 'NSI823': '数字隔离器', 'NSI824': '数字隔离器',
    'NSI167': '数字隔离器',
    # 纳芯微传感器不再用 PN 前缀猜“位置传感器”。NSE34 是智能高边开关，
    # NSE35 也不能仅凭前缀判定为位置传感器；统一以 section/目录真源归类。
    # 裕太微以太网: 品类标签(交换机/网卡)由 section 派生(见 extract_coord.py),
    # 不用型号前缀映射 — YT851/852/853 是PHY不是网卡, YT882是PHY不是交换机, 前缀猜品类会误判.
}

for slug, vd in data.items():
    for p in vd['products']:
        pn, ft = p['part_number'], p.get('_features','')
        feats = set(ft.split())
        # Sort by prefix length descending: only apply the most specific prefix tag
        for prefix, tag in sorted(PREFIX_TAG.items(), key=lambda x: len(x[0]), reverse=True):
            if pn.startswith(prefix):
                if tag not in feats:
                    if not DRY_RUN: p['_features'] = ft + ' ' + tag
                    fixes['add_tag'].append('{} -> +{}'.format(pn, tag))
                    feats.add(tag)
                break  # only one prefix tag per product, longest match wins

# ═══════════════════════════════════════════
# FIX 2: Remove conflicting tags (keep PN-matched)
# ═══════════════════════════════════════════
CONFLICT_PAIRS = [
    ('LIN', 'RS-485'), ('LIN', 'RS-232'), ('LIN', 'CAN-FD'),
    ('马达驱动', '栅极驱动'), ('马达驱动', '隔离栅极驱动'),
    ('栅极驱动', '隔离栅极驱动'),
    ('音频总线', 'CAN-FD'), ('音频总线', 'LIN'), ('音频总线', 'RS-485'), ('音频总线', 'RS-232'),
]

for slug, vd in data.items():
    for p in vd['products']:
        pn, ft = p['part_number'], p.get('_features','')
        feats_list = ft.split()
        for a, b in CONFLICT_PAIRS:
            if a not in feats_list or b not in feats_list: continue
            # Determine correct tag by PN prefix
            keep = None
            for prefix, tag in PREFIX_TAG.items():
                if pn.startswith(prefix):
                    keep = tag
                    break
            remove = b if keep == a else (a if keep == b else None)
            if remove and remove in feats_list:
                feats_list = [f for f in feats_list if f != remove]
                if not DRY_RUN: p['_features'] = ' '.join(feats_list)
                fixes['rm_conflict'].append('{}: -{} (kept {})'.format(pn, remove, keep))

# ═══════════════════════════════════════════
# FIX 3: Apply known schemas to ParamN products
# ═══════════════════════════════════════════
SCHEMAS = {
    'RS-485': ['Status','Rating','Drivers Per Package','Receivers Per Package','VCC Min (V)','VCC Max (V)','Data Rate Max (kBPS)','ICC Max (mA)','ESD HBM (kV)','IEC Contact (kV)','Operating Temp (C)','Package'],
    'RS-232': ['Status','Rating','Drivers Per Package','Receivers Per Package','VCC Min (V)','VCC Max (V)','Data Rate Max (kBPS)','ICC Max (mA)','ESD HBM (kV)','IEC Contact (kV)','Operating Temp (C)','Package'],
    '数字隔离器': ['Status','Rating','Drivers Per Package','Receivers Per Package','VCC Min (V)','VCC Max (V)','Data Rate Max (kBPS)','ICC Max (mA)','ESD HBM (kV)','IEC Contact (kV)','Operating Temp (C)','Package'],
    'LDO': ['Status','Rating','Vin Max (V)','Vout (V)','Iout (mA)','Iq (uA)','PSRR (dB)','Features','Package'],
    '运放': ['Status','Rating','Channels','Supply (V)','GBW (MHz)','Slew Rate (V/us)','Iq/Ch (uA)','Vos (mV)','Noise (nV/rtHz)','Package'],
    '电压基准': ['Status','Rating','Vout (V)','Accuracy (%)','Temp Coeff (ppm/C)','Iq (uA)','Features','Package'],
    '栅极驱动': ['Status','Rating','Supply Voltage (V)','Channels','Peak Current (A)','Input Range (V)','Temp Range','Rise/Fall (ns)','Prop Delay (ns)','Delay Match (ns)','Package'],
    '马达驱动': ['Status','Rating','Supply Voltage (V)','Channels','Max Current (A)','Features','Package'],
    'CAN-FD': ['Status','Rating','Supply Voltage (V)','Bus Fault (V)','Max Data Rate (Mbps)','Channels','Features','BUS ESD (kV)','Temp Range (C)','Package'],
    '比较器': ['Status','Rating','Output Type','Supply Min (V)','Channels','Supply Max (V)','Delay (ns)','Iq (uA)','Vos (mV)','Package'],
}

for slug, vd in data.items():
    for p in vd['products']:
        if 'Param1' not in p.get('_params',''): continue
        ft = p.get('_features','')
        raw_parts = [x.strip() for x in p.get('_raw','').split('|') if x.strip()]
        if len(raw_parts) < 3: continue
        
        for tag, schema in SCHEMAS.items():
            if tag not in ft: continue
            labeled = []
            for i, val in enumerate(raw_parts[:len(schema)]):
                labeled.append('{}: {}'.format(schema[i], val))
            if not DRY_RUN: p['_params'] = ' | '.join(labeled)
            fixes['schema'].append('{} -> {} cols'.format(p['part_number'], len(labeled)))
            break

# ═══════════════════════════════════════════
# FIX 4: Generate capability tags (speed, Iout, Vin, Vout, channels, features)
# ═══════════════════════════════════════════
def parse_range(s):
    s = s.strip()
    if not s or s in ('/', 'NA', 'N/A'): return None
    if 'External' in s or 'Isolated' in s: return None
    if s.startswith('.'): return None
    # Handle "Fixed (1.2, 1.5, 3.3)" → parse all numbers
    m = re.match(r'Fixed\s*\(([\d.,\s]+)\)', s, re.I)
    if m:
        try:
            nums = [float(x) for x in re.findall(r'[\d.]+', m.group(1))]
            if nums: return (min(nums), max(nums))
        except: pass
    # Handle "Adjustable (0.5 to 5.2)" → range
    m = re.match(r'Adjustable\s*\(([\d.]+)\s*(?:to|~|\-)\s*([\d.]+)\)', s, re.I)
    if m:
        try: return (float(m.group(1)), float(m.group(2)))
        except: pass
    try:
        m = re.match(r'([\d.]+)\s*[μuµ]\s*A', s, re.I)
        if m: return (0, float(m.group(1))/1000000)
        m = re.match(r'([\d.]+)\s*mA', s, re.I)
        if m: return (0, float(m.group(1))/1000)
        m = re.match(r'([\d.]+)\s*[~\-–—]\s*([\d.]+)', s)
        if m: return (float(m.group(1)), float(m.group(2)))
        m = re.match(r'([\d.]+)', s)
        if m: return (float(m.group(1)), float(m.group(1)))
    except ValueError:
        pass
    return None

def covers(rng, pt): return rng and rng[0] <= pt <= rng[1]
def fmtv(v): return str(int(v)) if v == int(v) else str(round(v, 3)).rstrip('0').rstrip('.')

def uniq_vals(vals):
    out = []
    seen = set()
    for v in vals:
        key = round(float(v), 6)
        if key in seen:
            continue
        seen.add(key)
        out.append(float(v))
    return out


def parse_actual_voltage_tags(s):
    s = (s or '').strip()
    if not s or s in ('/', 'NA', 'N/A'):
        return []
    vals = []
    m = re.match(r'Fixed\s*\(([\d.,\s]+)\)', s, re.I)
    if m:
        vals.extend(float(x) for x in re.findall(r'[\d.]+', m.group(1)))
    if '固定输出' in s:
        vals.extend(float(x) for x in re.findall(r'[\d.]+', s))
    m = re.match(r'Adjustable\s*\(([\d.]+)\s*(?:to|~|\-|–|—)\s*([\d.]+)\)', s, re.I)
    if m:
        lo, hi = sorted((float(m.group(1)), float(m.group(2))))
        vals.extend([lo, hi])
        vals.extend(x for x in [0.8, 1.2, 1.8, 2.5, 3.3, 5, 12, 24, 36, 48] if lo <= x <= hi)
    elif re.search(r'[\d.]+\s*[~\-–—]\s*[\d.]+', s):
        nums = [float(x) for x in re.findall(r'[\d.]+', s)]
        if len(nums) >= 2:
            lo, hi = min(nums), max(nums)
            vals.extend([lo, hi])
            vals.extend(x for x in [0.8, 1.2, 1.8, 2.5, 3.3, 5, 12, 24, 36, 48] if lo <= x <= hi)
    elif not vals:
        vals.extend(float(x) for x in re.findall(r'[\d.]+', s))
    return [x for x in uniq_vals(vals) if x > 0]

VIN = [0.8, 1.2, 1.8, 2.5, 3.3, 5, 12, 24, 36, 48]
VOUT = [0.6, 0.8, 1.0, 1.2, 1.8, 2.5, 3.3, 5, 12, 24, 36, 48]
IOUT = [0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20]
SPEED = [200, 150, 100, 50, 20, 10, 5, 2, 1]
CHANNELS = [1, 2, 4, 8, 16, 32]

for slug, vd in data.items():
    for p in vd['products']:
        ft, params = p.get('_features',''), p.get('_params','')
        if not params: continue
        
        # Speed tags for any Data Rate column (detect unit from param key + value suffix)
        rate_mbps = None
        m = re.search(r'Data Rate[^:|]*[(（]?\s*([kK])\s*bps\s*[)）]?\s*[:：]\s*(\d+\.?\d*)', params, re.IGNORECASE)
        if m and m.group(1).upper() == 'K':
            # kBPS detected in param key → divide by 1000
            rate_mbps = float(m.group(2)) / 1000
        else:
            # Fallback: check value suffix
            m = re.search(r'Data Rate.*?(\d+\.?\d*)\s*([kKmMgG]?)', params)
            if m:
                val = float(m.group(1))
                unit = (m.group(2) or '').upper()[:1]
                if unit == 'K':
                    rate_mbps = val / 1000
                elif unit == 'G':
                    rate_mbps = val * 1000
                elif unit in ('', 'M'):
                    # Check param key for kBPS hint
                    pre = params[:m.start()]
                    if re.search(r'\b[kK]\s*bps', pre):
                        rate_mbps = val / 1000
                    else:
                        rate_mbps = val  # default Mbps
        
        if rate_mbps is not None:
            parts = [t for t in ft.split() if not t.endswith('Mbps')]
            # ★ 方案甲(2026-06-12): 速率标签存真实值单一标签, 不再梯子展开.
            #   旧逻辑 `for t in SPEED: if rate>=t` 会把 ≤真实值的所有标准档都打上(208Mbps→挂20/50/100/150/200),
            #   既丢真实值(208不在梯子上→无208标签)又污染(挂一堆它并非的低档). 搜索的≥语义改由
            #   constraint-match.ts tagSatisfied 的 '速率' downgradable 分支做数值比较(要50→产品≥50即满足).
            #   亚Mbps真实值(0.5/0.25)也如实保留, 不再丢失.
            rstr = f'{fmtv(rate_mbps)}Mbps' if rate_mbps != int(rate_mbps) else f'{int(rate_mbps)}Mbps'
            parts.append(rstr)
            new_ft = ' '.join(parts)
            if new_ft != ft:
                if not DRY_RUN: p['_features'] = new_ft
                fixes['speed_tags'].append('{}: {} Mbps'.format(p['part_number'], rate_mbps))
        
        ft = p.get('_features','')  # refresh after speed tags
        
        # Vin/Vout/Iout for power products (v4 merged keys: "Minimum Input Voltage (V)", "VIN (V)", etc.)
        if any(kw in ft for kw in ['DCDC','升压','降压','LDO','马达驱动','栅极驱动','电子保险丝','理想二极管','电压基准']):
            vin_min = vin_max = vout_val = iout_val = None
            is_boost = '升压' in ft
            for part in params.split('|'):
                kv = part.split(':',1)
                if len(kv) < 2: continue
                k = kv[0].strip().lower()
                v = kv[1].strip()
                # Direct VIN/VOUT (v4 merged format: "VIN (V): 0.9~5.5", "Vin (Min) (V): 2.1", "Output (V): ...")
                if k.startswith('vin ') or k == 'vin':
                    if 'max' in k: vin_max = vin_max or v
                    else: vin_min = vin_min or v
                elif k.startswith('vout ') or k == 'vout' or k.startswith('output ') or k == 'output':
                    vout_val = vout_val or v
                elif 'iout' in k or 'output current' in k or 'peak current' in k:
                    iout_val = iout_val or v
                # Min/Max input voltage (v4 merged: "Minimum Input Voltage (V)")
                elif ('minimum input' in k or 'minimum operating' in k or 'supply voltage (min)' in k):
                    vin_min = vin_min or v
                elif ('maximum input' in k or 'maximum operating' in k or 'supply voltage (max)' in k):
                    vin_max = vin_max or v
                elif 'output voltage' in k or (k.startswith('output ') and 'type' not in k and 'por' not in k):
                    vout_val = vout_val or v
                elif 'supply voltage' in k and 'max' not in k and 'min' not in k:
                    vin_min = vin_min or v
                # "Working Voltage", "Input Voltage", "Supply" — generic Vin keys
                elif 'working voltage' in k or 'input voltage' in k:
                    vin_min = vin_min or v

            # Iout unit detection: key has "(mA)" or "(μA)" → divide
            if iout_val:
                iout_key_lower = ''
                for part in params.split('|'):
                    kv = part.split(':',1)
                    if len(kv) >= 2:
                        k_low = kv[0].strip().lower()
                        if 'iout' in k_low or 'output current' in k_low or 'peak current' in k_low:
                            iout_key_lower = k_low; break
                if 'ma)' in iout_key_lower or '(ma' in iout_key_lower:
                    try: iout_val = str(float(iout_val) / 1000)
                    except: pass
                elif 'μa)' in iout_key_lower or '(μa' in iout_key_lower:
                    try: iout_val = str(float(iout_val) / 1000000)
                    except: pass

            # Pair min+max → range. If either is non-numeric formula, fall through to single value
            vin_val = None
            if vin_min and vin_max and '~' not in str(vin_min) and '~' not in str(vin_max):
                try:
                    lo, hi = float(vin_min), float(vin_max)
                    vin_val = f'{min(lo,hi)}~{max(lo,hi)}'
                except (ValueError, TypeError):
                    pass  # formula in value, try single-side
            if vin_val is None:
                # Try single value: prefer max (more likely valid number), then min
                for candidate in [vin_max, vin_min]:
                    if candidate and '~' not in str(candidate):
                        try:
                            float(candidate)
                            vin_val = candidate
                            break
                        except (ValueError, TypeError):
                            continue
                # If still None, use whatever we have (e.g. pre-paired range like "3~36")
                if vin_val is None:
                    vin_val = vin_min or vin_max
            
            vin_tags = []
            if vin_min and vin_max:
                try:
                    lo, hi = sorted((float(vin_min), float(vin_max)))
                    std_points = [1.2, 1.8, 2.5, 3.3, 5, 12, 24, 36, 48, 60, 100]
                    covered = [x for x in std_points if lo <= x <= hi]
                    vin_tags = [f'Vin_{fmtv(x)}V' for x in uniq_vals([lo, hi] + covered) if x > 0]
                except (ValueError, TypeError):
                    rng = parse_range(f'{vin_min}~{vin_max}')
                    if rng:
                        lo, hi = sorted(rng)
                        std_points = [1.2, 1.8, 2.5, 3.3, 5, 12, 24, 36, 48, 60, 100]
                        covered = [x for x in std_points if lo <= x <= hi]
                        vin_tags = [f'Vin_{fmtv(x)}V' for x in uniq_vals([lo, hi] + covered) if x > 0]
                    else:
                        vin_tags = []
            if not vin_tags:
                vin_tags = [f'Vin_{fmtv(x)}V' for x in parse_actual_voltage_tags(vin_val or vin_min or vin_max)]

            vout_tags = [f'Vout_{fmtv(x)}V' for x in parse_actual_voltage_tags(vout_val)]

            ir = parse_range(iout_val) if iout_val else None
            iout_tags = []
            if ir and ir[1] > 0:
                iout_tags = [f'Iout_{fmtv(ir[1])}A']
            
            parts = [t for t in ft.split() if not (t.startswith('Vin_') or t.startswith('Vout_') or t.startswith('Iout_'))]
            added = []
            for t in vin_tags + vout_tags + iout_tags:
                if t not in parts:
                    parts.append(t)
                    added.append(t)
            
            if added:
                if not DRY_RUN: p['_features'] = ' '.join(parts)
                fixes['cap_tags'].append('{}: +{}'.format(p['part_number'], ','.join(added)))
            elif ' '.join(parts) != ft:
                # Strip old Iout/Vin/Vout tags even if no new ones added
                if not DRY_RUN: p['_features'] = ' '.join(parts)
        
        # Refresh ft after speed/cap tags may have changed it
        ft = p.get('_features','')

        # ── 裕太/以太网交换机端口数纠偏: 24G+4GC/2*SGMII 这类简介不能被端口列里的 8GE 误压低 ──
        feats_now = ft.split()
        if '交换机' in feats_now:
            port_src = ' | '.join(filter(None, [
                p.get('_params', ''),
                p.get('_raw', ''),
            ]))
            def _switch_port_count(text: str) -> int:
                m = re.search(r'(\d+)口交换机|(\d+)口', text)
                if m:
                    return int(m.group(1) or m.group(2))
                for pat in [
                    r'(\d+)\s*\*\s*[\d.]+\s*[gf]e',
                    r'(\d+)\s*\*\s*[gf]e',
                ]:
                    mm = re.search(pat, text, re.I)
                    if mm:
                        return int(mm.group(1))
                lead = re.search(r'简介\s*[:：]\s*(\d+)\s*g(?:e|c)?(?:\b|\+)', text, re.I)
                ge = [int(x) for x in re.findall(r'(?<![\d.])(\d+)\s*[gf]e', text, re.I)]
                gc = [int(x) for x in re.findall(r'(?<![\d.])(\d+)\s*gc', text, re.I)]
                vals = ge + gc
                if lead:
                    vals.append(int(lead.group(1)))
                return max(vals, default=0)
            port_count = _switch_port_count(port_src)
            if port_count > 0:
                old_port_tags = [t for t in feats_now if re.fullmatch(r'\d+口交换机', t)]
                desired = f'{port_count}口交换机'
                new_feats = [t for t in feats_now if not re.fullmatch(r'\d+口交换机', t)]
                if desired not in new_feats:
                    new_feats.append(desired)
                if new_feats != feats_now:
                    if not DRY_RUN:
                        p['_features'] = ' '.join(new_feats)
                    fixes['spec_tags'].append(f"{p['part_number']}: switch_port->{desired}")
                    ft = p.get('_features', ' '.join(new_feats))
                    feats_now = ft.split()
        
        # ── Feature tags from params ──
        feat_tags = []
        detail_text = ' | '.join(filter(None, [
            p.get('_detail_intro', ''),
            p.get('_detail_features', ''),
            p.get('_detail_apps', ''),
        ]))
        pl = (params + ' | ' + detail_text).lower()
        FEATURE_PARAM_RULES = [
            (r'aec[ -]?q100|q100 qualified|汽车级', '车规AEC-Q100'),
            (r'(integrated|intergrated|integreted)\s+ldo', 'LDO'),
            (r'load\s+switch', '负载开关'),
            (r'psrr.*\d+.*db', '高PSRR'),
            (r'vos.*max|offset.drift', '精密(≤1mV)'),
            (r'low.*iq|low.*quiescent|iq.*<.*\d+.*[uμ]', '低功耗'),
            (r'watchdog', '看门狗'),
            (r'short.*(protect|circuit)|short.circuit|短路保护', '短路保护'),
            (r'bi[ -]?directional', '双向'),
            (r'uni[ -]?directional', '单向'),
            (r'differential.output', '差分输出'),
            (r'single.end.output|single[ -]?ended', '单端输出'),
            (r'soft.?start', '软启动'),
            (r'spread.spectrum', '展频'),
            (r'\btracking\b', '跟踪输出'),
            (r'clock.in|external.clock', '外部时钟'),
            (r'\balert\b|alert.*(func|warn)|warning.func', '警报输出'),
            (r'low.*ib|low.*input.bias|low.*bias.current', '低Ib'),
            (r'zero.crossover|zero.cross|zero[ -]?cross', '零交越失真'),
            (r'shift.reg(ister)?', '移位寄存器接口'),
            (r'low[ -]?side', '低边检测'),
            (r'open.load|open[ -]?load', '开路检测'),
            (r'remote.sense|vout.sense', '远端采样'),
            (r'reverse.current.protect', '防反接'),
            (r'overcurrent.protect', '过流保护'),
            (r'ring suppression|振铃抑制', '振铃抑制'),
            (r'\bsic\b|signal improvement capability|信号改善功能', 'SIC'),
            (r'low loop delay|低环路延迟', '低环路延迟'),
            (r'over.?temp|过温保护|热保护', '过温保护'),
            (r'\bemc\b|电磁兼容', '高EMC'),
            (r'\besd\b|静电放电', '高ESD'),
            (r'passive behavior|无源特性|理想被动行为', '无源特性'),
        ]
        # 低噪声 / PSRR
        if any(kw in pl for kw in ['psrr','噪声','noise','vn at','peak noise']):
            valid, _ = validate_tag('低噪声', params)
            if valid:
                feat_tags.append('低噪声')
        if 'psrr' in pl and 'db' in pl.split('psrr')[1][:10] if 'psrr' in pl else False:
            valid, _ = validate_tag('高PSRR', params)
            if valid:
                feat_tags.append('高PSRR')
        # 精密 — only if Vos(Max) ≤ 1mV
        vos_max = None
        vos_m = re.search(r'vos\s*\(max\)\s*\(?mv\)?\s*[:：]\s*([\d.]+)', pl)
        if vos_m:
            vos_max = float(vos_m.group(1))
        if vos_max is not None and vos_max <= 1.0:
            feat_tags.append('精密(≤1mV)')
        elif any(kw in pl for kw in ['offset drift']):
            # Offset drift alone → flag as potentially精密 but check Vos first
            if vos_max is None or vos_max <= 1.0:
                feat_tags.append('精密(≤1mV)')
        # 轨到轨 — only if Rail-Rail In is Yes (true rail-to-rail requires input)
        rri = re.search(r'rail[-_ ]?(to[-_ ]?)?rail\s*in\s*[:：]\s*yes', pl, re.I)
        rro = re.search(r'rail[-_ ]?(to[-_ ]?)?rail\s*out\s*[:：]\s*yes', pl, re.I)
        if rri is not None:
            feat_tags.append('轨到轨')
        elif rro is not None:
            pass  # output-only rail-to-rail ≠ full rail-to-rail
        # 高压
        for part in ft.split():
            if '高压' in part: feat_tags.append(part); break
        # 低功耗唤醒 / Partial Networking
        wake_hit = any(kw in pl for kw in ['partial network', '特定帧唤醒', 'wake', '唤醒', 'standby', 'sleep', '休眠'])
        if wake_hit:
            valid, _ = validate_tag('低功耗唤醒', params)
            if valid and '低功耗唤醒' not in feat_tags:
                feat_tags.append('低功耗唤醒')
            if ('partial network' in pl or '特定帧' in pl):
                valid, _ = validate_tag('特定帧唤醒', params)
                if valid:
                    feat_tags.append('特定帧唤醒')

        # 车规 Q1 suffix 派生
        # 领域知识: Q1 是 TI / Novosense / 车规料常用 automotive suffix，和 3peak 的 -Q100 一样，
        # 是稳定的 automotive 变体命名，不应依赖 params 是否恰好写出 AEC-Q100。
        # 护栏: 仅对 part number 含 -Q1 的料补车规标签；若 params 已显式写 consumer/工业/非车规再由后续审计兜底。
        if '-Q1' in p.get('part_number', '').upper():
            feat_tags.append('车规AEC-Q100')

        for pat, tag in FEATURE_PARAM_RULES:
            # Only apply param-derived feature tags to Novosense (has detail pages for validation).
            # 3peak/yutai lack detail evidence, so param keyword matching creates too many false tags.
            if slug != 'novosense':
                continue
            if re.search(pat, pl, re.I):
                valid, _ = validate_tag(tag, params)
                if valid:
                    feat_tags.append(tag)

        if feat_tags:
            existing = set(ft.split())
            missing = []
            for t in feat_tags:
                if t not in existing and t not in missing:
                    missing.append(t)
            if missing:
                if not DRY_RUN:
                    p['_features'] = (ft + ' ' + ' '.join(missing)).strip()
                fixes['spec_tags'].append(f'{p["part_number"]}: +{",".join(missing)}')
        
        ft = p.get('_features','')  # refresh after spec tags

        # ── Remove invalid constrained tags (audit_data TAG_CONSTRAINT_FAIL auto-fix parity) ──
        feats_now = ft.split()
        invalid_tags = []
        for tag in feats_now:
            valid, _ = validate_tag(tag, params)
            if not valid:
                invalid_tags.append(tag)
        if invalid_tags:
            normalized = [x for x in feats_now if x not in set(invalid_tags)]
            if not DRY_RUN:
                p['_features'] = ' '.join(normalized)
            fixes['constraint_clean'].append(f'{p["part_number"]}: -{",".join(invalid_tags)}')
            ft = p.get('_features','')

        # ── Grade exclusivity: 工业级 / 车规AEC-Q100 / 消费级 互斥 ──
        grade_order = ['车规AEC-Q100', '消费级', '工业级']
        feats_now = ft.split()
        present_grades = [g for g in grade_order if g in feats_now]
        desired_grade = None
        if '车规AEC-Q100' in present_grades or '-Q1' in p.get('part_number', '').upper():
            desired_grade = '车规AEC-Q100'
        elif '消费级' in present_grades:
            desired_grade = '消费级'
        elif '工业级' in present_grades:
            desired_grade = '工业级'
        if desired_grade and len(present_grades) > 1:
            normalized = [x for x in feats_now if x not in {'工业级', '车规AEC-Q100', '消费级'}]
            normalized.insert(0, desired_grade)
            if not DRY_RUN:
                p['_features'] = ' '.join(normalized)
            fixes['grade_fix'].append(f'{p["part_number"]}: {"/".join(present_grades)}→{desired_grade}')
            ft = p.get('_features','')
        
        # ── Channel tags from params (all categories, v4 uses "Number of Channels:") ──
        ch_val = None
        for part in params.split('|'):
            kv = part.split(':',1)
            if len(kv) < 2: continue
            k = kv[0].strip().lower()
            v = kv[1].strip()
            # v4 merged keys + v3 legacy
            if any(k == x or k.startswith(x) for x in ['number of channels','channels','ch','switch config']):
                try:
                    if ':' in v: ch_val = max(int(float(x)) for x in v.replace(':',' ').split() if x.replace('.','').replace('-','').isdigit())
                    else: ch_val = int(float(v))
                    break
                except: pass
        if ch_val and ch_val > 0:
            for pt in CHANNELS:
                if pt <= ch_val:
                    t = f'{pt}通道'
                    if t not in ft:
                        if not DRY_RUN: p['_features'] = ft + ' ' + t
                        fixes['ch_tags'].append(f'{p["part_number"]}: +{t}')
        
        ft = p.get('_features','')  # refresh after channel tags

        # ── Resolution tags (e.g. 24位 ADC -> 24bit) ──
        bit_tags = []
        for bits in [8, 10, 12, 14, 16, 18, 20, 24]:
            if re.search(rf'(?<!\d){bits}\s*(?:bit|位)(?!\d)', pl, re.I):
                bit_tags.append(f'{bits}bit')
        if bit_tags:
            parts = ft.split()
            added = [t for t in bit_tags if t not in parts]
            if added:
                if not DRY_RUN:
                    p['_features'] = ft + ' ' + ' '.join(added)
                fixes['spec_tags'].append(f'{p["part_number"]}: +{",".join(added)}')
                ft = p.get('_features','')

        # ── RS-232/485: XTXR tags from Drivers/Receivers + duplex mode ──
        # Protocol evidence may be encoded as canonical token (RS-485) or compound category
        # (隔离RS485 / 集成隔离电源的隔离RS485). Do not require a dashed RS-485 token only.
        is_serial_232_485 = bool(re.search(r'RS-?\s*(?:232|485)|隔离RS485|集成隔离电源的隔离RS485', ft, re.I)) \
            or bool(re.search(r'RS-?\s*(?:232|485)|隔离RS485', params, re.I))
        if is_serial_232_485:
            drivers = receivers = None
            for part in params.split('|'):
                kv = part.split(':',1)
                if len(kv) < 2: continue
                k = kv[0].strip().lower()
                v = kv[1].strip()
                if 'drivers per package' in k or k.startswith('drivers'):
                    try: drivers = int(float(v))
                    except: pass
                if 'receivers per package' in k or k.startswith('receivers'):
                    try: receivers = int(float(v))
                    except: pass
            if drivers is not None and receivers is not None:
                txr_tag = f'{drivers}T{receivers}R'
                if txr_tag not in ft:
                    if not DRY_RUN: p['_features'] = ft + ' ' + txr_tag
                    fixes['txr_tags'].append(f'{p["part_number"]}: +{txr_tag}')
                    ft = p.get('_features','')
            # Duplex mode from row params. Variant row params are authoritative; detail intro may be family-level prose.
            row_has_duplex = False
            for part in params.split('|'):
                kv = part.split(':',1)
                if len(kv) < 2: continue
                k = kv[0].strip().lower()
                v = kv[1].strip()
                if k == 'mode' or 'duplex' in k or '双工' in k:
                    row_has_duplex = True
                    vl = v.lower()
                    if 'half' in vl or '半双工' in v:
                        if '半双工' not in ft:
                            if not DRY_RUN: p['_features'] = ft + ' 半双工'
                            fixes['duplex_tags'].append(f'{p["part_number"]}: +半双工')
                            ft = p.get('_features','')
                    elif 'full' in vl or '全双工' in v:
                        if '全双工' not in ft:
                            if not DRY_RUN: p['_features'] = ft + ' 全双工'
                            fixes['duplex_tags'].append(f'{p["part_number"]}: +全双工')
                            ft = p.get('_features','')
                    break
            # If the variant table has no duplex column, allow explicit product detail evidence.
            # Example: NSI84085 detail intro says “隔离半双工 RS485 收发器”. Do not use this when
            # row params already specify the opposite mode (family intro can be broader than variants).
            if not row_has_duplex and re.search(r'隔离(?:式)?\s*半双工\s*RS-?\s*485|半双工\s*RS-?\s*485\s*收发器|half[ -]?duplex\s+RS-?\s*485', pl, re.I):
                if '半双工' not in ft:
                    if not DRY_RUN: p['_features'] = ft + ' 半双工'
                    fixes['duplex_tags'].append(f'{p["part_number"]}: +半双工(detail)')
            elif not row_has_duplex and re.search(r'隔离(?:式)?\s*全双工\s*RS-?\s*485|全双工\s*RS-?\s*485\s*收发器|full[ -]?duplex\s+RS-?\s*485', pl, re.I):
                if '全双工' not in ft:
                    if not DRY_RUN: p['_features'] = ft + ' 全双工'
                    fixes['duplex_tags'].append(f'{p["part_number"]}: +全双工(detail)')
        # ── IO expander: always I2C (by prefix) ──
        if any(p['part_number'].startswith(px) for px in ['TPT295','TPT296']):
            if 'I2C' not in ft:
                if not DRY_RUN: p['_features'] = ft + ' I2C'
                fixes['i2c_tags'].append(p['part_number'])
            # Channel count from driver+receiver
            drivers = receivers = 0
            for part in params.split(' | '):
                if part.startswith('Drivers Per Package:'):
                    try: drivers = int(float(part.split(':')[1].strip()))
                    except: pass
                if part.startswith('Receivers Per Package:'):
                    try: receivers = int(float(part.split(':')[1].strip()))
                    except: pass
            total_pins = max(drivers, receivers, drivers + receivers)
            ft = p.get('_features','')  # refresh after I2C was added
            for pt in CHANNELS:
                if pt <= total_pins:
                    t = f'{pt}通道'
                    if t not in ft:
                        if not DRY_RUN: p['_features'] = ft + ' ' + t
                        fixes['ch_tags'].append(f'{p["part_number"]}: +{t}')
        
# ═══════════════════════════════════════════
# FIX 5: Section ↔ Feature alignment
# ═══════════════════════════════════════════
SECTION_TO_TAG = {
    'LIN 收发器': 'LIN', 'RS-232 收发器': 'RS-232', 'RS-485 收发器': 'RS-485',
    '隔离 RS-485 收发器': 'RS-485', 'CAN 收发器': 'CAN-FD', 'CAN 隔离': 'CAN-FD',
    'RS485收发器': 'RS-485', 'RS-485 收发器': 'RS-485', 'RS485 收发器': 'RS-485',
    'CAN收发器': 'CAN-FD', 'LIN收发器': 'LIN', 'LIN 收发器': 'LIN',
    'RS232收发器': 'RS-232', 'RS-232 收发器': 'RS-232',
    '隔离RS485': '隔离RS485', '隔离CAN': '隔离CAN', '隔离I2C': '隔离I2C', 'I2C 选型表': '隔离I2C', '2C 选型表': '隔离I2C',
    '隔离栅极驱动': '隔离栅极驱动', '非隔离栅极驱动': '非隔离栅极驱动',
    'IO 扩展器': 'IO扩展器', '数字隔离器': '数字隔离器',
    '放大器': '运放', '运算放大器': '运放', '比较器': '比较器',
    '高压运算放大器(Vs＞10V)': '运放', '低压运算放大器(Vs＜10V)': '运放',
    '高压运算放大器': '运放', '低压运算放大器': '运放', '零漂运算放大器': '运放',
    '精密运算放大器(Vos＜＝1mV)': '运放', '高速运算放大器(GBW＞＝50MHz)': '运放',
    '精密运算放大器': '运放', '高速运算放大器': '运放',
    '低功耗运算放大器(IqPerCh<=50μa)': '运放', '低功耗运算放大器': '运放',
    '小尺寸封装运算放大器(DFN,QFN,Wafer-LevelCSP)': '运放', '小尺寸封装运算放大器': '运放', 'AFE': '传感器接口',
    'LDO': 'LDO', '低压LDO': 'LDO', '高压LDO': 'LDO', 'DCDC': 'DCDC', 'ADC': 'ADC', 'DAC': 'DAC',
    '电压基准': '电压基准', '复位芯片': '复位芯片',
    '模拟开关': '模拟开关', '低压模拟开关': '模拟开关', '高压模拟开关': '模拟开关',
    '负载开关': '负载开关', '高边开关': '负载开关',
    '电平转换器': '电平转换', '逻辑和电平转换器': '电平转换',
    '步进马达驱动': '马达驱动', '直流马达驱动': '马达驱动',
    '温度传感器': '温度传感器', '电流传感器': '电流传感器',
    '位置传感器': '位置传感器', '压力传感器': '压力传感器',
    '霍尔开关/ 锁存器选型表': '霍尔开关/锁存器', '磁阻开关/ 锁存器选型表': '磁阻开关/锁存器',
    '速度传感器选型表': '速度传感器', '隔离ADC 选型表': '隔离ADC',
    '比较器选型表': '比较器', '电流传感放大器选型表': '电流检测放大器',
    '电流传感器磁调理芯片选型表': '传感器接口', '电流传感器磁调理选芯片选型表': '传感器接口',
    '隔离半桥栅极驱动选型表': '隔离栅极驱动',
    '隔离单管栅极驱动选型表': '隔离栅极驱动',
    '集成看门狗的复位芯片': '复位芯片',
    '线性充电芯片': '电池充电', '功率级DrMOS': 'DrMOS',
    'LDO线性稳压器选型表': 'LDO', 'DC-DC开关变换器选型表': 'DCDC',
    'CAN收发器选型表': 'CAN-FD', 'LIN收发器选型表': 'LIN',
    '隔离CAN收发器选型表': '隔离CAN', '数字隔离器选型表': '数字隔离器',
    '隔离比较器选型表': '比较器', '隔离电流放大器选型表': '隔离放大器',
    '隔离电压放大器选型表': '隔离放大器', '隔离ADC选型表': '隔离ADC', '隔离ADC 选型表': '隔离ADC',
    '隔离RS-485 收发器选型表': '隔离RS485',
    '磁阻开关/锁存器选型表': '磁阻开关/锁存器', '霍尔开关/锁存器选型表': '霍尔开关/锁存器',
    '线性位置传感器选型表': '线性位置传感器', '位置传感器专用芯片选型表': '位置传感器',
    '霍尔角度编码器选型表': '霍尔角度编码器', '磁阻角度编码器选型表': '磁阻角度编码器',
    '速度传感器选型表': '速度传感器',
    '线性电流传感器选型表': '电流传感器',
    '集成式电流传感器选型表': '电流传感器',
    '温度传感器选型表': '温度传感器',
    '温湿度传感器选型表': '温度传感器', '电压监控复位IC选型表': '复位芯片', '电压监控复位IC 选型表': '复位芯片',
    '实时控制MCU/DSP选型表': 'MCU/DSP', '实时控制MCU/DSP 选型表': 'MCU/DSP', '线性LED驱动选型表': 'LED驱动',
    '工业压力变送器信号调理芯片选型表': '传感器接口',
    '压力传感器信号调理芯片选型表': '传感器接口', '磁通门传感器调理芯片选型表': '传感器接口',
    '数字式电流/功率检测器': '电流功率检测器', '高速数据复用器/解复用器': '模拟开关',
    'MEMS 麦克风信号调理芯片选型表': '传感器接口', 'MEMS 压力传感器选型表': '压力传感器',
    '氮化镓功率芯片选型表': '氮化镓功率芯片',
    '低边驱动/ 开关选型表': '低边驱动', '非隔离低边栅极驱动选型表': '非隔离栅极驱动',
    '非隔离半桥栅极驱动选型表': '非隔离栅极驱动', '直流有刷电机驱动选型表': '马达驱动',
    '微步控制步进电机驱动选型表': '马达驱动', '直流有刷与三相无刷电机预驱选型表': '马达驱动',
    'Boost 控制器选型表': '升压',
    '通用低功耗高性能微控制器选型表': 'MCU/DSP',
    '功率运算放大器选型表': '运放', '低压通用运算放大器选型表': '运放', '高压通用运算放大器选型表': '运放',
    '串联电压基准选型表': '电压基准',
    'LED驱动': 'LED驱动', 'eFuse': '电子保险丝',
    '隔离单管栅极驱动选型表': '隔离栅极驱动', '集成短路保护的智能隔离式栅极驱动选型表': '隔离栅极驱动',
    '隔离电源': '隔离电源', '以太网供电': '以太网供电',
    '固态继电器': '固态继电器',
    # 集成隔离接口产品靠 PARENT_CLOSURE 召回，不给'隔离电源'token，避免跟专用隔离电源模块抢排名
    '隔离放大器和调制器': '隔离放大器',
    'SBC': 'SBC', 'MLVDS': 'MLVDS',
    '音频线路驱动': '音频功放', '视频滤波驱动': '视频滤波',
    '仪表放大器': '放大器', '差动放大器': '放大器',
    '对数放大器': '放大器', '带电压基准的放大器': '放大器',
    '匹配电阻网络': '匹配电阻', '与门': '逻辑门', '自动方向': '电平转换',
    'ASN 音频总线': '音频总线',
    # 传感器变体
    '电流信号检测放大器': '电流检测放大器',
    # 电源保护/管理
    '电源时序控制': '电源时序', '理想二极管|ORing 控制器': '理想二极管',
    '电子保险丝': '电子保险丝', '电池监控': 'BMS',
    '高边驱动': '高边驱动', '高边开关': '高边开关',
    # BMS variants (思瑞浦)
    '1节-检测MOS': 'BMS', '1节-检测Rsense': 'BMS', '1节-复合IC': 'BMS',
    '3~16节-全功能保护': 'BMS', '2~16节-次级保护': 'BMS', '电池均衡IC': 'BMS',
    # ADC/DAC variants with parenthetical names
    '精密数模转换器(DAC)': 'DAC', '高速数模转换器（DAC）': 'DAC',
    '精密模数转换器（ADC）': 'ADC', '高速模数转换器（ADC）': 'ADC',
    '多通道可配置模数/数模转换器': 'ADC',
    # DCDC variants
    '宽压降压变换器': '降压', '中压降压变换器': '降压', '低压降压变换器': '降压',
    '升压变换器': '升压',
    # 电压基准 variants
    '串联型电压基准': '串联型电压基准', '并联型电压基准': '并联型电压基准',
    # 纳芯微 space-separated section names
    '隔离 驱动': '隔离栅极驱动', '驱动': '栅极驱动',
    '隔离': '数字隔离器', '收发器': 'CAN-FD',
    '传感器': '温度传感器', '开关': '模拟开关',
    '接口': 'CAN-FD', '马达 驱动': '马达驱动',
}

# Normalize section matching: also try without spaces
def section_to_tag(sec):
    if sec in SECTION_TO_TAG:
        return SECTION_TO_TAG[sec]
    # Try without spaces e.g. "隔离 驱动" → "隔离驱动"
    compact = sec.replace(' ', '')
    if compact in SECTION_TO_TAG:
        return SECTION_TO_TAG[compact]
    return None

# Section correction by PN prefix (before section→tag mapping)
# e.g. TPDA prefix=音频总线 but section=CAN收发器 → correct section
PREFIX_SECTION = {
    'TPDA': 'ASN 音频总线',
    # MLVDS 误标修复(2026-06-12): TPT9H/TPT9L 系列在原始PDF第39页 section=MLVDS,
    #   但被早期提取误标成 'RS-485 收发器'(脏数据残留). MLVDS(TIA/EIA-899)与
    #   RS-485(TIA/EIA-485)是互斥物理层标准. 全库仅这5款 TPT9*, 前缀无冲突.
    'TPT9': 'MLVDS',
    # CAN SBC 误标修复(2026-06-13): 3peak-analog 的 TPT11693/11695 六款被误归到
    #   RS-485 收发器, 但 cross-vendor 证据明确: auto 册同型号 section=SBC,
    #   产品描述=CAN SBC, 可替代产品=UJA1169. 只改这两个精确型号族, 不用更短前缀.
    'TPT11693': 'SBC',
    'TPT11695': 'SBC',
    # LIN SBC 归位(2026-06-13): 3peak-auto 同型号产品类别=SBC, 描述明确“LIN SBC”,
    #   analog 册 params 也含 Integrated LDO. 这是 LIN SBC, 不是纯 LIN 收发器.
    'TPT10283': 'SBC',
    'TPT10285': 'SBC',
    # 隔离电源误归步进马达驱动(2026-06-14): TPM6501A/6505A/6505B 描述明确 Push-pull Isolated DCDC,
    #   可替代 SN6501/SN6505A，属于隔离电源，不是马达驱动。用精确前缀族修正，避免误伤其他 TPM.
    'TPM650': '隔离电源',
    # NSI8200 原始 _sections 被脏提取成“2C 选型表”，detail 明确是双向 I2C 隔离器；
    #   canonical 应为“隔离I2C”，不能挂成“数字隔离器 + I2C”。
    'NSI8200': '隔离I2C',
    # NSIP6051/6055x 是推挽式变压器驱动器, NSIP3266 是H桥变压器驱动器,
    # NSI7258 是固态继电器。它们被早期提取误归到"集成隔离电源的隔离CAN"section。
    # 真实品类是隔离电源, 不是CAN接口器件。
    'NSIP6051': '隔离电源',
    'NSIP6055': '隔离电源',
    'NSIP3266': '隔离电源',
    'NSI7258': '固态继电器',
}

for slug, vd in data.items():
    for p in vd['products']:
        pn = p['part_number']
        sec = p.get('_section', '')
        feats = p.get('_features', '').split()
        corrected_by_feature = None
        if '隔离RS485' in feats and sec in {'RS-485 收发器', 'RS485 收发器', 'RS485收发器'}:
            corrected_by_feature = '隔离RS485'
        elif '隔离CAN' in feats and sec in {'CAN 收发器', 'CAN收发器'}:
            corrected_by_feature = '隔离CAN'
        if corrected_by_feature and sec != corrected_by_feature:
            p['_section'] = corrected_by_feature
            if sec and sec not in p.get('_sections', []):
                p.setdefault('_sections', []).append(sec)
            fixes['sec_fix'].append(f'{pn}: section {sec}→{corrected_by_feature}')
            sec = corrected_by_feature
        for prefix, correct_sec in PREFIX_SECTION.items():
            if pn.startswith(prefix) and sec != correct_sec:
                p['_section'] = correct_sec
                if sec not in p.get('_sections', []):
                    p.setdefault('_sections', []).append(sec)
                fixes['sec_fix'].append(f'{pn}: section {sec}→{correct_sec}')
                break

# ── 协议互斥护栏(2026-06-12): section 决定的物理层协议是唯一的, 剥离其他互斥协议标签 ──
#   MLVDS/RS-485/RS-232/LIN/CAN-FD/I2C 是互斥的串行/差分物理层标准, 一颗收发器只属一种.
#   当 _section 明确映射到某协议时, _features 里残留的其他协议标签是误标(脏数据), 全部剥离.
#   判据只信 section(权威), 不信 PN 前缀. 同时清掉协议专属的"XX收发器"中文别名标签.
EXCLUSIVE_PROTOCOLS = {'MLVDS', 'RS-485', 'RS-232', 'LIN', 'CAN-FD', 'I2C'}
PROTOCOL_ALIASES = {  # 协议→该协议专属的别名标签(剥离其他协议时一并清掉)
    'RS-485': ['RS485收发器', 'RS485', 'RS-485收发器'],
    'RS-232': ['RS232收发器', 'RS232', 'RS-232收发器'],
    'LIN': ['LIN收发器'],
    'CAN-FD': ['CAN收发器', 'CAN'],
    'MLVDS': ['MLVDS收发器'],
}
for slug, vd in data.items():
    for p in vd['products']:
        sec = p.get('_section', '')
        sec_tag = section_to_tag(sec)
        if sec_tag not in EXCLUSIVE_PROTOCOLS:
            continue  # section 不是明确的互斥协议品类, 不动(避免误伤多协议器件需FAE确认的情形)
        feats = p.get('_features', '').split()
        # 要剥离的: 其他互斥协议标签 + 它们的中文别名
        strip = set()
        for proto in EXCLUSIVE_PROTOCOLS:
            if proto == sec_tag:
                continue
            strip.add(proto)
            strip.update(PROTOCOL_ALIASES.get(proto, []))
        new_feats = [f for f in feats if f not in strip]
        if new_feats != feats:
            removed = [f for f in feats if f in strip]
            if not DRY_RUN:
                p['_features'] = ' '.join(new_feats)
            fixes.setdefault('proto_exclusive', []).append(
                f'{p["part_number"]}({sec_tag}): -{",".join(removed)}')



for slug, vd in data.items():
    for p in vd['products']:
        pn = p.get('part_number', '')
        sec = p.get('_section','')
        ft = p.get('_features','')
        feats = ft.split()
        
        # A: 优先信 _sections 原始 section（若其 canonical tag 明确且与当前 _section 冲突）
        # 根因防护: 纳芯微历史上出现 _section 被错误“归一”成数字隔离器/隔离栅极驱动，
        # 但 _sections[0] 仍保留原始目录名（如“集成短路保护的智能隔离式栅极驱动选型表”）。
        # 当原始 section 可映射出 canonical tag 且与当前 canonical 不一致时，必须回退到原始 section 真源。
        raw_sections = p.get('_sections') or []
        primary_sec = raw_sections[0] if raw_sections else ''
        primary_tag = section_to_tag(primary_sec) if primary_sec else None
        tag = section_to_tag(sec)
        matched_prefix_override = None
        for prefix, correct_sec in PREFIX_SECTION.items():
            if pn.startswith(prefix):
                matched_prefix_override = correct_sec
                break
        if primary_sec and primary_tag and primary_tag != tag and primary_sec != sec:
            # 显式 prefix section override 比脏 _sections 更可信；否则会把 TPM650 这类已回正的隔离电源又打回步进马达驱动。
            if not (matched_prefix_override and matched_prefix_override == sec):
                sec = primary_sec
                p['_section'] = primary_sec
                tag = primary_tag
                fixes['sec_fix'].append('{}: _section→{}(_sections真源覆盖)'.format(p['part_number'], primary_sec))

        # A: Section implies tag → ensure tag present (use longest-match to avoid substring false positives)
        if tag and tag not in feats:
            # Check for conflicts
            skip = False
            if tag == 'CAN-FD' and 'ASN' in params:
                skip = True  # ASN audio bus, not CAN
            elif tag == 'LIN' and ('RS-232' in feats or 'RS-485' in feats or 'CAN' in feats):
                skip = True  # section is wrong, not features
            elif tag == 'RS-232' and 'LIN' in feats:
                feats = [f for f in feats if f != 'LIN']; feats.append('RS-232')
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: LIN→RS-232'.format(p['part_number']))
            elif tag == 'RS-485' and 'LIN' in feats:
                feats = [f for f in feats if f != 'LIN']; feats.append('RS-485')
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: LIN→RS-485'.format(p['part_number']))
            elif not skip:
                feats.append(tag)
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: +{}'.format(p['part_number'], tag))
        
        # A1.5: 非隔离栅极驱动 section 是子品类真源, 必须显式带非隔离子标签
        # 否则“非隔离栅极驱动”查询会漏掉早期只打了父标签“栅极驱动”的4款 3peak 老料.
        if sec == '非隔离栅极驱动' and '非隔离栅极驱动' not in feats:
            feats.append('非隔离栅极驱动')
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: +非隔离栅极驱动(section子品类真源)'.format(p['part_number']))

        # A1.6: 同义子类/复合品类补 canonical tag，防止 query 说法与数据 family 不一致导致漏召回。
        params_text = str(p.get('_params', ''))
        params_lower = params_text.lower()
        features_text = ' '.join(feats)
        features_lower = features_text.lower()
        alias_added = []
        if ('集成隔离电源' in params_text or '集成隔离电源' in features_text or 'isolated power' in params_lower or 'isolated power' in features_lower) and '隔离电源' not in feats:
            # 集成隔离接口产品(集成隔离电源的隔离CAN/RS485)的"集成隔离电源"字样不应触发补'隔离电源'token
            if not any(t in feats for t in ['集成隔离电源的隔离CAN', '集成隔离电源的隔离RS485']):
                feats.append('隔离电源'); alias_added.append('隔离电源')
        if ('高边开关' in sec or '高边开关' in params_text or 'high-side switch' in params_lower or 'high side switch' in params_lower) and '高边驱动' not in feats:
            feats.append('高边驱动'); alias_added.append('高边驱动')
        if ('理想二极管控制器' in sec or '理想二极管控制器' in params_text or 'oring controller' in params_lower or 'or-ing controller' in params_lower or 'ideal diode controller' in params_lower) and '理想二极管' not in feats:
            feats.append('理想二极管'); alias_added.append('理想二极管')
        if alias_added:
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: +{}(别名/复合品类归一)'.format(p['part_number'], '/'.join(alias_added)))

        # A1.7: 电压基准子类需补父类标签(串联型/并联型→电压基准), 使"电压基准"泛搜能召回
        if ('串联型电压基准' in feats or '并联型电压基准' in feats) and '电压基准' not in feats:
            feats.append('电压基准')
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: +电压基准(子类父标签)'.format(p['part_number']))

        # A2: 降压/升压变换器是DCDC(开关电源)的子类 → 补DCDC统称标签(领域知识: DCDC=Buck+Boost)
        # 让"DCDC"查询能召回所有开关电源, "降压"/"升压"查询仍精确
        if ('降压' in feats or '升压' in feats) and 'DCDC' not in feats:
            feats.append('DCDC')
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: +DCDC(降压/升压统称)'.format(p['part_number']))

        # A3: 品类互斥校验 — 运放/比较器/ADC等非电源产品不应有DCDC标签(领域知识: 运放≠开关电源)
        # 根因防护: 清除前缀映射等历史误标(如TP60前缀误伤TP6001-6004运放)
        if 'DCDC' in feats and ('运算放大器' in sec or '运放' in feats or '比较器' in sec or '比较器' in feats):
            feats = [f for f in feats if f != 'DCDC']
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: -DCDC(运放/比较器误标)'.format(p['part_number']))

        # A4: 以太网子品类互斥 — PHY芯片不是网卡/交换机(领域知识: PHY=物理层收发器, 网卡=带PCIe适配器, 交换机=多口转发)
        # 网卡/交换机标签只信 section. 纯PHY section(phy/PHY字样且无"网卡""交换"字样)清除误标的网卡/交换机标签.
        is_phy_section = ('phy' in sec.lower()) and ('网卡' not in sec) and ('交换' not in sec)
        if is_phy_section:
            removed = [f for f in feats if f in ('网卡', '交换机')]
            if removed:
                feats = [f for f in feats if f not in ('网卡', '交换机')]
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -{}(PHY非网卡/交换机)'.format(p['part_number'], '/'.join(removed)))

        # A4.4: 运放/比较器互斥 — section 真源明确时，剥离另一互斥模拟子品类。
        # 根因：历史 LM* 宽前缀猜品类与 section 叠加，产生“运放+比较器”双标，污染两侧搜索结果。
        analog_sec_tag = section_to_tag(sec)
        if analog_sec_tag in {'运放', '比较器'}:
            removed = [f for f in feats if f in {'运放', '比较器'} and f != analog_sec_tag]
            if removed:
                feats = [f for f in feats if f not in {'运放', '比较器'} or f == analog_sec_tag]
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -{}({}互斥清洗)'.format(p['part_number'], '/'.join(removed), analog_sec_tag))

        # A4.5: 隔离子品类互斥 — section 明确的隔离子品类是权威, 需剥离其他错误隔离子标签
        # 根因防护: 历史前缀映射把 NSI104/105(隔离CAN) 与 NSI130x(隔离ADC) 误打成“隔离放大器",
        #   导致搜索“隔离放大器”混入隔离CAN/隔离ADC。与 MLVDS≠RS-485 同理, 隔离子品类也应以 section 为单一真源。
        iso_sec_tag = section_to_tag(sec)
        EXCLUSIVE_ISO_CHILDREN = {'隔离CAN', '数字隔离器', '隔离放大器', '隔离电源', '隔离RS485', '隔离I2C', '隔离ADC'}
        if iso_sec_tag in EXCLUSIVE_ISO_CHILDREN:
            removed = [f for f in feats if f in EXCLUSIVE_ISO_CHILDREN and f != iso_sec_tag]
            # 隔离I2C 是独立子品类，不与裸 I2C 混挂。
            if iso_sec_tag == '隔离I2C' and 'I2C' in feats:
                removed.append('I2C')
            if removed:
                feats = [f for f in feats if (f not in EXCLUSIVE_ISO_CHILDREN and not (iso_sec_tag == '隔离I2C' and f == 'I2C')) or f == iso_sec_tag]
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -{}(section权威保留{})'.format(p['part_number'], '/'.join(removed), iso_sec_tag))

        # A4.5ab: 复合隔离接口电源品类只保留在“真实接口器件”上。
        # 用户已确认“集成隔离电源的隔离CAN/RS485”应作为整体复合品类保留，不能拆成
        # “隔离CAN/RS485 + 隔离电源”；但它也不能被目录噪声泛化到纯隔离电源/SSR/变压器驱动器。
        # 自动判据：必须有强协议证据（收发器/码率/双工/明确协议名）才保留复合品类标签。
        detail_text = ' | '.join([
            sec,
            str(p.get('_params', '') or ''),
            str(p.get('_detail_intro', '') or ''),
            str(p.get('_detail_features', '') or ''),
        ])
        if '集成隔离电源的隔离CAN' in feats:
            has_can_endpoint = bool(re.search(r'(?i)(?:\bCAN\b|CAN\s*FD|控制器局域网).{0,24}(?:收发器|transceiver)|(?:收发器|transceiver).{0,24}(?:\bCAN\b|CAN\s*FD|控制器局域网)|最大码流', detail_text))
            if not has_can_endpoint:
                feats = [f for f in feats if f != '集成隔离电源的隔离CAN']
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -集成隔离电源的隔离CAN(纯隔离电源/SSR≠复合隔离CAN)'.format(p['part_number']))
        if '集成隔离电源的隔离RS485' in feats:
            has_rs485_endpoint = bool(re.search(r'(?i)(?:RS-?\s*485).{0,24}(?:收发器|transceiver)|(?:收发器|transceiver).{0,24}(?:RS-?\s*485)|最大码流|半双工|全双工', detail_text))
            if not has_rs485_endpoint:
                feats = [f for f in feats if f != '集成隔离电源的隔离RS485']
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -集成隔离电源的隔离RS485(纯隔离电源≠复合隔离RS485)'.format(p['part_number']))

        # A4.5b: 隔离电源不是马达驱动/栅极驱动；清理历史步进马达驱动串标（典型: TPM650x）

        # A4.5c: 降压/升压变换器 ≠ 隔离电源模块
        if ('隔离电源' in feats and
            any(k in sec for k in ['降压变换器','升压变换器','降压','升压','Boost','Buck']) and
            not any(k in sec for k in ['隔离电源'])):
            feats = [f for f in feats if f != '隔离电源']
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: -隔离电源({}≠隔离电源模块)'.format(p['part_number'], sec))

        # A4.5f: 固态继电器 ≠ 隔离电源。NSI7258 是 SSR 不是电源模块。
        if sec == '固态继电器' and '隔离电源' in feats:
            feats = [f for f in feats if f != '隔离电源']
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: -隔离电源(固态继电器≠隔离电源)'.format(p['part_number']))

        if iso_sec_tag == '隔离电源':
            removed = [f for f in feats if f in {'马达驱动', '低边驱动', '隔离栅极驱动', '非隔离栅极驱动', '栅极驱动'}]
            if removed:
                feats = [f for f in feats if f not in {'马达驱动', '低边驱动', '隔离栅极驱动', '非隔离栅极驱动', '栅极驱动'}]
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -{}(隔离电源≠驱动类)'.format(p['part_number'], '/'.join(removed)))

        # A4.5e: 集成隔离接口产品(集成隔离电源的隔离CAN/RS485)的'隔离电源'token 剥离
        # 这些是隔离接口器件,不是专用隔离电源模块。靠 PARENT_CLOSURE 召回,不跟 TPM650x/NSIP6051 抢排名。
        if '隔离电源' in feats and any(t in feats for t in ['集成隔离电源的隔离CAN', '集成隔离电源的隔离RS485']):
            feats = [f for f in feats if f != '隔离电源']
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: -隔离电源(集成隔离接口≠隔离电源模块)'.format(p['part_number']))

        # A4.6: 传感器子品类按 section 真源互斥。
        # - 信号调理/接口芯片不是温度/电流/压力/位置/速度传感器本体。
        # - 纳芯微手册把“线性位置传感器 / 霍尔角度编码器 / 磁阻角度编码器 / 开关锁存器”列为独立选型表，
        #   不能硬归并成同一个“位置传感器”大类；否则泛搜“位置传感器”会把角度编码器/开关锁存器全部推出来。
        # - 只有“位置传感器专用芯片”和“线性位置传感器”保留/补充泛“位置传感器”召回标签。
        sensor_sec_tag = section_to_tag(sec)
        SENSOR_ENDPOINT_TAGS = {
            '温度传感器', '电流传感器', '压力传感器', '位置传感器', '速度传感器',
            '线性位置传感器', '霍尔角度编码器', '磁阻角度编码器', '霍尔开关/锁存器', '磁阻开关/锁存器',
        }
        if sensor_sec_tag == '传感器接口':
            removed = [f for f in feats if f in SENSOR_ENDPOINT_TAGS]
            if removed:
                feats = [f for f in feats if f not in SENSOR_ENDPOINT_TAGS]
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -{}(传感器接口≠传感器本体)'.format(p['part_number'], '/'.join(removed)))

        # A4.5d: 传感器接口/调理芯片 ≠ 栅极驱动/马达驱动
        # NSDRV401 是磁通门传感器调理芯片，params 写"外置大功率驱动可选"被早期提取误标成栅极驱动。
        if sensor_sec_tag == '传感器接口':
            removed = [f for f in feats if f in {'栅极驱动', '隔离栅极驱动', '非隔离栅极驱动', '马达驱动'}]
            if removed:
                feats = [f for f in feats if f not in {'栅极驱动', '隔离栅极驱动', '非隔离栅极驱动', '马达驱动'}]
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -{}(传感器接口≠驱动类)'.format(p['part_number'], '/'.join(removed)))

        # A4.6d: MEMS 麦克风信号调理芯片属于传感器接口，不是电压基准。
        # 根因：早期抽取把“偏置/参考”语义误上升成了产品品类，导致 NSC6360/6362/6364 混入电压基准搜索。
        # 判据只信 section + 麦克风证据；这是信号调理前端，不是 reference IC。
        sensor_text = ' | '.join([
            sec,
            str(p.get('_params', '') or ''),
            str(p.get('_detail_intro', '') or ''),
            str(p.get('_detail_features', '') or ''),
        ])
        if sensor_sec_tag == '传感器接口' and '电压基准' in feats and re.search(r'mems\s*麦克风|麦克风|硅麦|pdm\s*输出|i2s\s*接口', sensor_text, re.I):
            feats = [f for f in feats if f != '电压基准']
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: -电压基准(MEMS麦克风信号调理≠电压基准)'.format(p['part_number']))

        # A4.6b: 高边开关/高边驱动不是位置传感器本体；清除历史“位置传感器”串标（典型: NSE34xx）
        is_high_side_switch = ('高边开关' in sec) or (sensor_sec_tag in ('高边驱动', '高边开关'))
        if is_high_side_switch:
            removed = [f for f in feats if f in SENSOR_ENDPOINT_TAGS]
            if removed:
                feats = [f for f in feats if f not in SENSOR_ENDPOINT_TAGS]
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -{}(高边开关/驱动≠传感器本体)'.format(p['part_number'], '/'.join(removed)))

        # A4.6c: 位置传感器专用芯片不是 DCDC；历史 MT520/530 宽前缀误把两颗位置传感器芯片打成 DCDC
        if '位置传感器专用芯片' in sec and 'DCDC' in feats:
            feats = [f for f in feats if f != 'DCDC']
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: -DCDC(位置传感器专用芯片≠DCDC)'.format(p['part_number']))

        # A4.6a: 电流检测放大器/功率检测器/传感器调理 ≠ 电流传感器
        if sensor_sec_tag in ('电流检测放大器', '电流功率检测器', '传感器接口') and '电流传感器' in feats:
            feats = [f for f in feats if f != '电流传感器']
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: -电流传感器({}≠电流传感器本体)'.format(p['part_number'], sensor_sec_tag))

        SENSOR_SUBCATEGORY_TAGS = {'线性位置传感器', '霍尔角度编码器', '磁阻角度编码器', '霍尔开关/锁存器', '磁阻开关/锁存器'}
        if sensor_sec_tag in SENSOR_SUBCATEGORY_TAGS:
            removed = [f for f in feats if f in SENSOR_SUBCATEGORY_TAGS and f != sensor_sec_tag]
            if sensor_sec_tag != '线性位置传感器' and '位置传感器' in feats:
                removed.append('位置传感器')
            if removed:
                feats = [f for f in feats if (f not in SENSOR_SUBCATEGORY_TAGS and f != '位置传感器') or f == sensor_sec_tag or (f == '位置传感器' and sensor_sec_tag == '线性位置传感器')]
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -{}(section权威保留{})'.format(p['part_number'], '/'.join(removed), sensor_sec_tag))
        if sensor_sec_tag == '线性位置传感器' and '位置传感器' not in feats:
            feats.append('位置传感器')
            p['_features'] = ' '.join(feats)
            fixes['sec_fix'].append('{}: +位置传感器(线性位置父类召回)'.format(p['part_number']))

        # A4.7: 驱动子品类互斥 — 隔离栅极驱动 / 非隔离栅极驱动 / 低边驱动 / 马达驱动 / 数字隔离器 不可串类
        # 判据只信 section: 原始目录已明确品类时，剥离其他残留子类标签。
        driver_sec_tag = section_to_tag(sec)
        EXCLUSIVE_DRIVER_CHILDREN = {'隔离栅极驱动', '非隔离栅极驱动', '低边驱动', '马达驱动', '数字隔离器'}
        if driver_sec_tag in EXCLUSIVE_DRIVER_CHILDREN:
            removed = [f for f in feats if f in EXCLUSIVE_DRIVER_CHILDREN and f != driver_sec_tag]
            # 栅极驱动父标签只保留在真正的栅极驱动子类；马达驱动/低边驱动不应混入 gate-driver 父类，避免搜索串类。
            if driver_sec_tag in {'低边驱动', '马达驱动'} and '栅极驱动' in feats:
                removed.append('栅极驱动')
            if removed:
                feats = [f for f in feats if (f not in EXCLUSIVE_DRIVER_CHILDREN and f != '栅极驱动') or f == driver_sec_tag or (f == '栅极驱动' and driver_sec_tag in {'隔离栅极驱动', '非隔离栅极驱动'})]
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -{}(section权威保留{})'.format(p['part_number'], '/'.join(removed), driver_sec_tag))

        # A4.8: ASN 音频总线绝不能带 CAN-FD —— ASN 是车载音频总线，不是 CAN 收发器
        # 高置信判据: params/raw 中出现 ASN, 可自动移除 CAN-FD 并回正 section→ASN 音频总线。
        params_text = str(p.get('_params', ''))
        if 'ASN' in params_text and 'CAN-FD' in feats:
            feats = [f for f in feats if f != 'CAN-FD']
            if '音频总线' not in feats:
                feats.append('音频总线')
            p['_features'] = ' '.join(feats)
            p['_section'] = 'ASN 音频总线'
            sec = 'ASN 音频总线'
            fixes['sec_fix'].append('{}: ASN→音频总线, -CAN-FD'.format(p['part_number']))

        # A5: 电源子品类互斥 — BMS/电池监控/高边驱动等非稳压器产品不应有 LDO/DCDC 标签
        # 领域知识: LDO/DCDC 是稳压器, BMS AFE(电池监控)/高边驱动/电子保险丝/理想二极管 是另一类电源IC, 不是稳压器.
        # 根因防护: 清除 PN 前缀猜测留下的历史误标(如旧 TPB798/TPB771→LDO 把 BMS AFE 误标成 LDO).
        # 判据只信 section: section 明确是非稳压器电源品类时, 剥离 LDO/DCDC.
        NON_REGULATOR_POWER = ('电池监控', 'BMS', '高边驱动', '高边开关', '电子保险丝', '理想二极管', '电源时序')
        is_non_regulator = any(k in sec for k in NON_REGULATOR_POWER)
        if is_non_regulator:
            removed = [f for f in feats if f in ('LDO', 'DCDC')]
            if removed:
                feats = [f for f in feats if f not in ('LDO', 'DCDC')]
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: -{}({}非稳压器)'.format(p['part_number'], '/'.join(removed), sec))
        
        # A6: SBC 复合品类总线派生 — SBC(系统基础芯片)集成总线收发器(CAN/LIN/RS-485)+LDO+看门狗+SPI.
        # 领域知识: SBC 是复合器件, 其集成的总线类型是关键检索维度("集成CAN的SBC" vs "LIN SBC").
        # 数据一致性: LIN SBC 已有 LIN 标签、RS-485 SBC 已有 RS-485 标签, 但 CAN SBC 历史上漏了 CAN-FD 标签.
        # 派生判据优先级:
        #   1) 描述原文明确写总线类型(零假阳性)
        #   2) 对 cross-vendor 已确认的精确型号族做白名单回填: TPT11693/TPT11695 = CAN SBC
        #      (auto 册同型号 section=SBC + 描述=CAN SBC + 可替代产品=UJA1169)
        # 防复发: 未来新增任何 SBC 产品, 只要描述写明总线类型即自动补对应总线标签.
        is_sbc = (sec == 'SBC') or ('SBC' in feats)
        if is_sbc:
            pn = p.get('part_number', '')
            params_lower = str(p.get('_params','')).lower()
            bus_added = []
            is_confirmed_can_sbc = pn.startswith(('TPT11693', 'TPT11695'))
            # cross-vendor 已确认的 CAN SBC 旧脏标签里残留了 RS-485/RS485收发器，先剥离再补 CAN-FD
            if is_confirmed_can_sbc:
                strip = {'RS-485', 'RS485收发器', 'RS485', 'RS-485收发器'}
                cleaned = [f for f in feats if f not in strip]
                if cleaned != feats:
                    feats = cleaned
                    p['_features'] = ' '.join(feats)
                    fixes['sec_fix'].append('{}: -RS-485残留(CAN SBC已确认型号族)'.format(p['part_number']))
            # 描述明确总线类型才派生; 互斥保护: 已有其他总线时不强加(避免污染)
            if ('can sbc' in params_lower or 'can,' in params_lower or 'can ' in params_lower) \
               and 'CAN-FD' not in feats and 'LIN' not in feats and 'RS-485' not in feats and 'RS-232' not in feats:
                feats.append('CAN-FD'); bus_added.append('CAN-FD')
            elif is_confirmed_can_sbc \
               and 'CAN-FD' not in feats and 'LIN' not in feats and 'RS-485' not in feats and 'RS-232' not in feats:
                feats.append('CAN-FD'); bus_added.append('CAN-FD')
            if bus_added:
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: +{}(SBC总线派生/已确认型号族)'.format(p['part_number'], '/'.join(bus_added)))

        # B: Feature has category but section is wrong/unknown → fix section
        # 护栏: 仅当当前 _section 没有 canonical tag 时，才允许用 feature 反推 section。
        #   若当前 section 已能映射出品类（哪怕只是父类/同族），则 section 仍是权威，不能被残留特征标签反向改写。
        #   否则会出现 NSD 系列"马达驱动/低边驱动/传感器接口"被父标签"栅极驱动"强行改回非隔离栅极驱动的问题。
        # 另：SBC 是复合品类, 其 CAN-FD/LIN/RS-485 标签是"集成的总线维度", 不是品类.
        #   不能因为 SBC 产品带 CAN-FD 标签就把 _section 从 'SBC' 改成 'CAN 收发器'(会丢品类).
        is_sbc_product = (sec == 'SBC') or ('SBC' in feats)
        
        # B0: Force-fix known misclassified sections from PREFIX_TAG (SBC/MLVDS)
        SECTION_FORCE = {'SBC': 'SBC', 'MLVDS': 'MLVDS'}
        if is_sbc_product and sec != 'SBC':
            p['_section'] = 'SBC'
            sec = 'SBC'
            fixes['sec_fix'].append('{}: _section RS485/LIN→SBC(prefix已知)'.format(p['part_number']))
        elif 'MLVDS' in feats and sec != 'MLVDS' and not is_sbc_product:
            p['_section'] = 'MLVDS'
            sec = 'MLVDS'
            fixes['sec_fix'].append('{}: _section RS485→MLVDS(prefix已知)'.format(p['part_number']))
        
        if not is_sbc_product and not section_to_tag(sec):
            for tag in ['隔离RS485','隔离CAN','RS-232','RS-485','CAN-FD','LIN','IO扩展','数字隔离器','隔离栅极驱动','栅极驱动']:
                if tag in feats:
                    expected_sec = {
                        '隔离RS485': '隔离RS485', '隔离CAN': '隔离CAN',
                        'RS-232': 'RS-232 收发器', 'RS-485': 'RS-485 收发器',
                        'CAN-FD': 'CAN 收发器', 'LIN': 'LIN 收发器',
                        'IO扩展': 'IO 扩展器', '数字隔离器': '数字隔离器',
                        '隔离栅极驱动': '隔离栅极驱动', '栅极驱动': '非隔离栅极驱动',
                    }.get(tag)
                    if expected_sec and expected_sec not in sec and tag not in sec:
                        p['_section'] = expected_sec
                        sec = expected_sec
                        fixes['sec_fix'].append('{}: _section→{}'.format(p['part_number'], expected_sec))
                        break

# ═══════════════════════════════════════════
# FIX 5.5: 子品类闭包 → 父品类标签
# 例: 隔离栅极驱动 / 非隔离栅极驱动 都必须同时带 栅极驱动,
# 否则通用查询“栅极驱动”会漏掉子品类，跨 vendor 结果不完整。
# ═══════════════════════════════════════════
PARENT_CLOSURE = {
    '隔离栅极驱动': ['栅极驱动'],
    '非隔离栅极驱动': ['栅极驱动'],
    '隔离RS485': ['隔离'],
    '隔离CAN': ['隔离'],
    '隔离I2C': ['隔离'],
    '隔离电源': ['隔离'],
    '隔离放大器': ['隔离'],
    '数字隔离器': ['隔离'],
    '隔离ADC': ['隔离'],
}

for slug, vd in data.items():
    for p in vd['products']:
        ft = p.get('_features', '')
        feats = ft.split()
        feat_set = set(feats)
        added = []
        for child, parents in PARENT_CLOSURE.items():
            if child not in feat_set:
                continue
            for parent in parents:
                if parent not in feat_set:
                    feats.append(parent)
                    feat_set.add(parent)
                    added.append(parent)
        if added:
            if not DRY_RUN:
                p['_features'] = ' '.join(feats)
            fixes['parent_closure'].append('{}: +{}'.format(p['part_number'], '/'.join(added)))

# ═══════════════════════════════════════════
# FIX 6: Deduplicate features
# ═══════════════════════════════════════════
for slug, vd in data.items():
    for p in vd['products']:
        ft = p.get('_features','')
        parts = ft.split()
        seen = set()
        deduped = []
        for t in parts:
            if t not in seen:
                deduped.append(t)
                seen.add(t)
        new_ft = ' '.join(deduped)
        if new_ft != ft:
            if not DRY_RUN: p['_features'] = new_ft
            fixes['dedup'].append('{}: {}→{}'.format(p['part_number'], len(parts), len(deduped)))

# ═══════════════════════════════════════════
# FIX 6.1: Isolation late canonicalization
# 早期数据里有一小批产品带隔离子标签, 但 _section 仍停留在父类收发器；
# 另有少量隔离比较器表项缺少父标签"隔离"。在所有 feature/tag_config 规则跑完后做最终归一,
# 防止前面任一规则把 section/tag 又拉回父类。
# ═══════════════════════════════════════════
for slug, vd in data.items():
    for p in vd['products']:
        sec = p.get('_section', '')
        feats = p.get('_features', '').split()
        pn = p.get('part_number', '')

        desired_sec = None
        canonical_children = {'隔离RS485', '隔离CAN', '隔离I2C', '隔离栅极驱动', '非隔离栅极驱动', '隔离ADC'}
        sec_canon = section_to_tag(sec) if sec else None
        if sec_canon in canonical_children and sec != sec_canon:
            desired_sec = sec_canon
        elif '隔离RS485' in feats and sec in {'RS-485 收发器', 'RS485 收发器', 'RS485收发器'}:
            desired_sec = '隔离RS485'
        elif '隔离CAN' in feats and sec in {'CAN 收发器', 'CAN收发器'}:
            desired_sec = '隔离CAN'
        if desired_sec and sec != desired_sec:
            p['_section'] = desired_sec
            if sec and sec not in p.get('_sections', []):
                p.setdefault('_sections', []).append(sec)
            fixes['sec_fix'].append(f'{pn}: late _section→{desired_sec}(隔离子类归一)')

        # 隔离比较器目前没有单独 canonical child tag, 但 broad "隔离"维度必须完整可检索.
        if sec == '隔离比较器选型表' and '隔离' not in feats:
            feats.append('隔离')
            p['_features'] = ' '.join(feats)
            fixes['parent_closure'].append(f'{pn}: +隔离(隔离比较器父维度)')

# ═══════════════════════════════════════════
# Report
# ═══════════════════════════════════════════
# FIX 7: Detail evidence rules — 从 config/detail_evidence_rules.txt 加载
#   详情页/参数中的技术路由证据 → canonical tag (2026-06-16)
# ═══════════════════════════════════════════
_evidence_rules_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'detail_evidence_rules.txt')
if os.path.exists(_evidence_rules_path):
    _evidence_rules = []
    for _line in open(_evidence_rules_path):
        _line = _line.strip()
        if not _line or _line.startswith('#'):
            continue
        # regex= is last, may contain | chars
        _regex_idx = _line.find('regex=')
        if _regex_idx >= 0:
            _prefix = _line[:_regex_idx].strip().rstrip('|').strip()
            _regex_val = _line[_regex_idx + 6:].strip()
        else:
            _prefix = _line
            _regex_val = ''
        _row = {}
        for _seg in _prefix.split('|'):
            _seg = _seg.strip()
            if '=' not in _seg:
                continue
            _k, _v = _seg.split('=', 1)
            _row[_k.strip()] = _v.strip()
        if _regex_val:
            _row['regex'] = _regex_val
        if 'tag' in _row and _row.get('regex'):
            _evidence_rules.append(_row)

    for _rule in _evidence_rules:
        _tag = _rule['tag']
        _includes = set(x.strip() for x in _rule.get('include', '').split(',') if x.strip())
        _fields = [x.strip() for x in _rule.get('fields', '_detail_intro,_detail_features').split(',') if x.strip()]
        _auto = _rule.get('auto', 'false').lower() == 'true'
        _regex = re.compile(_rule['regex'], re.IGNORECASE)

        if not _auto:
            continue  # auto=false: skip, will be in manual review report

        for slug, vd in data.items():
            for p in vd['products']:
                feats = set((p.get('_features', '') or '').split())

                # Gate: product must have at least one include category
                if _includes and not (_includes & feats):
                    continue

                # Already has tag
                if _tag in feats:
                    continue

                # Search evidence fields
                evidence_text = ' '.join(
                    (p.get(f, '') or '') for f in _fields if p.get(f)
                )
                if not evidence_text or not _regex.search(evidence_text):
                    continue

                # Auto-fix: add tag
                current = p.get('_features', '')
                p['_features'] = (current + ' ' + _tag).strip()
                fixes.setdefault('evidence_rules', []).append(
                    f'{p["part_number"]}: +{_tag} ({_rule.get("dimension","?")})'
                )

# ═══════════════════════════════════════════
# FIX 6: tag_config as single source of truth (speed/Vin/Vout/Iout/channels/TXR/duplex)
# Runs AFTER all autofix logic. tag_config tags supplement autofix, never conflict.
# ═══════════════════════════════════════════
for slug, vd in data.items():
    for p in vd['products']:
        ft = p.get('_features', '')
        params = p.get('_params', '')
        if not params: continue
        
        # Determine primary category tag
        feats = set(ft.split())
        best_cat = None
        for cat in ['运放','比较器','LDO','DCDC','CAN-FD','LIN','RS-485','RS-232',
                     '数字隔离器','隔离CAN','隔离栅极驱动','非隔离栅极驱动','栅极驱动','马达驱动',
                     '模拟开关','电压基准','ADC','DAC','BMS','电平转换','IO扩展器',
                     'SBC','MLVDS','复位芯片','视频滤波','音频功放','隔离放大器',
                     '电流传感器','温度传感器','匹配电阻','逻辑门','电子保险丝',
                     '理想二极管','高边驱动','隔离电源','以太网供电']:
            if cat in feats:
                best_cat = cat
                break
        # Fallback: substring match (e.g. "精密数模转换器(DAC)" contains "DAC")
        if not best_cat:
            ft_lower = ft.lower()
            for cat in ['运放','比较器','ldo','dcdc','can-fd','lin','rs-485','rs-232',
                         '数字隔离器','隔离can','隔离栅极驱动','非隔离栅极驱动','栅极驱动','马达驱动',
                         '模拟开关','电压基准','adc','dac','bms','电平转换','io扩展器',
                         'sbc','mlvds','复位芯片','视频滤波','音频功放','隔离放大器',
                         '电流传感器','温度传感器','匹配电阻','逻辑门','电子保险丝',
                         '理想二极管','高边驱动','隔离电源','以太网供电']:
                if cat in ft_lower:
                    # Map back to canonical form
                    canonical = {'ldo':'LDO','dcdc':'DCDC','can-fd':'CAN-FD','lin':'LIN',
                                'rs-485':'RS-485','rs-232':'RS-232','adc':'ADC','dac':'DAC',
                                'bms':'BMS','sbc':'SBC','mlvds':'MLVDS',
                                'io扩展器':'IO扩展器'}
                    best_cat = canonical.get(cat, cat)
                    break
        
        if not best_cat:
            continue
        
        try:
            tags = tc_generate_tags(best_cat, params)
            for t in tags:
                if t not in feats:
                    feats.add(t)
                    fixes['tag_config'].append(f'{p["part_number"]}: +{t}')
            p['_features'] = ' '.join(feats)
        except Exception:
            pass

# ── Mbps 标签品类护栏(2026-06-12): 只有真正有"数据速率"的品类能带 Mbps 标签 ──
#   速率(Mbps)只对接口/隔离器/MLVDS/以太网等有数据速率概念的品类有意义.
#   比较器(传播延迟ns)/DAC(建立时间μs)/ADC(采样率MSPS)被旧梯子逻辑从无关参数列误抽成Mbps,
#   是单位语义混淆(ns/μs/MSPS ≠ Mbps). 这些品类的 Mbps 标签一律剥离(零假阳性: 该品类无此概念).
#   判据信品类标签(_features里的品类词), 不是section, 因为以太网产品section名多样.
#   ★ 必须放在 FIX 6(tag_config生成)之后, 否则品类标签可能还没生成会误删真接口料的Mbps.
MBPS_ALLOWED_CATS = {'RS-485', 'RS-232', 'CAN-FD', 'LIN', 'MLVDS', '数字隔离器',
                     'SBC', '以太网', '交换机', '网卡', 'IO扩展器', '隔离CAN'}
_mbps_re = re.compile(r'^\d+\.?\d*Mbps$')
for slug, vd in data.items():
    for p in vd['products']:
        feats = p.get('_features', '').split()
        if not any(_mbps_re.match(f) for f in feats):
            continue
        if any(cat in feats for cat in MBPS_ALLOWED_CATS):
            continue
        new_feats = [f for f in feats if not _mbps_re.match(f)]
        if new_feats != feats:
            removed = [f for f in feats if _mbps_re.match(f)]
            if not DRY_RUN:
                p['_features'] = ' '.join(new_feats)
            fixes.setdefault('mbps_guard', []).append(
                f'{p["part_number"]}({p.get("_section","")}): -{",".join(removed)}')

# ═══════════════════════════════════════════
# FINAL CLEANUP: 3peak/yutai — strip param-derived noise tags
#   Must run AFTER all other fix loops to prevent re-addition.
# ═══════════════════════════════════════════
PARAM_DERIVED_TAGS = {
    # From FEATURE_PARAM_RULES — param-derived noise for non-novosense
    '低噪声', '低功耗唤醒', '低功耗(≤50µA)', '低功耗',
    '精密(≤1mV)', '高PSRR', '高ESD', '高EMC', '高CMRR',
    '轨到轨', '短路保护', '过温保护', '过压保护', '欠压锁定',
    '振铃抑制', '斜率控制', '显性超时',
    '低失调', '低漂移', '低静态电流', '宽输入', '低输入偏置',
    '高增益带宽', '高转换率', '自校准', '零漂移',
    '低Ib', '双向', '单向', '差分输出', '单端输出', '软启动', '展频',
    '跟踪输出', '外部时钟', '警报输出', '零交越失真',
    '低边检测', '开路检测', '远端采样', '防反接', '过流保护',
    'SIC', '特定帧唤醒', '低环路延迟', '无源特性', '看门狗',
    '微功耗放大器',
    # Section raw names that have canonical equivalents in whitelist
    '电流信号检测放大器',  # → 电流检测放大器
}
NUMERIC_PARAM_RE = re.compile(
    r'^(?:Vin_\d+\.?\d*V?|Vout_\d+\.?\d*V?|Iout_\d+\.?\d*[Am]?|Vref_\d+\.?\d*V?|'
    r'\d+\.?\d*Mbps|\d+通道|\d+口|\d+bit|\d+:\d+|'
    r'\d+T\d+R|\d+R\d+T|'
    r'<[=＝]?\d+mV|>[=＝]?\d+|≤\d+|\d+～\d+|高通|低通|带通|'
    r'低压运算放大器|高压运算放大器|精密运算放大器|高速运算放大器|'
    r'＜＝\d+mV\)?|≤\d+mV\)|'
    r'IO扩展|IO$|扩展器$|收发器$|I2C$|LDO$|DCDC$|'
    r'RS-485$|RS485$|'
    r'MII$|RMII$|RGMII$|SGMII$|'  # interface types as standalone noise
    r'隔离$)$')  # "隔离" alone without subcategory is noise

# Whitelist: tags to KEEP for non-novosense (categories + grades + known good patterns)
CATEGORY_WHITELIST = {
    'SBC', 'MLVDS', 'CAN-FD', 'LIN', 'RS-485', 'RS-232', 'IO扩展器',
    '数字隔离器', '隔离栅极驱动', '非隔离栅极驱动', '栅极驱动', '马达驱动',
    '运放', '比较器', 'LDO', 'DCDC', 'ADC', 'DAC', '电压基准',
    'BMS', '电平转换', '模拟开关', '负载开关', '高边开关', '低边驱动',
    'LED驱动', 'MCU/DSP', 'DrMOS', '隔离放大器', '隔离电源', '隔离CAN', '隔离RS485',
    '集成隔离电源的隔离CAN', '集成隔离电源的隔离RS485',
    '隔离I2C', '以太网', '交换机', '网卡', 'PHY', 'EMI滤波器',
    '复位芯片', '温度传感器', '压力传感器', '电流传感器', '速度传感器',
    '霍尔角度编码器', '磁阻角度编码器', '氮化镓功率芯片',
    '固态继电器',
    '电池充电', '音频功放', '视频滤波', '音频总线', '匹配电阻', '逻辑门',
    '电子保险丝', '理想二极管', '电源时序', '传感器接口',
    '升压', '降压', '宽压降压变换器', '电流检测放大器', '电流功率检测器',
    '工业级', '车规AEC-Q100', '消费级',
    # Section-name derived tags (section_to_tag produces these)
    '1节-检测MOS', '1节-检测Rsense', '1节-复合IC', '1Cell-高精度(Digital)',
    '3~16节-全功能保护', '2~16节-次级保护', '电池监控', '电池均衡IC',
    '串联型电压基准', '并联型电压基准', '低压LDO', '高压LDO',
    '隔离',  # parent tag for isolation subcategories
    'CAN', 'I2C', 'SPI',  # bus interfaces as category modifiers
    '精密模数转换器（ADC）', '高速模数转换器（ADC）',
    '精密数模转换器(DAC)', '高速数模转换器（DAC）',
    '微功耗放大器',
    # section_to_tag canonical values (parent categories / specific tags)
    '放大器', '隔离ADC', '分流采样', '数字输出温度传感器', '模拟输出温度传感器',
    '电压基准放大器', '磁开关/锁存器',
}
# Also allow tags that contain section name as substring
def is_valid_tag(tag, section):
    if tag in CATEGORY_WHITELIST:
        return True
    # Allow if tag EQUALS the cleaned section name
    sec_clean = section.replace(' ', '').replace('（','(').replace('）',')')
    tag_clean = tag.replace(' ', '')
    if len(tag_clean) >= 3 and tag_clean == sec_clean:
        return True
    # Allow section fragments only if they appear as full tokens in the section
    #   e.g. section="IO 扩展器" → "IO扩展器" is valid, but "IO扩展" is not
    #   e.g. section="高压运算放大器(Vs＞10V)" → no fragment matching
    # Allow tags matching section pattern like "高压(≥30V)"
    if re.match(r'^[高低超].*[（(].*[）)]$', tag):
        return True
    return False


# ═══════════════════════════════════════════
# NVS: Novosense-specific data fixes (run before FINAL CLEANUP)
# ═══════════════════════════════════════════
# 1. Delete suffix-fragment and trailing-hyphen PNs (extraction artifacts)
NVS_INVALID_PNS = {'DQNR', 'DDBR', 'SWR', 'DSWR', 'TSSOP', 'QQNR', 'DSWVR', 'Q1SPR', 'Q1DNR'}
NVS_TRAILING_HYPHEN = {'NSA2860X-', 'NSA2862X-', 'NSC2860X-', 'NSI1050C-',
                        'NSI1042-', 'NSI1042C-', 'NSI1052-', 'NCA1021S-'}
all_bad = NVS_INVALID_PNS | NVS_TRAILING_HYPHEN
for slug, vd in data.items():
    removed = [p['part_number'] for p in vd['products'] if p['part_number'] in all_bad]
    vd['products'] = [p for p in vd['products'] if p['part_number'] not in all_bad]
    if removed:
        fixes['nvs_remove_pn'] = ['Removed {}: {}'.format(len(removed), removed)]

# 2. NSI6642: section "数字隔离器" → "隔离栅极驱动" (params show 半桥栅极驱动)
# 3. NSUC1500/1602/1610/1612E: section "Boost 控制器选型表" → "MCU/DSP"
NVS_SECTION_FIX = {
    'NSI6642': '隔离栅极驱动',
    'NSUC1500': 'MCU/DSP', 'NSUC1602': 'MCU/DSP', 'NSUC1610': 'MCU/DSP',
    'NSUC1612': 'MCU/DSP', 'NSUC1612E': 'MCU/DSP',
}
NVS_FEATURE_STRIP = {
    'NSI6642': ['数字隔离器', '隔离', '隔离半桥栅极驱动选型表', '栅极驱动'],
    'NSUC1500': ['Boost', '升压', 'DCDC', '控制器选型表', '12bit', '16bit', '8bit'],
    'NSUC1602': ['Boost', '升压', 'DCDC', '控制器选型表', '12bit', '16bit', '8bit', '看门狗'],
    'NSUC1610': ['Boost', '升压', 'DCDC', '控制器选型表', '12bit', '16bit', '8bit'],
    'NSUC1612': ['Boost', '升压', 'DCDC', '控制器选型表', '12bit', '16bit', '8bit', '看门狗'],
    'NSUC1612E': ['Boost', '升压', 'DCDC', '控制器选型表'],
}
for slug, vd in data.items():
    for p in vd['products']:
        pn = p.get('part_number', '')
        for prefix, new_sec in NVS_SECTION_FIX.items():
            if pn.startswith(prefix):
                if p.get('_section', '') != new_sec:
                    p['_section'] = new_sec
                    fixes['nvs_sec_fix'].append('{}: {}→{}'.format(pn, p.get('_section', ''), new_sec))
                # Clean features
                ft = (p.get('_features', '') or '').split()
                strip_tags = NVS_FEATURE_STRIP.get(prefix, [])
                new_ft = [t for t in ft if t not in strip_tags]
                if new_sec not in new_ft:
                    new_ft.append(new_sec)
                p['_features'] = ' '.join(new_ft)
                # NSUC1612E: params say "规格: 车规" → fix grade
                if pn.startswith('NSUC1612E'):
                    new_ft = [t for t in new_ft if t not in ('工业级', '消费级')]
                    if '车规AEC-Q100' not in new_ft:
                        new_ft.append('车规AEC-Q100')
                    p['_features'] = ' '.join(new_ft)
                fixes['nvs_feat_fix'].append('{}: {}→{}'.format(pn, ft, new_ft))
                break

# 4. Strip section-name tags and table-name fragments from ALL features
#    These are PDF section artifacts that pollute features.
TABLE_NAME_SUFFIXES = re.compile(r'选型表$|系列$|系列/')
for slug, vd in data.items():
    for p in vd['products']:
        fn = p.get('_features', '') or ''
        feats = fn.split()
        sec = p.get('_section', '') or ''
        sec_clean = sec.replace(' ', '').replace('（','(').replace('）',')')
        canon = section_to_tag(sec)
        
        new_feats = []
        for t in feats:
            t_clean = t.replace(' ', '').replace('（','(').replace('）',')')
            # Strip: exact section-name match → replace with canonical
            if canon and sec_clean != canon and t_clean == sec_clean:
                if canon not in feats and canon not in new_feats:
                    new_feats.append(canon)
                continue
            # Strip: table-name suffixes only when they're the section name or have no category value
            if TABLE_NAME_SUFFIXES.search(t) and canon and sec_clean != canon:
                # Only strip if canonical will be added (avoid losing category)
                if canon not in feats and canon not in new_feats:
                    new_feats.append(canon)
                continue
            new_feats.append(t)
        
        if new_feats != feats:
            p['_features'] = ' '.join(new_feats)
            fixes['nvs_sec_tag'].append('{}: {}→{}'.format(p.get('part_number',''), fn[:60], p['_features'][:60]))

# 5. Strip PARAM_DERIVED_TAGS from ALL vendors (novosense included)
PARAM_DERIVED_ALL = PARAM_DERIVED_TAGS | {
    '高ESD', '高EMC', '高CMRR', '轨到轨', '短路保护', '过温保护', '过压保护',
    '欠压锁定', '振铃抑制', '斜率控制', '显性超时', '低功耗唤醒', '低功耗(≤50µA)',
    '低功耗', '精密(≤1mV)', '高PSRR', '低失调', '低漂移', '低静态电流',
    '宽输入', '低输入偏置', '高增益带宽', '高转换率', '自校准', '零漂移',
    '低Ib', '软启动', '展频', '跟踪输出', '外部时钟', '警报输出',
    '零交越失真', '低边检测', '开路检测', '远端采样', '防反接', '过流保护',
    'SIC', '特定帧唤醒', '低环路延迟', '无源特性', '看门狗', '微功耗放大器',
    '双向', '单向', '差分输出', '单端输出',
}
PARAM_NUMERIC_RE_ALL = re.compile(
    r'^(?:\d+\.?\d*Mbps|\d+\.?\d*kBPS|Vin_\d+\.?\d*V?|Vout_\d+\.?\d*V?|'
    r'Iout_\d+\.?\d*[Am]?|Vref_\d+\.?\d*V?|'
    r'\d+bit|\d+通道|\d+口|\d+:\d+|\d+T\d+R|\d+R\d+T)$', re.I)
for slug, vd in data.items():
    for p in vd['products']:
        fn = p.get('_features', '') or ''
        feats = fn.split()
        cleaned = [t for t in feats if t not in PARAM_DERIVED_ALL 
                   and not PARAM_NUMERIC_RE_ALL.match(t)]
        if cleaned != feats:
            p['_features'] = ' '.join(cleaned)
            fixes['param_strip'].append('{}: {}→{}'.format(
                p.get('part_number',''), fn[:80], p['_features'][:80]))

# 6. Global redundancy cleanup (all vendors)
for slug, vd in data.items():
    for p in vd['products']:
        fn = p.get('_features', '') or ''
        feats = fn.split()
        changed = False
        # CAN-FD implies CAN
        if 'CAN-FD' in feats and 'CAN' in feats:
            feats = [t for t in feats if t != 'CAN']; changed = True
        # 保留 parent closure tag: child + parent 共存是设计需要，不是冗余。
        # 否则泛化查询“隔离 / 栅极驱动”会被前端初筛或后端老路径漏掉。
        if changed:
            p['_features'] = ' '.join(feats)

# 6b. Fix truncated/canonical alias tags (extraction artifacts)
# These are unambiguous product-feature artifacts discovered by global feature→KB audit.
# Keep the fix in rule code, not by hand-editing products_structured.json.
FEATURE_CANONICAL_ALIASES = {
    '2C': 'I2C',
    'DC-DC': 'DCDC',
    'Boost': '升压',
    '降压变换器': '降压',
    '电压监控复位IC': '复位芯片',
    '模数转换器ADC': 'ADC',
    '高精度ADC': 'ADC',
    '理想二极管控制器': '理想二极管',
    '隔离RS-485': '隔离RS485',
    '实时控制MCU/DSP': 'MCU/DSP',
    '线性LED': 'LED驱动',
    '带看门狗的复位芯片': '复位芯片',
}
FEATURE_ARTIFACT_TAGS = {
    # Raw section names with spaces get split into dangling fragments by _features.split().
    # The complete canonical tags are added from section_to_tag; these fragments carry no meaning.
    '霍尔开关/', '磁阻开关/', '低边驱动/',
    # MEMS 在当前产品库里不是稳定的搜索品类，而是工艺/技术描述：
    # - 18 款 MEMS 压力传感器同时已有 canonical 品类“压力传感器”
    # - 6 款 MEMS 麦克风信号调理芯片同时已有 canonical 品类“传感器接口”
    # 继续保留只会把技术词混进 feature taxonomy，造成 feature→知识库审计残留。
    'MEMS',
}
for slug, vd in data.items():
    for p in vd['products']:
        fn = p.get('_features', '') or ''
        feats = fn.split()
        fixed = []
        changed = False
        for t in feats:
            if t in FEATURE_ARTIFACT_TAGS:
                changed = True
                continue
            t2 = FEATURE_CANONICAL_ALIASES.get(t, t)
            if t2 != t:
                changed = True
            if t2 not in fixed:
                fixed.append(t2)
        # DCDC is the parent category for buck/boost switching converters.
        if any(t in fixed for t in ('升压', '降压')) and 'DCDC' not in fixed:
            fixed.append('DCDC')
            changed = True
        if changed:
            p['_features'] = ' '.join(fixed)
            fixes['fix_tag'].append('{}: {}→{}'.format(p.get('part_number',''), fn, p['_features']))

for slug, vd in data.items():
    if slug == 'novosense':
        continue
    for p in vd['products']:
        pn = p.get('part_number', '')
        sec = p.get('_section', '') or ''
        feats = (p.get('_features', '') or '').split()
        # Strip: noise tags + numeric params + non-whitelist unknown tags
        # Strip: keep only whitelisted category/grade tags
        sec_clean = sec.replace(' ', '').replace('（','(').replace('）',')')
        cleaned = [t for t in feats 
                   if is_valid_tag(t, sec) and t not in PARAM_DERIVED_TAGS]
        
        # Strip raw section-name tags when section_to_tag maps to a different canonical.
        #   e.g. "宽压降压变换器" → replaced with "降压" when canonical differs.
        canon = section_to_tag(sec)
        if canon and sec_clean != canon:
            # Search cleaned for the original section tag (may have full-width brackets)
            found_idx = None
            for i, t in enumerate(cleaned):
                t_clean = t.replace(' ', '').replace('（','(').replace('）',')')
                if t_clean == sec_clean:
                    found_idx = i
                    break
            if found_idx is not None:
                cleaned[found_idx] = canon if canon not in cleaned else None
                cleaned = [t for t in cleaned if t is not None]
        
        # SBC (System Basis Chip): CAN-FD/LIN/RS-485 are integrated sub-features,
        #   not product category. Strip them — params carry the detail.
        if 'SBC' in cleaned:
            for proto in ('CAN-FD', 'LIN', 'CAN', 'RS-485', 'RS-232'):
                if proto in cleaned:
                    cleaned.remove(proto)
        # MLVDS ≠ RS-485 (different physical layer). Strip RS-485 from MLVDS.
        if 'MLVDS' in cleaned and 'RS-485' in cleaned:
            cleaned.remove('RS-485')
        
        # Redundancy cleanup: sub-tags that imply parent tags
        # 1. CAN-FD implies CAN → remove bare "CAN" when "CAN-FD" present
        if 'CAN-FD' in cleaned and 'CAN' in cleaned:
            cleaned.remove('CAN')
        # 2. 保留 generic parent tags: 隔离子品类需同时保留父维度“隔离”；
        #    栅极驱动子品类也保留父品类“栅极驱动”。这是检索闭包, 不是噪声。
        # 3. CAN-FD/CAN → "CAN" is parent, "CAN-FD" is specific
        if '隔离CAN' in cleaned and 'CAN' in cleaned:
            cleaned.remove('CAN')
        # Grade: 工业级+消费级 → pick based on params rating
        if '工业级' in cleaned and '消费级' in cleaned:
            params_str = p.get('_params', '')
            if 'Automotive' in params_str or '车规' in params_str:
                cleaned.remove('消费级')
            elif '消费' in params_str or 'Consumer' in params_str or 'commercial' in params_str.lower():
                cleaned.remove('工业级')
            else:
                cleaned.remove('消费级')  # default to 工业级 when ambiguous
        
        # 3peak 车规规则: base PN (first segment before "-") 以 Q 结尾才是车规
        #   "3peak-auto" 手册里混入了大量工规料，不能全标车规。
        #   ★ 仅对 3peak 生效，yutai 等厂商从 params 取等级。
        if slug.startswith('3peak'):
            base = pn.split('-')[0] if '-' in pn else pn
            is_auto_q = bool(re.search(r'Q\d*$', base))
            if is_auto_q:
                if '车规AEC-Q100' not in cleaned:
                    cleaned.append('车规AEC-Q100')
            else:
                cleaned = [t for t in cleaned if t != '车规AEC-Q100']
                if '工业级' not in cleaned:
                    cleaned.append('工业级')

        # Yutai grade must be derived from source evidence, not preserved from stale features.
        # Priority: explicit automotive/AEC evidence > explicit consumer/industrial words > temperature.
        if slug == 'yutai':
            raw_text = ' | '.join([sec, p.get('_params', '') or ''])
            low_text = raw_text.lower()
            desired_grade = None
            if re.search(r'aec[-\s]*q100|automotive|车规|车载', low_text, re.I):
                desired_grade = '车规AEC-Q100'
            elif '消费级' in raw_text or 'consumer' in low_text:
                desired_grade = '消费级'
            elif '工业级' in raw_text or 'industrial' in low_text:
                desired_grade = '工业级'
            else:
                tm = re.search(r'(-?\d+)\s*[°℃c]', raw_text, re.I)
                if tm:
                    start_temp = int(tm.group(1))
                    if start_temp <= -40:
                        desired_grade = '工业级'
                    elif start_temp >= 0:
                        desired_grade = '消费级'
            if desired_grade:
                cleaned = [t for t in cleaned if t not in ('工业级', '车规AEC-Q100', '消费级')]
                cleaned.append(desired_grade)
        
        if cleaned != feats:
            p['_features'] = ' '.join(cleaned)

# 6c. Final parent closure re-apply after all late section/category rewrites.
# Some products only become canonical child categories in later passes (e.g. NSI6642* → 隔离栅极驱动),
# so parent tags must be re-filled here to avoid order-dependent漏标.
for slug, vd in data.items():
    for p in vd['products']:
        feats = (p.get('_features', '') or '').split()
        feat_set = set(feats)
        added = []
        for child, parents in PARENT_CLOSURE.items():
            if child not in feat_set:
                continue
            for parent in parents:
                if parent not in feat_set:
                    feats.append(parent)
                    feat_set.add(parent)
                    added.append(parent)
        if added:
            p['_features'] = ' '.join(feats)
            fixes['parent_closure'].append('{}: final +{}'.format(p.get('part_number',''), '/'.join(added)))

# ═══════════════════════════════════════════
if not DRY_RUN:
    json.dump(data, open(DATA_PATH, 'w'), ensure_ascii=False, indent=2)

for name, items in sorted(fixes.items()):
    print('{}: {} 处'.format(name, len(items)))

if DRY_RUN:
    print('\n⚠️  DRY RUN - 未实际修改。去掉 --dry-run 执行修复。')
else:
    # Compare
    changed = 0
    for slug, vd in data.items():
        for p in vd['products']:
            pn = p['part_number']
            for op in original.get(slug, {}).get('products', []):
                if op['part_number'] == pn:
                    if op.get('_features') != p.get('_features') or op.get('_params') != p.get('_params'):
                        changed += 1
    print('\n实际修改产品数: {}'.format(changed))

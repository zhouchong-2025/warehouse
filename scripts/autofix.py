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
    'TPT116': 'SBC',
    'TPT726': 'I2C',
    'TPT9H': 'MLVDS', 'TPT9L': 'MLVDS',
    'T74L': '电平转换', 'T74A': '电平转换', 'TPT201': '电平转换', 'TPT202': '电平转换',
    'TPW4': '模拟开关', 'TPWH': '模拟开关', 'TPW3': '模拟开关', 'TPW1': '模拟开关',
    'TPM8': '马达驱动', 'TPM88': '马达驱动', 'TPM89': '马达驱动',
    'TPM5': '隔离栅极驱动', 'TPM2': '栅极驱动', 'TPM27': '栅极驱动',
    'TPM102': '栅极驱动', 'TPM202': '栅极驱动', 'TPM275': '栅极驱动',
    'TPQ05': '升压', 'TPQ5': '升压',
    'TPM650': '隔离电源',
    'TPE': '以太网供电',
    'TPTMP': '温度传感器',
    'TPDA': '音频总线',
    'TPS05P': '电子保险丝', 'TPS0': '负载开关', 'TPS2': '负载开关',
    'TPV6': '复位芯片', 'TPV7': '复位芯片', 'TPV8': '复位芯片',
    # CM series: TVS/ESD for 纳芯微, BMS for 思瑞浦-模拟
    # Leave CM tagging to extract_toc.py (TOC-driven is more accurate)
    # 'CM100': 'TVS/ESD', 'CM101': 'TVS/ESD', ... — REMOVED: conflicts with 3peak BMS
    # 纳芯微 隔离栅极驱动
    'NSD1': '隔离栅极驱动', 'NSD3': '隔离栅极驱动', 'NSD7': '隔离栅极驱动',
    'NSD8': '隔离栅极驱动', 'NSD12': '隔离栅极驱动', 'NSD16': '隔离栅极驱动',
    'NSD36': '隔离栅极驱动', 'NSD73': '隔离栅极驱动', 'NSD83': '隔离栅极驱动',
    'NSD10': '隔离栅极驱动', 'NSD124': '隔离栅极驱动', 'NSD162': '隔离栅极驱动',
    # 纳芯微 运放
    'NSOPA': '运放',
    # 纳芯微 数字隔离器
    'NSI665': '数字隔离器', 'NSI671': '数字隔离器', 'NSI673': '数字隔离器',
    'NSI677': '数字隔离器', 'NSI685': '数字隔离器', 'NSI663': '数字隔离器',
    'NSI820': '数字隔离器', 'NSI821': '数字隔离器', 'NSI826': '数字隔离器',
    'NSI840': '数字隔离器',
    # 纳芯微 隔离电源
    'NSIP60': '隔离电源', 'NSIP32': '隔离电源',
    # 纳芯微 隔离放大器
    'NSI105': '隔离放大器', 'NSI104': '隔离放大器', 'NSI120': '隔离放大器',
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
    'TS250': '隔离放大器', 'TLV900': '运放', 'LM358': '运放', 'LM290': '比较器',
    'LM324': '运放', 'LM321': '运放', 'LMV3': '运放', 'LMV9': '运放',
    'TP07': '运放', 'TP12': '运放', 'TP15': '运放', 'TP17': '运放',
    'TP22': '运放', 'TP25': '运放', 'TPH2': '运放',
    'SNA00': '运放',
    # 通用 DCDC
    'MT520': 'DCDC', 'MT530': 'DCDC',
    # 纳芯微 电压基准 / 电流传感器
    'NSC63': '电压基准', 'NSC28': '电流传感器', 'NSC627': '电流传感器',
    'NSC62': '电流传感器',
    # 纳芯微 栅极驱动
    'NSDRV': '栅极驱动',
    # 纳芯微 数字隔离器
    'NSI822': '数字隔离器', 'NSI823': '数字隔离器', 'NSI824': '数字隔离器',
    'NSI167': '数字隔离器',
    # 纳芯微 位置传感器
    'NSE35': '位置传感器', 'NSE34': '位置传感器',
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
def fmtv(v): return str(int(v)) if v == int(v) else str(v)

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
            
            vr = parse_range(vin_val) if vin_val else None
            vor = parse_range(vout_val) if vout_val and not is_boost else None
            ir = parse_range(iout_val) if iout_val else None
            
            parts = [t for t in ft.split() if not (t.startswith('Vin_') or t.startswith('Vout_') or t.startswith('Iout_'))]
            added = []
            
            if vr:
                # If only max available, range is (0, max); if only min, range is (min, 1000)
                vlo, vhi = vr
                # Check if min/max are actual numbers (not formulas like "max(Ver+0.05, 2.1)")
                try: _ = float(vin_min) if vin_min else None
                except: vin_min = None
                try: _ = float(vin_max) if vin_max else None
                except: vin_max = None
                if vin_max and not vin_min: vlo = 0
                if vin_min and not vin_max: vhi = 1000
                for pt in VIN:
                    if vlo <= pt <= vhi:
                        t = f'Vin_{fmtv(pt)}V'
                        parts.append(t); added.append(t)
            if is_boost and vout_val:
                for pt in VOUT:
                    if vr and vr[1] >= pt:
                        t = f'Vout_{fmtv(pt)}V'; parts.append(t); added.append(t)
                    elif vor and vor[1] >= pt:
                        t = f'Vout_{fmtv(pt)}V'; parts.append(t); added.append(t)
            elif vor:
                for pt in VOUT:
                    if covers(vor, pt):
                        t = f'Vout_{fmtv(pt)}V'; parts.append(t); added.append(t)
            if ir:
                for pt in IOUT:
                    if pt <= ir[1]:
                        t = f'Iout_{fmtv(pt)}A'; parts.append(t); added.append(t)
            
            if added:
                if not DRY_RUN: p['_features'] = ' '.join(parts)
                fixes['cap_tags'].append('{}: +{}'.format(p['part_number'], ','.join(added)))
            elif ' '.join(parts) != ft:
                # Strip old Iout/Vin/Vout tags even if no new ones added
                if not DRY_RUN: p['_features'] = ' '.join(parts)
        
        # Refresh ft after speed/cap tags may have changed it
        ft = p.get('_features','')
        
        # ── NEW: Feature tags from params ──
        feat_tags = []
        pl = params.lower()
        # 低噪声 / PSRR
        if any(kw in pl for kw in ['psrr','噪声','noise','vn at','peak noise']):
            feat_tags.append('低噪声')
        if 'psrr' in pl and 'db' in pl.split('psrr')[1][:10] if 'psrr' in pl else False:
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
        if any(kw in pl for kw in ['partial network', '特定帧唤醒', 'wake', '唤醒']):
            if '低功耗唤醒' not in feat_tags:
                feat_tags.append('低功耗唤醒')
            if 'partial network' in pl or '特定帧' in pl:
                feat_tags.append('特定帧唤醒')
        
        if feat_tags:
            existing = set(ft.split())
            for t in feat_tags:
                if t not in existing:
                    if not DRY_RUN: p['_features'] = ft + ' ' + ' '.join(feat_tags)
                    fixes['spec_tags'].append(f'{p["part_number"]}: +{",".join(feat_tags)}')
        
        ft = p.get('_features','')  # refresh after spec tags
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
        # ── RS-232/485: XTXR tags from Drivers/Receivers ──
        if any(kw in ft for kw in ['RS-232','RS-485']):
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
            # Duplex mode from params
            for part in params.split('|'):
                kv = part.split(':',1)
                if len(kv) < 2: continue
                k = kv[0].strip().lower()
                v = kv[1].strip()
                if k == 'mode' or 'duplex' in k:
                    if 'half' in v.lower():
                        if '半双工' not in ft:
                            if not DRY_RUN: p['_features'] = ft + ' 半双工'
                            fixes['duplex_tags'].append(f'{p["part_number"]}: +半双工')
                    elif 'full' in v.lower():
                        if '全双工' not in ft:
                            if not DRY_RUN: p['_features'] = ft + ' 全双工'
                            fixes['duplex_tags'].append(f'{p["part_number"]}: +全双工')
                    break
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
    '隔离RS485': 'RS-485', '隔离CAN': 'CAN-FD', '隔离I2C': 'I2C',
    '隔离栅极驱动': '隔离栅极驱动', '非隔离栅极驱动': '栅极驱动',
    'IO 扩展器': 'IO扩展器', '数字隔离器': '数字隔离器',
    '放大器': '运放', '运算放大器': '运放', '比较器': '比较器',
    'LDO': 'LDO', 'DCDC': 'DCDC', 'ADC': 'ADC', 'DAC': 'DAC',
    '电压基准': '电压基准', '复位芯片': '复位芯片',
    '模拟开关': '模拟开关', '负载开关': '负载开关', '高边开关': '负载开关',
    '电平转换器': '电平转换', '逻辑和电平转换器': '电平转换',
    '步进马达驱动': '马达驱动', '直流马达驱动': '马达驱动',
    '温度传感器': '温度传感器', '电流传感器': '电流传感器',
    '位置传感器': '位置传感器', '压力传感器': '压力传感器',
    '隔离电源': '隔离电源', '以太网供电': '以太网供电',
    '隔离放大器和调制器': '隔离放大器',
    'SBC': 'SBC', 'MLVDS': 'MLVDS',
    'ASN 音频总线': '音频总线',
    # 传感器变体
    '电流信号检测放大器': '电流传感器',
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
    '串联型电压基准': '电压基准', '并联型电压基准': '电压基准',
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
}

for slug, vd in data.items():
    for p in vd['products']:
        pn = p['part_number']
        sec = p.get('_section', '')
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
        sec = p.get('_section','')
        ft = p.get('_features','')
        feats = ft.split()
        
        # A: Section implies tag → ensure tag present (use longest-match to avoid substring false positives)
        tag = section_to_tag(sec)
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
        # 派生判据只信产品描述原文(零假阳性): 描述含 "can sbc"/"can " → +CAN-FD; "lin sbc"/"lin " → +LIN.
        # 防复发: 未来新增任何 SBC 产品, 只要描述写明总线类型即自动补对应总线标签.
        is_sbc = (sec == 'SBC') or ('SBC' in feats)
        if is_sbc:
            params_lower = str(p.get('_params','')).lower()
            bus_added = []
            # 描述明确总线类型才派生; 互斥保护: 已有其他总线时不强加(避免污染)
            if ('can sbc' in params_lower or 'can,' in params_lower or 'can ' in params_lower) \
               and 'CAN-FD' not in feats and 'LIN' not in feats and 'RS-485' not in feats and 'RS-232' not in feats:
                feats.append('CAN-FD'); bus_added.append('CAN-FD')
            if bus_added:
                p['_features'] = ' '.join(feats)
                fixes['sec_fix'].append('{}: +{}(SBC总线派生,描述明确)'.format(p['part_number'], '/'.join(bus_added)))

        # B: Feature has category but section is wrong → fix section
        # 护栏: SBC 是复合品类, 其 CAN-FD/LIN/RS-485 标签是"集成的总线维度", 不是品类.
        #   不能因为 SBC 产品带 CAN-FD 标签就把 _section 从 'SBC' 改成 'CAN 收发器'(会丢品类).
        is_sbc_product = (sec == 'SBC') or ('SBC' in feats)
        if not is_sbc_product:
            for tag in ['RS-232','RS-485','CAN-FD','LIN','IO扩展','数字隔离器','隔离栅极驱动','栅极驱动']:
                if tag in feats:
                    expected_sec = {
                        'RS-232': 'RS-232 收发器', 'RS-485': 'RS-485 收发器',
                        'CAN-FD': 'CAN 收发器', 'LIN': 'LIN 收发器',
                        'IO扩展': 'IO 扩展器', '数字隔离器': '数字隔离器',
                        '隔离栅极驱动': '隔离栅极驱动', '栅极驱动': '非隔离栅极驱动',
                    }.get(tag)
                    if expected_sec and expected_sec not in sec and tag not in sec:
                        p['_section'] = expected_sec
                        fixes['sec_fix'].append('{}: _section→{}'.format(p['part_number'], expected_sec))

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
# Report
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
                     '数字隔离器','隔离栅极驱动','非隔离栅极驱动','栅极驱动','马达驱动',
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
                         '数字隔离器','隔离栅极驱动','非隔离栅极驱动','栅极驱动','马达驱动',
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
                     'SBC', '以太网', '交换机', '网卡', 'IO扩展器'}
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

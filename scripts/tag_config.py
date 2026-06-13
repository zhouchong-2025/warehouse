#!/usr/bin/env python3
"""
tag_config.py — 品类→参数→标签的配置驱动映射表
定义每个品类可以从哪些参数提取哪些标签，以及提取逻辑。
新增品类/标签时只需修改此文件，无需改 autofix 代码。
"""

import re

# ─── 参数提取规则 ───
# 每条规则: (param_key_pattern, extract_fn, tag_template)
# extract_fn(value) → list of tag strings

def extract_channels(v):
    """Number of Channels: N or X/Y → [N通道, ...] cumulative"""
    try:
        v = str(v).strip()
        # Handle "4/2" format → max(4,2) = 4
        if '/' in v:
            parts = v.split('/')
            n = max(int(float(p.strip())) for p in parts if p.strip().replace('.','').isdigit())
        else:
            n = int(float(v.split()[0]))
        return [f'{c}通道' for c in [1,2,4,8,16,32] if c <= n]
    except:
        return []

def extract_txr(v_drivers, v_receivers):
    """Drivers=N, Receivers=M → [NTMR]"""
    try:
        d = int(float(v_drivers.split()[0]))
        r = int(float(v_receivers.split()[0]))
        return [f'{d}T{r}R']
    except:
        return []

def extract_duplex(v):
    """Mode: Half/Full Duplex → [半双工] or [全双工]"""
    vlow = v.lower()
    if 'half' in vlow: return ['半双工']
    if 'full' in vlow: return ['全双工']
    return []

def extract_speed(v, param_key=''):
    """Data Rate: N (kBPS/Mbps/Gbps) → [XMbps] cumulative. Unit from key or value suffix."""
    try:
        m = re.search(r'([\d.]+)\s*([kKmMgG]?)', str(v))
        if not m: return []
        val = float(m.group(1))
        unit = (m.group(2) or '').upper()
        # If no unit suffix on value, detect from param key (kBPS, Mbps, Gbps)
        if not unit and param_key:
            klow = param_key.lower()
            if 'kbps' in klow or 'kbps' in klow: unit = 'K'
            elif 'gbps' in klow: unit = 'G'
            else: unit = 'M'  # default
        elif not unit:
            unit = 'M'
        
        if unit == 'K': rate = val / 1000
        elif unit == 'M': rate = val
        elif unit == 'G': rate = val * 1000
        else: rate = val
        # ★ 方案甲(2026-06-12): 速率存真实值单一标签, 不再梯子展开.
        #   与 autofix.py speed 块一致. 搜索≥语义由 constraint-match.ts '速率' downgradable 分支做数值比较.
        if rate <= 0: return []
        return [f'{int(rate)}Mbps' if rate == int(rate) else f'{round(rate, 3)}Mbps']
    except:
        return []

def extract_vin(v):
    """VIN/Supply: N or N~M → [Vin_XV] cumulative"""
    try:
        v = str(v).strip()
        m = re.match(r'([\d.]+)\s*[~\-\u2013\u2014]\s*([\d.]+)', v)
        if m:
            lo, hi = float(m.group(1)), float(m.group(2))
        else:
            m = re.match(r'([\d.]+)', v)
            if m:
                lo = hi = float(m.group(1))
            else:
                return []
        # Handle "max (Ver+0.05, 2.1)" formulas
        if 'max' in v.lower() or 'ver' in v.lower(): return []
        thresholds = [0.8, 1.2, 1.8, 2.5, 3.3, 5, 12, 24, 36, 48]
        tags = []
        for pt in thresholds:
            if lo <= pt <= hi:
                t = f'Vin_{int(pt)}V' if pt == int(pt) else f'Vin_{pt}V'
                tags.append(t)
        return tags
    except:
        return []

def extract_vout(v):
    """Output Voltage: N or Fixed(a,b,c) → [Vout_XV]"""
    try:
        v = str(v).strip()
        # Fixed(1.25, 2.048, 3.3) → parse all numbers
        m = re.match(r'Fixed\s*\(([\d.,\s]+)\)', v, re.I)
        if m:
            nums = [float(x) for x in re.findall(r'[\d.]+', m.group(1))]
        else:
            m = re.match(r'([\d.]+)\s*[~\-\u2013\u2014]\s*([\d.]+)', v)
            if m:
                nums = [float(m.group(1)), float(m.group(2))]
            else:
                m = re.match(r'([\d.]+)', v)
                if m:
                    nums = [float(m.group(1))]
                else:
                    return []
        lo, hi = min(nums), max(nums)
        thresholds = [0.6, 0.8, 1.0, 1.2, 1.8, 2.5, 3.3, 5, 12, 24, 36, 48]
        tags = []
        for pt in thresholds:
            if lo <= pt <= hi:
                t = f'Vout_{int(pt)}V' if pt == int(pt) else f'Vout_{pt}V'
                tags.append(t)
        return tags
    except:
        return []

def extract_iout(v, param_key=''):
    """Max Output Current: N (A/mA) → [Iout_XA] cumulative"""
    try:
        v = str(v).strip()
        m = re.match(r'([\d.]+)', v)
        if not m: return []
        val = float(m.group(1))
        # Detect unit from param key or value context
        klow = param_key.lower()
        if any(x in klow for x in ['(ma)', 'ma)','(ma']):
            val = val / 1000
        elif any(x in klow for x in ['μa','(μa','ua']):
            val = val / 1000000
        thresholds = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20]
        return [f'Iout_{int(t)}A' if t == int(t) else f'Iout_{t}A' for t in thresholds if t <= val]
    except:
        return []


def extract_bits(v):
    """Resolution: N → [Nbit]"""
    try:
        n = int(float(str(v).split()[0]))
        return [f'{n}bit']
    except:
        return []


def extract_mux(v):
    """Switch Config: 8:1 → [8:1]"""
    try:
        v = str(v).strip()
        m = re.match(r'(\d+)\s*:\s*(\d+)', v)
        if m: return [f'{m.group(1)}:{m.group(2)}']
        return []
    except:
        return []

def extract_spec(v, param_key):
    """Feature detection: low noise, precision, rail-to-rail"""
    tags = []
    klow = param_key.lower()
    vlow = str(v).lower()
    if any(kw in klow for kw in ['psrr','噪声','noise','vn at','peak noise']):
        tags.append('低噪声')
    if 'psrr' in klow and 'db' in vlow:
        tags.append('高PSRR')
    if any(kw in klow for kw in ['vos (max)','offset drift','精度']):
        tags.append('精密(≤1mV)')
    if 'rail-rail' in klow or 'rail_rail' in klow:
        tags.append('轨到轨')
    if '高压' in param_key:
        tags.append('高压(≥30V)')
    return tags

# ─── 品类→参数→标签映射表 ───
# 格式: category_tag → { param_key_substring: extract_fn or ('paired', extract_fn, [keys]) }
# extract_fn(value) 或 extract_fn(v1, v2) for paired

TAG_RULES = {
    # ── 接口芯片: 收发数 + 速率 + 双工模式 ──
    'RS-232': {
        'drivers per package': None,  # paired with receivers
        'paired:(drivers per package,receivers per package)': extract_txr,
        'data rate': extract_speed,
    },
    'RS-485': {
        'drivers per package': None,  # paired with receivers
        'paired:(drivers per package,receivers per package)': extract_txr,
        'data rate': extract_speed,
        'mode': extract_duplex,  # Half/Full Duplex
    },
    'MLVDS': {
        'drivers per package': None,
        'paired:(drivers per package,receivers per package)': extract_txr,
        'data rate': extract_speed,
    },
    'IO扩展': {
        'drivers per package': None,
        'paired:(drivers per package,receivers per package)': extract_txr,
    },
    # ── 通信: 速率 ──
    'CAN-FD': {'data rate': extract_speed},
    'LIN': {'data rate': extract_speed},
    'SBC': {'data rate': extract_speed},
    # ── 隔离: 速率 ──
    '数字隔离器': {'data rate': extract_speed},
    # ── 通道数（通用，累积制）──
    '运放': {'number of channels': extract_channels},
    '比较器': {'number of channels': extract_channels},
    '马达驱动': {'number of channels': extract_channels},
    '栅极驱动': {'number of channels': extract_channels},
    '非隔离栅极驱动': {'number of channels': extract_channels},
    '隔离栅极驱动': {'number of channels': extract_channels},
    '模拟开关': {'number of channels': extract_channels},
    'ADC': {'number of channels': extract_channels},
    'DAC': {'number of channels': extract_channels},
    '电平转换': {'number of channels': extract_channels},
    '数字隔离器': {'forward/reverse channels': extract_channels, 'number of channels': extract_channels, 'max data rate': extract_speed},
    'CAN-FD': {'number of channels': extract_channels, 'data rate': extract_speed},
    'LIN': {'number of channels': extract_channels},
    'SBC': {'number of channels': extract_channels},
    '视频滤波': {'number of channels': extract_channels},
    '音频功放': {'number of channels': extract_channels},
    # ── 电源: Vin/Vout/Iout ──
    'DCDC': {
        'vin (v)': extract_vin,
        'minimum input voltage': extract_vin,
        'maximum input voltage': None,  # paired with min
        'paired:(minimum input voltage,maximum input voltage)': extract_vin,
        'paired:(minimum operating voltage,maximum operating voltage)': extract_vin,
        'output voltage': extract_vout,
        'output (v)': extract_vout,
        'max output current': extract_iout,
    },
    'LDO': {
        'minimum input voltage': extract_vin,
        'maximum input voltage': None,
        'paired:(minimum input voltage,maximum input voltage)': extract_vin,
        'output voltage': extract_vout,
        'max output current': extract_iout,
    },
    '电压基准': {
        'vin (min)': extract_vin,
        'vin (max)': extract_vin,
        'vin (v)': extract_vin,
        'output voltage': extract_vout,
    },
    '马达驱动': {
        'vin (v)': extract_vin,
        'max output current': extract_iout,
    },
    '栅极驱动': {
        'vin (v)': extract_vin,
        'max output current': extract_iout,
    },
    '非隔离栅极驱动': {
        'vin (v)': extract_vin,
        'max output current': extract_iout,
    },
    '隔离栅极驱动': {
        'max output current': extract_iout,
    },
    '隔离电源': {
        'vin (v)': extract_vin,
        'max output current': extract_iout,
    },
    '电子保险丝': {
        'minimum operating voltage': extract_vin,
        'maximum operating voltage': None,
        'paired:(minimum operating voltage,maximum operating voltage)': extract_vin,
    },
    '理想二极管': {
        'minimum operating voltage': extract_vin,
        'maximum operating voltage': None,
        'paired:(minimum operating voltage,maximum operating voltage)': extract_vin,
    },

    # ── ADC/DAC: bit depth + channels + Vin ──
    #   ★ 2026-06-12: 删除 ADC 'rate (msps)'→extract_speed 和 DAC 'settling time'→extract_speed.
    #   MSPS(采样率)和 Settling Time(建立时间μs)都不是数据速率(Mbps), 单位语义不同, 误抽成Mbps是语义推断错误.
    #   ADC采样率排序由 SortIntent(paramKeys=throughput/msps 读_params_numeric)处理, 不需要Mbps布尔标签.
    'ADC': {
        'resolution': extract_bits,
        'number of channels': extract_channels,
        'vdd (v)': extract_vin,
    },
    'DAC': {
        'resolution': extract_bits,
        'number of channels': extract_channels,
        'vdd (v)': extract_vin,
    },
    # ── 数字隔离器: channels (Forward/Reverse) + speed ──
    '数字隔离器': {
        'forward/reverse channels': extract_channels,
        'number of channels': extract_channels,
        'max data rate': extract_speed,
    },

    # ── MLVDS: channels + speed ──
    'MLVDS': {
        'drivers per package': None,
        'paired:(drivers per package,receivers per package)': extract_txr,
        'data rate': extract_speed,
        'number of channels': extract_channels,
    },
    # ── 比较器: speed from propagation delay (lower ns = faster) ──
    '比较器': {
        'number of channels': extract_channels,
        'propagation delay': extract_speed,
        'vs (min)': extract_vin,
        'vs (max)': extract_vin,
    },
    # ── 视频滤波: channels ──
    '视频滤波': {
        'number of channels': extract_channels,
    },
    # ── 模拟开关: mux ratio + channels ──
    '模拟开关': {
        'number of channels': extract_channels,
        'switch config': extract_mux,
    },
    # ── 隔离栅极驱动: isolation voltage ──
    '隔离栅极驱动': {
        'number of channels': extract_channels,
        'max output current': extract_iout,
        'isolation rating (vrms)': extract_vin,
    },
    # ── 运放/比较器/放大器的 Supply Voltage → Vin ──
    '运放': {
        'number of channels': extract_channels,
        'supply voltage (min)': extract_vin,
        'supply voltage (max)': extract_vin,
        'gbw': None,  # GBW tag handled separately
    },
    '比较器': {
        'number of channels': extract_channels,
        'propagation delay': extract_speed,
        'vs (min)': extract_vin,
        'vs (max)': extract_vin,
    },
}


def get_applicable_rules(category_tag):
    """Get all tag rules applicable to a category (including parent categories)."""
    rules = {}
    if category_tag in TAG_RULES:
        rules.update(TAG_RULES[category_tag])
    # Also check substring matches for compound tags like "隔离 RS-485"
    for cat, cat_rules in TAG_RULES.items():
        if cat != category_tag and cat in category_tag:
            rules.update(cat_rules)
    return rules


def generate_tags(category_tag, params_str):
    """Generate all tags for a product based on its category and params.
    
    Returns: list of tag strings that the product SHOULD have.
    """
    rules = get_applicable_rules(category_tag)
    if not rules:
        return []
    
    # Parse params into dict
    params = {}
    for part in params_str.split('|'):
        kv = part.split(':', 1)
        if len(kv) >= 2:
            params[kv[0].strip().lower()] = kv[1].strip()
    
    tags = []
    paired_values = {}  # key → accumulated value for pairing
    
    for key_pattern, extract_fn in rules.items():
        if extract_fn is None:
            continue  # placeholder for paired
        
        if key_pattern.startswith('paired:'):
            # Paired extraction: extract_fn(v1, v2)
            pair_keys = key_pattern[7:].strip('()').split(',')
            v1 = params.get(pair_keys[0].strip())
            v2 = params.get(pair_keys[1].strip())
            if v1 is not None and v2 is not None:
                result = extract_fn(v1, v2)
                tags.extend(result)
        else:
            # Single key extraction: find first matching param key
            for param_key, param_val in params.items():
                # Flexible matching for param keys that express the same concept
                # but use different wordings (e.g., 'max output current' vs 'iout max')
                matched = key_pattern in param_key
                if not matched:
                    # Iout: match key_pattern 'max output current' ↔ param_key 'iout max'
                    iout_terms_kp = 'output current' in key_pattern or 'iout' in key_pattern
                    iout_terms_pk = 'output current' in param_key or 'iout' in param_key
                    if iout_terms_kp and iout_terms_pk:
                        matched = True
                    # Speed: match 'data rate' ↔ 'data rate (kbps)' etc.
                    speed_terms_kp = any(t in key_pattern for t in ['data rate', 'speed', 'throughput', 'rate'])
                    speed_terms_pk = any(t in param_key for t in ['data rate', 'speed', 'throughput', 'rate'])
                    if speed_terms_kp and speed_terms_pk:
                        matched = True
                if not matched:
                    continue
                    
                # For Iout/Speed, pass param_key to detect units
                if any(t in param_key for t in ['output current', 'iout']):
                    result = extract_iout(param_val, param_key)
                elif any(t in param_key for t in ['data rate', 'speed', 'throughput', 'rate']):
                    result = extract_speed(param_val, param_key)
                else:
                    result = extract_fn(param_val)
                tags.extend(result)
                break
    
    return tags

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


def fmt_num(v):
    return str(int(v)) if float(v).is_integer() else str(round(float(v), 3)).rstrip('0').rstrip('.')


def uniq_keep_order(vals):
    out = []
    seen = set()
    for v in vals:
        key = round(float(v), 6)
        if key in seen:
            continue
        seen.add(key)
        out.append(float(v))
    return out

def extract_channels(v):
    """Number of Channels: N or X/Y or 1CH → [N通道, ...] cumulative"""
    try:
        nums = [int(float(x)) for x in re.findall(r'[\d.]+', str(v))]
        if not nums:
            return []
        n = max(nums)
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

def extract_vin(v, v2=None):
    """VIN/Supply → actual endpoint tags only (no ladder expansion)."""
    try:
        vals = []
        if v2 is not None:
            vals = [float(x) for x in re.findall(r'[\d.]+', f'{v} {v2}')]
            if len(vals) >= 2:
                vals = [min(vals[0], vals[1]), max(vals[0], vals[1])]
        else:
            v = str(v).strip()
            if not v or 'max' in v.lower() or 'ver' in v.lower():
                return []
            nums = [float(x) for x in re.findall(r'[\d.]+', v)]
            if not nums:
                return []
            if len(nums) >= 2 and any(sep in v for sep in ['~', '-', '–', '—', '/']):
                vals = [min(nums), max(nums)]
            else:
                vals = [nums[0]]
        vals = uniq_keep_order(vals)
        return [f'Vin_{fmt_num(x)}V' for x in vals if x > 0]
    except:
        return []

def extract_vout(v):
    """Output Voltage → actual fixed values or range endpoints only (no ladder expansion)."""
    try:
        v = str(v).strip()
        vals = []
        m = re.match(r'Fixed\s*\(([\d.,\s]+)\)', v, re.I)
        if m:
            vals.extend(float(x) for x in re.findall(r'[\d.]+', m.group(1)))
        # 中文固定输出 / 多固定档
        if '固定输出' in v:
            vals.extend(float(x) for x in re.findall(r'[\d.]+', v))
        m = re.match(r'Adjustable\s*\(([\d.]+)\s*(?:to|~|\-|–|—)\s*([\d.]+)\)', v, re.I)
        if m:
            vals.extend([float(m.group(1)), float(m.group(2))])
        elif re.search(r'[\d.]+\s*[~\-–—]\s*[\d.]+', v):
            nums = [float(x) for x in re.findall(r'[\d.]+', v)]
            if len(nums) >= 2:
                vals.extend([min(nums), max(nums)])
        elif not vals:
            vals.extend(float(x) for x in re.findall(r'[\d.]+', v))
        vals = [x for x in uniq_keep_order(vals) if x > 0]
        return [f'Vout_{fmt_num(x)}V' for x in vals]
    except:
        return []

def extract_iout(v, param_key=''):
    """Max Output Current → exact real-value tag only (A-normalized, no ladder expansion)."""
    try:
        v = str(v).strip()
        m = re.match(r'([\d.]+)', v)
        if not m: return []
        val = float(m.group(1))
        # Detect unit from param key or value context
        klow = param_key.lower()
        vlow = v.lower()
        if any(x in klow for x in ['(ma)', 'ma)', '(ma']) or 'ma' in vlow:
            val = val / 1000
        elif any(x in klow for x in ['μa','(μa','ua']) or 'μa' in vlow or 'ua' in vlow:
            val = val / 1000000
        if val <= 0:
            return []
        return [f'Iout_{fmt_num(val)}A']
    except:
        return []


def extract_bits(v):
    """Resolution: N → [Nbit]"""
    try:
        m = re.search(r'(\d+)\s*(?:bit|位)?', str(v), re.I)
        if not m:
            return []
        n = int(m.group(1))
        return [f'{n}bit']
    except:
        return []


def extract_isolation(v, param_key=''):
    """Isolation rating: 3/5 kVrms or 3000/5000 Vrms → [隔离,3kVrms隔离,5kVrms隔离]"""
    try:
        m = re.search(r'([\d.]+)', str(v))
        if not m:
            return []
        val = float(m.group(1))
        klow = str(param_key).lower()
        if 'kvrms' in klow or 'kvrms' in str(v).lower():
            kv = val
        else:
            kv = val / 1000 if val > 50 else val
        tags = ['隔离']
        if kv >= 5:
            tags.append('5kVrms隔离')
        elif kv >= 3:
            tags.append('3kVrms隔离')
        return tags
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
    'CAN-FD': {
        'number of channels': extract_channels,
        'data rate': extract_speed,
        '最大工作速率': extract_speed,
        '最大码流': extract_speed,
    },
    'LIN': {
        'number of channels': extract_channels,
        '最大码流': extract_speed,
    },
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
        '最小输入 电压': extract_vin,
        '最大输入 电压': None,
        'paired:(最小输入 电压,最大输入 电压)': extract_vin,
        'output voltage': extract_vout,
        '输出电压': extract_vout,
        'output (v)': extract_vout,
        'max output current': extract_iout,
        '输出电流': extract_iout,
    },
    'LDO': {
        'minimum input voltage': extract_vin,
        'maximum input voltage': None,
        'paired:(minimum input voltage,maximum input voltage)': extract_vin,
        '最小输入 电压': extract_vin,
        '最大输入 电压': None,
        'paired:(最小输入 电压,最大输入 电压)': extract_vin,
        'output voltage': extract_vout,
        '输出电压': extract_vout,
        'max output current': extract_iout,
        '输出 电流': extract_iout,
        '输出电流': extract_iout,
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
        '输入通道': extract_channels,
        '通道数': extract_channels,
        '最高分辨率': extract_bits,
        '特征 高精度': extract_bits,
        'avdd': extract_vin,
        '供电电压': extract_vin,
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
        '最大码流': extract_speed,
        'kvrms': extract_isolation,
    },
    '隔离CAN': {
        '最大码流': extract_speed,
        'data rate': extract_speed,
        'kvrms': extract_isolation,
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
        'isolation rating (vrms)': extract_isolation,
        '最大输出电流': extract_iout,
        'kvrms': extract_isolation,
    },
    '电流传感器': {
        '工作电压': extract_vin,
        '供电电压': extract_vin,
        '介电强度': extract_isolation,
    },
    '温度传感器': {
        '供电电压': extract_vin,
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
                elif any(t in param_key for t in ['data rate', 'speed', 'throughput', 'rate']) or any(t in param_key for t in ['码流', '速率']):
                    result = extract_speed(param_val, param_key)
                else:
                    result = extract_fn(param_val)
                    # Novosense-style merged key: "特征 高精度24 位ADC": value itself may not carry the bit width.
                    # If extracting bits from value got nothing, retry on the param key text.
                    if extract_fn is extract_bits and not result:
                        result = extract_bits(param_key)
                tags.extend(result)
                break
    
    return tags

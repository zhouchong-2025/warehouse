#!/usr/bin/env python3
"""
numerify_params.py — P5 参数数值化

从 _params 和 _detail_features/_detail_intro 提取数值+量纲，附加到产品数据。
格式: {value: float, unit: str, raw: str}

支持的单位模式:
  电压: V, mV, μV, kV
  电流: A, mA, μA, nA, pA
  频率: Hz, kHz, MHz, GHz, Mbps, kbps, Gbps, Msps
  温度: ℃, °C
  电阻: Ω, mΩ, kΩ, MΩ
  时间: s, ms, μs, ns, ps
  功率: W, mW, μW
  电容: F, μF, nF, pF
  隔离: Vrms, Vpk
  其他: dB, %, ppm, V/μs, nV/rtHz

区间值: "3 to 5", "-40~125" → {min, max}
"""

import json, re, os

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                         "web", "public", "data", "products_structured.json")

# ─── 单位映射 ───
UNIT_MAP = {
    # 电压
    'V': 'V', 'v': 'V', 'mV': 'mV', 'mv': 'mV', 'μV': 'μV', 'uv': 'μV',
    'kV': 'kV', 'kv': 'kV',
    # 电流
    'A': 'A', 'a': 'A', 'mA': 'mA', 'ma': 'mA', 'μA': 'μA', 'ua': 'μA',
    'nA': 'nA', 'na': 'nA', 'pA': 'pA', 'pa': 'pA',
    # 频率/速率
    'Hz': 'Hz', 'hz': 'Hz', 'kHz': 'kHz', 'khz': 'kHz', 'MHz': 'MHz', 'mhz': 'MHz',
    'GHz': 'GHz', 'ghz': 'GHz', 'Mbps': 'Mbps', 'mbps': 'Mbps',
    'kbps': 'kbps', 'Kbps': 'kbps', 'Gbps': 'Gbps', 'gbps': 'Gbps',
    'Msps': 'Msps', 'msps': 'Msps',
    # 电阻
    'Ω': 'Ω', 'ohm': 'Ω', 'mΩ': 'mΩ', 'mohm': 'mΩ', 'kΩ': 'kΩ',
    # 时间
    's': 's', 'S': 's', 'ms': 'ms', 'mS': 'ms', 'μs': 'μs', 'us': 'μs',
    'ns': 'ns', 'ps': 'ps',
    # 功率
    'W': 'W', 'w': 'W', 'mW': 'mW', 'mw': 'mW',
    # 其他
    'dB': 'dB', 'db': 'dB', '%': '%', 'ppm': 'ppm',
    'V/μs': 'V/μs', 'V/us': 'V/μs', 'V/μS': 'V/μs',
    'nV/rtHz': 'nV/rtHz', 'μVrms': 'μVrms',
    'Vrms': 'Vrms', 'Vpk': 'Vpk',
    '℃': '℃', '°C': '℃', '°c': '℃',
    'pF': 'pF', 'nF': 'nF', 'μF': 'μF', 'uF': 'μF', 'F': 'F',
}

# 列名→单位推断 (无显式单位时)
COL_UNIT_HINTS = {
    'supply voltage': 'V', 'voltage': 'V', 'vin': 'V', 'vout': 'V', 'vdd': 'V',
    'vcc': 'V', 'vee': 'V', 'vos': 'mV', 'offset': 'mV',
    'current': 'A', 'iout': 'A', 'iq': 'μA', 'ib': 'nA', 'ishort': 'mA',
    'gbw': 'MHz', 'bandwidth': 'MHz', 'frequency': 'Hz', 'switching': 'kHz',
    'data rate': 'Mbps', 'throughput': 'Msps', 'speed': 'Mbps',
    'temperature': '℃', 'temp': '℃',
    'resistance': 'Ω', 'rdson': 'mΩ', 'ron': 'Ω',
    'delay': 'ns', 'settling': 'μs', 'timeout': 'ms', 'rise': 'ns', 'fall': 'ns',
    'power': 'mW', 'noise': 'nV/rtHz',
    'isolation': 'Vrms', 'insulation': 'Vrms', 'surge': 'Vpk',
    'psrr': 'dB', 'cmrr': 'dB', 'snr': 'dB',
    'esd': 'kV', 'accuracy': '%', 'gain error': '%',
    # 中文列名 → 单位
    '供电电压': 'V', '工作电压': 'V', '输入电压': 'V', '输出电压': 'V',
    '输出电流': 'A', '输入电流': 'A', '静态电流': 'μA',
    '带宽': 'MHz', '频率': 'Hz', '开关频率': 'kHz',
    '温度': '℃', '工作温度': '℃',
    '电阻': 'Ω', '导通电阻': 'Ω',
    '延迟': 'ns', '响应时间': 'μs', '超时': 'ms',
    '功率': 'mW', '噪声': 'nV/rtHz',
    '隔离': 'Vrms', '绝缘': 'Vrms', '浪涌': 'Vpk',
    '电源抑制': 'dB', '增益误差': '%',
    '速率': 'Mbps', '数据速率': 'Mbps', '采样率': 'Msps',
    'esd': 'kV', '静电': 'kV',
}

def parse_value(raw_str):
    """从字符串提取数值和单位, 返回 {value, unit, raw, is_range, min, max}"""
    s = raw_str.strip()
    # Strip common unit prefixes: "VBAT: 5.5~27V" → "5.5~27V"
    s = re.sub(r'^(VBAT|VCC|VDD|VIN|VIO|VREF|VOUT|BAT|SUPPLY)\s*[:：]\s*', '', s, flags=re.I)
    # Strip ± tolerance prefix: "±3000" → "3000"
    s = re.sub(r'^±\s*', '', s)
    if not s:
        return None
    
    result = {'raw': s}
    
    # 多值分隔符: "0.2/0.4", "4.2/7.8" → 取第一个有效值
    if re.match(r'^[\d.]+\s*/\s*[\d.]+(\s*/\s*[\d.]+)*$', s):
        first_val = s.split('/')[0].strip()
        try:
            result['value'] = float(first_val)
            result['unit'] = '?'  # 从列名推断
            return result
        except:
            pass
    
    # 尝试区间: "3 to 5", "3~5", "8-55", "-40 to 125"
    range_m = re.match(r'([+-]?\d+\.?\d*)\s*(to|~|～|-)\s*([+-]?\d+\.?\d*)', s, re.I)
    if range_m:
        # Dash separator: first number must NOT be negative (avoid -40-125 ambiguity)
        if range_m.group(2) == '-' and range_m.group(1).startswith('-'):
            range_m = None
    if range_m:
        result['is_range'] = True
        result['min'] = float(range_m.group(1))
        result['max'] = float(range_m.group(3))
        # 找单位(在区间后或整个字符串中)
        rest = s[range_m.end():].strip()
        for unit_str in sorted(UNIT_MAP.keys(), key=len, reverse=True):
            if rest.startswith(unit_str) or rest == unit_str:
                result['unit'] = UNIT_MAP[unit_str]
                break
        if 'unit' not in result:
            result['unit'] = '?'
        return result
    
    # Fixed离散值列表: "Fixed (0.8, 1.2, 1.5)" / "固定 (0.8, 1.2)"
    #   → 转为 range [min, max] (产品可订购这些固定电压, 搜索层范围匹配是合理近似)
    fixed_m = re.match(r'(?:Fixed|固定|可选|可选值)\s*\(\s*([\d.,\s]+)\s*\)', s, re.I)
    if fixed_m:
        nums = [float(x) for x in re.findall(r'\d+\.?\d*', fixed_m.group(1))]
        if nums:
            result['is_range'] = True
            result['min'] = min(nums)
            result['max'] = max(nums)
            result['unit'] = '?'
            return result
    
    # Fixed单值: "Fixed 3.3" / "固定 3.3" (no parens)
    fixed_single_m = re.match(r'(?:Fixed|固定)\s+([+-]?\d+\.?\d*)', s, re.I)
    if fixed_single_m:
        result['value'] = float(fixed_single_m.group(1))
        result['unit'] = '?'
        return result
    
    # Adjustable range: "Adjustable (0.5 to 5.2)"
    adj_m = re.match(r'(?:Adjustable|可调)\s*\(\s*([\d.]+)\s*(?:to|~|～|-)\s*([\d.]+)\s*\)', s, re.I)
    if adj_m:
        result['is_range'] = True
        result['min'] = float(adj_m.group(1))
        result['max'] = float(adj_m.group(2))
        result['unit'] = '?'
        return result
    
    # 单值: "3.3V", "5000Vrms", "240K" (后面跟单位), "100" (纯数字)
    m = re.match(r'([+-]?\d+\.?\d*)\s*([a-zA-ZμΩ°℃%/]+)?', s)
    if not m:
        return None
    
    try:
        result['value'] = float(m.group(1))
    except:
        return None
    
    unit_suffix = m.group(2) or ''
    if unit_suffix:
        for unit_str in sorted(UNIT_MAP.keys(), key=len, reverse=True):
            if unit_suffix.lower().startswith(unit_str.lower()):
                result['unit'] = UNIT_MAP[unit_str]
                break
        if 'unit' not in result:
            result['unit'] = unit_suffix
    else:
        result['unit'] = '?'  # 纯数字, 无单位
    
    return result

def infer_unit(col_name):
    """从列名推断期望单位"""
    cn = col_name.lower().strip()
    for hint, unit in COL_UNIT_HINTS.items():
        if hint in cn:
            return unit
    # 从列名中提取单位 (support both half-width (V) and full-width （V）)
    unit_from_name = re.search(r'[\(（]([^)）]+)[\)）]', cn)
    if unit_from_name:
        u = unit_from_name.group(1).strip()
        if u in UNIT_MAP:
            return UNIT_MAP[u]
    return None

def scan_detail_for_numerics(product):
    """从 _detail_features / _detail_intro 散文文本提取数值参数 (兜底 _params 缺失)"""
    text = ' | '.join(filter(None, [
        product.get('_detail_features', ''),
        product.get('_detail_intro', ''),
    ]))
    if not text:
        return {}
    numeric = {}
    # "工作电压范围至40V" / "工作电压范围至 40 V" → max voltage
    m = re.search(r'工作电压范围[至到]\s*([\d.]+)\s*V', text)
    if m:
        numeric['工作电压_max'] = {'value': float(m.group(1)), 'unit': 'V', 'raw': m.group(0)}
    # "供电电压：5.5~27V" / "电源电压: 4.5-28 V"
    m = re.search(r'(?:供电电压|工作电压|电源电压|输入电压)\s*[：:]\s*([\d.]+)\s*[~～\-to]+\s*([\d.]+)\s*V', text)
    if m:
        numeric['供电电压'] = {'is_range': True, 'min': float(m.group(1)), 'max': float(m.group(2)), 'unit': 'V', 'raw': m.group(0)}
    # "输出电流：2A" / "持续电流 3 A"
    m = re.search(r'(?:输出电流|持续电流|负载电流|最大电流)\s*[：:]\s*([\d.]+)\s*A', text)
    if m:
        numeric['输出电流'] = {'value': float(m.group(1)), 'unit': 'A', 'raw': m.group(0)}
    # "导通电阻范围：8mΩ ~ 140mΩ"
    m = re.search(r'导通电阻[范围]?\s*[：:]\s*([\d.]+)\s*mΩ\s*[~～\-to]+\s*([\d.]+)\s*mΩ', text)
    if m:
        numeric['导通电阻范围'] = {'is_range': True, 'min': float(m.group(1)), 'max': float(m.group(2)), 'unit': 'mΩ', 'raw': m.group(0)}
    return numeric

def numerify_product(product):
    """为单个产品生成 _params_numeric (含 detail 兜底扫描)"""
    params_str = product.get('_params', '')
    
    # 非参数列名(描述/特性等)
    NON_PARAM_COLS = {'产品描述', '产品类别', 'description', 'features', '特性',
                      '功能', 'function', 'application', '应用领域', 'note',
                      '简介', '端口', '接口', '产品型号', 'part number',
                      'wpn', 'status', '状态', 'rating', 'product family',
                      'subcategory', 'type', 'output type', 'input type',
                      'digital interface', 'interface', 'interface type',
                      'control mode', 'mode', 'topology', 'regulation',
                      'architecture', 'switch config', 'resistor configuration',
                      'output logic', 'power supervisor', 'manual reset input',
                      'watchdog', 'uvp control', 'shutdown', 'sleep function',
                      '0v battery charging function', 'temperature protection',
                      'low voltage charging prohibition function',
                      'pwm rejection', 'communication interface'}
    
    numeric = {}
    if params_str:
        for part in params_str.split(' | '):
            if ': ' not in part and ':' not in part:
                continue
            kv = part.split(':', 1)
            col_name = kv[0].strip()
            val_str = kv[1].strip()
            
            # 跳过非参数列
            if col_name.lower() in {c.lower() for c in NON_PARAM_COLS}:
                continue
            # 跳过纯文本值(不含数字)
            if not re.search(r'\d', val_str):
                continue
            
            parsed = parse_value(val_str)
            if not parsed:
                continue
            
            # 推断单位
            if parsed.get('unit') == '?':
                inferred = infer_unit(col_name)
                if inferred:
                    parsed['unit'] = inferred
                else:
                    continue  # 无法推断单位 → 跳过
            
            norm_key = re.sub(r'[^\w]', '_', col_name.lower())[:40]
            numeric[norm_key] = parsed
    
    # 从 detail 文本兜底扫描 (_params 中没有的才会补充)
    detail_nums = scan_detail_for_numerics(product)
    for k, v in detail_nums.items():
        if k not in numeric:
            numeric[k] = v
    
    return numeric

def main():
    with open(DATA_PATH) as f:
        data = json.load(f)
    
    total = 0
    numerified = 0
    
    for vendor_slug, vd in data.items():
        for p in vd.get('products', []):
            total += 1
            numeric = numerify_product(p)
            if numeric:
                p['_params_numeric'] = numeric
                numerified += 1
    
    with open(DATA_PATH, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"参数数值化完成: {numerified}/{total} 款产品")
    
    # 统计
    all_units = {}
    for vendor_slug, vd in data.items():
        for p in vd.get('products', []):
            for k, v in p.get('_params_numeric', {}).items():
                u = v.get('unit', '?')
                all_units[u] = all_units.get(u, 0) + 1
    
    print(f"涉及单位类型: {len(all_units)}")
    for u, c in sorted(all_units.items(), key=lambda x: -x[1])[:15]:
        print(f"  {u}: {c}")

if __name__ == '__main__':
    main()

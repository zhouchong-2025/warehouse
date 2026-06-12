#!/usr/bin/env python3
"""autofix_v2: Generate search tags from correctly-aligned params (post-extract_v4)."""
import json, re, argparse, os

# ── Parse utilities ─────────────────────────────────────────────────────────
def parse_range(val):
    """Extract (min, max) from value string like '4.5~100', '1.2 to 5.5', '-40 to +125'."""
    val = val.strip()
    # Fixed(a,b,c) → full range [a, c] (strip units)
    fm = re.match(r'Fixed\s*\(([^)]+)\)', val, re.I)
    if fm: 
        vals = [re.sub(r'[VvAa]', '', v.strip()).strip() for v in fm.group(1).split(',')]
        nums = [float(v) for v in vals]
        return (min(nums), max(nums))
    # Adjustable(a to b) → range (strip units)
    am = re.match(r'Adjustable?\s*\(([^)]+)\)', val, re.I)
    if am: 
        val = am.group(1)
        val = re.sub(r'[VvAa]', '', val).strip()
    # Normal ranges: 4.5~100, 1.2 to 5.5, -40 to +125
    parts = re.split(r'[~～to]+', val, flags=re.I)
    nums = []
    for p in parts:
        p = p.strip()
        p = re.sub(r'[VvAa]', '', p).strip()  # strip units
        try: nums.append(float(p))
        except ValueError: pass
    if len(nums) == 1: return (nums[0], nums[0])
    if len(nums) >= 2: return (nums[0], nums[-1])
    return None

def is_voltage_unit(unit):
    return unit and unit.upper().startswith('V')

def is_current_unit(unit):
    return unit and 'A' in unit.upper()

def is_speed_unit(unit):
    return unit and any(u in unit.lower() for u in ['hz', 'bps', 'mhz', 'khz', 'ghz'])

# ── Param matching ─────────────────────────────────────────────────────────
VOLTAGE_KEYS = ['vin','input voltage','supply voltage','vcc','operating voltage','bus voltage',
                'minimum input','maximum input','vcc-vee','vcc (min)','vcc (max)',
                'vee (min)','vee (max)','output voltage','vout']
VIN_KEYS = ['vin','input voltage','supply voltage','vcc','operating voltage','bus voltage',
            'minimum input','maximum input','vcc-vee','vcc (min)','vcc (max)',
            'vee (min)','vee (max)','minimum operating','maximum operating']
VOUT_KEYS = ['output voltage','vout','output (v)','output voltage (v)']
IOUT_KEYS = ['output current','iout','max output current','max current','drive current',
             'continuous current','load current','source current']
CHANNEL_KEYS = ['number of channels','channels','channel']
SPEED_KEYS = ['data rate','max data rate','switching frequency','gbw','bandwidth','bw',
              'speed','frequency']
ISOLATION_KEYS = ['isolation voltage','isolation','withstand','cmti','viorm','viowm','viso']
PSRR_KEYS = ['psrr']
NOISE_KEYS = ['noise', 'vn']

# ── Tag generation ──────────────────────────────────────────────────────────
VIN_POINTS = [3.3, 5, 12, 24, 28, 36, 40, 48, 60, 75, 100]
IOUT_POINTS_A = [0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5, 6, 10, 15, 20]
IOUT_POINTS_MA = [50, 100, 150, 200, 300, 500, 1000]
SPEED_POINTS = {'hz': [1, 10, 50, 100, 500, 1000, 10000, 100000, 1000000],
                'khz': [100, 300, 500, 1000, 2000, 3000, 5000, 10000],
                'mhz': [0.1, 0.5, 1, 5, 10, 20, 50, 100, 200, 500, 1000, 2000],
                'ghz': [0.1, 0.5, 1, 2, 5, 10],
                'bps': [1, 5, 10, 20, 50, 100],
                'kbps': [100, 250, 500, 1000, 2000],
                'mbps': [1, 5, 10, 20, 50, 100, 500, 1000, 2000, 5000],
                'gbps': [1, 5, 10, 25, 50, 100]}

def get_unit(param_name):
    """Extract unit from parenthesized part of param name."""
    m = re.search(r'\(([^)]+)\)', param_name)
    if m: return m.group(1)
    return ''

def generate_vin_tags(val):
    r = parse_range(val)
    if not r: return []
    vmin, vmax = r
    tags = []
    for p in VIN_POINTS:
        if vmin <= p <= vmax:
            tags.append(f'Vin_{int(p)}V' if p == int(p) else f'Vin_{p}V')
    # Add range display tag
    if vmin != vmax:
        vmin_s = str(int(vmin)) if vmin == int(vmin) else str(vmin)
        vmax_s = str(int(vmax)) if vmax == int(vmax) else str(vmax)
        tags.append(f'Vin_{vmin_s}~{vmax_s}V')
    else:
        v_s = str(int(vmin)) if vmin == int(vmin) else str(vmin)
        tags.append(f'Vin_{v_s}V')
    return tags

def generate_vout_tags(val):
    r = parse_range(val)
    if not r: return []
    tags = []
    vmin = r[0]
    vmax = r[-1] if len(r) > 1 else r[0]
    for p in VIN_POINTS:
        if vmin <= p <= vmax:
            tags.append(f'Vout_{int(p)}V' if p == int(p) else f'Vout_{p}V')
    return tags

def generate_iout_tags(val, unit):
    """Generate Iout tags. Detect if value is in A or mA."""
    r = parse_range(val)
    if not r: return []
    v = r[-1]  # use max
    
    # Detect unit from param or value magnitude
    is_ma = False
    if unit and 'ma' in unit.lower(): is_ma = True
    elif v > 100 and not (unit and 'a' in unit.lower()): is_ma = True  # heuristic: >100 likely mA
    
    if is_ma:
        points = IOUT_POINTS_MA
        suffix = 'mA'
    else:
        points = IOUT_POINTS_A
        suffix = 'A'
    
    tags = []
    for p in points:
        if p <= v:
            p_str = str(int(p)) if p == int(p) else str(p)
            tags.append(f'Iout_{p_str}{suffix}')
    # Also add the actual max
    v_str = str(int(v)) if v == int(v) else str(v)
    tags.append(f'Iout_{v_str}{suffix}')
    return tags

def generate_channel_tags(val):
    """Generate channel count tags from value like '1', '2', '4', '8:1'."""
    val = val.strip()
    # Handle mux formats like "8:1"
    m = re.match(r'(\d+):(\d+)', val)
    if m:
        return [f'{m.group(1)}Channels']
    # Handle plain numbers
    try:
        n = int(re.sub(r'[^\d]', '', val))
        if n > 0:
            return [f'{n}Channels']
    except ValueError:
        pass
    return []

def generate_speed_tags(val, unit):
    """Generate speed tags with unit detection."""
    r = parse_range(val)
    if not r: return []
    v = r[-1]
    
    unit_lower = (unit or '').lower()
    # Detect unit
    if 'mbps' in unit_lower: points, prefix = SPEED_POINTS['mbps'], 'Mbps'
    elif 'gbps' in unit_lower: points, prefix = SPEED_POINTS['gbps'], 'Gbps'
    elif 'kbps' in unit_lower: points, prefix = SPEED_POINTS['kbps'], 'kbps'
    elif 'bps' in unit_lower: points, prefix = SPEED_POINTS['bps'], 'bps'
    elif 'ghz' in unit_lower: points, prefix = SPEED_POINTS['ghz'], 'GHz'
    elif 'mhz' in unit_lower: points, prefix = SPEED_POINTS['mhz'], 'MHz'
    elif 'khz' in unit_lower: points, prefix = SPEED_POINTS['khz'], 'kHz'
    elif 'hz' in unit_lower: points, prefix = SPEED_POINTS['hz'], 'Hz'
    else: return []
    
    tags = []
    for p in points:
        if p <= v:
            p_str = str(int(p)) if p == int(p) else str(p)
            tags.append(f'{p_str}{prefix}')
    # Add actual max
    v_str = str(int(v)) if v == int(v) else str(v)
    tags.append(f'{v_str}{prefix}')
    return tags

def generate_isolation_tags(val):
    """Generate isolation voltage tags from values like '5kV', '3kVrms', '3000'."""
    val = val.strip()
    # Extract numeric value
    nums = re.findall(r'[\d.]+', val)
    if not nums: return []
    v = float(nums[-1])
    # Detect k multiplier
    if 'k' in val.lower() or v < 100:  # likely in kV
        # Already in kV, e.g., "5" → 5kV
        pass
    else:
        v = v / 1000  # Convert V to kV
    
    tags = []
    for p in [1, 1.5, 2.5, 3, 3.75, 5, 6]:
        if p <= v:
            tags.append(f'{p}kVrms' if p != int(p) else f'{int(p)}kVrms')
    return tags

# ── Main autofix ────────────────────────────────────────────────────────────

def autofix(product):
    """Generate _features tags from correctly-aligned params."""
    params = product.get('_params', '')
    if not params: return product
    
    param_lines = params.split(' | ')
    features = set()
    speed_value = None  # for display
    
    for pline in param_lines:
        if ':' not in pline: continue
        key = pline.split(':', 1)[0].strip()
        value = pline.split(':', 1)[1].strip() if ':' in pline else ''
        key_lower = key.lower()
        unit = get_unit(key)
        
        # ── Vin ──
        if any(k in key_lower for k in VIN_KEYS):
            tags = generate_vin_tags(value)
            features.update(tags)
        
        # ── Vout ──
        if any(k in key_lower for k in VOUT_KEYS):
            tags = generate_vout_tags(value)
            features.update(tags)
        
        # ── Iout ──
        if any(k in key_lower for k in IOUT_KEYS):
            tags = generate_iout_tags(value, unit)
            features.update(tags)
        
        # ── Channels ── (skip 'per channel' false positives)
        if any(k in key_lower for k in CHANNEL_KEYS) and 'per channel' not in key_lower and 'per ch' not in key_lower:
            tags = generate_channel_tags(value)
            features.update(tags)
        
        # ── Speed / Data Rate ──
        if any(k in key_lower for k in SPEED_KEYS):
            tags = generate_speed_tags(value, unit)
            features.update(tags)
            if tags: speed_value = tags[-1]
        
        # ── Isolation ──
        if any(k in key_lower for k in ISOLATION_KEYS):
            tags = generate_isolation_tags(value)
            features.update(tags)
        
        # ── PSRR ──
        if any(k in key_lower for k in PSRR_KEYS):
            try:
                v = float(re.findall(r'[\d.]+', value)[0])
                if v >= 70: features.add('PSRR_high')
                if v >= 60: features.add('PSRR_mid')
            except: pass
        
        # ── Noise ── (match 'vn' only as standalone word or prefix)
        if any(k in key_lower for k in NOISE_KEYS) and 'peak' not in key_lower:
            try:
                v = float(re.findall(r'[\d.]+', value)[0])
                if v < 50: features.add('低噪声')
                elif v < 200: features.add('中噪声')
            except: pass
    
    # ── Special tags from params ──
    params_text = ' '.join(param_lines).lower()
    
    # Rail-to-Rail
    if 'rail-rail out' in params_text and 'yes' in params_text:
        features.add('轨到轨_输出')
    if 'rail-rail in' in params_text and any(w in params_text for w in ['yes', 'v+', 'v-', 'to v+', 'to v-']):
        features.add('轨到轨_输入')
    
    # Low power (Iq)
    if 'iq' in params_text:
        iq_vals = re.findall(r'iq[^:]*:\s*([\d.]+)', params_text)
        if iq_vals:
            try:
                iq = min(float(v) for v in iq_vals)
                if iq <= 50: features.add('低功耗')
            except: pass
    
    # Precision (Vos)
    if 'vos' in params_text:
        vos_vals = re.findall(r'vos[^:]*:\s*([\d.]+)', params_text)
        if vos_vals:
            try:
                vos = max(float(v) for v in vos_vals)
                if vos <= 1: features.add('精密')
            except: pass
    
    # High voltage detection
    vin_vals = re.findall(r'vin[^:]*?\b(\d+)\s*[~v]', params_text)
    supply_vals = re.findall(r'supply voltage[^:]*:\s*[\d.]+\s*[~～]\s*(\d+)', params_text, re.I)
    max_vins = [int(v) for v in vin_vals + supply_vals]
    if max_vins and max(max_vins) >= 30:
        features.add('高压')
    
    # Update features
    existing = set(product['_features'].split())
    existing.update(features)
    product['_features'] = ' '.join(sorted(existing))
    return product

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--vendor', required=True)
    p.add_argument('--dry-run', action='store_true')
    a = p.parse_args()
    
    dp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                      'web/public/data/products_structured.json')
    with open(dp) as f: data = json.load(f)
    
    vendor = data.get(a.vendor, {})
    products = vendor.get('products', [])
    if not products:
        print(f"No products found for vendor '{a.vendor}'")
        return
    
    for i in range(len(products)):
        products[i] = autofix(products[i])
    
    # Stats
    from collections import Counter
    tag_counts = Counter()
    for p in products:
        for t in p['_features'].split():
            if ':' not in t and t not in ('工业级', '车规AEC-Q100', '隔离'):
                tag_counts[t] += 1
    
    print(f"Processed {len(products)} products")
    print(f"\nTop 30 tags:")
    for tag, count in tag_counts.most_common(30):
        print(f"  {tag:20s}: {count:3d}")
    
    if a.dry_run: return
    
    vendor['productCount'] = len(products)
    vendor['products'] = products
    with open(dp, 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n✓ Saved to {dp}")

if __name__ == '__main__':
    main()

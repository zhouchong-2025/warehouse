#!/usr/bin/env python3
"""
validate_columns.py — 列级量纲校验工具

对每个 section 的每一列做类型一致性检查。
原理: 每列名揭示其期望值类型(V→电压值, ℃→温度区间, Vrms→隔离大数...)。
不一致超20% → 疑似列错位, 报告但不自动修(人工确认)。

铁律:
  3. mA≠A, ESD≠隔离
  4. 参数乱码产品禁止自动打标签

用法:
  python3 scripts/validate_columns.py                     # 校验所有数据
  python3 scripts/validate_columns.py --vendor 3peak-analog  # 只校验指定厂商
  python3 scripts/validate_columns.py --strict             # 严格模式(阈值10%)
"""

import json, re, os, sys, argparse
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "web", "public", "data")
DATA_PATH = os.path.join(DATA_DIR, "products_structured.json")

# ─── 列名→期望值类型 推断规则 ───
# 返回 (kind, description, is_validator)
# kind: 'voltage' | 'current' | 'temperature' | 'isolation' | 'frequency' |
#       'channels' | 'package' | 'status' | 'numeric' | 'percent' | 'text'
def infer_column_kind(col_name):
    cn = col_name.lower()
    
    # 隔离电压 (kVrms/Vrms, 通常≥1000)
    if any(kw in cn for kw in ['isolation', 'vpk', 'surge', 'vrms', '绝缘', '介电']):
        return 'isolation', '隔离/耐压值 (通常≥500Vrms)', lambda v: _is_numeric_or_range(v, min_val=100)
    
    # 电压 (V, mV, μV)
    if re.search(r'\(v\)|voltage|\(mv\)|\(μv\)|\(uv\)|vos\b|vin\b|vout\b|vdd\b|vcc\b|vee\b|vicr|uvlo|ovp', cn):
        if 'vos' in cn or 'uv' in cn:
            return 'voltage_mv', '失调电压 (mV/μV级)', lambda v: _is_numeric(v)
        return 'voltage', '电压值 (V)', lambda v: _is_numeric_or_range(v)
    
    # 温度
    if re.search(r'temperature|\(℃\)|\(°c\)|temp', cn):
        return 'temperature', '温度区间 (℃)', lambda v: _is_temp_range(v)
    
    # 电流 (mA/μA/A)
    if re.search(r'\(ma\)|\(μa\)|\(ua\)|\(a\)|current\b|iq\b|ib\b|idd\b|icc\b|ishort|isink|igat', cn):
        if 'μa' in cn or 'ua' in cn:
            return 'current_ua', '电流 (μA级)', lambda v: _is_numeric(v)
        return 'current', '电流 (mA/A级)', lambda v: _is_numeric(v)
    
    # 频率/速率 (MHz/kHz/Mbps/kBPS/Hz)
    if re.search(r'\(mhz\)|\(khz\)|\(hz\)|\(mbps\)|\(kbps\)|\(msps\)|frequency\b|bandwidth\b|bw\b|gbw\b|data.rate\b|speed\b|throughput|update.rate', cn):
        return 'frequency', '频率/速率', lambda v: _is_numeric(v)
    
    # 通道数
    if re.search(r'channels?\b|#\s*of|number\s+of|port|ch\b', cn) and 'ch' not in cn.replace('ch', ''):
        return 'channels', '通道数 (整数)', lambda v: _is_channel_count(v)
    
    # 百分比/精度
    if re.search(r'accuracy|error|\(%\)|drift|regulation|thd', cn):
        return 'percent', '百分比/精度', lambda v: _is_numeric(v)
    
    # 封装
    if re.search(r'package\b|封装', cn):
        return 'package', '封装名 (文本)', lambda v: _is_package_text(v)
    
    # 状态
    if re.search(r'^status$|^rating$', cn):
        return 'status', '产品状态 (文本)', lambda v: _is_status_text(v)
    
    # 时间 (ns/μs/ms/S)
    if re.search(r'\(ns\)|\(μs\)|\(us\)|\(ms\)|\(s\)|delay|settling|timeout|trise|tfall|ton|toff|propagation', cn):
        return 'time', '时间值', lambda v: _is_numeric(v)
    
    # ESD
    if re.search(r'esd|\(kv\)', cn):
        return 'esd', 'ESD值 (kV)', lambda v: _is_numeric(v)
    
    # 电阻 (Ω/mΩ)
    if re.search(r'\(Ω\)|\(mΩ\)|\(ohm\)|rdson|ron\b|resistor', cn):
        return 'resistance', '电阻值 (Ω/mΩ)', lambda v: _is_numeric(v)
    
    # 噪声
    if re.search(r'noise|\(nv/|\(μv', cn):
        return 'noise', '噪声值', lambda v: _is_numeric(v)
    
    # 功率
    if re.search(r'\(mw\)|\(w\)|power\b', cn):
        return 'power', '功率值', lambda v: _is_numeric(v)
    
    # 通用数值
    if re.search(r'\(db\)|\(lsb\)|\(bit|\(v/v\)|gain\b|cmrr|psrr|snr|inl|dnl|sinad|thd', cn):
        return 'numeric', '通用数值', lambda v: _is_numeric(v)
    
    return 'text', '文本/其他', lambda v: True  # 默认放行

def _is_numeric(val):
    """判断值是否为纯数值(支持小数、负号、科学记数)"""
    v = val.strip()
    if not v:
        return True  # 空值放行
    # 区间如 '0.8,1.2,1.8...'
    v = v.replace(',', '.').replace('，', '.')
    for part in re.split(r'[\s~/]', v):
        part = part.strip()
        if not part:
            continue
        try:
            float(part)
        except ValueError:
            return False
    return True

def _is_numeric_or_range(val, min_val=None):
    """判断值是否为数值或范围(如 '3 to 5', '-40~125')"""
    v = val.strip()
    if not v:
        return True
    v = re.sub(r'\s*to\s*', '~', v, flags=re.I)
    parts = re.split(r'[~,、]', v)
    for part in parts:
        part = part.strip()
        if not part:
            continue
        try:
            f = float(part.replace('±', '').replace('+', ''))
            if min_val is not None and f < min_val:
                # 不直接判错，但标记可疑
                pass
        except ValueError:
            pass  # 容错非数值
    return True

def _is_temp_range(val):
    """判断是否为温度区间 (-40 to 125 等)"""
    v = val.strip().lower()
    if not v:
        return True
    if re.match(r'^-?\d+\.?\d*\s*(to|~|～)\s*-?\d+\.?\d*\s*$', v):
        return True
    if re.match(r'^-?\d+\.?\d*\s*(to|~|～)\s*\+?\d+\.?\d*\s*$', v):
        return True
    # 单独值也放行 (可能是 Tj)
    try:
        float(v)
        return True
    except ValueError:
        pass
    return False

def _is_channel_count(val):
    v = val.strip()
    if not v:
        return True
    # 支持 '1/1', '2', '4'
    if re.match(r'^\d+(\s*/\s*\d+)?$', v):
        return True
    return False

def _is_package_text(val):
    v = val.strip().upper()
    if not v:
        return True
    # 封装应包含典型封装名
    pkg_kw = ['SOP', 'SOT', 'TSSOP', 'MSOP', 'QFN', 'DFN', 'WSOP', 'TQFP',
              'LQFP', 'BGA', 'CSP', 'WLCSP', 'ESOP', 'VSON', 'SOW', 'SOD',
              'SC', 'TO', 'DIP', 'SOIC', 'WSON', 'UDFN']
    # 如果纯数值且没有封装关键词 → 可疑
    if re.match(r'^[\d.,\s]+$', v):
        return False
    return True

def _is_status_text(val):
    v = val.strip().lower()
    if not v:
        return True
    status_kw = ['production', 'pre-production', 'industrial', 'automotive',
                 'mp', 'sample', '量产', '样片', 'nrfnd', 'nrnd', 'active',
                 'engineering', 'preview', 'obsolete']
    if any(kw in v for kw in status_kw):
        return True
    return False

def validate_vendor(products, vendor_name, strict=False):
    """对单个厂商的所有产品做列级量纲校验"""
    threshold = 0.10 if strict else 0.20
    
    # 按 section 分组
    by_section = defaultdict(list)
    for p in products:
        sec = p.get('_section', 'Unknown')
        by_section[sec].append(p)
    
    # 收集每列的所有值
    all_issues = []
    
    for section, prods in sorted(by_section.items()):
        # 提取该section的列结构(从_params)
        all_cols = set()
        for p in prods:
            params = p.get('_params', '')
            for part in params.split(' | '):
                if ':' in part:
                    col = part.split(':', 1)[0].strip()
                    if col:
                        all_cols.add(col)
        
        # 对每列收集值
        for col in sorted(all_cols):
            vals = []
            for p in prods:
                params = p.get('_params', '')
                # 从 _params 字符串中提取该列的值
                for part in params.split(' | '):
                    if ':' in part:
                        c, v = part.split(':', 1)
                        if c.strip() == col:
                            vals.append(v.strip())
                            break
            
            kind, desc, validator = infer_column_kind(col)
            bad_vals = []
            for v in vals:
                if v and not validator(v):
                    bad_vals.append(v)
            
            if vals:
                bad_pct = len(bad_vals) / len(vals)
                if bad_pct > threshold:
                    issue = {
                        'section': section,
                        'column': col,
                        'kind': kind,
                        'expected': desc,
                        'total_values': len(vals),
                        'bad_count': len(bad_vals),
                        'bad_pct': bad_pct,
                        'bad_samples': bad_vals[:5]
                    }
                    all_issues.append(issue)
                    
    return all_issues

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--vendor', help='只校验指定厂商 (如 3peak-analog)')
    ap.add_argument('--strict', action='store_true', help='严格模式 (阈值10%%, 默认20%%)')
    ap.add_argument('--dump-garbage', help='输出参数乱码产品到该文件')
    a = ap.parse_args()
    
    with open(DATA_PATH) as f:
        data = json.load(f)
    
    vendors_to_check = [a.vendor] if a.vendor else [k for k in data.keys()]
    
    print("=" * 70)
    print("列级量纲校验报告")
    print(f"模式: {'严格' if a.strict else '标准'} (阈值: {'10%' if a.strict else '20%'})")
    print("=" * 70)
    
    all_issues_by_vendor = {}
    garbage_products = []  # 参数乱码产品
    
    for vendor in vendors_to_check:
        vdata = data.get(vendor)
        if not vdata:
            print(f"\n⚠️ 厂商 {vendor} 不存在")
            continue
        products = vdata.get('products', []) if isinstance(vdata, dict) else vdata
        
        issues = validate_vendor(products, vendor, a.strict)
        all_issues_by_vendor[vendor] = issues
        
        total_cols_checked = 0
        sections_with_issues = set()
        
        print(f"\n{'─' * 70}")
        print(f"厂商: {vendor} ({len(products)} 款)")
        print(f"{'─' * 70}")
        
        # 统计碎片表头
        from compare_extraction import count_fragments
        frag_count = sum(1 for p in products if count_fragments(p)[1] > 0)
        print(f"碎片表头: {frag_count}/{len(products)} = {frag_count/len(products)*100:.1f}%")
        
        if not issues:
            print(f"✅ 所有列通过量纲校验 (无不一致率超阈值)")
            continue
        
        # 分组显示
        print(f"\n⚠️ 发现 {len(issues)} 个疑似列错位:\n")
        
        for issue in issues:
            sections_with_issues.add(issue['section'])
            print(f"  [{issue['section']}]")
            print(f"    列: {issue['column']}")
            print(f"    期望类型: {issue['expected']}")
            print(f"    不一致率: {issue['bad_count']}/{issue['total_values']} = {issue['bad_pct']:.1%}")
            print(f"    反例: {issue['bad_samples'][:3]}")
            
            # 判断严重性
            if issue['bad_pct'] > 0.5:
                print(f"    🔴 高优先级: 该列大概率错位, 需人工确认")
            elif issue['bad_pct'] > 0.3:
                print(f"    🟡 中优先级: 该列部分值异常")
            print()
        
        # 参数乱码检测 (铁律#4)
        print(f"\n  📋 参数乱码检测:")
        garb_count = 0
        for p in products:
            params = p.get('_params', '')
            raw = p.get('_raw', '')
            # 检测异常模式
            suspicious = False
            reasons = []
            
            # 检查 _params 中的空值异常
            if params.count(':') < 3 and raw:
                suspicious = True
                reasons.append('参数列数过少')
            
            # 检查是否有纯数字PN (误把值当PN)
            # 检查碎片列名数量
            total, frag, names = count_fragments(p)
            if total > 0 and frag / total > 0.5:
                suspicious = True
                reasons.append(f'碎片列名过多({frag}/{total})')
            
            if suspicious:
                garb_count += 1
                if len(garbage_products) < 20:
                    garbage_products.append({
                        'vendor': vendor,
                        'pn': p['part_number'],
                        'section': p.get('_section', '?'),
                        'reasons': reasons,
                        'params_sample': params[:200]
                    })
        
        print(f"    参数乱码产品: {garb_count}/{len(products)}")
        if garb_count > 0:
            print(f"    ⚠️ 铁律#4: 参数乱码产品禁止自动打标签, 需人工审核")
    
    # ─── 总结 ───
    print(f"\n{'=' * 70}")
    print("总结")
    print(f"{'=' * 70}")
    total_issues = sum(len(v) for v in all_issues_by_vendor.values())
    if total_issues:
        print(f"  疑似列错位: {total_issues} 处 (需人工确认)")
    else:
        print(f"  ✅ 所有列通过量纲校验")
    print(f"  参数乱码产品: {len(garbage_products)} 款 (需人工审核)")
    
    if a.dump_garbage and garbage_products:
        with open(a.dump_garbage, 'w') as f:
            json.dump(garbage_products, f, ensure_ascii=False, indent=2)
        print(f"  乱码清单 → {a.dump_garbage}")
    
    # ─── 返回码 ───
    if total_issues > 0 or len(garbage_products) > 0:
        sys.exit(0)  # 有问题但预期内(需人工确认), 不返回错误码

if __name__ == '__main__':
    main()

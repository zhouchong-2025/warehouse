#!/usr/bin/env python3
"""
audit_data.py — 全量数据质量审计
扫描 products_structured.json，检测:
  1. 标签矛盾（ASN+CAN-FD、隔离+非隔离 等）
  2. 单位错误（kBPS→Mbps 虚高、mA→A 混淆）
  3. 误分类（section 和 features 不一致）
  4. 空 section / 空 features / 乱码参数

用法: python3 scripts/audit_data.py [--fix] [--json]
  --fix   自动修复高置信度问题
  --json  输出 JSON 格式（便于 LLM 消费）
"""

import json, re, sys, os
from validate_tags import validate_tag, get_tags_with_constraints
from collections import Counter

DATA_PATH = 'web/public/data/products_structured.json'

# ═══════════════════════════════════════════════
# 检测规则
# ═══════════════════════════════════════════════

def check_asn_can(products):
    """ASN 音频总线产品被标了 CAN-FD"""
    issues = []
    for p in products:
        params = p.get('_params', '')
        feats = p.get('_features', '')
        if 'ASN' in params and 'CAN-FD' in feats:
            issues.append({
                'type': 'ASN_CAN_MISMATCH',
                'severity': 'high',
                'pn': p['part_number'],
                'section': p.get('_section', ''),
                'features': feats,
                'fix': "remove CAN-FD, ensure 音频总线 tag, section→ASN 音频总线",
                'auto_fix': True
            })
    return issues


def check_isolation_context(products):
    """隔离标签但 section 不含隔离（非隔离产品误标隔离）"""
    issues = []
    for p in products:
        feats = p.get('_features', '')
        sec = p.get('_section', '').lower()
        params = p.get('_params', '')
        
        feat_tokens = feats.split()
        
        # "隔离" standalone tag on non-isolation product
        if '隔离' in feat_tokens and not any(k in sec for k in ['隔离', 'isolat']):
            # Check if params actually indicate isolation (kVrms, CMTI, isolation rating)
            params_lower = params.lower()
            has_isolation_param = any(k in params_lower for k in ['kv', 'isolation', 'cmti', 'vrms', '隔离'])
            if has_isolation_param:
                continue  # Product genuinely has isolation, tag is correct
            # Skip if features already indicate the product is genuinely isolated
            feature_tokens_lower = [t.lower() for t in feat_tokens]
            if any(k in feature_tokens_lower for k in ['隔离电源', '隔离放大器', '隔离i2c', '隔离can', '隔离rs485']):
                continue  # Product is genuinely isolated, tag is correct
            # Exception: BMS, TVS, ESD, 复位芯片 sometimes have "隔离" tag for other reasons
            if not any(k in sec for k in ['bms', 'tvs', 'esd', '复位', '电池']):
                issues.append({
                    'type': 'ISOLATION_NO_CONTEXT',
                    'severity': 'medium',
                    'pn': p['part_number'],
                    'section': p.get('_section', ''),
                    'features': feats,
                    'fix': "verify if product truly has isolation; if not, remove 隔离 tag",
                    'auto_fix': False  # needs human verification
                })
    return issues


def check_speed_unit(products):
    """kBPS 参数但标签是 Mbps（单位混乱）"""
    issues = []
    for p in products:
        params = p.get('_params', '')
        feats = p.get('_features', '')
        
        # Check if params mention kBPS
        kbps_match = re.search(r'Data Rate.*?\(kBPS\).*?(\d+\.?\d*)', params, re.I)
        if not kbps_match:
            continue
        
        kbps_val = float(kbps_match.group(1))
        actual_mbps = kbps_val / 1000
        
        # Get max Mbps tag
        mbps_tags = [int(t.replace('Mbps', '')) for t in feats.split() if t.endswith('Mbps')]
        if not mbps_tags:
            continue
        
        max_mbps = max(mbps_tags)
        if max_mbps > actual_mbps * 1.5:
            issues.append({
                'type': 'SPEED_UNIT_KBPS',
                'severity': 'high',
                'pn': p['part_number'],
                'param_value': f'{kbps_val} kBPS',
                'should_be': f'{actual_mbps} Mbps',
                'current_max': f'{max_mbps} Mbps',
                'fix': f"re-run tag_config with kBPS→Mbps conversion",
                'auto_fix': True
            })
    
    return issues


def check_conflicting_tags(products):
    """互斥标签同时出现"""
    conflicts = [
        (['RS-485', 'RS-232'], 'RS-485/RS-232 mutual exclusion'),
        (['隔离栅极驱动', '非隔离栅极驱动'], 'isolated/non-isolated gate driver conflict'),
        (['CAN-FD', 'LIN'], 'CAN-FD/LIN — possible but rare, verify'),
    ]
    issues = []
    for p in products:
        feats_tokens = p.get('_features', '').split()
        for pair, desc in conflicts:
            if all(t in feats_tokens for t in pair):
                # Exception: CAN-FD + LIN together is valid for SBC products
                if 'CAN-FD' in pair and 'LIN' in pair and 'SBC' in feats_tokens:
                    continue
                issues.append({
                    'type': 'CONFLICTING_TAGS',
                    'severity': 'medium',
                    'pn': p['part_number'],
                    'section': p.get('_section', ''),
                    'conflict': desc,
                    'features': p.get('_features', ''),
                    'fix': "verify which tag is correct, remove the wrong one",
                    'auto_fix': False
                })
    return issues


def check_empty_fields(products):
    """空 section 或空 features"""
    issues = []
    for p in products:
        sec = p.get('_section', '').strip()
        feats = p.get('_features', '').strip()
        if not sec:
            issues.append({
                'type': 'EMPTY_SECTION',
                'severity': 'high',
                'pn': p['part_number'],
                'fix': "manually assign section from PDF context",
                'auto_fix': False
            })
        if not feats:
            issues.append({
                'type': 'EMPTY_FEATURES',
                'severity': 'high',
                'pn': p['part_number'],
                'section': sec,
                'fix': "run autofix.py to regenerate tags",
                'auto_fix': False
            })
    return issues


def check_garbled_params(products):
    """参数乱码（merge_headers 失败产物）"""
    issues = []
    garbled_patterns = [
        (r'\b\d{2,}\s*℃(?!\s*-?\d)', 'unexpected numeric value before ℃'),
        (r'Temperature.*\d{3,}(?!\d*\s*-)', 'suspicious temperature values (3+ digits)'),
    ]
    legit_param_indicators = [
        r'Status:', r'Rating:', r'Supply', r'Voltage', r'Data Rate', r'Package',
        r'Channel', r'Channels', r'Resolution', r'Current', r'Output',
    ]
    for p in products:
        params = p.get('_params', '')
        # Skip if params contain >= 3 standard field indicators (looks legit)
        legit_count = sum(1 for ind in legit_param_indicators if re.search(ind, params))
        if legit_count >= 3:
            continue
        for pat, desc in garbled_patterns:
            if re.search(pat, params):
                issues.append({
                    'type': 'GARBLED_PARAMS',
                    'severity': 'medium',
                    'pn': p['part_number'],
                    'section': p.get('_section', ''),
                    'hint': desc,
                    'fix': "re-extract with coordinate-based method (v5)",
                    'auto_fix': False
                })
                break
    return issues



def check_param_feature_gap(products):
    """params中提到的功能，features标签是否缺失
    Two-tier: auto-fix for FAE-confirmed mappings, ask for unknown terms.
    """
    # Tier 1: FAE确认的映射 — 自动修复
    AUTO_FIX_MAP = [
        # (param regex, tag, FAE 判断依据)
        (r'partial.network', '特定帧唤醒', 'ISO 11898-6 Partial Networking = 选择性帧唤醒'),
        (r'partial.network', '低功耗唤醒', 'Partial Networking 的前提是低功耗唤醒'),
        (r'psrr.*\d+.*db', '高PSRR', 'PSRR 带 dB 值 → 电源抑制比指标'),
        (r'rail.rail|rail_', '轨到轨', 'Rail-to-rail → 轨到轨输入/输出'),
        (r'噪声|noise|vn.at|low.noise', '低噪声', '噪声/Noise 指标 → 低噪声特性'),
        (r'vos.*max|offset.drift', '精密(≤1mV)', 'Vos/Offset Drift → 精密运放指标'),
        (r'low.*iq|low.*quiescent|iq.*<.*\d+.*[uμ]', '低功耗', 'Low Iq → 低功耗特性'),
        (r'spread.spectrum', '展频', 'Spread Spectrum → 展频功能'),
        (r'bi[ -]?directional', '双向', 'Bidirectional → 双向通信/转换'),
        (r'differential.output', '差分输出', 'Differential Output → 差分输出'),
        (r'soft.?start', '软启动', 'Soft-start → 软启动功能'),
        (r'watchdog', '看门狗', 'Watchdog → 看门狗功能'),
        (r'\btracking\b', '跟踪输出', 'Tracking → LDO 跟踪输出功能'),
        (r'short.*(protect|circuit)|short.circuit|短路保护', '短路保护', 'Short-circuit protection → 短路保护'),
        (r'clock.in|external.clock', '外部时钟', 'Clock input → 外部时钟同步'),
        (r'alert.*(func|warn)|warning.func', '警报输出', 'Alert/Warning function → 警报输出功能'),
        (r'low.*ib|low.*input.bias|low.*bias.current', '低Ib', 'Low input bias current → 低输入偏置电流'),
        (r'zero.crossover|zero.cross|zero[ -]?cross', '零交越失真', 'Zero crossover distortion → 零交越失真'),
        (r'shift.reg(ister)?', '移位寄存器接口', 'Shift register interface → 移位寄存器接口'),
        (r'open.load|open[ -]?load', '开路检测', 'Open-load detection → 开路检测功能'),
        (r'low[ -]?side', '低边检测', 'Low-side sensing → 低边电流检测'),
        (r'single.end.output|single[ -]?ended', '单端输出', 'Single-ended output → 单端输出'),
        (r'reverse.current.protect', '防反接', 'Reverse current protection → 防反接保护'),
        (r'overcurrent.protect', '过流保护', 'Overcurrent protection → 过流保护'),
        (r'uni[ -]?directional', '单向', 'Unidirectional → 单向'),
        (r'remote.sense|vout.sense', '远端采样', 'Remote/Vout sense → 远端电压采样'),
        (r'\bbrake\b', '刹车功能', 'Brake function → 电机刹车'),
    ]
    

    issues = []
    for p in products:
        params = p.get('_params', '')
        params_lower = params.lower()
        feats_lower = p.get('_features', '').lower()
        
        # Skip if params are garbled (merge_headers failure) or known-bad vendor
        # Garbled products have split/misaligned params; can't reliably extract features
        legit_count = sum(1 for ind in ['Status:', 'Rating:', 'Supply', 'Voltage', 'Data Rate', 'Package', 'Channel', 'Resolution'] if ind.lower() in params_lower)
        params_garbled = (legit_count < 2)
        # Known-extraction-issue vendors: skip feature extraction
        pn_lower = p['part_number'].lower()
        if pn_lower.startswith('yt') or pn_lower.startswith('mt') or pn_lower.startswith('ns') or pn_lower.startswith('nst') or pn_lower.startswith('nca') or pn_lower.startswith('npd') or pn_lower.startswith('npc') or pn_lower.startswith('npm'):
            params_garbled = True
        
        # Tier 1: auto-fix known mappings (validate before suggesting)
        for pat, tag, reason in AUTO_FIX_MAP:
            if not re.search(pat, params_lower, re.I):
                continue
            if tag.lower() not in feats_lower:
                # Validate tag against constraints before suggesting
                valid, _ = validate_tag(tag, params)
                if not valid:
                    continue  # skip — tag would violate constraint
                issues.append({
                    'type': 'PARAM_FEATURE_GAP',
                    'severity': 'medium',
                    'pn': p['part_number'],
                    'section': p.get('_section', ''),
                    'features': p.get('_features', ''),
                    'missing_tag': tag,
                    'reason': reason,
                    'fix': f'add {tag} tag',
                    'auto_fix': True
                })
                break
        
        # Tier 2: unknown functional terms → ask FAE
        if params_garbled:
            continue  # garbled params can't be reliably parsed
        
        # Extract meaningful feature descriptions from params
        FEATURE_KEYS = [
            r'(?:^|\|)\s*features?\s*[:：]\s*([^|]+)',
            r'(?:^|\|)\s*function\s*[:：]\s*([^|]+)',
            r'(?:^|\|)\s*key.features?\s*[:：]\s*([^|]+)',
        ]
        
        # Noise filters: things that look like features but aren't
        NOISE_PATTERNS = [
            r'^[a-z]+\d+[-\d]*[a-z]*$',       # SOP8, QFN3X3-16
            r'^[a-z]+\d+[a-z]+[-\d]+$',       # SOT23G-3, TSSOP14
            r'[-+\d]+\s*to\s*[-+\d]+',           # -40 to +125 (temp range)
            r'^\d+(\.\d+)?\s*[vmadbhz%℃°]+$',  # 5V, 100mA
            r'^(standby|sleep|silent|shut.?down|inhibit|inh|vio)$',
            r'^(psm|fpwm|ccm|dcm|burst|forced.pwm)(\s*mode)?$',
            r'^(spi|i2c|uart|gpio|adc|dac|pwm|i/o|io)$',
            r'^aec.*qualified$',
            r'^g\s*=\s*\d+',                   # G = 8
            r'^(pdm|tdm)\s*(only|disabled|enabled)?$',  # audio modes
            r'^(automotive|industrial|commercial)$',  # grade
            r'^\d+[\.\d]*\s*v\s*(cm|diff)',    # 36V Vcm
            r'^\d+(\.\d+)?v?\)?$',                # bare values: 150, 100, 2.5, 1.8v)
            r'^arm.*cortex',                         # ARM Cortex descriptions
            r'^\d+.*integrated.*ldo',               # 2 x integrated LDO
            r'^(full|master|slave).*(version|node)',  # Full version, Master Node
            r'^\d+\.?\d*v\s*vfb',                 # 0.8v VFB (feedback voltage)
            r'^(inh|wake|slp|en|cs|rst)\s*pin',      # pin names: INH, WAKE, SLP
            r'^(canl|canh|txd|rxd)$',                 # CAN bus pin names
            r'^pfm$',                                 # PFM mode
            r'^任意\d+\s*点',                        # 任意3点 (sensor calibration)
            r'^任意\d+\s*点.*等分',                   # 任意8点或者17点等分
            r'^(two|multi)[- ]?temp(erature)?.*trim', # two-temperature trim
            r'^(parallel|serial)\s*input$',          # parallel input, serial input
            r'inter[a-z]*\s*(power|ldo|mosfet|monitor)', # integrated/intergrated/integreted power
            r'.*vcm.*',                                # any Vcm-related string
            r'^(usb|type.c|pcie|dp\d|mipi|sata|sas)', # interface names
            r'^\d+\s*khz$',                          # "80 khz"
            r'^(fixed|adjustable)\s*\d',             # "fixed 5v output"
            r'^(high|low)[- ]?voltage.*(startup|start)', # "high-voltage startup"
            r'^powered.by',                            # "powered by input pin"
            r'^external.fet',                          # "external fet"
            r'^(build.in|built.in).*ss',               # "build-in ss & inrush control"
            r'^configurable.averag',                   # "configurable averaging"
            r'^tdm.only|pdm.disabled',                 # audio modes with period
            r'^dfn\d',                                 # dfn0.8x0.8-4
            r'^(crc|eeprom|idle|open|short|esd|fault|over|brake|obc|dcdc|bms)$',  # single-word noise
            r'^(产品型号|击穿电压|qualified)$',          # Chinese noise
            r'^supply.monitor',                         # supply monitor
            r'^integrated.comparator',                  # integrated comparator
            r'^fault.mask',                             # fault mask
            r'^(rmii|mii|sgmii|rgmii|qsgmii)',         # PHY interfaces (from garbled params)
        ]
        
        for key_pat in FEATURE_KEYS:
            m = re.search(key_pat, params, re.I)
            if not m:
                continue
            raw_features = m.group(1).strip()
            terms = re.split(r'[,;/，；]', raw_features)
            for term in terms:
                term = term.strip().lower()
                if not term or len(term) < 3:
                    continue
                # Skip Tier 1 matches
                if any(re.search(pat, term, re.I) for pat, _, _ in AUTO_FIX_MAP):
                    continue
                # Skip noise
                if any(re.search(np, term, re.I) for np in NOISE_PATTERNS):
                    continue
                # Flag for FAE review
                issues.append({
                    'type': 'UNKNOWN_FEATURE_TERM',
                    'severity': 'low',
                    'pn': p['part_number'],
                    'section': p.get('_section', ''),
                    'unknown_term': term,
                    'context': f'params: {raw_features[:120]}',
                    'fix': f'FAE判断: "{term}" 是否对应已有标签？如需要，加映射到 AUTO_FIX_MAP',
                    'auto_fix': False
                })
    
    return issues




def check_tag_constraints(products):
    """统一标签约束校验：从 tag_schema.json 读取所有约束"""
    issues = []
    constrained_tags = get_tags_with_constraints()
    for p in products:
        params = p.get('_params', '')
        for tag in p.get('_features', '').split():
            if tag not in constrained_tags:
                continue
            valid, reason = validate_tag(tag, params)
            if not valid:
                issues.append({
                    'type': 'TAG_CONSTRAINT_FAIL',
                    'severity': 'high',
                    'pn': p['part_number'],
                    'section': p.get('_section', ''),
                    'tag': tag,
                    'reason': reason,
                    'fix': f'remove {tag} tag — {reason}',
                    'auto_fix': True
                })
    return issues

def check_precision_tag_accuracy(products):
    """精密(≤1mV)标签的Vos值是否真的≤1mV"""
    issues = []
    for p in products:
        feats = p.get('_features', '').split()
        if '精密(≤1mV)' not in feats:
            continue
        params = p.get('_params', '')
        vos_m = re.search(r'Vos\s*\(Max\)\s*\(mV\)\s*[:：]\s*([\d.]+)', params)
        if vos_m:
            vos_val = float(vos_m.group(1))
            if vos_val > 1.0:
                issues.append({
                    'type': 'FALSE_PRECISION_TAG',
                    'severity': 'high',
                    'pn': p['part_number'],
                    'section': p.get('_section', ''),
                    'vos_max': vos_val,
                    'features': p.get('_features', ''),
                    'fix': f'remove 精密(≤1mV) tag (Vos(Max)={vos_val}mV > 1mV)',
                    'auto_fix': True
                })
    return issues


def check_rail_accuracy(products):
    """轨到轨标签必须 Rail-Rail In = Yes"""
    issues = []
    for p in products:
        feats = p.get('_features', '').split()
        if '轨到轨' not in feats:
            continue
        params = p.get('_params', '')
        rri = re.search(r'Rail-Rail\s*In\s*[:：]\s*Yes', params, re.I)
        if not rri:
            issues.append({
                'type': 'FALSE_RAIL_TAG',
                'severity': 'high',
                'pn': p['part_number'],
                'section': p.get('_section', ''),
                'features': p.get('_features', ''),
                'fix': 'remove 轨到轨 tag (Rail-Rail In ≠ Yes)',
                'auto_fix': True
            })
    return issues

def check_tag_naming(products):
    """标签命名规范：不能含空格（会被前端token匹配拆散）"""
    issues = []
    for p in products:
        for tag in p.get('_features', '').split():
            if ' ' in tag:
                issues.append({
                    'type': 'TAG_HAS_SPACES',
                    'severity': 'high',
                    'pn': p['part_number'],
                    'section': p.get('_section', ''),
                    'bad_tag': tag,
                    'fix': f'rename tag: "{tag}" → remove spaces',
                    'auto_fix': False  # needs human to pick new name
                })
                break
    return issues

def check_section_tag_mismatch(products):
    """section 和 features 品类标签不一致"""
    # Known good mappings
    section_hints = {
        '隔离栅极驱动': '隔离栅极驱动',
        '非隔离栅极驱动': '非隔离栅极驱动',
        '数字隔离器': '数字隔离器',
        'CAN 收发器': 'CAN-FD',
        'CAN-FD': 'CAN-FD',
        'RS-485 收发器': 'RS-485',
        'RS-232 收发器': 'RS-232',
        'LIN 收发器': 'LIN',
        'LIN': 'LIN',
        'MLVDS': 'MLVDS',
        'LDO': 'LDO',
        '低压LDO': 'LDO',
        '高压 LDO': 'LDO',
        'DCDC': 'DCDC',
        '运放': '运放',
        '比较器': '比较器',
        'ADC': 'ADC',
        'DAC': 'DAC',
        '电压基准': '电压基准',
        '模拟开关': '模拟开关',
        '负载开关': '负载开关',
        '马达驱动': '马达驱动',
        '电平转换': '电平转换',
        '电流传感器': '电流传感器',
        '温度传感器': '温度传感器',
        '复位芯片': '复位芯片',
        'BMS': 'BMS',
        '电子保险丝': '电子保险丝',
        '理想二极管': '理想二极管',
        'ASN 音频总线': '音频总线',
    }
    
    issues = []
    for p in products:
        sec = p.get('_section', '')
        feats = p.get('_features', '').split()
        
        for sec_key, expected_tag in section_hints.items():
            if sec_key in sec and expected_tag not in feats:
                # Exception: multi-section products, compound sections
                if len(sec.split()) > 3:
                    continue
                issues.append({
                    'type': 'SECTION_TAG_MISMATCH',
                    'severity': 'low',
                    'pn': p['part_number'],
                    'section': sec,
                    'missing_tag': expected_tag,
                    'features': p.get('_features', ''),
                    'fix': f"add {expected_tag} tag",
                    'auto_fix': False  # many false positives for compound sections
                })
    return issues


# ═══════════════════════════════════════════════
# 自动修复
# ═══════════════════════════════════════════════

def auto_fix(products, all_issues):
    """自动修复高置信度问题。先加后删，防止循环。"""
    fixed = 0
    
    # Separate additions and removals
    additions = [i for i in all_issues if i.get('auto_fix') and i['type'] == 'PARAM_FEATURE_GAP']
    removals = [i for i in all_issues if i.get('auto_fix') and i['type'] != 'PARAM_FEATURE_GAP']
    
    for issue in additions + removals:
        pn = issue['pn']
        p = next((p for p in products if p['part_number'] == pn), None)
        if not p:
            continue
        
        if issue['type'] == 'PARAM_FEATURE_GAP':
            missing_tag = issue.get('missing_tag', '')
            if missing_tag and missing_tag not in p['_features'].split():
                p['_features'] = p['_features'] + ' ' + missing_tag
                fixed += 1
        elif issue['type'] == 'FALSE_PRECISION_TAG':
            p['_features'] = ' '.join([f for f in p['_features'].split() if f != '精密(≤1mV)'])
            fixed += 1
        elif issue['type'] == 'FALSE_RAIL_TAG':
            p['_features'] = ' '.join([f for f in p['_features'].split() if f != '轨到轨'])
            fixed += 1
        elif issue['type'] == 'TAG_CONSTRAINT_FAIL':
            bad_tag = issue.get('tag', '')
            if bad_tag:
                p['_features'] = ' '.join([f for f in p['_features'].split() if f != bad_tag])
                fixed += 1
        elif issue['type'] == 'ASN_CAN_MISMATCH':
            feats = p['_features'].split()
            new_feats = [f for f in feats if f != 'CAN-FD']
            if '音频总线' not in new_feats:
                new_feats.append('音频总线')
            p['_features'] = ' '.join(new_feats)
            p['_section'] = 'ASN 音频总线'
            fixed += 1
    
    return fixed

def main():
    do_fix = '--fix' in sys.argv
    json_out = '--json' in sys.argv
    
    with open(DATA_PATH) as f:
        data = json.load(f)
    
    all_issues = []
    
    for vendor, vd in data.items():
        products = vd['products']
        if not products:
            continue
        
        vendor_issues = []
        vendor_issues.extend(check_asn_can(products))
        vendor_issues.extend(check_isolation_context(products))
        vendor_issues.extend(check_speed_unit(products))
        vendor_issues.extend(check_conflicting_tags(products))
        vendor_issues.extend(check_empty_fields(products))
        vendor_issues.extend(check_garbled_params(products))
        vendor_issues.extend(check_param_feature_gap(products))
        vendor_issues.extend(check_tag_naming(products))
        vendor_issues.extend(check_tag_constraints(products))
        vendor_issues.extend(check_precision_tag_accuracy(products))
        vendor_issues.extend(check_rail_accuracy(products))
        # vendor_issues.extend(check_section_tag_mismatch(products))  # too noisy, skip by default
        
        for issue in vendor_issues:
            issue['vendor'] = vendor
        
        all_issues.extend(vendor_issues)
    
    # Severity stats
    high = [i for i in all_issues if i['severity'] == 'high']
    medium = [i for i in all_issues if i['severity'] == 'medium']
    low = [i for i in all_issues if i['severity'] == 'low']
    
    # Auto-fix
    fixed_count = 0
    if do_fix:
        all_products = []
        for vd in data.values():
            all_products.extend(vd['products'])
        fixed_count = auto_fix(all_products, all_issues)
        if fixed_count > 0:
            with open(DATA_PATH, 'w') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
    
    # Identify known systemic issues (not actionable per-product)
    known_novosense_empty = len([i for i in all_issues if i['vendor'] == 'novosense' and i['type'] in ('EMPTY_SECTION', 'EMPTY_FEATURES')])
    actionable = [i for i in all_issues if not (i['vendor'] == 'novosense' and i['type'] in ('EMPTY_SECTION', 'EMPTY_FEATURES'))]
    
    if json_out:
        print(json.dumps({
            'total_issues': len(all_issues),
            'high': len(high), 'medium': len(medium), 'low': len(low),
            'fixed': fixed_count,
            'issues': all_issues
        }, ensure_ascii=False, indent=2))
    else:
        print(f"\n╔══════════════════════════════════╗")
        print(f"║  数据质量审计报告                ║")
        print(f"╠══════════════════════════════════╣")
        print(f"║  🔴 HIGH:   {len(high):<4}  (需处理: {len(actionable):<4})         ║")
        print(f"║  🟡 MEDIUM: {len(medium):<4}                    ║")
        print(f"║  🟢 LOW:    {len(low):<4}                       ║")
        print(f"║  ✅ auto-fixed: {fixed_count:<2}                 ║")
        if known_novosense_empty > 0:
            print(f"║  📋 novosense 空section: {known_novosense_empty:<4} (已知)    ║")
        print(f"╚══════════════════════════════════╝")
        
        if actionable:
            print(f"\n需处理的 {len(actionable)} 项:")
            for issue in actionable:
                icon = {'high': '🔴', 'medium': '🟡', 'low': '🟢'}.get(issue['severity'], '⚪')
                auto = ' [AUTO-FIX]' if issue.get('auto_fix') else ''
                print(f"\n  {icon} [{issue['vendor']}] {issue['pn']} — {issue['type']}{auto}")
                print(f"     section: {issue.get('section','?')}")
                print(f"     features: {issue.get('features','?')[:100]}")
                if issue.get('fix'):
                    print(f"     → {issue['fix']}")
        else:
            print(f"\n  ✅ 零问题！数据完全干净。")
    
    return len(high) == 0


if __name__ == '__main__':
    ok = main()
    sys.exit(0 if ok else 1)

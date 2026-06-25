#!/usr/bin/env python3
"""
约束层(must/nice + 维度感知三级降级)回归测试
==========================================
覆盖 2026-06 灰度推广 + 交互升级验证过的全部 case:
  - 裕太微以太网: TX/T1/FX 物理层互斥, 端口精确, 网卡/交换机子品类
  - 思瑞浦模拟: 运放/比较器/电源(DCDC/LDO)/数据转换/接口
  - 同义词归一: 车载=车规=车用=汽车级
  - 语义歧义消解: 泛"车载"=车规等级; 明确"t1/单对线"=T1物理层
  - 维度感知降级: category/media硬维度保住, spec/grade软维度放松
  - 端口/通道向下兼容: 要N口, ≥N也满足(多口当少口); 精确优先排序
  - 规格超限(选项B): 要9口但库存最多8口 → 诚实说明上限, 不展示低规格冒充
  - 数据标签防回归: PHY非网卡, 运放非DCDC, DCDC=降压+升压统称

用法: 先启动 dev server (npm run dev), 再 python3 scripts/test_constraint_layer.py
注: 本脚本复刻 constraint-match.ts 的维度感知逻辑, 修改前端逻辑后须同步更新此处.
"""
import json, urllib.request, re, sys

BASE = "http://localhost:3000"
DATA = "web/public/data/products_structured.json"

def vendor_group_key(slug):
    return "3peak" if str(slug).startswith("3peak") else str(slug)

def interpret(query):
    req = urllib.request.Request(f"{BASE}/api/interpret",
        data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

# ── 复刻 constraint-match.ts 维度感知逻辑(保持与前端同步) ──
def _unit(family): return "口" if family == "端口" else "通道"

def _parse_tag_values(toks, prefix, suffix):
    vals = []
    for tk in toks:
        if not tk.startswith(prefix) or not tk.endswith(suffix):
            continue
        try:
            vals.append(float(tk[len(prefix):-len(suffix)]))
        except:
            pass
    return vals

def _normalize_current_to_a(key, obj):
    if not isinstance(obj, dict) or not isinstance(obj.get("value"), (int, float)):
        return None
    unit = str(obj.get("unit", "")).lower()
    raw = str(obj.get("raw", "")).lower()
    kl = key.lower()
    val = float(obj["value"])
    if "ma" in unit or "ma" in raw or "__ma_" in kl:
        val /= 1000
    elif "μa" in unit or "ua" in unit or "μa" in raw or "ua" in raw or "__ua_" in kl:
        val /= 1000000
    return val

def _vin_range_of(p, toks):
    pn = p.get("_params_numeric") or {}
    min_v = max_v = None
    for k, v in pn.items():
        kl = k.lower()
        if not isinstance(v, dict) or not isinstance(v.get("value"), (int, float)):
            continue
        if (("minimum_input" in kl) or ("最小输入" in k)) and (("voltage" in kl) or ("电压" in k) or ("__v_" in kl)):
            min_v = float(v["value"])
        elif (("maximum_input" in kl) or ("最大输入" in k)) and (("voltage" in kl) or ("电压" in k) or ("__v_" in kl)):
            max_v = float(v["value"])
    if min_v is not None and max_v is not None:
        return (min(min_v, max_v), max(min_v, max_v))
    if min_v is not None:
        return (min_v, float("inf"))
    if max_v is not None:
        return (0.0, max_v)
    vals = _parse_tag_values(toks, "vin_", "v")
    if len(vals) >= 2:
        return (min(vals), max(vals))
    if len(vals) == 1:
        return (0.0, vals[0])
    return None

def _iout_max_of(p, toks):
    pn = p.get("_params_numeric") or {}
    best = None
    for k, v in pn.items():
        kl = k.lower()
        if not (("output" in kl) or ("输出" in k)):
            continue
        if not (("current" in kl) or ("电流" in k) or ("__a_" in kl) or ("__ma_" in kl)):
            continue
        num = _normalize_current_to_a(k, v)
        if num is None:
            continue
        best = num if best is None else max(best, num)
    if best is not None:
        return best
    vals = _parse_tag_values(toks, "iout_", "a")
    return max(vals) if vals else None

def _parse_voltage_spec(text):
    s = text.strip()
    values = []
    m = re.search(r'Fixed\s*\(([\d.,\s]+)\)', s, re.I)
    if m:
        values += [float(x) for x in re.findall(r'[\d.]+', m.group(1))]
    if '固定输出' in s:
        values += [float(x) for x in re.findall(r'[\d.]+', s)]
    m = re.search(r'Adjustable\s*\(([\d.]+)\s*(?:to|~|\-|–|—)\s*([\d.]+)\)', s, re.I)
    if m:
        return sorted(set(values)), (float(m.group(1)), float(m.group(2)))
    m = re.search(r'([\d.]+)\s*[~\-–—]\s*([\d.]+)', s)
    if m:
        return sorted(set(values)), (float(m.group(1)), float(m.group(2)))
    return sorted(set(values)), None

def _vout_spec_of(p, toks):
    pn = p.get("_params_numeric") or {}
    for k, v in pn.items():
        kl = k.lower()
        if not (("output" in kl) or ("输出" in k)):
            continue
        if not (("voltage" in kl) or ("电压" in k) or ("__v_" in kl)):
            continue
        if isinstance(v, dict) and isinstance(v.get("min"), (int, float)) and isinstance(v.get("max"), (int, float)):
            return [], (min(float(v["min"]), float(v["max"])), max(float(v["min"]), float(v["max"])))
        if isinstance(v, dict) and isinstance(v.get("value"), (int, float)):
            return [float(v["value"])], None
    params = str(p.get("_params", "") or "")
    for seg in params.split('|'):
        if ':' not in seg:
            continue
        k, v = seg.split(':', 1)
        kl = k.lower()
        if (("output voltage" in kl) or ("输出电压" in k) or ("output (v)" in kl)) and (("voltage" in kl) or ("电压" in k) or ("(v)" in kl)):
            return _parse_voltage_spec(v.strip())
    return sorted(set(_parse_tag_values(toks, "vout_", "v"))), None

def _port_count(p, toks):
    best = None
    for tk in toks:
        m = re.match(r'^(\d+)口$', tk)
        if m:
            best = int(m.group(1)) if best is None else max(best, int(m.group(1)))
    params = str(p.get("_params", "") or "").lower()
    for rx in [r'简介\s*[:：][^|]*?\b(\d+)\s*g(?:e)?\b', r'端口\s*[:：]\s*(\d+)\s*ge', r'\b(\d+)\s*ge\b', r'\b(\d+)\s*ports?\b', r'端口\s*[:：]\s*(\d+)']:
        for m in re.finditer(rx, params, re.I):
            n = int(m.group(1)); best = n if best is None else max(best, n)
    return best

def _is_io_expander(p, toks):
    sec = re.sub(r'\s+', '', str(p.get("_section", "") or "").lower())
    return "io扩展器" in toks or "io扩展器" in sec or "i/o扩展器" in sec

def _channel_count(p, toks):
    best = None
    pn = p.get("_params_numeric") or {}
    for k, v in pn.items():
        kl = k.lower()
        if not ("channel" in kl or "通道" in k or "__ch_" in kl):
            continue
        num = None
        if isinstance(v, dict):
            if isinstance(v.get("value"), (int, float)): num = v["value"]
            elif isinstance(v.get("max"), (int, float)): num = v["max"]
        if num is not None:
            best = int(num) if best is None else max(best, int(num))
    params = str(p.get("_params", "") or "")
    rx_list = [r'(number of channels?|channel count|adc input channel|input channel(?:\s+数量)?|参考\s*通道数|输入通道\s*数量)\s*[:：]\s*(\d+)']
    if _is_io_expander(p, toks):
        # IO 扩展器产品线语义: Receivers Per Package/16bit GPIO Expander 是扩展位数证据，
        # 仅限 IO 扩展器 section/feature，避免污染 RS-232/RS-485/电平转换器。
        rx_list += [
            r'receivers\s+per\s+package\s*[:：]\s*(\d+)',
            r'\b(\d+)\s*bit\s+gpio\s+expander\b',
            r'\b(\d+)\s*ch\s+i2c\s+switch\b',
        ]
    rx_list += [r'(\d+)\s*通道', r'\b(\d+)\s*ch\b']
    for rx in rx_list:
        for m in re.finditer(rx, params, re.I):
            n = int(m.group(len(m.groups()))); best = n if best is None else max(best, n)
    for tk in toks:
        m = re.match(r'^(\d+)通道', tk)
        if m:
            n = int(m.group(1)); best = n if best is None else max(best, n)
    return best

def _data_rate_mbps(p, toks):
    best = None
    for tk in toks:
        m = re.match(r'^(\d+\.?\d*)mbps$', tk)
        if m:
            v = float(m.group(1)); best = v if best is None else max(best, v)
    pn = p.get("_params_numeric") or {}
    for k, obj in pn.items():
        kl = k.lower()
        if not ("data" in kl or "rate" in kl or "bps" in kl or "速率" in k):
            continue
        if not isinstance(obj, dict):
            continue
        num = obj.get("value") if isinstance(obj.get("value"), (int, float)) else obj.get("max")
        if not isinstance(num, (int, float)):
            continue
        num = float(num)
        unit = str(obj.get("unit", "")).lower(); raw = str(obj.get("raw", "")).lower()
        if "kbps" in kl or "kbps" in unit or "kbps" in raw:
            num /= 1000
        elif "gbps" in kl or "gbps" in unit or "gbps" in raw:
            num *= 1000
        best = num if best is None else max(best, num)
    return best

def _normalize_voltage_to_mv(key, obj):
    if not isinstance(obj, dict) or not isinstance(obj.get("value"), (int, float)):
        return None
    unit = str(obj.get("unit", "")).lower()
    raw = str(obj.get("raw", "")).lower()
    kl = key.lower()
    val = float(obj["value"])
    if "μv" in unit or "uv" in unit or "μv" in raw or "uv" in raw or "__uv_" in kl or "__μv_" in kl:
        val /= 1000
    elif unit == "v" or unit.endswith(" v") or raw.endswith(" v") or "__v_" in kl:
        val *= 1000
    return val

def _vos_max_mv_of(p):
    pn = p.get("_params_numeric") or {}
    best = None
    for k, v in pn.items():
        kl = k.lower()
        is_vos = ("vos" in kl) or ("offset_voltage" in kl) or ("input_offset" in kl) or ("失调电压" in k)
        is_drift = ("drift" in kl) or ("dvos" in kl) or ("_dt" in kl) or ("temp" in kl) or ("漂移" in k)
        if not is_vos or is_drift:
            continue
        mv = _normalize_voltage_to_mv(k, v)
        if mv is None:
            continue
        best = mv if best is None else min(best, mv)
    return best

def tag_satisfied(p, tag, meta=None):
    toks = (p.get("_features","") or "").lower().split()
    t = tag.lower()
    params = str(p.get("_params", "") or "").lower()
    detail = (str(p.get("_detail_intro", "") or "") + " " + str(p.get("_detail_features", "") or "")).lower()
    all_text = params + " " + detail
    if t in ('半双工', '全双工'):
        has_serial = bool(re.search(r'rs-?\s*(?:485|232)|隔离\s*rs-?\s*485|485\s*收发器|232\s*收发器', all_text)) or any(x in toks for x in ['rs-485','rs-232','隔离rs485','集成隔离电源的隔离rs485'])
        if not has_serial:
            return t in toks
        params_half = bool(re.search(r'半双工|half[ -]?duplex', params))
        params_full = bool(re.search(r'全双工|full[ -]?duplex', params))
        if t == '半双工':
            if params_full and not params_half: return False
            return params_half or bool(re.search(r'半双工|half[ -]?duplex', detail)) or t in toks
        if params_half and not params_full: return False
        return params_full or bool(re.search(r'全双工|full[ -]?duplex', detail)) or t in toks
    if t == '隔离rs485':
        return t in toks or '集成隔离电源的隔离rs485' in toks or bool(re.search(r'隔离(?:式)?\s*rs-?\s*485|隔离rs485|isolated\s+rs-?485', all_text))
    parent_closure = {
        '栅极驱动': ['隔离栅极驱动', '非隔离栅极驱动'],
        '隔离can': ['集成隔离电源的隔离can'],
        '隔离rs485': ['集成隔离电源的隔离rs485'],
        '电压基准': ['串联型电压基准', '并联型电压基准'],
        '隔离': ['隔离放大器', '隔离can', '隔离rs485', '集成隔离电源的隔离can', '集成隔离电源的隔离rs485', '隔离栅极驱动', '隔离电源', '隔离i2c', '数字隔离器', '隔离adc'],
        # “电源”是搜索层虚拟父类：泛电源/电源芯片查询召回 DCDC/LDO/PMIC 等；不写入产品 _features。
        '电源': ['dcdc', 'ldo', 'pmic', 'drmos', '降压', '升压', '电源时序'],
    }
    if t in parent_closure and any(child in toks for child in parent_closure[t]):
        return True
    # Synonym closure: equivalent names (运放↔放大器) + compound reverse mapping
    synonym_closure = {
        '运放': ['放大器'],
        # Compound reverse: constituent tags match products with compound tokens
        'rs-485': ['隔离rs485', '集成隔离电源的隔离rs485'],
        'can-fd': ['隔离can', '集成隔离电源的隔离can'],
        'i2c': ['隔离i2c'],
        '隔离电源': ['集成隔离电源的隔离can', '集成隔离电源的隔离rs485'],
    }
    if t in synonym_closure and any(syn in toks for syn in synonym_closure[t]):
        return True
    # Evidence registry: tag → params_key / context_section / detail_regex
    # Same structure as EVIDENCE_REGISTRY in constraint-match.ts
    # Only applies to spec/technology dimensions; category/grade use hard identity.
    can_use = (not meta) or (meta.get("dimension") not in ("category","grade"))
    if can_use:
        _evidence_registry = {
            '电压基准': {'params_key': 'voltage_reference', 'context_section': re.compile(r'放大器|运放|比较器')},
            '霍尔': {'detail_regex': re.compile(r'霍尔|hall[ -]?(effect|sensor|switch|latch)', re.I)},
        }
        rule = _evidence_registry.get(t)
        if rule:
            context_ok = True
            if rule.get('context_section'):
                section = p.get('_section', '') or ''
                context_ok = bool(rule['context_section'].search(section))
            if context_ok:
                if rule.get('params_key'):
                    pn = p.get('_params_numeric')
                    if pn and any(rule['params_key'] in k for k in pn):
                        return True
                if rule.get('detail_regex'):
                    detail = ((p.get('_detail_intro') or '') + ' ' + (p.get('_detail_features') or '')).lower()
                    if rule['detail_regex'].search(detail):
                        return True
    if t == '轨到轨':
        if t in toks or re.search(r'\brrio\b|轨到轨', all_text):
            return True
        in_yes = bool(re.search(r'rail[-\s]?rail\s*in\s*[:：]\s*(yes|是)', all_text))
        out_yes = bool(re.search(r'rail[-\s]?rail\s*out\s*[:：]\s*(yes|是)', all_text))
        return in_yes and out_yes
    if t == 't1-phy':
        return bool(re.search(r'(?:10|100|1000)base-t1|802\.3bw', params))
    if t == '100base-tx':
        if re.search(r'(?:10|100|1000)base-t1|802\.3bw', params): return False
        return bool(re.search(r'100base-tx|\bfe\s+phy\b|双绞线', params))
    if t == '百兆':
        return t in toks or bool(re.search(r'百兆|100base-(?:tx|t1|fx)|\bfe\s+phy\b|\b1fe\b|802\.3bw', params))
    if t == '千兆':
        return t in toks or bool(re.search(r'千兆|1000base|\b1\s*ge\b|\bge\b|gigabit', params))
    if 'sbc' in toks:
        if t == 'can-fd': return bool(re.search(r'\bcan\b|uja1169|tja1145', params))
        if t == 'lin': return bool(re.search(r'\blin\b|tja1028|tlin1028', params))
        if t == 'rs-485': return bool(re.search(r'rs-?485|485\s*sbc', params))
        if t == 'rs-232': return bool(re.search(r'rs-?232|232\s*sbc', params))
    # 端口/通道向下兼容: ≥N
    if meta and meta.get("downgradable") and meta.get("value") is not None and meta.get("family") in ("端口","通道"):
        count = _port_count(p, toks) if meta.get("family") == "端口" else _channel_count(p, toks)
        return count is not None and count >= meta["value"]
    # Mbps 向下兼容: 产品速率 >= 查询
    if meta and meta.get("value") is not None and meta.get("family") == "Mbps":
        val = _data_rate_mbps(p, toks)
        return val is not None and val >= meta["value"]
    if meta and meta.get("value") is not None and meta.get("family") == "Vin":
        rng = _vin_range_of(p, toks)
        return bool(rng and rng[0] <= meta["value"] <= rng[1])
    if meta and meta.get("value") is not None and meta.get("family") == "Iout":
        mv = _iout_max_of(p, toks)
        return mv is not None and mv >= meta["value"]
    # Hard category/grade dimensions: no params/detail fallback. Token match only.
    # Must be AFTER all special handlers (Vos/千兆/SBC/downgradable etc).
    if meta and meta.get("dimension") in ("category","grade"):
        return t in toks
    if (meta and meta.get("value") is not None and meta.get("family") == "Vos") or (meta and meta.get("dimension") == "spec" and re.match(r'^vos_<=', t, re.I)):
        vos_val = meta.get("value") if meta and meta.get("value") is not None else None
        if vos_val is None:
            m = re.match(r'^Vos_<=(\d+\.?\d*)(m?)V?$', tag, re.I)
            if m: vos_val = float(m.group(1))
        if vos_val is not None:
            mv = _vos_max_mv_of(p)
            return mv is not None and mv <= vos_val
    if meta and meta.get("value") is not None and meta.get("family") == "Vout":
        vals, rng = _vout_spec_of(p, toks)
        if any(abs(v - meta["value"]) < 1e-6 for v in vals):
            return True
        return bool(rng and rng[0] <= meta["value"] <= rng[1])
    pm = re.match(r'^(\d+)口$', t)
    if pm:
        for tk in toks:
            m = re.match(r'^(\d+)口', tk)
            if m and m.group(1) == pm.group(1): return True
        return False
    # 普通 tag 必须精确 token 命中，不能用子串放宽。
    # 否则“隔离栅极驱动”会误命中“非隔离栅极驱动”。
    return any(tk == t for tk in toks)

def exact_spec(p, meta):
    fam = meta.get("family")
    if meta.get("value") is None:
        return False
    if fam in ("端口", "通道"):
        toks = (p.get("_features","") or "").lower().split()
        count = _port_count(p, toks) if fam == "端口" else _channel_count(p, toks)
        return count is not None and count == meta["value"]
    toks = (p.get("_features","") or "").lower().split()
    if fam == "Iout":
        mv = _iout_max_of(p, toks)
        return mv is not None and abs(mv - meta["value"]) < 1e-6
    if fam == "Vin":
        rng = _vin_range_of(p, toks)
        return bool(rng and (abs(rng[0] - meta["value"]) < 1e-6 or abs(rng[1] - meta["value"]) < 1e-6))
    if fam == "Vos":
        mv = _vos_max_mv_of(p)
        return mv is not None and mv <= meta["value"]
    if fam == "Vout":
        vals, rng = _vout_spec_of(p, toks)
        if any(abs(v - meta["value"]) < 1e-6 for v in vals):
            return True
        return bool(rng and (abs(rng[0] - meta["value"]) < 1e-6 or abs(rng[1] - meta["value"]) < 1e-6))
    return False

def align_meta(must, meta):
    bytag = {m["tag"]: m for m in (meta or [])}
    return [bytag.get(t, {"tag": t, "dimension": "category"}) for t in must]

def sort_value(p, paramKeys, direction, param=None):
    pn = p.get("_params_numeric", {}) or {}
    best = None
    for k, v in pn.items():
        kl = k.lower()
        if not any(pk in kl for pk in paramKeys): continue
        if str(param or '').lower() == 'vos' and ("drift" in kl or "dvos" in kl or "_dt" in kl or "temp" in kl or "漂移" in k):
            continue
        num = None
        if isinstance(v, dict):
            if isinstance(v.get("value"), (int, float)):
                num = _normalize_voltage_to_mv(k, v) if str(param or '').lower() == 'vos' else v["value"]
            elif isinstance(v.get("max"), (int, float)): num = v["max"]
        if num is None: continue
        best = num if best is None else (max(best, num) if direction == "high" else min(best, num))
    return best

def _vendor_bucket(p):
    return p.get("__vendorGroup") or p.get("__vendor")

def _status_rank(p):
    text = str(p.get("_params", "") or "").lower()
    if re.search(r'状态\s*[:：]\s*(?:mp|量产|production)|status\s*[:：]\s*(?:production|active|mp)', text, re.I): return 3
    if re.search(r'状态\s*[:：]\s*(?:预量产|试产)|pre[-\s]?production', text, re.I): return 2
    if re.search(r'状态\s*[:：]\s*(?:样品|sample)|sample', text, re.I): return 1
    return 0

def _status_tie_rank(p):
    toks = (p.get("_features", "") or "").lower().split()
    return _status_rank(p) if "sbc" in toks else 0

def diversify_ties(items, tie_key):
    if len(items) <= 2:
        return items
    out = []
    i = 0
    while i < len(items):
        key = tie_key(items[i])
        j = i + 1
        while j < len(items) and tie_key(items[j]) == key:
            j += 1
        group = items[i:j]
        buckets = {}
        order = []
        singletons = []
        for s in group:
            bucket = _vendor_bucket(s["p"])
            if not bucket:
                singletons.append(s)
                continue
            if bucket not in buckets:
                buckets[bucket] = []
                order.append(bucket)
            buckets[bucket].append(s)
        if len(buckets) <= 1:
            out.extend(group)
            i = j
            continue
        single_idx = 0
        while True:
            progressed = False
            for bucket in order:
                if not buckets[bucket]:
                    continue
                out.append(buckets[bucket].pop(0))
                progressed = True
                if single_idx < len(singletons):
                    out.append(singletons[single_idx])
                    single_idx += 1
            if not progressed:
                break
        out.extend(singletons[single_idx:])
        i = j
    return out

def apply_constraints(prods, must, nice, meta, sortKey=None):
    metas = align_meta(must, meta)
    scored = []
    for p in prods:
        hit=[]; miss=[]; eb=0
        for mt in metas:
            if tag_satisfied(p, mt["tag"], mt):
                hit.append(mt["tag"])
                if exact_spec(p, mt): eb += 1
            else: miss.append(mt["tag"])
        nh = [n for n in nice if tag_satisfied(p, n)]
        scored.append({"pn":p["part_number"],"p":p,"hit":hit,"miss":miss,"nh":nh,"eb":eb,
                       "full":not miss,"score":len(hit)*10+eb*3+len(nh)})
    hard = {mt["tag"] for mt in metas if mt["dimension"] in ("category","media")}

    def _apply_sort(arr):
        if not sortKey: return arr
        sk = sortKey
        pool = arr
        if sk.get("require"):
            pool = [s for s in arr if sort_value(s["p"], sk["paramKeys"], sk["direction"], sk.get("param")) is not None]
        d = sk["direction"]
        def key(s):
            v = sort_value(s["p"], sk["paramKeys"], d, sk.get("param"))
            v = (float("-inf") if d=="high" else float("inf")) if v is None else v
            return (-v if d=="high" else v, -s["eb"], -len(s["nh"]), -s["score"])
        sorted_pool = sorted(pool, key=key)
        return diversify_ties(sorted_pool, lambda s: (sort_value(s["p"], sk["paramKeys"], d, sk.get("param")), s["eb"], len(s["nh"]), s["score"]))

    full = [s for s in scored if s["full"]]
    if full:
        if sortKey:
            sf = _apply_sort(full)
            if sf: return 1, sf
        else:
            full.sort(key=lambda x:(-x["eb"],-len(x["nh"]),-_status_tie_rank(x["p"]),-x["score"]))
            return 1, diversify_ties(full, lambda s: (s["eb"], len(s["nh"]), _status_tie_rank(s["p"]), s["score"]))
    hardok = [s for s in scored if hard and all(t in s["hit"] for t in hard)]
    if hardok:
        # 规格超限检测
        for mt in metas:
            if not mt.get("downgradable") or mt.get("value") is None or mt.get("family") not in ("端口","通道"): continue
            fam = mt["family"]; mx = 0
            pmap = {p["part_number"]: p for p in prods}
            for s in hardok:
                p0 = pmap[s["pn"]]
                toks0 = (p0.get("_features","") or "").lower().split()
                n = _port_count(p0, toks0) if fam == "端口" else _channel_count(p0, toks0)
                if n is not None: mx = max(mx, n)
            if 0 < mx < mt["value"]:
                def _at_max(pn):
                    p0 = pmap[pn]
                    toks0 = (p0.get("_features","") or "").lower().split()
                    n = _port_count(p0, toks0) if fam == "端口" else _channel_count(p0, toks0)
                    return n == mx
                atmax = [s for s in hardok if _at_max(s["pn"])][:5]
                return 2, atmax  # 超限: 展示库存上限产品
        hardok.sort(key=lambda x:(len(x["miss"]),-x["eb"],-len(x["nh"]),-x["score"]))
        return 2, diversify_ties(hardok, lambda s: (len(s["miss"]), s["eb"], len(s["nh"]), s["score"]))[:8]
    any_ = diversify_ties(sorted([s for s in scored if s["hit"]], key=lambda x:-x["score"]), lambda s: s["score"])[:5]
    return 3, any_

# ── 测试用例: (查询, vendor, 期望tier, Top含, 不应出现, top1需含[可选]) ──
# 解读B: tier1端口向下兼容(8口可当5口用), 但精确规格(5口)必须排最前. top1校验锁定排序.
CASES = [
    # 物理层互斥
    ("车规百兆phy tx接口", "yutai", 1, ["YT8522A"], ["YT8010A"], None),
    ("车规百兆phy t1接口", "yutai", 1, ["YT8010A"], ["YT8522A"], None),
    # 端口向下兼容(解读B): 5口排最前, 8口可兜底出现在后
    ("五口交换", "yutai", 1, ["YT9215RB"], [], "YT9215"),
    ("8口交换机", "yutai", 1, ["YT9218MB"], ["YT9215RB"], "YT9218"),
    ("16口交换机", "yutai", 1, ["YT9232D"], ["YT9215RB"], "YT9232D"),
    ("千兆网卡", "yutai", 1, ["YT6801"], ["YT8511H"], None),
    # 同义词归一: 车载=车规=车用, top1都是5口精确
    # 注: yutai 交换机暂无车规AEC-Q100型号, 约束层正确降级到tier2(等级放松).
    ("车载五口交换机", "yutai", 2, ["YT9215"], [], "YT9215"),
    ("车规五口交换机", "yutai", 2, ["YT9215"], [], "YT9215"),
    ("车用5口交换机", "yutai", 2, ["YT9215"], [], "YT9215"),
    # 语义歧义: 泛"车载以太网"=车规交换机(非T1); 明确"t1"才是T1物理层
    ("车载以太网交换机", "yutai", 2, ["YT9215"], ["YT8010A"], None),
    ("车载t1 phy", "yutai", 1, ["YT8010A"], ["YT9215"], None),
    # 规格超限: 9/11口现在可由更高口数交换机满足(≥N), 不应再诚实降级到8口
    # 注: tier2下等级+规格放松, YT9215RB等低口交换机会在近匹配中出现.
    ("车规9口交换机", "yutai", 2, ["YT9232"], [], "YT9232"),
    ("车规11口交换机", "yutai", 2, ["YT9232"], [], "YT9232"),
    # 思瑞浦模拟多品类
    ("4通道运放", "3peak-analog", 1, ["LM324A"], ["LMV331TP", "LMV331X", "LMV393TP", "LMV393X"], None),
    ("轨到轨运放，1mv 以下的 offset", "3peak-analog", 1, ["TP5551"], ["TPA1811", "NSOPA9051"], "TP555"),
    ("失调电压小于500uV的轨到轨运放", "3peak-analog", 1, ["TP5551"], ["TPA1811", "NSOPA9051"], "TP555"),
    ("比较器", "3peak-analog", 1, ["LMV331TP"], ["LM324A", "LM2902A", "LM2904A"], None),
    ("5A DCDC 3.3V输出", "3peak-analog", 1, ["TPP366090"], [], None),
    ("降压器", "3peak-analog", 1, ["TPP00031"], ["TPL8033", "TPA1811"], None),
    ("电源芯片", "3peak-analog", 1, ["TPP00031"], ["TPA1811", "LMV331TP"], None),
    ("低压LDO 3.3V", "3peak-analog", 1, [], [], None),
    ("16位ADC", "3peak-analog", 1, [], [], None),
    ("RS-485收发器 10Mbps", "3peak-analog", 1, [], [], None),
    # IO扩展器: 不向features补16/8/4通道，约束层从 params/detail 读扩展位数；
    # Receivers Per Package 只能在 IO扩展器 section 中作为扩展位数，不能污染 RS-232/RS-485/电平转换器。
    ("16通道IO扩展器", None, 1, ["TPT29539Q", "TPT29555A"], ["TPT3243", "TPT4032", "TPT24857"], "TPT29539"),
    ("8通道IO扩展器", None, 1, ["TPT29548", "TPT29554A", "TPT29539Q"], ["TPT3243", "TPT4032"], "TPT29548"),
    ("4通道IO扩展器", None, 1, ["TPT29536A", "TPT29545"], ["TPT3243", "TPT4032"], "TPT29536"),
    ("车规16通道IO扩展器", None, 1, ["TPT29539Q", "TPT29539AQ"], ["TPT29555A", "TPT3243"], "TPT29539"),
    # 纳芯微隔离RS485: 双工证据有两类来源：NSI84085 在 detail intro 写“隔离半双工RS485”，
    # NSIP93086 H/HV 在行级 params 写 Half Duplex；行级 params 必须压过系列intro里的全双工描述。
    ("纳芯微 隔离485 半双工", "novosense", 1, ["NSI84085", "NSIP93086H"], ["NSIP93086C-DSWR"], None),
    ("纳芯微 隔离485 全双工", "novosense", 1, ["NSIP93086C"], ["NSIP93086H-DSWR", "NSI84085"], None),
    ("隔离485 半双工", None, 1, ["TPT7481", "NSI84085", "NSIP93086H"], ["NSIP93086C-DSWR"], None),
    ("隔离CAN", "novosense", 1, ["NSIP9042-DSWR"], ["NSIP6051", "NSI7258", "NSIP3266"], None),
    ("集成隔离电源的隔离CAN", "novosense", 1, ["NSIP9042-DSWR"], ["NSIP6051", "NSI7258", "NSIP3266"], "NSIP9042"),
    ("集成隔离电源的隔离RS485", "novosense", 1, ["NSIP93086C-DSWR", "NSIP93086H-DSWR"], ["NSIP6051", "NSIP9042-DSWR"], "NSIP93086"),
    # SBC 复合品类: 品类SBC + 总线维度(CAN/LIN)正交共存. "集成can的sbc"应同时约束SBC+CAN-FD，
    # 既能召回 auto 册 CAN SBC，也能召回已修正 section/tag 的 analog 同族；但不能混入 LIN SBC.
    ("集成can的sbc", None, 1, ["TPT11695XFQ", "TPT11693FQ-DFUR"], ["TPT10283Q-DFCR-S"], "TPT11695"),
    ("can sbc", None, 1, ["TPT11693FQ-DFUR-S"], ["TPT10285Q-DFCR-S"], None),
    ("lin sbc", None, 1, ["TPT10283Q-DFCR-S"], ["TPT11695XFQ-DFUR-S"], None),
    # 驱动品类 (2026-06-12 推广, 跨3vendor, vendor=None 全库): 子品类硬约束互斥
    ("隔离栅极驱动", None, 1, ["TPM21520"], ["TPM1020"], None),
    ("非隔离栅极驱动", None, 1, ["TPM1020"], ["TPM21520"], None),
    ("马达驱动", None, 1, ["TPM8837C"], ["TPM21520"], None),
    # 数字隔离器 (2026-06-12 推广, category_hint='隔离', 跨3vendor): must=数字隔离器硬过滤,
    # 隔离放大器(TPA8000等含'隔离'但非数字隔离器)不应混入.
    ("数字隔离器", None, 1, ["TPT7720"], ["TPA8000"], None),
    # 电压基准 (2026-06-20 推广, category_hint='电压基准', vendor=None 全库): 验证品类门控正确,
    # 串联/并联型均召回, 但放大器(带内部参考≠电压基准IC)不混入.
    ("电压基准", None, 1, ["NSREF3140", "TPR31-S"], ["TPA7252", "TPA7252A"], None),
    ("串联型电压基准", None, 1, ["TPR31-S"], [], "TPR31-S"),
    ("并联型电压基准", None, 1, ["TPR431"], [], "TPR431"),
]

# ── 排序意图 case: (查询, vendor, 期望sortKey.param, 期望direction, top1需含, 校验单调) ──
# 验证"高PSRR/低噪声/大电流"类查询的数值排序. monotone=True 时校验返回列表按方向单调.
SORT_CASES = [
    # LDO 专属
    ("高psr的ldo", "3peak-analog", "PSRR", "high", "TPL8033", True),
    ("高psrr的ldo", "3peak-analog", "PSRR", "high", "TPL8033", True),
    ("低压差ldo", "3peak-analog", "Dropout", "low", None, True),
    ("大电流ldo", "3peak-analog", "输出电流", "high", None, True),
    # DCDC: 输出电流(通用) + 开关频率(专属)
    ("大电流dcdc", "3peak-analog", "输出电流", "high", None, True),
    ("高频dcdc", "3peak-analog", "开关频率", "high", None, True),
    # 运放: 带宽(专属高) + 失调(专属低) + 低噪声(通用)
    ("高带宽运放", "3peak-analog", "GBW", "high", None, True),
    ("低失调运放", "3peak-analog", "Vos", "low", None, True),
    ("低噪声运放", "3peak-analog", "噪声", "low", None, True),
    ("低功耗运放", "3peak-analog", "Iq", "low", None, True),
    # 比较器: 低延迟(专属)
    ("低延迟比较器", "3peak-analog", "传播延迟", "low", None, True),
    # ADC/DAC: 高采样率(专属)
    ("高采样率adc", "3peak-analog", "采样率", "high", None, True),
    # 接口: 高速率(专属) + 高ESD(专属)
    ("高速率rs485", "3peak-analog", "数据速率", "high", None, True),
    ("高esd的can", "3peak-analog", "ESD", "high", None, True),
    # 驱动品类排序 (2026-06-12 推广): 大电流→输出电流; 高速→传播延迟
    ("大电流栅极驱动", None, "输出电流", "high", None, True),
    ("高速栅极驱动", None, "传播延迟", "low", None, True),
    # 数字隔离器排序 (2026-06-12 推广): 高速→数据速率(码流), 47/81有值, require过滤无值款
    ("高速数字隔离器", None, "数据速率", "high", None, True),
]

VENDOR_DIVERSITY_CASES = [
    ("栅极驱动", 8, {"3peak", "novosense"}),
]

# ── 负向 case: 品类门控应阻止跨品类误触发. (查询) 期望不触发sortKey ──
# 用"非品类定义词的修饰 + 明确他品类": psr/带宽/采样率/esd 不是任何品类的定义词,
# 加在缺该参数的品类上, 品类门控应阻止 → 不触发(否则 require 把该品类全过滤成空).
# 注: "低压差dcdc"不是有效反例——"低压差"是LDO定义词(Low Dropout), 会把查询规范化成LDO, 属正确行为.
NEG_SORT_CASES = [
    "高psr的dcdc",     # psrr 不应作用于 DCDC
    "高带宽的dcdc",     # GBW 不应作用于 DCDC
    "高采样率的ldo",    # 采样率 不应作用于 LDO
    "高频的运放",       # 开关频率 不应作用于 运放
]

# ── 竞品型号反查(cross_ref) case: (查询, 期望target, 期望命中PN含, 不应误判cross_ref?) ──
# 验证意图识别(含中文连写) + 确定性反查"可替代产品"字段. 数据现实: 仅思瑞浦汽车有对标标注.
CROSS_REF_CASES = [
    ("有没有iso7721的替换", "ISO7721", "TPT7721", False),  # 用户实际查询(中文连写)
    ("iso7721替代", "ISO7721", "TPT7721", False),
    ("INA240替代", "INA240", "TPA132", False),
    ("LM2901替代品", "LM2901", "LM2901A", False),
    ("TJA1145 pin to pin", "TJA1145", "TPT1145", False),
    # 方案A(2026-06-12): 纯型号输入(无替代词)也走反查, 切断LLM脑补
    ("iso7721", "ISO7721", "TPT7721", False),         # 纯型号(非自家PN)
    ("TJA1145", "TJA1145", "TPT1145", False),          # 纯型号(非自家PN)
    # 前缀冲突修复: LM 既是自家又是竞品前缀, 去掉OWN_PREFIX黑名单后带替代词能反查.
    # 注: 纯"lm2901"会精确命中自家PN(库里真有LM2901), 走PN-exact展示该料, 属正确行为不在此测.
]
# 负向: 不应被误判为 cross_ref(纯品类查询/纯规格/带品类意图词的型号查询/协议名)
CROSS_REF_NEG = ["数字隔离器", "2通道隔离器", "4通道运放", "高速can", "高psr的ldo",
                 "类似tja1145的CAN收发器", "tja1145 收发器", "高速率rs485", "rs485收发器"]

def main():
    d = json.load(open(DATA))
    passed=failed=0
    for query, vendor, exp_tier, must_have, must_not, top1 in CASES:
        try:
            r = interpret(query)
        except Exception as e:
            print(f"✗ {query!r}: API错误 {e}"); failed+=1; continue
        must = r.get("must") or []; nice = r.get("nice") or []; meta = r.get("mustMeta") or []
        if not must:
            print(f"✗ {query!r}: must为空(parser未识别品类)"); failed+=1; continue
        # vendor=None → 全库搜(SBC等跨vendor品类); 否则限定单一vendor
        if vendor is None:
            prods = [
                {**p, "__vendor": slug, "__vendorGroup": vendor_group_key(slug)}
                for slug, vd in d.items() if isinstance(vd, dict) and "products" in vd
                for p in vd["products"]
            ]
        else:
            prods = [{**p, "__vendor": vendor, "__vendorGroup": vendor_group_key(vendor)} for p in d[vendor]["products"]]
        tier, items = apply_constraints(prods, must, nice, meta, r.get("sortKey"))
        top_pns = " ".join(s["pn"] for s in items[:20])
        errs=[]
        if tier != exp_tier: errs.append(f"tier{tier}≠期望{exp_tier}")
        for mh in must_have:
            if mh not in top_pns: errs.append(f"缺{mh}")
        for mn in must_not:
            if mn in top_pns: errs.append(f"不应出现{mn}")
        if top1 and items and top1 not in items[0]["pn"]:
            errs.append(f"top1应含{top1}(实际{items[0]['pn']})")
        if errs:
            print(f"✗ {query!r} [{vendor}]: {'; '.join(errs)}")
            print(f"    must={must} meta={[(m['tag'],m['dimension']) for m in meta]} tier{tier} top={top_pns[:80]}")
            failed+=1
        else:
            print(f"✓ {query!r} → tier{tier}, {len(items)}款")
            passed+=1

    # ── 排序意图 case ──
    for query, vendor, exp_param, exp_dir, top1, monotone in SORT_CASES:
        try:
            r = interpret(query)
        except Exception as e:
            print(f"✗ {query!r}: API错误 {e}"); failed+=1; continue
        must = r.get("must") or []; nice = r.get("nice") or []; meta = r.get("mustMeta") or []
        sk = r.get("sortKey")
        errs=[]
        if not sk:
            print(f"✗ {query!r}: 无sortKey(SORT_RULES未命中)"); failed+=1; continue
        if sk.get("param") != exp_param: errs.append(f"param={sk.get('param')}≠{exp_param}")
        if sk.get("direction") != exp_dir: errs.append(f"direction={sk.get('direction')}≠{exp_dir}")
        # vendor=None → 全库搜(驱动等跨vendor品类); 否则限定单一vendor
        if vendor is None:
            prods = [
                {**p, "__vendor": slug, "__vendorGroup": vendor_group_key(slug)}
                for slug, vd in d.items() if isinstance(vd, dict) and "products" in vd
                for p in vd["products"]
            ]
        else:
            prods = [{**p, "__vendor": vendor, "__vendorGroup": vendor_group_key(vendor)} for p in d[vendor]["products"]]
        tier, items = apply_constraints(prods, must, nice, meta, sk)
        vals = [sort_value(s["p"], sk["paramKeys"], sk["direction"], sk.get("param")) for s in items]
        # require模式: 不应有None值进入结果
        if sk.get("require") and any(v is None for v in vals):
            errs.append("require模式残留无数值产品")
        if monotone and len(vals) > 1:
            nv = [v for v in vals if v is not None]
            ok = all(nv[i] >= nv[i+1] for i in range(len(nv)-1)) if exp_dir=="high" \
                 else all(nv[i] <= nv[i+1] for i in range(len(nv)-1))
            if not ok: errs.append(f"非单调({exp_dir}): {nv[:6]}")
        if top1 and items and top1 not in items[0]["pn"]:
            errs.append(f"top1应含{top1}(实际{items[0]['pn']})")
        if errs:
            print(f"✗ {query!r} [sort]: {'; '.join(errs)}")
            failed+=1
        else:
            print(f"✓ {query!r} → {sk['label']}, {len(items)}款 (top={items[0]['pn'] if items else '—'})")
            passed+=1

    for query, topn, want_vendors in VENDOR_DIVERSITY_CASES:
        try:
            r = interpret(query)
        except Exception as e:
            print(f"✗ {query!r}: API错误 {e}"); failed+=1; continue
        must = r.get("must") or []; nice = r.get("nice") or []; meta = r.get("mustMeta") or []
        prods = [
            {**p, "__vendor": slug, "__vendorGroup": vendor_group_key(slug)}
            for slug, vd in d.items() if isinstance(vd, dict) and "products" in vd
            for p in vd["products"]
        ]
        tier, items = apply_constraints(prods, must, nice, meta)
        top = items[:topn]
        seen = {s["p"].get("__vendorGroup") for s in top}
        if not want_vendors.issubset(seen):
            print(f"✗ {query!r} [vendor]: top{topn} 缺少 vendor 多样性, seen={sorted(seen)}")
            failed += 1
        else:
            print(f"✓ {query!r} [vendor] → top{topn} 含 {sorted(seen)}")
            passed += 1

    # ── 负向 case: 品类门控应阻止跨品类误触发 ──
    for query in NEG_SORT_CASES:
        try:
            r = interpret(query)
        except Exception as e:
            print(f"✗ {query!r}: API错误 {e}"); failed+=1; continue
        sk = r.get("sortKey")
        if sk:
            print(f"✗ {query!r} [neg]: 不应触发sortKey却得到 {sk.get('param')}(品类门控失效)")
            failed+=1
        else:
            print(f"✓ {query!r} [neg] → 品类门控正确阻止, 无误触发sortKey")
            passed+=1

    # ── 竞品型号反查(cross_ref) 测试 ──
    allp = [p for vd in d.values() if isinstance(vd, dict) and "products" in vd for p in vd["products"]]
    def _extract_alt(p):
        for seg in (p.get("_params","") or "").split("|"):
            s=seg.strip()
            if s.startswith("可替代产品") or s.startswith("可替代") or s.startswith("替代产品"):
                m=re.search(r"[:：]",s)
                if m: return s[m.end():].strip()
        return ""
    def _cross_ref_search(target):
        tgt=target.upper().strip(); hits=[]
        for p in allp:
            alt=_extract_alt(p)
            if not alt: continue
            toks=[t.strip() for t in re.split(r"[/,，、;；\s]+",alt.upper()) if t.strip()]
            for at in toks:
                if at==tgt or ((at.startswith(tgt) or tgt.startswith(at)) and min(len(at),len(tgt))>=4):
                    hits.append(p.get("part_number","")); break
        return hits
    for query, exp_target, hit_pn, _ in CROSS_REF_CASES:
        try:
            r = interpret(query)
        except Exception as e:
            print(f"✗ {query!r}: API错误 {e}"); failed+=1; continue
        errs=[]
        if r.get("intent") != "cross_ref": errs.append(f"intent={r.get('intent')}≠cross_ref")
        if (r.get("crossRefTarget") or "").upper() != exp_target: errs.append(f"target={r.get('crossRefTarget')}≠{exp_target}")
        hits=_cross_ref_search(exp_target)
        if not any(hit_pn in h for h in hits): errs.append(f"反查无命中含{hit_pn}(得{hits[:3]})")
        if errs:
            print(f"✗ {query!r} [xref]: {'; '.join(errs)}"); failed+=1
        else:
            print(f"✓ {query!r} → cross_ref({exp_target}), 反查{len(hits)}款含{hit_pn}"); passed+=1
    for query in CROSS_REF_NEG:
        try:
            r = interpret(query)
        except Exception as e:
            print(f"✗ {query!r}: API错误 {e}"); failed+=1; continue
        if r.get("intent") == "cross_ref":
            print(f"✗ {query!r} [xref-neg]: 误判为cross_ref(target={r.get('crossRefTarget')})"); failed+=1
        else:
            print(f"✓ {query!r} [xref-neg] → 正确未误判cross_ref"); passed+=1

    print(f"\n{'='*50}\n通过 {passed}/{passed+failed}")
    sys.exit(0 if failed==0 else 1)

if __name__ == "__main__":
    main()

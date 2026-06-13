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

def interpret(query):
    req = urllib.request.Request(f"{BASE}/api/interpret",
        data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())

# ── 复刻 constraint-match.ts 维度感知逻辑(保持与前端同步) ──
def _unit(family): return "口" if family == "端口" else "通道"

def tag_satisfied(p, tag, meta=None):
    toks = (p.get("_features","") or "").lower().split()
    t = tag.lower()
    # 端口/通道向下兼容: ≥N
    if meta and meta.get("downgradable") and meta.get("value") is not None and meta.get("family") in ("端口","通道"):
        u = _unit(meta["family"])
        for tk in toks:
            m = re.match(rf'^(\d+){u}', tk)
            if m and int(m.group(1)) >= meta["value"]: return True
        return False
    pm = re.match(r'^(\d+)口$', t)
    if pm:
        for tk in toks:
            m = re.match(r'^(\d+)口', tk)
            if m and m.group(1) == pm.group(1): return True
        return False
    return any(tk==t or t in tk for tk in toks)

def exact_spec(p, meta):
    if meta.get("value") is None or meta.get("family") not in ("端口","通道"): return False
    u = _unit(meta["family"])
    for tk in (p.get("_features","") or "").lower().split():
        m = re.match(rf'^(\d+){u}', tk)
        if m and int(m.group(1)) == meta["value"]: return True
    return False

def align_meta(must, meta):
    bytag = {m["tag"]: m for m in (meta or [])}
    return [bytag.get(t, {"tag": t, "dimension": "category"}) for t in must]

def sort_value(p, paramKeys, direction):
    pn = p.get("_params_numeric", {}) or {}
    best = None
    for k, v in pn.items():
        if not any(pk in k.lower() for pk in paramKeys): continue
        num = None
        if isinstance(v, dict):
            if isinstance(v.get("value"), (int, float)): num = v["value"]
            elif isinstance(v.get("max"), (int, float)): num = v["max"]
        if num is None: continue
        best = num if best is None else (max(best, num) if direction == "high" else min(best, num))
    return best

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
        pool = arr
        if sortKey.get("require"):
            pool = [s for s in arr if sort_value(s["p"], sortKey["paramKeys"], sortKey["direction"]) is not None]
        d = sortKey["direction"]
        def key(s):
            v = sort_value(s["p"], sortKey["paramKeys"], d)
            v = (float("-inf") if d=="high" else float("inf")) if v is None else v
            return (-v if d=="high" else v, -s["eb"], -len(s["nh"]), -s["score"])
        return sorted(pool, key=key)

    full = [s for s in scored if s["full"]]
    if full:
        if sortKey:
            sf = _apply_sort(full)
            if sf: return 1, sf
        else:
            full.sort(key=lambda x:(-x["eb"],-len(x["nh"]),-x["score"]))
            return 1, full
    hardok = [s for s in scored if hard and all(t in s["hit"] for t in hard)]
    if hardok:
        # 规格超限检测
        for mt in metas:
            if not mt.get("downgradable") or mt.get("value") is None or mt.get("family") not in ("端口","通道"): continue
            u = _unit(mt["family"]); mx = 0
            pmap = {p["part_number"]: p for p in prods}
            for s in hardok:
                for tk in (pmap[s["pn"]].get("_features","") or "").lower().split():
                    m = re.match(rf'^(\d+){u}', tk)
                    if m: mx = max(mx, int(m.group(1)))
            if 0 < mx < mt["value"]:
                def _at_max(pn):
                    for tk in (pmap[pn].get("_features","") or "").lower().split():
                        mm = re.match(rf'^(\d+){u}', tk)
                        if mm and int(mm.group(1)) == mx: return True
                    return False
                atmax = [s for s in hardok if _at_max(s["pn"])][:5]
                return 2, atmax  # 超限: 展示库存上限产品
        hardok.sort(key=lambda x:(len(x["miss"]),-x["eb"],-len(x["nh"]),-x["score"]))
        return 2, hardok[:8]
    any_ = sorted([s for s in scored if s["hit"]], key=lambda x:-x["score"])[:5]
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
    ("千兆网卡", "yutai", 1, ["YT6801"], ["YT8511H"], None),
    # 同义词归一: 车载=车规=车用, top1都是5口精确
    ("车载五口交换机", "yutai", 1, ["YT9215"], [], "YT9215"),
    ("车规五口交换机", "yutai", 1, ["YT9215"], [], "YT9215"),
    ("车用5口交换机", "yutai", 1, ["YT9215"], [], "YT9215"),
    # 语义歧义: 泛"车载以太网"=车规交换机(非T1); 明确"t1"才是T1物理层
    ("车载以太网交换机", "yutai", 1, ["YT9215"], ["YT8010A"], None),
    ("车载t1 phy", "yutai", 1, ["YT8010A"], ["YT9215"], None),
    # 规格超限(选项B): 要9/11口但库存最多8口 → tier2展示8口上限产品
    ("车规9口交换机", "yutai", 2, ["YT9218"], ["YT9215RB"], None),
    ("车规11口交换机", "yutai", 2, ["YT9218"], [], None),
    # 思瑞浦模拟多品类
    ("4通道运放", "3peak-analog", 1, ["LM324A"], [], None),
    ("比较器", "3peak-analog", 1, [], [], None),
    ("5A DCDC 3.3V输出", "3peak-analog", 1, ["TPP366090"], [], None),
    ("低压LDO 3.3V", "3peak-analog", 1, [], [], None),
    ("16位ADC", "3peak-analog", 1, [], [], None),
    ("RS-485收发器 10Mbps", "3peak-analog", 1, [], [], None),
    # SBC 复合品类: 品类SBC + 总线维度(CAN/LIN)正交共存. "集成can的sbc"应同时约束SBC+CAN-FD,
    # 只返回真正的CAN SBC(section=SBC), 不混入RS-485 SBC/LIN SBC. 单查"sbc"则返回全部SBC.
    ("集成can的sbc", None, 1, ["TPT11695XFQ-DFUR-S"], ["TPT10283Q-DFCR-S", "TPT11693Q "], None),
    ("can sbc", None, 1, ["TPT11693FQ-DFUR-S"], ["TPT10285Q-DFCR-S"], None),
    ("lin sbc", None, 1, ["TPT10283Q-DFCR-S"], ["TPT11695XFQ-DFUR-S"], None),
    # 驱动品类 (2026-06-12 推广, 跨3vendor, vendor=None 全库): 子品类硬约束互斥
    ("隔离栅极驱动", None, 1, ["TPM21520"], ["TPM1020"], None),
    ("非隔离栅极驱动", None, 1, ["TPM1020"], ["TPM21520"], None),
    ("马达驱动", None, 1, ["TPM8837C"], ["TPM21520"], None),
    # 数字隔离器 (2026-06-12 推广, category_hint='隔离', 跨3vendor): must=数字隔离器硬过滤,
    # 隔离放大器(TPA8000等含'隔离'但非数字隔离器)不应混入.
    ("数字隔离器", None, 1, ["TPT7720"], ["TPA8000"], None),
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
            prods = [p for vd in d.values() if isinstance(vd, dict) and "products" in vd for p in vd["products"]]
        else:
            prods = d[vendor]["products"]
        tier, items = apply_constraints(prods, must, nice, meta)
        top_pns = " ".join(s["pn"] for s in items[:8])
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
            prods = [p for vd in d.values() if isinstance(vd, dict) and "products" in vd for p in vd["products"]]
        else:
            prods = d[vendor]["products"]
        tier, items = apply_constraints(prods, must, nice, meta, sk)
        vals = [sort_value(s["p"], sk["paramKeys"], sk["direction"]) for s in items]
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

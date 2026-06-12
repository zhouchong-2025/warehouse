#!/usr/bin/env python3
"""
extract_coord.py — 坐标法提取器(P0重构)

原理: pymupdf get_text("dict") 的 span 带 bbox 坐标。
  列 = x 中心稳定的竖带; 行 = y 相近的一组 span。
  按几何位置二维重建, 而非依赖文本流顺序(碎片化根源)。

为什么不用 extract_v3/v4/v5:
  - v4 merge_headers 黑名单 if 链, 表头碎片化(30%错)
  - v5 用 get_text('words')+左边界x0聚类+列数门控 → 三重失效(详见 wiki/P0_COORD_EXTRACTION_PROTOTYPE.md §4.5)
  本脚本: get_text('dict') span + 中心cx聚类 + 无门控全量坐标法。

验证: 比较器/高压运放/低压LDO/数字隔离器 4个section全通过(11~20列)。

用法:
  python3 scripts/extract_coord.py --pdf raw/xxx.pdf --dry-run          # 只看section→列名总表
  python3 scripts/extract_coord.py --pdf raw/xxx.pdf --vendor 3peak-analog  # 写入数据库
"""
import re, json, argparse, os
from collections import defaultdict, Counter

try:
    import pymupdf
except ImportError:
    import fitz as pymupdf

# ─── 常量 ───
PN_PAT = re.compile(r'^(?=(.*[A-Z]){2,})[A-Z0-9]{3,}\d[\w\-]*$')
ANCHORS = {"Part Number", "WPN"}     # 表头第一列锚点(验证发现 WPN 也是锚点)
LEFTMOST_X = 170                      # PN列右边界
COL_TOL = 8                           # 列聚类容差(px)
ROW_BIN = 6                           # 行分箱(px)
HDR_LOOKUP = 15                       # 表头带向上扩展
GRADE_AUTO = ('automotive', 'q100')   # 车规判定关键词

# 非产品行的 PN 误判过滤(封装名等)
PKG_HINT = re.compile(r'^(SOP|SOT|TSSOP|MSOP|QFN|DFN|WSOP|TQFP|LQFP|BGA|CSP|WLCSP|ESOP|VSON|DFN\d)', re.I)

# 页眉/页脚噪声(混入数据行需剔除)
NOISE_TXT = {"Analog", "Selection", "Guide", "Analog Selection Guide"}
NOISE_RE = re.compile(r'Analog\s+Selection\s+Guide', re.I)
AUTO_NOISE = re.compile(r'3PEAK\s+INCORPORATED|All\s+Rights\s+Reserved|www\.3peak\.com|^\d+$')


def _denoise(t):
    """剔除页眉页脚噪声文本"""
    t = NOISE_RE.sub("", t).strip()
    return t


def _spans(pg):
    out = []
    for blk in pg.get_text("dict")["blocks"]:
        if blk.get("type") != 0:
            continue
        for line in blk["lines"]:
            for sp in line["spans"]:
                t = sp["text"].strip()
                if not t:
                    continue
                t = _denoise(t)
                if not t:
                    continue
                x0, y0, x1, y1 = sp["bbox"]
                out.append({"t": t, "x0": x0, "x1": x1, "cx": (x0 + x1) / 2, "y": y0})
    return out


def _find_anchors(spans):
    """返回所有表头锚点(Part Number/WPN且在最左列), 按y排序 → 每个=一张表"""
    return sorted(
        [s for s in spans if s["t"] in ANCHORS and s["x0"] < LEFTMOST_X],
        key=lambda s: s["y"]
    )


def _build_columns(hdr_spans):
    """表头span按中心cx聚类成列, 同列多行碎片按y拼接成完整列名"""
    hdr_spans = sorted(hdr_spans, key=lambda s: s["x0"])
    cols = []
    for s in hdr_spans:
        placed = False
        for c in cols:
            if c["x0"] - COL_TOL <= s["cx"] <= c["x1"] + COL_TOL:
                c["frags"].append((s["y"], s["t"]))
                c["x0"] = min(c["x0"], s["x0"])
                c["x1"] = max(c["x1"], s["x1"])
                placed = True
                break
        if not placed:
            cols.append({"x0": s["x0"], "x1": s["x1"], "frags": [(s["y"], s["t"])]})
    cols.sort(key=lambda c: c["x0"])
    names = [" ".join(t for _, t in sorted(c["frags"])) for c in cols]
    centers = [(c["x0"] + c["x1"]) / 2 for c in cols]
    return names, centers


def _section_titles_on_page(spans, leaf_norms):
    """页面物理出现的TOC section标题, 返回[(y, title)]按y排序"""
    out = []
    for s in spans:
        if s["x0"] < 250 and re.search(r'[\u4e00-\u9fff]', s["t"]):
            nt = _norm(s["t"])
            for lt, ltn in leaf_norms:
                if nt == ltn or (len(nt) > 6 and nt in ltn) or (len(ltn) > 6 and ltn in nt):
                    out.append((s["y"], lt))
                    break
    return sorted(out)


def _norm(s):
    return re.sub(r'\s+', '', s).lower()


def _section_for_row(row_y, page_titles, carry_section):
    """行级section归属: 取该行上方最近的section标题; 若本页该行上方无标题, 用上页延续的carry"""
    above = [(y, t) for y, t in page_titles if y <= row_y + 5]
    if above:
        return above[-1][1]
    return carry_section


def extract_table(spans, anchor, next_anchor_y):
    """提取单张表(从anchor到next_anchor_y之间)"""
    pn_hdr_y = anchor["y"]
    # 数据行起点: anchor下方第一个最左列PN
    upper = next_anchor_y if next_anchor_y else 1e9
    data_ys = sorted({round(s["y"], 0) for s in spans
                      if PN_PAT.match(s["t"]) and pn_hdr_y + 8 < s["y"] < upper
                      and s["x0"] < LEFTMOST_X and not PKG_HINT.match(s["t"])})
    if not data_ys:
        return None
    first_data_y = data_ys[0]

    hdr = [s for s in spans if pn_hdr_y - HDR_LOOKUP <= s["y"] < first_data_y - 5]
    if not hdr:
        return None
    names, centers = _build_columns(hdr)
    if len(names) < 3:
        return None

    # 数据span: first_data_y 到 next_anchor_y
    data = [s for s in spans if first_data_y - 2 <= s["y"] < upper]
    rows = defaultdict(list)
    for s in data:
        rows[round(s["y"] / ROW_BIN) * ROW_BIN].append(s)

    products = []
    for ry in sorted(rows):
        cells = rows[ry]
        pncell = [c for c in cells if c["x0"] < LEFTMOST_X and PN_PAT.match(c["t"]) and not PKG_HINT.match(c["t"])]
        if not pncell:
            continue
        pn = pncell[0]["t"]
        pn = pn.rstrip('-')  # 处理类似TP1561A-被换行截断的PN
        row_vals = {i: [] for i in range(len(names))}
        for c in cells:
            i = min(range(len(centers)), key=lambda k: abs(centers[k] - c["cx"]))
            row_vals[i].append((c["x0"], c["t"]))
        params = [(names[i], " ".join(t for _, t in sorted(row_vals[i]))) for i in range(len(names))]
        products.append((ry, pn, params))   # ry = 行y, 供行级section归属
    return names, products


def extract(pdf_path):
    doc = pymupdf.open(pdf_path)
    all_products = {}
    section_columns = defaultdict(list)   # section → 列名(可能多套, 取首套)

    # TOC 权威 section 清单(leaf level>=3)
    toc = doc.get_toc()
    leaf_norms = [(t, _norm(t)) for lvl, t, p in toc if lvl >= 3]

    carry_section = ""   # 跨页延续的 section(上页表尾延续到本页)
    for pg_idx in range(len(doc)):
        pg = doc[pg_idx]
        spans = _spans(pg)
        anchors = _find_anchors(spans)
        if not anchors:
            continue
        page_titles = _section_titles_on_page(spans, leaf_norms)
        for ai, anchor in enumerate(anchors):
            next_y = anchors[ai + 1]["y"] if ai + 1 < len(anchors) else None
            res = extract_table(spans, anchor, next_y)
            if not res:
                continue
            names, prods = res
            for ry, pn, params in prods:
                # 行级 section 归属: 该行上方最近的TOC标题, 否则延续carry
                sec = _section_for_row(ry, page_titles, carry_section)
                if not sec:
                    sec = f"page{pg_idx+1}_table{ai+1}"
                carry_section = sec   # 更新延续状态
                if names not in section_columns[sec]:
                    section_columns[sec].append(names)

                raw_vals = [v for _, v in params]
                params_str = " | ".join(f"{k}: {v}" for k, v in params if v.strip())

                if pn in all_products:
                    # 多重分类: 同一颗芯片出现在多个section → 累加section标签
                    rec = all_products[pn]
                    if sec not in rec["_sections"]:
                        rec["_sections"].append(sec)
                        # _features 累加新分类(供搜索/标签命中所有品类)
                        if sec not in rec["_features"]:
                            rec["_features"] += f" {sec}"
                    # 参数取更完整的一份(列数多者), 不同则保留首份(罕见, 交叉上市参数通常一致)
                    if len(params_str) > len(rec["_params"]):
                        rec["_params"] = params_str
                        rec["_raw"] = " | ".join(raw_vals)
                    continue

                grade_txt = " ".join(raw_vals).lower()
                grade = "车规AEC-Q100" if any(g in grade_txt for g in GRADE_AUTO) else "工业级"
                all_products[pn] = {
                    "part_number": pn,
                    "_section": sec,           # 主分类(首个), 向后兼容前端
                    "_sections": [sec],        # 多重分类标签
                    "_params": params_str,
                    "_raw": " | ".join(raw_vals),
                    "_features": f"{grade} {sec}",
                }
    # section_columns: 每个section取第一套列名(供审核)
    seccols = {sec: cols_list[0] for sec, cols_list in section_columns.items()}
    return all_products, seccols


def extract_auto(pdf_path):
    """思瑞浦-汽车提取: 行优先, 7列单行中文表头, 无碎片"""
    doc = pymupdf.open(pdf_path)
    all_products = {}
    section_columns = defaultdict(list)
    
    # 锚点: "产品型号"
    ANCHOR_TXT = "产品型号"
    CATEGORY_X0 = 80       # 产品类别列右边界 (x0≈46)
    
    PN_CHAR = re.compile(r'[A-Z]')  # PN必须包含大写字母(过滤中文分类行)
    
    for pg_idx in range(len(doc)):
        pg = doc[pg_idx]
        spans = _spans(pg)
        
        # 找锚点
        anchors = [s for s in spans if s["t"] == ANCHOR_TXT]
        if not anchors:
            continue
        anchor = anchors[0]
        hdr_y = anchor["y"]
        
        # 确定列中心(从表头行)
        hdr_spans = [s for s in spans 
                     if abs(s["y"] - hdr_y) < ROW_BIN 
                     and s["x0"] > CATEGORY_X0]  # 排除产品类别(不在表头行)
        hdr_spans.sort(key=lambda s: s["x0"])
        
        # 构建列中心: 产品类别(固定在最左) + 表头的6列
        centers = [50.0]  # 产品类别列中心 (x0≈46)
        hdr_names = ["产品类别"]
        for s in hdr_spans:
            centers.append(s["cx"])
            hdr_names.append(s["t"])
        
        # 确保有7列
        if len(centers) < 7:
            continue
        
        # 数据行: 表头以下的所有span
        data_spans = [s for s in spans if s["y"] > hdr_y + ROW_BIN]
        
        # 按行分组
        rows = defaultdict(list)
        for s in data_spans:
            rows[round(s["y"] / ROW_BIN) * ROW_BIN].append(s)
        
        for ry in sorted(rows):
            cells = rows[ry]
            
            # 按列分配
            row_vals = {i: [] for i in range(len(hdr_names))}
            for c in cells:
                i = min(range(len(centers)), key=lambda k: abs(centers[k] - c["cx"]))
                if i < len(hdr_names):
                    row_vals[i].append(c["t"])
            
            # 组装各列值
            col_vals = [" ".join(row_vals[i]) for i in range(len(hdr_names))]
            pn_val = col_vals[1].strip()
            category_val = col_vals[0].strip()
            
            # 判断行类型: 必须有PN(含大写字母)才算产品行
            has_pn = bool(pn_val and PN_CHAR.search(pn_val))
            
            if not has_pn:
                # 分类头行(如"放大器和特殊功能电路")或空行, 跳过
                continue
            
            # 产品行: section = 产品类别列的值
            section_name = category_val if category_val else "Unknown"
            
            # 过滤噪声行(页脚版权等)
            if AUTO_NOISE.search(pn_val):
                continue
            
            params = list(zip(hdr_names, col_vals))
            params_str = " | ".join(f"{k}: {v}" for k, v in params if v.strip())
            raw_vals = col_vals
            
            # 汽车册全部为车规
            grade = "车规AEC-Q100"
            
            if pn_val in all_products:
                rec = all_products[pn_val]
                if section_name not in rec["_sections"]:
                    rec["_sections"].append(section_name)
                    if section_name not in rec["_features"]:
                        rec["_features"] += f" {section_name}"
                if len(params_str) > len(rec["_params"]):
                    rec["_params"] = params_str
                    rec["_raw"] = " | ".join(raw_vals)
                continue
            
            all_products[pn_val] = {
                "part_number": pn_val,
                "_section": section_name,
                "_sections": [section_name],
                "_params": params_str,
                "_raw": " | ".join(raw_vals),
                "_features": f"{grade} {section_name}",
            }
    
    # section_columns
    for pn, p in all_products.items():
        sec = p["_section"]
        cols_from_params = [k for k, v in zip(hdr_names, 
            p["_params"].split(" | "))] if p["_params"] else hdr_names
        if cols_from_params not in section_columns[sec]:
            section_columns[sec].append(cols_from_params)
    
    seccols = {sec: cols_list[0] for sec, cols_list in section_columns.items()}
    return all_products, seccols


def extract_yutai(pdf_path):
    """裕太提取: 单页超宽表, 中文单行表头, 按section分块, Note可能跨行"""
    doc = pymupdf.open(pdf_path)
    pg = doc[0]
    spans = _spans(pg)
    
    all_products = {}
    section_columns = defaultdict(list)
    
    PN_YT = re.compile(r'^(YT|SZ)\d')  # YT或SZ开头+数字
    YT_LEFTMOST = 80
    # 封装码识别(用于非80系列第一列 简介+封装 拆分)
    # 主体: (DR)QFN/LQFP + 数字; 后缀: 可选的 /数字(多封装) 与 -E/_E/-VB 等版本码
    _YT_PKG = re.compile(r'((?:DRQFN|LQFP|QFN)[-_]?\d+(?:[/-]\d+)*(?:[-_][A-Za-z]+\d*)?)', re.I)
    
    # 用"封装"作锚点(每个section都出现)
    PKG_ANCHOR = "封装"
    pkg_anchors = [(s["y"], s["x0"], s["cx"]) for s in spans if s["t"] == PKG_ANCHOR]
    
    # 列头识别名(含变体)
    HDR_TEXTS = {"简介", "封装", "制程", "状态", "工作环境温度", "端口", "接口", "扩展接口", "Note"}
    
    for hi, (hdr_y, hdr_x0, hdr_cx) in enumerate(pkg_anchors):
        # 收集该列头行的所有span(仅取已知列头名)
        hdr_spans = [s for s in spans 
                     if abs(s["y"] - hdr_y) < 3
                     and s["t"] in HDR_TEXTS]
        hdr_spans.sort(key=lambda s: s["x0"])
        
        # 确定表头是否含"简介"(只有第一个section有)
        has_intro = any(s["t"] == "简介" for s in hdr_spans)
        
        # 构建列: PN(隐式) + 数据列
        centers = [65.0]
        hdr_names = ["产品型号"]
        for s in hdr_spans:
            centers.append(s["cx"])
            hdr_names.append(s["t"])
        
        if len(centers) < 6:
            continue
        
        # 确定数据y范围
        next_y = pkg_anchors[hi+1][0] if hi+1 < len(pkg_anchors) else 1e9
        
        data_spans = [s for s in spans 
                      if hdr_y + 3 < s["y"] < next_y - 3
                      and s["x0"] > 30]
        
        # Section名: 仅取列头行最左侧的非列头span
        section_spans = [s for s in spans 
                         if abs(s["y"] - hdr_y) < 3
                         and s["x0"] < 65
                         and s["t"] not in HDR_TEXTS]
        section_parts = [s["t"] for s in sorted(section_spans, key=lambda s: s["y"])]
        section_name = " ".join(section_parts).strip()
        if not section_name:
            section_name = f"section_{hi}"
        
        # 按行分组(裕太行间距紧, 用4px)
        YT_ROW_BIN = 4
        rows = defaultdict(list)
        for s in data_spans:
            rows[round(s["y"] / YT_ROW_BIN) * YT_ROW_BIN].append(s)
        
        # 找PN行: 直接从data_spans找PN cell, 用原始y(不分桶, 裕太行距仅3px)
        pn_rows = []
        for s in data_spans:
            if s["x0"] < YT_LEFTMOST and PN_YT.match(s["t"]):
                pn_rows.append((s["y"], s["t"]))
        pn_rows.sort()

        # 对每个PN行, 收集该产品的所有span(按最近PN行y归属, 防止相邻行串值)
        pn_ys = [ry for ry, _ in pn_rows]
        for ri, (ry, pn) in enumerate(pn_rows):
            prev_pn_ry = pn_rows[ri-1][0] if ri > 0 else -1e9
            next_pn_ry = pn_rows[ri+1][0] if ri+1 < len(pn_rows) else 1e9
            # 边界取与上/下PN行的中点, 每个span归属最近的PN行
            lower = (prev_pn_ry + ry) / 2 if prev_pn_ry > -1e9 else ry - 3
            upper = (ry + next_pn_ry) / 2 if next_pn_ry < 1e9 else next_pn_ry

            prod_spans = [s for s in data_spans
                         if lower <= s["y"] < upper]
            
            # 按列分配
            col_vals = defaultdict(list)
            for c in prod_spans:
                i = min(range(len(centers)), key=lambda k: abs(centers[k] - c["cx"]))
                if i < len(hdr_names):
                    col_vals[i].append((c["y"], c["t"]))
            
            # 每列值按y排序拼接
            vals = []
            for i in range(len(hdr_names)):
                parts = [t for _, t in sorted(col_vals[i])]
                vals.append(" ".join(parts))
            
            # 跳过PN列自身(PN已在pn中)
            params = list(zip(hdr_names[1:], vals[1:]))  # 跳过"产品型号"
            # ── 非80系列无独立"简介"列: 第一数据列含 简介+封装码 ──
            # 封装码位置不固定: 88系列码在末尾(简介 码), 68系列码在开头(码 简介).
            # 故取封装码"匹配区间之外"的全部文字作简介(对两种顺序都成立), 不假设前后.
            if not has_intro and params:
                first_key, first_val = params[0]
                if first_key == "封装" and first_val.strip():
                    mpkg = _YT_PKG.search(first_val)
                    if mpkg:
                        pkg_part = mpkg.group(1).strip()
                        # 简介 = 封装码前缀 + 封装码后缀, 拼接后去多余空格
                        intro_part = (first_val[:mpkg.start()] + " " + first_val[mpkg.end():]).strip()
                        intro_part = re.sub(r'\s+', ' ', intro_part)
                        # 重建: 简介在前, 封装替换原值
                        params = [("简介", intro_part), ("封装", pkg_part)] + params[1:]
            params_str = " | ".join(f"{k}: {v}" for k, v in params if v.strip())
            raw_vals = [v for _, v in params]

            # 去重(同PN, 不同section)
            if pn in all_products:
                rec = all_products[pn]
                if section_name not in rec["_sections"]:
                    rec["_sections"].append(section_name)
                if len(params_str) > len(rec["_params"]):
                    rec["_params"] = params_str
                    rec["_raw"] = " | ".join(raw_vals)
                continue

            all_products[pn] = {
                "part_number": pn,
                "_section": section_name,
                "_sections": [section_name],
                "_params": params_str,
                "_raw": " | ".join(raw_vals),
                "_features": f"工业级 {section_name}",
            }
    
    # 速度标签 + 车规检测
    def _field(params_str, key):
        """从 _params 取指定列的值(lower)"""
        for part in params_str.split(" | "):
            if part.startswith(key + ": "):
                return part[len(key)+2:].strip().lower()
        return ""

    for pn, p in all_products.items():
        params_lower = p["_params"].lower()
        sec = p["_section"]
        feats = set(p["_features"].split())
        # 清除初始化时硬编码的"工业级"占位; 等级一律由简介/温度重新判定(零假阳性) ──
        feats.discard('工业级')
        feats.discard('消费级')
        # ── 车规检测: section名含车规/车载, 或 Note/简介含 AEC-Q100/Automotive(FAE确认) ──
        note_intro = _field(p["_params"], "Note") + " " + _field(p["_params"], "简介")
        is_auto = ('车规' in sec or '车载' in sec
                   or 'aec-q100' in note_intro or 'aec q100' in note_intro
                   or 'automotive' in note_intro)
        if is_auto:
            feats.add('车规AEC-Q100')
        else:
            # ── 等级判定(FAE规则): 简介明确词优先, 否则用温度起始点, 都无则留空不默认 ──
            intro_l = _field(p["_params"], "简介")
            if '消费级' in intro_l:
                feats.add('消费级')
            elif '工业级' in intro_l:
                feats.add('工业级')
            else:
                temp_l = _field(p["_params"], "工作环境温度")
                # 起始温度: 支持 -40°C / -40℃ / 0°C 等(半角全角)
                mt = re.search(r'(-?\d+)\s*[°℃c]', temp_l)
                if mt:
                    start = int(mt.group(1))
                    if start <= -40:
                        feats.add('工业级')
                    elif start >= 0:
                        feats.add('消费级')
                # 温度也无法解析 → 等级留空, 不默认
        # 去裸section名(已在_section中)
        feats.discard(sec)
        # ── 端口数: 优先从"端口"列, 否则"简介"列。正确处理 N*xGE / NGE / N口 格式 ──
        port_field = _field(p["_params"], "端口") or _field(p["_params"], "简介")
        def _port_count(text):
            # "N口"字面优先
            m = re.search(r'(\d+)口', text)
            if m: return int(m.group(1))
            # "N*x.xGE/FE" = N口(N路, 每路x.xG)
            m = re.search(r'(\d+)\s*\*\s*[\d.]+\s*[gf]e', text)
            if m: return int(m.group(1))
            m = re.search(r'(\d+)\s*\*\s*[gf]e', text)
            if m: return int(m.group(1))
            # "NGE/NFE"(N紧跟, 非小数) = N口; 取最大(防多列同值)
            cands = [int(x) for x in re.findall(r'(?<![\d.])(\d+)\s*[gf]e', text)]
            return max(cands, default=0)
        port_count = _port_count(port_field)
        if port_count > 0:
            feats.add(f'{port_count}口交换机' if ('交换' in sec and port_count > 1) else f'{port_count}口')
        # 接口类型
        port_text = params_lower
        iface_tags = []
        for kw, tag in [('rgmii','RGMII'),('sgmii','SGMII'),('qsgmii','QSGMII'),
                         ('mii','MII'),('rmii','RMII'),('pcie','PCIE'),
                         ('serdes','Serdes'),('usxgmii','USXGMII')]:
            if kw in port_text:
                iface_tags.append(tag)
        for t in iface_tags:
            feats.add(t)
        # 品类标签(子品类独立打标, 与查询层must/nice对齐)
        # 网卡判据(FAE领域知识): 网卡=带PCIe主机接口的完整网络适配器, 区别于纯PHY物理层收发器.
        # 只认明确的"网卡"字样, 不用'nic'子串(会误匹配electronic等), 不把PHY当网卡.
        sec_l = sec.lower()
        intro_l = _field(p["_params"], "简介")
        if '交换' in sec or '交换' in intro_l or 'switch' in port_text:
            feats.add('交换机')
            feats.add('以太网')
        if '网卡' in sec or '网卡' in intro_l or '网络适配器' in intro_l:
            feats.add('网卡')
            feats.add('以太网')
        if 'phy' in port_text:
            feats.add('以太网')
        # 速度标签
        if any(kw in params_lower for kw in ['100base-t1','100base-tx','100fx','fe phy','百兆','10base-t1l']):
            feats.add('百兆')
        if any(kw in params_lower for kw in ['1000base-t1','ge phy','千兆','1ge','2.5g','gcombo','4gcombo','2.5gcombo']):
            feats.add('千兆')
        if '2.5g' in params_lower or '2500base' in params_lower:
            feats.add('2.5G')
        # ── 物理层介质接口(按datasheet原文+IEEE领域知识打标) ──
        # T1(100Base-T1/1000Base-T1)=车载单对线, 是替代TX的独立物理层, 不叠加TX
        # FE PHY 默认含100Base-TX基础物理层(IEEE 802.3); 100FX是在此之上的叠加光纤能力
        # FAE确认: "FE PHY 支持100FX" → TX和FX都标
        is_t1 = ('100base-t1' in params_lower or '1000base-t1' in params_lower or '10base-t1' in params_lower)
        if is_t1:
            feats.add('T1-PHY')
        # FX: 显式光纤能力(叠加)
        if '100fx' in params_lower or 'fiber' in params_lower or '光纤' in params_lower or '光口' in params_lower:
            feats.add('100FX')
        # TX: 显式标注, 或标准FE PHY基础能力(非T1). T1产品不含TX
        if not is_t1 and ('100base-tx' in params_lower or '双绞线' in params_lower or 'fe phy' in params_lower):
            feats.add('100Base-TX')
        # 清除噪声 token: 孤立标点(/ - 等)、空串、纯符号(来自section名拆分残留)
        feats = {t for t in feats if t and not re.fullmatch(r'[\s/\-_·,，、|]+', t)}
        p["_features"] = ' '.join(feats)
    
    for pn, p in all_products.items():
        sec = p["_section"]
        # 从params提取该产品的真实列名
        param_keys = [k for k, v in [part.split(": ", 1) for part in p["_params"].split(" | ") if ": " in part]]
        cols = ["产品型号"] + param_keys
        if cols not in section_columns[sec]:
            section_columns[sec].append(cols)
    
    seccols = {sec: cols_list[0] for sec, cols_list in section_columns.items()}
    return all_products, seccols

def extract_novosense(pdf_path):
    """纳芯微提取: y对齐法, 只提取含'选型表'的页面"""
    doc = pymupdf.open(pdf_path)
    all_products = {}
    section_columns = defaultdict(list)
    
    PN_PAT = re.compile(r'^[A-Z]')
    NOISE_PN = {'产品型号', '产品名称', '型号', 'Part Number'}
    
    for pg_idx in range(len(doc)):
        pg = doc[pg_idx]
        text = pg.get_text()
        if '选型表' not in text:
            continue
        
        section_name = ''
        for line in text.strip().split('\n')[:5]:
            if '选型表' in line:
                section_name = line.strip()
                break
        if not section_name:
            continue
        
        spans = _spans(pg)
        if not spans:
            continue
        
        # 找"产品型号"锚点
        pn_header = next((s for s in spans if s['t'] in ('产品型号', '产品名称', '型号')), None)
        if not pn_header:
            continue
        
        # PN列表(y去重)
        pn_data = [s for s in spans 
                   if s['y'] > pn_header['y'] + 10
                   and abs(s['x0'] - pn_header['x0']) < 15
                   and PN_PAT.match(s['t'])
                   and s['t'] not in NOISE_PN]
        if len(pn_data) < 2:
            continue
        
        seen_y = set()
        pns = []
        for s in sorted(pn_data, key=lambda s: s['y']):
            yb = round(s['y'] / 5) * 5
            if yb not in seen_y:
                seen_y.add(yb)
                pns.append((s['y'], s['t']))
        
        pn_ys = {round(y/5)*5 for y, _ in pns}
        fdy = min(pn_ys)
        
        # Header spans: right of PN col, near top of page
        hdr_spans = [s for s in spans 
                     if s['x0'] > pn_header['x0'] + 5 
                     and s['y'] < fdy + 10
                     and s['t'] not in NOISE_PN
                     and not PN_PAT.match(s['t'])]
        
        if not hdr_spans:
            continue
        
        # cx聚类表头(8px容差)
        hdr_spans.sort(key=lambda s: s['cx'])
        col_groups = []
        for s in hdr_spans:
            placed = False
            for g in col_groups:
                if abs(g['cx'] - s['cx']) < 8:
                    g['spans'].append(s)
                    g['cx'] = sum(x['cx'] for x in g['spans']) / len(g['spans'])
                    g['x0'] = min(g['x0'], s['x0'])
                    g['x1'] = max(g['x1'], s['x1'])
                    placed = True
                    break
            if not placed:
                col_groups.append({'cx': s['cx'], 'x0': s['x0'], 'x1': s['x1'], 'spans': [s]})
        
        # y对齐检测 + 取值
        for g in col_groups:
            # 收集该列x范围内的所有数据span
            all_col = [s for s in spans 
                       if s['x0'] >= g['x0'] - 5 and s['x1'] <= g['x1'] + 5]
            
            # 数据区: y >= fdy-3
            data = [s for s in all_col if s['y'] >= fdy - 3]
            data_ys = {round(s['y']/5)*5 for s in data}
            
            # y对齐度
            aligned = sum(1 for py in pn_ys if py in data_ys or (py+5) in data_ys or (py-5) in data_ys)
            if aligned < len(pn_ys) * 0.4:
                continue
            
            # 表头名: 数据区域之前的所有span, 按y排序
            first_data_y = min(s['y'] for s in data) if data else fdy
            hdr = [s for s in all_col if s['y'] < first_data_y - 2]
            
            hdr_parts = []
            seen_text = set()
            for s in sorted(hdr, key=lambda x: x['y']):
                if s['t'] not in seen_text:
                    hdr_parts.append(s['t'])
                    seen_text.add(s['t'])
            col_name = ' '.join(hdr_parts)
            if not col_name.strip():
                continue
            
            # 取值(最近y匹配)
            col_vals = {}
            for s in data:
                yb = round(s['y'] / 5) * 5
                if yb not in col_vals:
                    col_vals[yb] = s['t']
            
            for pn_y, pn in pns:
                pn_yb = round(pn_y / 5) * 5
                best_y = None
                best_dist = 999
                for vy in col_vals:
                    d = abs(vy - pn_yb)
                    if d < best_dist:
                        best_dist = d
                        best_y = vy
                if best_y and best_dist < 12:
                    val = col_vals[best_y]
                    if pn not in all_products:
                        all_products[pn] = {
                            'part_number': pn, '_section': section_name,
                            '_sections': [section_name],
                            '_params': f'{col_name}: {val}', '_raw': val,
                            '_features': f'工业级 {section_name}',
                        }
                    else:
                        all_products[pn]['_params'] += f' | {col_name}: {val}'
                        all_products[pn]['_raw'] += f' | {val}'
    
    for pn, p in all_products.items():
        sec = p['_section']
        cols = [k.split(':')[0].strip() for k in p['_params'].split(' | ')]
        if cols not in section_columns[sec]:
            section_columns[sec].append(cols)
    
    seccols = {sec: cols_list[0] for sec, cols_list in section_columns.items()}
    return all_products, seccols

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--vendor")
    ap.add_argument("--profile", choices=["analog", "auto", "yutai", "novosense"], default="analog",
                    help="analog=TOC碎片型, auto=汽车中文单行表, yutai=裕太单页超宽表, novosense=纳芯微列转置型")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--dump-columns", help="把section→列名总表写到此json路径")
    a = ap.parse_args()

    if a.profile == "auto":
        products, seccols = extract_auto(a.pdf)
    elif a.profile == "yutai":
        products, seccols = extract_yutai(a.pdf)
    elif a.profile == "novosense":
        products, seccols = extract_novosense(a.pdf)
    else:
        products, seccols = extract(a.pdf)
    print(f"提取 {len(products)} 款, {len(seccols)} 个 section\n")
    print("=" * 70)
    print("Section → 重建列名总表(供FAE审核)")
    print("=" * 70)
    for sec, names in seccols.items():
        n = sum(1 for p in products.values() if p["_section"] == sec)
        print(f"\n【{sec}】({n}款, {len(names)}列)")
        for i, nm in enumerate(names):
            print(f"   {i:2d}. {nm}")

    if a.dump_columns:
        with open(a.dump_columns, "w") as f:
            json.dump(seccols, f, ensure_ascii=False, indent=2)
        print(f"\n✓ 列名总表 → {a.dump_columns}")

    if a.dry_run or not a.vendor:
        return

    dp = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "web/public/data/products_structured.json")
    with open(dp) as f:
        d = json.load(f)
    plist = list(products.values())
    d[a.vendor] = {"name": d.get(a.vendor, {}).get("name", a.vendor),
                   "productCount": len(plist), "products": plist}
    with open(dp, "w") as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print(f"\n✓ 写入 {len(plist)} 款到 {a.vendor}")


if __name__ == "__main__":
    main()

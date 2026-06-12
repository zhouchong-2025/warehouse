# 物料主数据层 — 型号族归一(Family Normalization)架构

> 版本: 2026-06-08 | 架构师文档, 供执行模型落地
> 范围: MDM 的第一项能力 — 把散落的型号变体归到型号族(Family)
> 前置: 四厂型号命名规律已实测验证(见 §2), 不是拍脑袋规则
> 配套: ARCHITECTURE_DECISIONS.md(MDM三层概念), MULTI_VENDOR_PARSING_ARCHITECTURE.md

---

## 0. 这一层解决什么

当前问题: 同一颗芯片的变体散成多条独立记录, 互不关联:
```
TP2261, TP2261-Q100              ← 工规/车规, 现在是2条无关记录
LM2902A(模拟册), LM2902A-SO2R-S(汽车册)  ← 同芯片跨册, 完全割裂
YT8011A, YT8011AN, YT8011AR      ← 封装变体, 无关联
NSM2011, NSM2011-Q1              ← 车规变体, 无关联
```

目标: 建立 **Family(族) → Material(订货型号) → Source(来源)** 三层, 把变体归到族,
同时**保留每个订货型号的区分信息**(车规/封装/温度等级不可丢)。

---

## 1. 核心原则: 命名提候选 + 参数验证(零假阳性)

> **绝不能用单一命名正则硬归族** — 后缀语义因厂商而异且会叠加, 硬归必误判, 违反零假阳性铁律。

正确策略是**双重确认**:
```
步骤1 命名规律 → 提取"候选族"(同base的型号是候选同族)
步骤2 参数一致性 → 验证候选族成员参数是否高度一致
  - 一致(只差车规/封装/温度) → 确认同族
  - 显著不同 → 拆开, 标记人工审核(不自动归)
```

### 为什么需要步骤2(实测证据)
| 型号对 | 命名 | 参数 | 判定 |
|--------|------|------|------|
| NSM2011 vs NSM2011-Q1 | 同base | 几乎全同(仅电流范围因车规异) | ✅同族 |
| NSM2011 vs NSM2012 | 不同base | 0.85→1.2, 5000→3000, 240K→400K | ✅不同族 |
| TP2261 vs TP2261-Q100 | 同base | 完全一致 | ✅同族 |
| YT8011A vs YT8011AN | 字母变体 | 完全一致 | ✅同族(marking变体) |
| YT8011A vs YT8011AR | 字母变体 | 封装QFN48→40, 接口不同 | ✅同族但不同封装变体 |
| YT8521SH-CA vs YT8521SC-CA | H/C | 温度-40~85 vs 0~70 | ✅同族不同温度等级 |

---

## 2. 四厂命名规律(实测, 各厂不同)

> 实测自 products_structured.json, 用第一个`-`切分base/suffix 的初步统计。

### 2.1 思瑞浦-模拟
- 主族标识: `-Q100` = 车规版(如 `TP2261` / `TP2261-Q100`)。
- 多变体base: 37个。后缀 `-Q100`(车规)、`-DAT/-BCD/-GKT`等(封装/卷带料号)。
- **跨册关键**: 基础型号(如 LM2902A)与汽车册 LM2902A-xxx 同族。

### 2.2 思瑞浦-汽车
- 后缀 = 封装代码 + 卷带, 格式 `-{封装}{卷带}R-S`:
  `-SO1R-S`(SOP)、`-TS1R-S`(TSSOP)、`-VS1R-S`(VSSOP)、`-DFCR-S`(DFN)、`-S5TR-S`等。
- 同base多封装: 44个族(如 LM2903A 有 SO1R/TS1R/VS1R 三封装)。
- ⚠️ **`Q` 在base里**: `LM2903A` vs `LM2903Q` 被`-`切成两族, 但 Q=车规标识,
  需判断是否同基础族的工规/车规版(交参数验证)。

### 2.3 纳芯微(后缀叠加最复杂)
- 后缀可叠加: `-Q1`(车规Grade1) + `SW/SP`(封装) + `R`(卷带):
  `-Q1SWR` = 车规+SW封装+卷带, `-DSWR` = D+SW封装+卷带。
- 无`-`变体: `NSM2013` vs `NSM2013P`(P是子型号变体, 在base里)。
- 多变体base: 148个(最多)。
- **解析顺序**: 先剥卷带(R结尾), 再剥封装(SW/SP/LA...), 再剥车规(Q1/Q0/D), 剩下是族。

### 2.4 裕太
- 字母变体: `YT8011A/AN/AR`(无`-`, 末尾字母区分封装/marking)。
- 后缀 `-CA`(9个)、温度等级在字母里: `SH`(工业-40~85) vs `SC`(消费0~70)。
- 当前多变体base: 0(因为字母变体无`-`, 初步切分识别不出)→ **需专门的字母变体归族逻辑**。

---

## 3. 数据结构设计

```json
{
  "family_id": "LM2902A",                    // 归一后的族标识
  "family_name": "LM2902A 四通道运放",
  "base_part": "LM2902A",
  "categories": ["低压运算放大器(Vs＜10V)"],   // 来自成员的 _sections 并集
  "materials": [                              // 订货型号(变体), 区分信息保留
    {
      "pn": "LM2902A",
      "vendor": "3peak-analog",
      "grade": "工业级",                       // 工规/车规
      "package": "SOP14,TSSOP14",
      "temp_range": "-40 to 125",
      "params": { ... },                       // 数值化参数(带unit)
      "source": {"pdf":"思瑞浦-模拟_2026.pdf", "page":4, "section":"..."}
    },
    {
      "pn": "LM2902A-SO2R-S",
      "vendor": "3peak-auto",
      "grade": "车规AEC-Q100",
      "package": "SOP14",
      "source": {"pdf":"思瑞浦-汽车_2026.pdf", "page":4}
    }
  ],
  "variant_axes": {                            // 该族的变体维度(自动归纳)
    "grade": ["工业级","车规AEC-Q100"],
    "package": ["SOP14","TSSOP14"]
  },
  "confidence": "high",                        // high=参数验证通过; review=需人工
  "needs_review": false
}
```

要点:
- `materials[]` 保留每个订货型号的 grade/package/temp(铁律: 区分信息不可丢)。
- `variant_axes` 自动归纳"这个族在哪些维度上有变体"——这是 FAE 选型时"同款换封装/换车规"的直接支撑。
- `confidence`/`needs_review`: 参数验证通不过的归族标记人工审核, **不自动合并**(铁律#4)。

---

## 3.5 跨册同型号 spec 出入的处理(字段级合并)⭐

> 这是项目负责人明确要求的规则: **一样的合并, 不一样的记录补充。**

### 实测真相: 跨册"出入"几乎不是参数值冲突, 而是详细程度互补
实测101个跨册同型号(模拟册∩汽车册), 两边字段分布:
- **模拟册**: 20+ 完整工程参数(通道数/供电/GBW/压摆率/失调/温度...)
- **汽车册**: 仅5字段 — `Status` `Package` `Description` `Alternate(可替代)` `Application(应用领域)`
- **汽车独有**: `Alternate`、`Application`(模拟册完全没有)

→ 两册是**互补维度**, 不是同维度打架。所谓"出入"分三类, 处理各不同:

| 类型 | 实例 | 本质 | 处理 |
|------|------|------|------|
| **纯互补** | 模拟有GBW/Vos, 汽车有Alternate/Application | 信息维度不重叠 | **直接合并**, 两边字段都留 |
| **伪冲突(表述差异)** | Status: `Production` vs `量产` | 同义, 中英文不同 | **归一化后合并**(映射表: 量产=Production) |
| **变体粒度差异** | Package: `SOP14,TSSOP14` vs `SOP14` | 模拟列全族封装, 汽车是具体订货封装 | **不合并到族级**, 各 Material 保留自己的 package |

### 字段级合并规则(merge, 不是整条二选一)
对跨册/同族同型号, **逐字段**判断, 而非整条记录取一份:
```
对每个字段 field:
  1. 两边都有且归一化后值相同   → 合并为1个值(provenance记录来源:[模拟,汽车])
  2. 只有一边有                 → 补充进来(记录来源)
  3. 两边都有但值真不同(归一化后仍不同):
       3a. 该字段是变体维度(package/grade/temp) → 不放族级, 各Material各自保留
       3b. 该字段是真参数(如Vs/GBW)且值冲突     → 标记 conflict, needs_review=true,
            两个值都保留, 注明来源, 交FAE裁决, 禁止自动选一个(零假阳性铁律)
```

### 合并后的字段结构(带 provenance 来源追溯)
族级/Material级的每个合并字段, 保留来源, 满足铁律#1可追溯:
```json
"merged_params": {
  "Number of Channels": {"value": "4", "sources": ["3peak-analog"]},
  "Supply Voltage (Max) (V)": {"value": "36", "sources": ["3peak-analog"]},
  "Alternate": {"value": "LM2902", "sources": ["3peak-auto"]},
  "Application": {"value": "通用产品, xEV", "sources": ["3peak-auto"]},
  "Status": {"value": "Production", "sources": ["3peak-analog","3peak-auto"]}  // 量产→归一
}
```
真冲突字段的形态(交FAE):
```json
"Vs (Max) (V)": {
  "conflict": true,
  "candidates": [
    {"value": "36", "source": "3peak-analog"},
    {"value": "40", "source": "3peak-auto"}
  ],
  "needs_review": true
}
```

### Status/单位等归一化映射(需建小映射表, 文本格式, 用户偏好)
```
量产 = Production
预生产 = Pre-Production
车规 = Automotive / AEC-Q100
工规 = Industrial
```
归一化**只用于判断"是否同值"**, 原始值仍存 provenance, 不丢原文(铁律#1)。

### 为什么字段级合并优于"整条取更完整的一份"
旧文档 §4 曾写"参数取更完整(列数多)的一份"——**这是错的**, 会丢掉汽车册独有的
Alternate/Application(因为汽车册字段少, 整条会被模拟册覆盖)。
字段级合并才能做到"模拟的详细参数 + 汽车的车规/可替代信息"两边都不丢。
**执行模型注意: 用本节字段级合并替代 §4 的"取更完整一份"。**

---

## 4. 归族算法(执行模型实现 scripts/build_families.py)

```
输入: products_structured.json 全部产品(已含 _params/_sections/vendor)
输出: families.json

1. 按厂商分组, 用厂商专属规则提取 base:
     strip_suffix(pn, vendor) → base
       思瑞浦模拟: 去 -Q100 / -料号后缀
       思瑞浦汽车: 去 -{封装}{卷带}-S
       纳芯微: 按 卷带R→封装→Q车规 顺序逐层剥
       裕太: 去 -CA, 末尾字母变体单独成轴
2. 同 base 的型号 = 候选族
3. 参数一致性验证(核心):
     比较候选族成员的"基础参数"(去掉 package/grade/temp 等变体维度后)
     一致度 ≥ 阈值 → confidence=high, 自动归族
     一致度低 → confidence=review, needs_review=true, 拆分待人工
4. 跨厂商 family 合并(用基础型号匹配):
     模拟 LM2902A 与 汽车 LM2902A-* 的 base 都是 LM2902A → 合并同族
     ⚠️ 仅当基础型号字面相同才合并, 不做模糊匹配(零假阳性)
5. 归纳 variant_axes, 输出 families.json
```

### 跨厂商对标的种子数据(顺带可得)
思瑞浦-汽车的"可替代产品"列(如 LM2901A-SO2R-S → 可替代 LM2901)是**跨厂商/对标**关系的现成数据,
归族时一并抽出, 存入未来的"关系层"(本期不做, 见 §6)。

---

## 5. 验证标准(归族后必须)

- **零假阳性核查**: 随机抽样族, 确认无"不同芯片被误归同族"(FAE抽审)。
- **参数一致性**: high-confidence 族成员基础参数一致度报告。
- **覆盖率**: 多少款进了多变体族, 多少款是单品族。
- **跨册归一数**: 模拟↔汽车成功关联的 family 数(预期≈97族, 见 ARCHITECTURE_DECISIONS)。
- **needs_review 清单**: 参数不一致的候选族, 整理交 FAE, **不自动归**。
- 不确定的归族**不自行下结论**, 交项目负责人确认。

---

## 6. 边界(本期型号族归一**不做**的)

明确范围, 避免执行模型扩张:
- ❌ 替代/兼容关系网络(可替代产品列虽抽出, 但建图是后续"关系层")
- ❌ 跨厂商对标(国产替代进口)
- ❌ 应用关联(选A配B)
本期只做: **同族变体归一 + 跨册同型号归一**。其余关系层待型号族稳定后另立文档。

---

## 7. Definition of Done

- [ ] scripts/build_families.py 实现四厂专属 strip_suffix + 参数验证
- [ ] 输出 families.json, 每族含 materials/variant_axes/confidence
- [ ] 跨册归一(模拟↔汽车)成功关联, family 数接近预期
- [ ] needs_review 族整理成清单交 FAE
- [ ] 零假阳性抽审通过(无误归)
- [ ] 不自行下"归对了"结论, 交负责人确认

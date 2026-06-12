# P0 实施手册 — 坐标法提取器落地(供执行模型)

> 版本: 2026-06-08 | 状态: 算法已验证, 列名已经 FAE 审核通过, 待写库
> 角色分工: 架构(本文档作者)定方案; **执行模型**按本手册落地
> 配套: `wiki/P0_COORD_EXTRACTION_PROTOTYPE.md`(原型验证与坐标法原理)
> 脚本: `scripts/extract_coord.py`(已实现, 本手册解释如何用与如何验证)

---

## 0. TL;DR(执行模型必读)

- `scripts/extract_coord.py` 已写好并验证通过(898款, 71 section, FAE 已审列名)。
- 你的任务**不是重写它**, 而是: ①写库前备份 ②执行写库 ③加列级量纲校验 ④跑审计压测证明 30%→0% ⑤清理旧脚本。
- **铁律**(来自项目负责人, 不可违背):
  1. 零假阳性 — 参数 = PDF 原文, 不做语义推断/翻译/猜测。
  2. 系统性修复 — 发现 bug 先扫全量同类, 架构级修, 加测试防复发, 不打补丁。
  3. mA ≠ A, ESD ≠ 隔离 — 单位敏感, 不可混。
  4. 参数乱码产品**禁止**自动打标签, 标记人工审核。
  5. 每次修复后必须审计 + 压测, 用数据证明, 不接受口头保证。

---

## 1. 算法总览(extract_coord.py 已实现)

### 核心思想
pymupdf `get_text("dict")` 返回每个文字 span 的 bbox 坐标。
表格的**列 = x 中心(cx)稳定的竖带; 行 = y 相近的一组 span**。
按几何位置二维重建, 而非依赖文本流顺序(文本流顺序错乱正是表头碎片化的根源)。

### 数据流
```
PDF
 → _spans(page)               每页所有文字span {t,x0,x1,cx,y}, 顺带 _denoise 去页眉噪声
 → _find_anchors(spans)       找所有 "Part Number"/"WPN" 锚点(每个=一张表)
 → _section_titles_on_page    用 TOC 匹配本页物理出现的 section 标题及其 y
 → extract_table(每个锚点)
     → 表头带 = [锚点y-15, 首数据行y-5]
     → _build_columns: 表头span按 cx 聚类成列, 同列多行碎片按y拼接成完整列名
     → 数据行 = y 按 6px 分箱, 每箱必须含一个最左列PN
     → 单元格归位: 每个span按 cx 分配到最近列中心
 → 行级 section 归属: _section_for_row(行y上方最近的TOC标题, 否则carry延续)
 → 多重分类合并: 同PN出现在多section → _sections 数组累加, _section 取首个
```

### 关键参数(已调好, 勿轻改)
| 常量 | 值 | 含义 |
|------|-----|------|
| `LEFTMOST_X` | 170 | PN列右边界(判定"最左列") |
| `COL_TOL` | 8 | 列聚类容差px(列间距通常>30) |
| `ROW_BIN` | 6 | 行分箱px(同行span y抖动<6) |
| `HDR_LOOKUP` | 15 | 表头带向上扩展px |
| `ANCHORS` | {"Part Number","WPN"} | 表头第一列锚点 |

---

## 2. 已解决的4个结构问题(为什么这版对)

| 问题 | 旧方案(v4/v5) | 本方案 | 验证结果 |
|------|--------------|--------|---------|
| 表头碎片化 | merge_headers黑名单/words+x0聚类 | dict span + cx聚类 | 30%→~0 |
| section归属错乱 | 文本流顺序猜 | TOC权威边界+行级归属 | 精密运放2→75款 |
| 多重分类丢失 | 全局去重先到先得 | _sections数组累加 | 109款多分类 |
| 页眉噪声混入 | 无处理 | _denoise过滤 | 9款已清除 |

**为什么不能用 extract_v3/v4/v5**: 详见 `P0_COORD_EXTRACTION_PROTOTYPE.md §4.5`。
三重失效(words API + x0聚类 + 列数门控)。**全部废弃, 不要在其上修补。**

---

## 3. 写库步骤(执行模型按序操作)

### 3.1 前置: 备份(强制, 不可跳过)
写库会覆盖 `web/public/data/products_structured.json` 里的 `3peak-analog`(现861款)。
```bash
cd /Users/zhouchong/projects/warehouse
cp web/public/data/products_structured.json \
   web/public/data/products_structured.json.pre_coord.bak
```

### 3.2 干跑确认(不写库)
```bash
python3 scripts/extract_coord.py --pdf "raw/思瑞浦-模拟产品选型册_2026.pdf" --dry-run
```
预期: `提取 898 款, 71 个 section`, 无 `page{N}_table{M}` 占位 section 名。

### 3.3 执行写库
```bash
python3 scripts/extract_coord.py --pdf "raw/思瑞浦-模拟产品选型册_2026.pdf" --vendor 3peak-analog
```
预期末行: `✓ 写入 898 款到 3peak-analog`。

### 3.4 数据结构(写入后每条产品)
```json
{
  "part_number": "TP07A",
  "_section": "高压运算放大器(Vs＞10V)",          // 主分类(首个), 向后兼容前端
  "_sections": ["高压运算放大器(Vs＞10V)","精密运算放大器(Vos ＜＝1mV)"],  // 多重分类
  "_params": "Status: Production | Rating: Industrial | ...",  // 列名:值, 来自PDF原文
  "_raw": "Production | Industrial | ...",        // 纯值, |分隔
  "_features": "工业级 高压运算放大器(Vs＞10V) 精密运算放大器(Vos ＜＝1mV)"  // 等级+全部分类(供搜索)
}
```
**注意**: `_sections` 是新增字段。前端当前只读 `_section`(单值), 向后兼容无需改。
但要支持"多分类搜索"需让前端/route.ts 改读 `_sections`(见 §5 后续工作)。

---

## 4. 列级量纲校验(执行模型需新建 scripts/validate_columns.py)

这是"用数据证明对错"的核心工具, 也是铁律#5的落地。**不是用列数判断(碎片化会骗过列数), 而是用每列的值类型一致性判断。**

### 4.1 校验逻辑
对每个 section 的每一列, 收集所有产品在该列的值, 检查类型一致性:
```python
# 伪代码
for section, products in by_section.items():
    for col_name in columns:
        vals = [p.param(col_name) for p in products if p.param(col_name)]
        # 推断该列应有的类型
        kind = infer_kind(col_name)   # 从列名: (V)→电压数值, (℃)→温度区间, Vrms→隔离数值...
        # 校验值是否符合
        bad = [v for v in vals if not matches(v, kind)]
        if len(bad)/len(vals) > 0.2:   # >20%不符 → 该列疑似错位
            report(section, col_name, kind, bad[:5])
```

### 4.2 类型推断规则(从列名)
| 列名特征 | 期望值类型 | 反例(报警) |
|---------|-----------|-----------|
| 含 `(V)`,`Voltage` | 数值或区间(`2.5`,`-40~125`) | `Open-Drain`, `50%VCC` |
| 含 `(℃)`,`Temperature` | 温度区间(`-40 to 125`) | 单个小数 |
| 含 `(mA)`,`(μA)`,`(A)` | 电流数值 | 非数字 |
| 含 `Vrms`,`Isolation` | 大数值(通常≥1000) | `8`(应是8000) |
| 含 `Channels` | 整数或`N/M`(如`1/1`) | 电压值 |
| 含 `(MHz)`,`(Mbps)`,`(kHz)` | 频率/速率数值 | 文本 |
| `Package` | 封装名(SOP/QFN/...) | 数值 |
| `Status` | Production/Pre-Production | 数值 |

### 4.3 输出与处置(遵守铁律#3/#4)
- **确定无疑的列错位**(如 Isolation列值全<100但应≥1000): 报告, **但不自动改值**——标记该 section 需人工/重提取。
- **mA/A 单位**: 单独核查, 不可自动换算(铁律#3)。LDO 的 Iout 历史踩坑见 MEMORY。
- **参数乱码产品**: 标记 `needs_review`, **禁止自动打标签**(铁律#4)。

---

## 5. 验证与压测(写库后强制执行)

### 5.1 对比新旧数据
```bash
# 新建 scripts/compare_extraction.py 对比 .pre_coord.bak vs 新数据:
#   - 产品总数变化(预期 861→898, 多37款)
#   - 碎片表头数(旧30% → 新应~0)
#   - 每个section款数
#   - 丢失的PN(旧有新无) / 新增的PN
```

### 5.2 碎片表头量化(证明 30%→0)
判定碎片: 列名为纯括号/裸单位(`(V)`,`(typ)`,`(MHz)`,`(Max)`,`to`等)或长度≤2(除`CH`白名单)。
```
旧数据: ~262/861 (30%) 含碎片表头
新数据目标: <1%
```

### 5.3 跑现有测试
```bash
python3 scripts/test_all.py          # 若存在
python3 scripts/category_pressure_test.py   # 压测(若存在)
```
要求: 通过率不低于改造前, 且碎片表头指标显著下降。

### 5.4 前端验证(项目负责人会亲自做)
负责人会在前端实测搜索: 搜"精密运放"应出现75款(含多分类), 搜"隔离器"参数应正确(8000Vrms非8)。
**不要替负责人下"修好了"的结论, 自动跑完全部测试, 把不确定的列给他确认。**

---

## 6. 清理(验证通过后)

```bash
# 旧提取脚本归档(确认新数据通过验证后)
mkdir -p scripts/_archived
git mv scripts/extract_v3.py scripts/extract_v4.py scripts/extract_v5.py scripts/_archived/ 2>/dev/null
# 6个 fix_yutai_*.py 等一次性补丁脚本一并归档
```
**保留**: extract_coord.py(主提取), validate_columns.py(校验), compare_extraction.py(对比)。

---

## 7. 已知边缘情况(执行模型遇到时参考)

1. **锚点不止 Part Number, 还有 WPN**(数字隔离器)。新厂商可能有其他锚点, 遇到加入 `ANCHORS`。
2. **一页多表 / section标题与表分离**: 按"每锚点一张表"提取, 已处理。
3. **跨页表延续**: `carry_section` 处理上页表尾延续到本页, 已处理。
4. **多重分类同PN参数可能不同**: 当前取"更完整(列数多)"的一份。若两份参数实质冲突(罕见), 标记人工审核, 不自动选。
5. **CH 是合法列名**(通道数缩写), 不是碎片, 勿误删。
6. **LM358A 标"高压运放"是PDF原文如此**(宽供电3-32V), 非bug, 勿"纠正"。

---

## 8. 完成标准(Definition of Done)

- [ ] 已备份原数据到 `.pre_coord.bak`
- [ ] 写库成功, 898款写入 3peak-analog
- [ ] validate_columns.py 跑通, 碎片表头 <1%, 列级量纲校验报告无"确定错位"(或已标记人工审核)
- [ ] compare_extraction.py 输出新旧对比, 无意外丢失PN
- [ ] 现有测试通过率不低于改造前
- [ ] 旧 extract_v3/v4/v5 已归档
- [ ] 不确定的列/产品已整理成清单交项目负责人确认(不自行下"修好了"结论)

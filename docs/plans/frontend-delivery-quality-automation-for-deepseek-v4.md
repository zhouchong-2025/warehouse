# ChipSelect 前端交付质量与自动化测试架构方案

> 面向后续 DeepSeek v4 pro 执行。本文不是单个 bug 修复单，而是把“前端交付和用户输入理解偏差”系统化测试出来、分层定位、自动修复确定项、把不确定项交给 FAE 人工确认的架构方案。

## 1. 背景与目标

当前状态：

- 数据库大部分产品和基础标签已经相对正确。
- 主要问题从“数据有没有”转移到“前端交付是否按 FAE 语义正确推荐”。
- 现有修复经常是用户发现一个 query case，然后系统点对点修 parser / ranking / tag，效率低。
- 纳芯微这类手册存在明显两层信息源：
  - 前部选型表：型号、关键参数、封装、隔离等级等结构化信息。
  - 后部产品介绍页：技术路线、功能特性、应用场景等更语义化的信息。
- 有些前端查询依赖详情页才有的信息。例如：集成式电流传感器选型表不一定写“霍尔”，但产品介绍里写“线性霍尔效应电流传感器芯片”。

目标：

1. 建立系统测试方法，自动发现“输入理解偏差”和“前端推荐偏差”。
2. 把问题分层定位到：parser、数据标签、详情页证据、ranking、API delivery、前端展示。
3. 对确定无歧义项自动修复；对需要 FAE 判断的项生成人工确认清单。
4. 特别解决“表格缺失、详情页存在”的语义标签，例如“霍尔电流传感器”。
5. 输出可重复运行的回归脚本，而不是靠用户逐个前端手测。

---

## 2. 当前系统事实

### 2.1 数据流

当前仓库路径：

`/Users/zhouchong/Projects/warehouse`

核心数据流：

```text
PDF 手册
  -> scripts/extract_coord.py / scripts/generate_data.py
  -> web/public/data/products_structured.json
  -> scripts/autofix.py 补 canonical tags / 参数 tags / 详情页 tags
  -> scripts/validate.py / audit scripts
  -> web/app/api/interpret/query_parser.ts + route.ts
  -> web/app/page.tsx 前端展示
```

### 2.2 纳芯微抽取机制

文件：`scripts/extract_coord.py`

纳芯微专用函数：`extract_novosense(pdf_path)`。

已经做了两件事：

1. 前部选型表抽取：
   - 使用 `page.find_tables()`。
   - 以页面前几行的 `选型表` 标题作为 `_section`。
   - 表格列进入 `_params` / `_raw`。
   - 初始 `_features` 包含 grade + section。

2. 后部产品介绍页合并：
   - 识别页面包含 `产品介绍`。
   - 从页面第一行提取 PN。
   - 如果 PN 已存在于前部选型表产品中，则合并：
     - `_detail_intro`
     - `_detail_features`
     - `_detail_apps`

也就是说，详情页信息不是完全没进库；但目前只是一段文本字段，并没有系统性转成可检索、可排序、可解释的 canonical evidence tags。

### 2.3 目前已知例子

实测数据里，纳芯微存在详情页“霍尔”信息：

- `NSM2032`
  - `_section`: `线性电流传感器选型表`
  - `_features`: `电流传感器 Vin_5V 工业级 线性电流传感器选型表`
  - `_detail_intro`: `NSM2032 线性霍尔效应电流传感器芯片...`

- `NSM2034`
  - `_detail_intro`: `NSM2034 线性霍尔效应电流传感器芯片...`

- `MT9519`
  - `_detail_intro`: 包含 `平面霍尔技术`、`HMD 技术`

当前问题：

- 查询 `电流传感器`：返回 3peak 和 novosense 都合理。
- 查询 `霍尔电流传感器`：parser 目前只理解成 `电流传感器`，忽略 `霍尔`。
- 查询 `纳芯微 霍尔 电流传感器`：当前 interpret 仍只返回 `电流传感器`，甚至 vendor 也没有正确识别。
- 查询 `3peak 霍尔 电流传感器`：当前也仍只返回 `电流传感器`，前端可能继续出现 3peak 电流传感器，造成“霍尔”约束未生效。

当前 API 实测表现：

```text
Q=电流传感器
must=[电流传感器]

Q=霍尔电流传感器
must=[电流传感器]
缺失：霍尔 技术路线约束

Q=纳芯微 霍尔 电流传感器
must=[电流传感器]
vendor=null
缺失：vendor=novosense，缺失霍尔 技术路线约束
```

---

## 3. 核心架构判断

### 3.1 不应继续逐 case 修补

现在的问题不是单个 query alias，而是缺少三类系统能力：

1. Query 语义维度化：
   - 用户说的“霍尔”“磁阻”“隔离”“SIC”“低功耗唤醒”等，不一定是品类，有时是技术路线/功能/结构。
   - 不能都塞进 `features` 或都当 category。

2. 数据证据分层：
   - 表格字段是强结构证据。
   - 详情页产品介绍是语义证据。
   - section 是品类权威证据。
   - PN suffix 是弱派生证据。
   - LLM 或正则提取出的描述性短语必须经白名单过滤，不能直接变成标签。

3. 前端交付可解释：
   - 结果卡要显示“命中/缺失条件”。
   - 若某个结果只满足 `电流传感器`，但缺少 `霍尔`，必须展示为参考料或被过滤/降级。
   - 不能让“满足霍尔”和“不满足霍尔”的产品在前端看起来同等推荐。

### 3.2 推荐的标签/证据模型

建议在现有 `_features` 之外，新增或模拟以下逻辑层：

```text
query intent
  category: 电流传感器
  vendor: novosense / 3peak / null
  technology: 霍尔 / TMR / AMR / 磁阻 / 分流器 / 隔离 / SIC ...
  spec: Vin/Iout/DataRate/Isolation/Channel/Port...
  grade: 车规/工业/消费
```

数据侧也按证据层归类：

```text
section_tags       来自 _section/_sections，品类权威
param_tags         来自 _params/_params_numeric，规格权威
tech_tags          来自 _detail_intro/_detail_features/_params，技术路线/结构
grade_tags         来自 PN suffix / AEC 字段 / params
application_tags   来自 _detail_apps，仅用于弱建议，默认不做 hard must
```

重要原则：

- `霍尔` 是技术路线，不是泛品类。
- 对 `霍尔电流传感器`，`电流传感器` 是 category must，`霍尔` 是 technology must。
- 如果 3peak 电流传感器没有证据命中 `霍尔`，就不能作为优先推荐；最多作为“电流传感器参考料，缺少霍尔证据”。
- 如果纳芯微详情页有 `线性霍尔效应电流传感器芯片`，则应被打上 `霍尔` 或 `霍尔效应` 技术路线标签，并在前端解释来源。

---

## 4. 需要新增的自动化测试体系

建议新增三层测试，而不是只扩现有单点 case。

### 4.1 Query Parser Matrix：输入理解测试

目的：只测试用户 query 是否被解析到正确语义，不依赖数据结果。

现有基础：

- `scripts/test_category_parser_matrix.py`
- `tests/category_parser_sample.txt`
- `scripts/test_parser.ts`

建议新增：

`tests/query_understanding_matrix.txt`

格式继续用用户偏好的简单文本格式：

```text
# query 输入理解矩阵
# query=... | expect_vendor=... | expect_must=... | expect_nice=... | expect_tech=... | forbid_must=...

query=霍尔电流传感器 | expect_must=电流传感器,霍尔 | expect_hint=传感器
query=纳芯微 霍尔 电流传感器 | expect_vendor=novosense | expect_must=电流传感器,霍尔 | expect_hint=传感器
query=3peak 霍尔 电流传感器 | expect_vendor=3peak | expect_must=电流传感器,霍尔 | expect_hint=传感器
query=磁阻电流传感器 | expect_must=电流传感器,磁阻 | expect_hint=传感器
query=霍尔角度编码器 | expect_must=霍尔角度编码器 | forbid_must=位置传感器
query=磁阻角度编码器 | expect_must=磁阻角度编码器 | forbid_must=位置传感器
```

新增 runner：

`scripts/test_query_understanding_matrix.py`

要求：

- 可 direct 调用 `query_parser.ts`。
- 可 api 调用 `/api/interpret`。
- direct 模式用于快速稳定测试。
- api 模式用于端到端 prompt/forceCat 验证。
- 输出每行 PASS/FAIL。
- FAIL 说明缺什么、误多了什么。

验收标准：

```bash
python3 scripts/test_query_understanding_matrix.py --mode direct
python3 scripts/test_query_understanding_matrix.py --mode api
```

### 4.2 Evidence Coverage Audit：数据证据覆盖测试

目的：自动找出“详情页有某技术词，但没有 canonical tech tag”的产品。

新增文件：

`scripts/audit_detail_evidence_tags.py`

新增配置：

`tests/detail_evidence_rules.txt`

格式：

```text
# 证据词 -> canonical tag / 维度 / 适用 category
# tag=... | dimension=technology | include=... | regex=...

tag=霍尔 | dimension=technology | include=电流传感器 | regex=霍尔|hall\s*effect|linear\s*hall
标签=磁阻 | dimension=technology | include=电流传感器 | regex=TMR|AMR|磁阻|magnetoresistive
标签=SIC | dimension=feature | include=CAN | regex=signal improvement capability|\bSIC\b|信号改善
标签=特定帧唤醒 | dimension=feature | include=CAN,SBC | regex=partial network|特定帧唤醒
```

注意：实际实现时字段名统一用 `tag=`，上面“标签=”只是提醒中文不要引入。

审计逻辑：

1. 遍历所有产品。
2. 拼接证据文本：
   - `_params`
   - `_detail_intro`
   - `_detail_features`
   - `_detail_apps` 只作为弱证据，默认不自动 hard tag。
3. 如果产品已有 include category，比如 `电流传感器`，且证据 regex 命中 `霍尔`，但 `_features` 没有 `霍尔`，输出 missing_evidence_tag。
4. 如果 `_features` 有 `霍尔`，但详情/参数完全没有证据，输出 unsupported_tag。
5. 生成两类结果：
   - auto_fix_candidates：证据明确，可自动补。
   - review_required：词义可能歧义，需要 FAE 确认。

输出文件：

`reports/detail_evidence_audit.md`

报告格式：

```markdown
# Detail Evidence Audit

## 可自动修复

| PN | vendor | category | missing_tag | evidence_field | evidence_snippet |
|---|---|---|---|---|---|
| NSM2032 | novosense | 电流传感器 | 霍尔 | _detail_intro | 线性霍尔效应电流传感器芯片... |

## 需 FAE 确认

| PN | candidate_tag | reason | snippet |
```

### 4.3 Delivery E2E Matrix：前端交付排序测试

目的：不是只测 parser，而是测前端交付结果是否符合 FAE 预期。

现有基础：

- `scripts/test_category_e2e.py`
- `tests/category_e2e_sample.txt`
- `scripts/test_constraint_layer.py`

建议新增：

`tests/delivery_expectations.txt`

格式：

```text
# query=... | pool=... | must_have=... | must_not=... | top_contains=... | reference_allowed=... | explain_must=...

query=霍尔电流传感器 | pool=all | must_have=NSM2032,NSM2034 | must_not=TP181,TP182,TPA127 | top_contains=NSM203 | explain_must=电流传感器,霍尔
query=纳芯微 霍尔 电流传感器 | pool=novosense | must_have=NSM2032,NSM2034 | must_not=TP181,TP182 | top_contains=NSM203 | explain_must=电流传感器,霍尔
query=3peak 霍尔 电流传感器 | pool=3peak | zero_or_reference_only=true | explain_missing=霍尔
```

新增 runner：

`scripts/test_delivery_expectations.py`

测试内容：

1. 调用 `/api/interpret` 得到 must/nice/vendor/category_hint。
2. 用和前端一致的 constraint/ranking 逻辑生成结果。
3. 验证：
   - 必须出现的 PN 在 top N。
   - 不应出现的 PN 不在 top N。
   - top result 的 `matchedTerms` 包含所有 explain_must。
   - 若是 referenceOnly，必须明确显示缺失条件。
4. 如果 query 没有足够结果，要验证零结果建议文案：
   - “目前没有 X，最接近 Y，满足 A/B，缺少 C，是否查看？”

---

## 5. 数据修复策略：详情页技术路线如何进入检索

### 5.1 不建议直接把所有详情页词都打标签

禁止：

```text
只要详情页出现任意技术词，就自动加入 _features
```

原因：

- 产品介绍里可能有背景介绍、对比技术、应用场景，不一定是本产品属性。
- `_detail_apps` 更容易出现应用噪声，不应默认 hard tag。
- 用户已明确要求：描述性短语若无明确检索价值，不新建 tag。

### 5.2 推荐白名单 evidence rule

对高价值、低歧义的技术路线建白名单：

第一批建议：

```text
霍尔
磁阻
TMR
AMR
SIC
Partial Networking / 特定帧唤醒
低功耗唤醒
振铃抑制
高EMC
高ESD
无源特性
```

每条规则必须声明：

- canonical tag
- dimension：technology / feature / grade / spec
- 适用品类 include
- 证据字段权重
- 是否可自动补 tag

示例：

```text
tag=霍尔 | dimension=technology | include=电流传感器,位置传感器 | fields=_detail_intro,_detail_features,_params | auto=true | regex=线性霍尔|霍尔效应|hall effect|linear hall
```

### 5.3 autofix 接入方式

修改：`scripts/autofix.py`

在当前 `detail_text = _detail_intro + _detail_features + _detail_apps` 的基础上，把 FEATURE_PARAM_RULES 升级为“带维度和 include guard 的 evidence rules”。

不要写死在 if 链里；建议读取纯文本配置：

`tests/detail_evidence_rules.txt` 或 `config/detail_evidence_rules.txt`

伪逻辑：

```python
for rule in load_detail_evidence_rules():
    if not product_has_any_include_tag(product, rule.include):
        continue
    evidence_text = join_allowed_fields(product, rule.fields)
    if regex_hit(rule.regex, evidence_text):
        if rule.auto:
            add_tag(rule.tag)
        else:
            write_review_candidate(...)
```

### 5.4 tag 命名建议

短期可以直接用 `霍尔` 作为 canonical technology tag，因为用户查询也会说“霍尔”。

但推荐保留维度 metadata：

```text
tag=霍尔 | dimension=technology
```

不要把 `霍尔` 当作 category。

如果担心 `霍尔角度编码器` 和 `霍尔电流传感器` 混淆，则 ranking 时必须同时要求：

```text
must = 电流传感器 + 霍尔
```

而不是只搜 `霍尔`。

---

## 6. 前端交付改造建议

### 6.1 前端卡片必须显示命中/缺失

对约束查询，例如 `霍尔电流传感器`，卡片不能只显示分数或裸产品列表。

必须显示类似：

```text
优先推荐 NSM2032（2/2条件：电流传感器、霍尔；关键参数：Vin 5V，技术路线：线性霍尔）
```

如果产品只满足电流传感器但没有霍尔证据：

```text
参考料 TP181（1/2条件：电流传感器；缺少：霍尔证据）
```

这符合用户偏好：推荐卡必须展示命中/缺失条件与关键参数，不能只给分数。

### 6.2 API delivery 应输出 evidence 字段

建议 `/api/interpret` 或结果构造层增加：

```json
{
  "matchedTerms": ["电流传感器", "霍尔"],
  "missingTerms": [],
  "evidence": [
    {"term": "电流传感器", "source": "_section", "snippet": "线性电流传感器选型表"},
    {"term": "霍尔", "source": "_detail_intro", "snippet": "线性霍尔效应电流传感器芯片"}
  ],
  "referenceOnly": false
}
```

前端 `page.tsx` 只渲染这些结构，不重新猜逻辑。

---

## 7. 人工确认机制

自动化不是替代 FAE 判断，而是减少 FAE 要看的量。

新增报告：

`reports/manual_review_candidates.md`

分级：

### A. 可自动修复

满足：

- 证据字段明确。
- regex 高置信。
- tag 已在 canonical 白名单。
- include category 命中。

示例：

```text
NSM2032: 电流传感器 + 详情页“线性霍尔效应电流传感器芯片” -> 自动补 霍尔
```

### B. 需 FAE 确认

满足任一：

- 详情页只是应用场景提到技术词。
- 技术词可能是比较背景，不一定是本产品属性。
- tag 还不在 canonical 白名单。
- category 不明确。

报告要给出：

```text
PN
候选 tag
命中字段
证据片段
为什么不自动修
建议动作：确认加入 / 忽略 / 新建 tag / 改 regex
```

---

## 8. DeepSeek v4 pro 具体实施任务

### Task 1: 新增 query 理解矩阵

文件：

- Create: `tests/query_understanding_matrix.txt`
- Create: `scripts/test_query_understanding_matrix.py`
- Modify: `scripts/test_all.py`

最小 case：

```text
query=霍尔电流传感器 | expect_must=电流传感器,霍尔 | expect_hint=传感器
query=纳芯微 霍尔 电流传感器 | expect_vendor=novosense | expect_must=电流传感器,霍尔 | expect_hint=传感器
query=3peak 霍尔 电流传感器 | expect_vendor=3peak | expect_must=电流传感器,霍尔 | expect_hint=传感器
query=霍尔角度编码器 | expect_must=霍尔角度编码器 | forbid_must=位置传感器
query=磁阻角度编码器 | expect_must=磁阻角度编码器 | forbid_must=位置传感器
```

验证：

```bash
python3 scripts/test_query_understanding_matrix.py --mode direct
```

预期：先 FAIL，证明现状确实不能理解 `霍尔` 和 vendor。

### Task 2: parser 支持 vendor 与 technology tags

文件：

- Modify: `web/app/api/interpret/query_parser.ts`
- Modify: `web/app/api/interpret/route.ts`
- Modify: `scripts/validate.py` 如需加入 `霍尔` canonical tag

要求：

- `纳芯微` -> vendor `novosense`
- `思瑞浦` / `3peak` -> vendor group `3peak`
- `霍尔电流传感器` -> must `电流传感器`, `霍尔`
- `霍尔角度编码器` 仍应走 `霍尔角度编码器` category，不拆成 `霍尔 + 角度编码器`
- `磁阻角度编码器` 仍应走 `磁阻角度编码器`

验证：

```bash
python3 scripts/test_query_understanding_matrix.py --mode direct
python3 scripts/test_category_parser_matrix.py
```

### Task 3: 新增详情页证据审计

文件：

- Create: `config/detail_evidence_rules.txt` 或 `tests/detail_evidence_rules.txt`
- Create: `scripts/audit_detail_evidence_tags.py`
- Create output: `reports/detail_evidence_audit.md`

第一批规则：

```text
tag=霍尔 | dimension=technology | include=电流传感器 | fields=_params,_detail_intro,_detail_features | auto=true | regex=线性霍尔|霍尔效应|hall effect|linear hall
```

验证：

```bash
python3 scripts/audit_detail_evidence_tags.py
```

预期报告至少发现：

- `NSM2032` 缺 `霍尔`
- `NSM2034` 缺 `霍尔`
- `MT9519` 可能缺 `霍尔` 或需确认，取决于 regex 与 category guard

### Task 4: autofix 接入 evidence rules

文件：

- Modify: `scripts/autofix.py`
- Modify: `scripts/validate.py`

要求：

- 自动补确定性的 `霍尔` tag。
- 不把应用场景词默认作为 hard tag。
- 不给没有电流传感器 category 的产品乱补 `霍尔电流传感器`。
- tag 必须经过 validate / canonical 白名单。

验证：

```bash
python3 scripts/autofix.py
python3 scripts/validate.py
python3 scripts/audit_detail_evidence_tags.py
```

预期：

- `NSM2032` `_features` 包含 `电流传感器` 和 `霍尔`。
- `NSM2034` `_features` 包含 `电流传感器` 和 `霍尔`。
- 3peak 电流传感器如果没有霍尔证据，不应被补 `霍尔`。

### Task 5: 新增交付排序 E2E

文件：

- Create: `tests/delivery_expectations.txt`
- Create: `scripts/test_delivery_expectations.py`
- Modify: `scripts/test_all.py`

首批 case：

```text
query=霍尔电流传感器 | pool=all | must_have=NSM2032,NSM2034 | must_not=TP181,TP182,TPA127 | top_contains=NSM203 | explain_must=电流传感器,霍尔
query=纳芯微 霍尔 电流传感器 | pool=novosense | must_have=NSM2032,NSM2034 | must_not=TP181,TP182 | top_contains=NSM203 | explain_must=电流传感器,霍尔
query=3peak 霍尔 电流传感器 | pool=3peak | zero_or_reference_only=true | explain_missing=霍尔
```

如果 `TP181/TP182/TPA127` 实际后续被证明确实有霍尔证据，则不要硬 forbid，改为要求卡片显示证据来源。DeepSeek 实施前必须先用详情/参数审计确认。

### Task 6: 前端/API 增加 matched/missing/evidence 交付

文件：

- Modify: `web/app/api/interpret/route.ts`
- Modify: `web/app/api/interpret/constraint-match.ts`
- Modify: `web/app/page.tsx`
- Modify/Create: `scripts/test_ui_copy_and_compare_guard.py` 或新增 UI delivery guard

要求：

- 对每个推荐结果输出：
  - matchedTerms
  - missingTerms
  - referenceOnly
  - evidence snippet
- 前端卡片直接展示：
  - `2/2 条件`
  - `缺少：霍尔`
  - 至少 2 个关键参数/证据字段

验证：

```bash
python3 scripts/test_delivery_expectations.py
python3 scripts/test_ui_copy_and_compare_guard.py
cd web && npm run build
```

### Task 7: 总回归接入

文件：

- Modify: `scripts/test_all.py`
- Modify: `scripts/run_regression.sh`

加入：

```bash
python3 scripts/test_query_understanding_matrix.py --mode direct
python3 scripts/audit_detail_evidence_tags.py
python3 scripts/test_delivery_expectations.py
```

最后完整验证：

```bash
python3 scripts/autofix.py
python3 scripts/validate.py
python3 scripts/test_all.py
python3 scripts/test_constraint_layer.py
cd web && npm run build
```

---

## 9. 验收标准

### 9.1 输入理解

以下必须通过：

- `霍尔电流传感器` -> `电流传感器 + 霍尔`
- `纳芯微 霍尔 电流传感器` -> vendor `novosense` + `电流传感器 + 霍尔`
- `3peak 霍尔 电流传感器` -> vendor `3peak` + `电流传感器 + 霍尔`
- `霍尔角度编码器` -> `霍尔角度编码器`，不能退化成泛 `位置传感器`
- `磁阻角度编码器` -> `磁阻角度编码器`，不能退化成泛 `位置传感器`

### 9.2 数据证据

- 纳芯微详情页明确写“线性霍尔效应电流传感器芯片”的产品必须有 `霍尔` 技术标签。
- 没有表格或详情证据的产品不能被自动补 `霍尔`。
- 所有自动补 tag 必须有 evidence snippet 可追溯。

### 9.3 前端交付

- 搜 `霍尔电流传感器` 时，NSM2032/NSM2034 应优先于没有霍尔证据的普通电流传感器。
- 如果 3peak 当前没有霍尔证据，搜 `3peak 霍尔 电流传感器` 不应把普通 3peak 电流传感器包装成优先推荐。
- 若展示参考料，必须显示：
  - 命中 `电流传感器`
  - 缺少 `霍尔`
  - 为什么仍作为参考

### 9.4 人工确认效率

- 每次审计输出 `reports/manual_review_candidates.md`。
- 人工只确认 B 类不确定项。
- A 类确定项由 autofix 自动处理并回归验证。

---

## 10. 风险与注意事项

1. 不要把 `霍尔` 作为品类。
   - 它是 technology dimension。
   - 必须和 category 组合使用。

2. 不要让 `霍尔角度编码器` 被拆坏。
   - 明确 query `霍尔角度编码器` 时，应输出 category `霍尔角度编码器`。
   - 不应输出泛 `位置传感器`。

3. 不要用详情页应用场景自动打 hard tag。
   - `_detail_apps` 默认弱证据。
   - 除非规则显式允许。

4. 不要只改 parser。
   - 如果数据侧没有 `霍尔` tag，parser 再正确也无法过滤/排序。

5. 不要只改数据。
   - 如果 parser 不识别 `霍尔`，前端 query 仍不会使用这个 tag。

6. 不要只改前端文案。
   - 如果 ranking 没有区分满足/缺失，文案只是掩盖问题。

---

## 11. 建议的最终交付物清单

DeepSeek v4 pro 执行完成后，应交付：

```text
config/detail_evidence_rules.txt
scripts/audit_detail_evidence_tags.py
scripts/test_query_understanding_matrix.py
scripts/test_delivery_expectations.py
tests/query_understanding_matrix.txt
tests/delivery_expectations.txt
reports/detail_evidence_audit.md
reports/manual_review_candidates.md
```

并修改：

```text
scripts/autofix.py
scripts/validate.py
scripts/test_all.py
scripts/run_regression.sh
web/app/api/interpret/query_parser.ts
web/app/api/interpret/route.ts
web/app/api/interpret/constraint-match.ts
web/app/page.tsx
```

最后必须给出以下命令的通过结果：

```bash
python3 scripts/autofix.py
python3 scripts/validate.py
python3 scripts/test_query_understanding_matrix.py --mode direct
python3 scripts/audit_detail_evidence_tags.py
python3 scripts/test_delivery_expectations.py
python3 scripts/test_all.py
python3 scripts/test_constraint_layer.py
cd web && npm run build
```

---

## 12. 一句话总结

当前系统不是“数据库错得多”，而是缺少“用户语义 -> 证据标签 -> 排序交付 -> 前端解释”的闭环测试。后续应先建立 query 理解矩阵、详情页 evidence audit、delivery E2E 三层自动化，再让 autofix 只处理证据明确的技术路线标签，把不确定项集中输出给 FAE 确认。

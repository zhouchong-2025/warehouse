# Teampo / ChipSelect 选型平台 — 系统架构交接文档

> 版本: 2026-06-08 | 用途: 交给接手模型做**架构级重构**的权威依据
> 本文不是"现状美化版"，是**带证据的体检报告 + 重构方向**。
> 所有数字均来自对仓库实际代码与数据的扫描，不是文档自述。

---

## 0. 一句话定位

半导体芯片智能选型平台：FAE/PM 用自然语言描述需求（"轨到轨运放 offset 小于 1mV"），
系统理解 → 转结构化标签 → 匹配产品 → 返回精确型号 + 参数对比，不依赖人对型号的记忆。

**当前阶段**：4 个厂商已入库共 2245 款，但只有 **思瑞浦-模拟 (861款)** 是当前重点打磨对象。
其余三家（思瑞浦-汽车 252 / 纳芯微 1066 / 裕太 66）数据已提取但质量参差，**待模拟册调通后再逐个做**。

---

## 1. 系统三层 + 数据管道全景

```
┌─────────────────────────────────────────────────────────────────┐
│ 离线数据管道 (Python, scripts/)                                    │
│   PDF → extract_*.py → autofix.py → products_structured.json      │
│   tag_schema.json ──(generate_all.py)──→ prompt.txt + wiki/        │
└─────────────────────────────────────────────────────────────────┘
                              │ 产物: web/public/data/products_structured.json
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 在线查询理解 (TypeScript, web/app/api/interpret/)                  │
│   query → query_parser.ts (确定性规则, 80%命中)                     │
│         → 未命中则 route.ts 调 DeepSeek LLM                         │
│         → route.ts 23个 Post-process 补丁修正                       │
│         → {features, exclude_tags, suggestions, confidence}        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 前端交付 (React/Next.js, web/app/page.tsx)                         │
│   全量 JSON load → JS 文本匹配 + LLM标签匹配 + exclude过滤            │
│   → 产品卡片 + 建议横幅 + 对比面板 + CSV导出                          │
└─────────────────────────────────────────────────────────────────┘
```

### 核心文件清单（实测行数）

| 文件 | 行数 | 角色 | 健康度 |
|------|------|------|--------|
| `web/app/api/interpret/query_parser.ts` | 313 | 确定性查询解析（CATEGORY/MODIFIER/PARAM 规则） | ⚠️ 规则硬编码 |
| `web/app/api/interpret/route.ts` | 688 | API + LLM调用 + **23个Post-process补丁** | ❌ 补丁化重灾区 |
| `web/app/api/interpret/prompt.txt` | 57 | LLM系统提示（generate_all.py生成） | ✅ 自动生成 |
| `web/app/page.tsx` | 620 | 前端：搜索/评分/卡片/对比/CSV | ⚠️ 全量内存扫描 |
| `web/lib/synonyms.ts` | 77 | 销售口语→技术词映射 | ✅ 干净 |
| `web/lib/types.ts` | 61 | 类型定义 | ✅ |
| `scripts/tag_schema.json` | 1146 | **声称的单一真源**（categories/modifiers/params/validations/domain） | ⚠️ 名不副实，见§4 |
| `scripts/tag_config.py` | 426 | 数据侧 品类→参数→标签 提取 | ⚠️ 与parser逻辑重复 |
| `scripts/autofix.py` | 34774B | 数据修复（前缀/冲突/调tag_config） | ⚠️ 巨石 |
| `scripts/audit_data.py` | 29186B | 数据审计 6+项 | ✅ 思路对 |
| `scripts/generate_all.py` | 205 | schema→prompt.txt+wiki | ⚠️ 只生成2类产物 |
| `scripts/extract_v4.py` 等 **16个 extract_\*** | — | 每PDF一个适配器 | ❌ 组合爆炸 |

---

## 2. 数据层现状（最重要：原始文档读取能力）

> 用户明确：**原始文档读取是第一优先级**。PDF 有多行表头、图片、跨厂商异构格式。

### 2.1 四份文档是四种**根本不同**的 PDF 文本布局

这是整个项目最被低估的难点。pdfplumber/pymupdf 抽出的文本顺序，四家完全不同：

| 厂商 | PDF文本布局 | 解析模型 | 实测数据质量 |
|------|------------|---------|------------|
| **思瑞浦-模拟** (55页) | **行优先**：先吐多行表头（碎片化），再吐 PN+值 | 表头合并 + 列对齐 | ⚠️ 262/861 (30%) 表头碎片 |
| **思瑞浦-汽车** | **行优先扁平**：固定6列(型号/状态/封装/描述/可替代/应用)，品类作为标签行嵌入 | 固定schema切分 | ✅ 0% 错误 |
| **纳芯微** (1066) | **列优先（转置表）**：先吐**所有PN**成块，再逐列吐该列所有值 | **需转置重组** | ❌ 34% 串位 + 182款缺section |
| **裕太** (66) | **记录优先**：每产品一段 field:value 竖排，字段顺序固定 | 按记录切分 | ✅ 0% 错误 |

**关键洞察**：干净的两家（汽车/裕太）恰好是"结构规整、一次就对齐"的；
出问题的两家（模拟/纳芯微）都是"表头/列需要重组"的。**问题不是厂商，是布局类型。**

证据样例（思瑞浦-模拟册 PDF 抽出的原始文本，行优先碎片化表头）：
```
Part Number
Status
Rating
Number of      ← "Number of Channels" 被拆成两行
Channels
Supply         ← "Supply Voltage (Min) (V)" 被拆成三行
Voltage (Min)
(V)
...
```

证据样例（纳芯微，列优先转置）：
```
产品型号
NSM2011        ← PN 全部先列出
NSM2011-Q1
NSM2012
... (几十个PN)
源边电阻         ← 然后才是某一列的表头
(mΩ)
0.85           ← 该列所有值
0.85
1.20
...
```

### 2.2 思瑞浦-模拟的真实病灶：表头碎片化（**值是对的**）

实测 262/861 (30%) 产品的 `_params` 表头名错误。**但值与 `_raw` 完全对得上，没有串位。**

实例 TP358（低压运放）：
```
_params: ...Voltage: 2.1 | Voltage: 6 | channel (typ) (μA): 87 | (MHz): 1 | (Typ): 1 ...
_raw:    ...| 2.1 | 6 | 87 | 1 | 1 |...   ← 值正确
```
应该是 `Supply Voltage (Min): 2.1 | Supply Voltage (Max): 6 | Iq per channel (μA): 87 | GBW (MHz): 1 | Slew Rate (Typ): 1`。
错因：PDF 两行表头 `Supply Voltage`+`(Min)` 没合并，退化成裸 `Voltage` + 孤儿 `(MHz)`/`(Typ)`。

按品类分布（碎片表头产品数/品类总数）：
```
49/49  1节-检测MOS        44/44  比较器          24/24  1节-复合IC
23/27  精密运放           20/36  低压运放         19/20  精密ADC
18/19  精密DAC            17/17  电源时序控制      14/16  仪表放大器
11/27  小尺寸封装运放      7/13   数字电流检测      7/15   并联电压基准
```

### 2.3 根因：merge_headers 是"黑名单 if 链"，必然漏

`scripts/extract_v4.py:69` 的 `merge_headers()` 用一堆 `startswith` 硬编码判断"什么算续行"：
```python
(s.startswith('Voltage') and merged) or
(s.startswith('Temperature') and merged) or
(s.startswith('Range') and merged) or
(s.startswith('Current') and len(s) < 20) or
... 十几个硬编码分支
```
这是典型的黑名单思路死局：比较器有 18 种表头变体，永远枚举不完。**这正是"修修补补"在提取层的化身。**

### 2.4 数据层重构方向（建议）

**核心原则：从"每PDF一个适配器 + 黑名单续行判断"换成"布局分类 + 模板驱动 + 列级量纲校验"。**

1. **按布局类型分 4 个解析器（而非按厂商分16个）**：
   - 行优先碎片型（模拟册）
   - 行优先扁平型（汽车册）
   - 列优先转置型（纳芯微）
   - 记录型（裕太）
   新厂商进来先归类到这 4 型之一，而不是写第 17 个 extract。

2. **每个 section 建"权威表头模板"**（列名 + 列数 + 单位）。
   既然选型表的列结构在 datasheet 里是固定的，提取时**按已知列数切分 + 按模板赋名**，
   不靠猜续行。列数对不上 = 立即报警（把现有的 "Column count mismatch" 警告升级成硬校验）。

3. **保留二维网格再序列化**：当前 `_params` 是已拍平的 `"Header: Value"` 字符串，
   一旦错位无法回溯。应先保留 `rows × cols + 表头行索引`，**对齐校验通过后**才拍平。

4. **列级量纲一致性校验**（可全自动、零假阳性）：
   每列做类型/量纲检查。如某列声明 `Isolation (Vrms)` 但 80% 值 < 100，
   或 `Supply (V)` 列值全是 `-40~125`（明显是温度区间）→ 判定该列错位，
   而不是逐个产品改。这是 audit_data.py 应该补强的能力。

5. **思瑞浦-模拟的具体落地**（先做这个）：
   - 因为值已正确，**风险极低**：写一个"表头修复后处理"，按 section 模板把碎片表头映射回标准名，**只改 key 不动值**。
   - 同一份 section→标准表头模板，顺势固化进 extract，根治复发。
   - 修完跑全量审计 + 压测，用"30%→0%"的数据证明。

---

## 3. 查询理解层现状（前端的 FAE 角色理解）

### 3.1 双轨：确定性 Parser + LLM 兜底

- `query_parser.ts`：75条品类规则 + 13条修饰符 + 14条参数规则，号称 80% 查询不走 LLM。
  优点真实：零 token、零幻觉、可测试（test_parser.ts 65 用例 2 秒）。
- 未命中 → `route.ts` 调 DeepSeek（`deepseek-chat`, temp 0.1, max_tokens 200, 8s超时）。
- PN 精确命中 → 直接跳过 LLM（前端文本搜索处理）。

### 3.2 病灶：route.ts 的 23 个 Post-process 补丁

`route.ts` 从第 180 行到第 482 行，是 **23 个连续的 `// Post-process:` 补丁块**。
每一个都是一次"用户报bug → 加个 if"的化石。逻辑本身都对（都是真实领域知识），
问题是它们以**代码 if** 形式散落，而非数据：

```
180 channel count        216 高速→RS485降级        266 X发Y收
185 current              223 隔离485封顶20Mbps      276 XA→Iout
208 大电流               235 RS485/232互斥          297 半双工/全双工
325 非隔离strip隔离       362 TVS strip CAN-FD       371 BMS strip TVS
410 理想二极管strip高压   442 ADC/DAC bit            455 推断缺失品类
479 隔离→加通用标签       ... 等等
```

这些补丁可归纳成 **4 类声明式规则**：
| 类型 | 例子 | 当前实现 |
|------|------|---------|
| **mutex** 互斥 | [RS-485, RS-232]、[TVS/ESD, CAN-FD] | 写死 if |
| **requires/conflicts** 依赖冲突 | 隔离485 → Mbps≤20 | 写死 if |
| **enum** 值域 | Vin∈{5,12,24}, Mbps白名单 | 写死 if |
| **implies** 蕴含 | 栅极驱动+大电流 → 5A | 写死 if |

> 注意：`tag_schema.json` 的 `categories[].conflicts` 字段**已经定义了互斥关系**（如 RS-485 conflicts RS-232），
> 但 route.ts 没读它，而是又在代码里写了一遍。**这就是漂移。**

### 3.3 重构方向（建议）

把 23 个补丁换成 **1 个规则解释器 + tag_schema.json 里的声明式规则**：
- 在 schema 里补全 mutex/requires/enum/implies 四类规则段。
- route.ts 用一个通用 `applyRules(features, schema.rules)` 替换所有 Post-process 块。
- **加品类 = 改 schema 一行**，不再改 TS 代码。

---

## 4. "单一真源"的真相（架构最大裂缝）

> ARCHITECTURE.md 声称 `tag_schema.json` 是单一真源，`generate_all.py` 生成所有派生文件。
> **实测：这只对了一半。**

`generate_all.py` 实际只生成 **2 类产物**：
- ✅ `prompt.txt`（LLM提示）
- ✅ `wiki/*.md`（知识库文档）
- ❌ **没有**生成 `query_parser.ts` 的 CATEGORY_RULES（手写硬编码）
- ❌ **没有**生成 `route.ts` 的 VALID_TAGS（手写硬编码，route.ts:382）
- ❌ **没有**生成 23 个 Post-process 规则
- ❌ `generate_valid_tags()` 只 `print` 一个计数，**根本不写文件**（generate_all.py:175-188）

**结果：标签/规则逻辑实际散落在 11 个文件**（实测 grep）：
```
query_parser.ts、route.ts（VALID_TAGS+23补丁）、tag_config.py、autofix.py、
extract_v3/v4/v5.py、extract_auto.py、validate.py、llm_audit.py、extract_toc.py
```

更糟：`tag_config.py`（Python，数据侧）和 `query_parser.ts` 的 PARAM_RULES（TS，查询侧）
**各自实现了同一套阈值逻辑**（同样的 `[200,150,100,50,20,10,5,2,1]` Mbps 阈值、同样的 Iout_/Vin_ 前缀）。
**一处改了另一处不会跟着改** → 这是数据侧标签和查询侧标签漂移的根源。

### 真正的单一真源应该是（建议）

```
tag_schema.json (扩展后含 categories/modifiers/params/rules/constraints)
        │
        ├──(generate)──→ prompt.txt              (已有)
        ├──(generate)──→ wiki/                   (已有)
        ├──(generate)──→ query_parser 规则表      (新增, 或运行时直接读JSON)
        ├──(generate)──→ route VALID_TAGS+rules   (新增)
        └──(import)────→ tag_config 提取阈值       (新增, Python侧读同一JSON)
```
让 TS 侧和 Python 侧**读同一份 schema**（TS 直接 import JSON，Python json.load），
彻底消灭"两种语言各写一遍阈值"。

---

## 5. 前端交付层现状

### 5.1 数据流
- 启动时 `fetch('/data/products_structured.json')` **全量载入内存**（2245款，现在撑得住）。
- 搜索：输入清洗 → synonyms 扩展 → 对每个产品 `Object.values().join(' ')` 拼成大字符串做 `includes` 匹配。
- AND 逻辑：所有原始词必须命中（防假阳性，符合用户铁律）。
- LLM 高置信特征：要求**全部命中**（token 级精确匹配）才算 perfect fit（+20分）。
- `exclude_tags` 过滤：parser/LLM 给的排除标签在前端 token 级过滤产品。

### 5.2 交付物
- **产品卡片**：PN + 厂商 + 评分 + 品类标签 + 6条参数 + 命中词 + 加入对比。
- **建议横幅**：route.ts 生成（"最接近TPL8032(4/5条件, PSRR:70dB, Vout:5V)"，含参数值）。
- **对比面板**：底部固定，产品卡纵向展示各自参数（非矩阵），"原始文档参数"独立分组，CSV导出带 `\uFEFF` BOM 头（Excel中文不乱码）。

### 5.3 局限（非当前最痛，规模到了再处理）
- 参数全是字符串，无法做数值范围查询（"PSRR>70dB 且 Vout=5V" 做不了，只能靠预生成离散标签近似）。
- 全表线性扫描 + 字符串 includes，无索引。2245款可接受，上万款需要倒排索引或 SQLite/DuckDB。
- `_params` 错位（§2.2）直接污染卡片展示和匹配——**所以数据层是地基，必须先修**。

---

## 6. 测试体系（已有，需扩展）

```bash
python3 scripts/test_all.py   # ~4-6秒
```
| 层 | 测试 | 用例 |
|---|------|------|
| Parser | test_parser.ts | 65 |
| 数据 | audit_data.py | 6+项 |
| 搜索 | test_search_quality.py | 10 |
| 品类 | category_pressure_test.py | 39品类 |

**缺口**：没有"提取层"的测试。表头碎片/列错位这类 bug 现在只能靠人工发现。
建议补 **extract 回归测试**：对每个 section 断言"标准表头模板 + 列数 + 量纲"。

---

## 7. 已知 Bug 类别（调试时优先排查）

| 类别 | 症状 | 根因 | 正确修法 |
|------|------|------|---------|
| 表头碎片化 | `Voltage:`×2、孤儿`(MHz)` | merge_headers黑名单漏 | section表头模板 |
| 列错位（转置） | 温度值出现在Supply列 | 列优先布局没转置 | 转置解析器+量纲校验 |
| Regex贪心 | "1mv"→"1Mbps" | 无上下文守卫 | 后缀检查守卫 |
| 标签值虚标 | "精密≤1mV"但Vos>1mV | 无约束校验 | schema constraints |
| mA≠A | 200mA误当200A | 单位未检测 | params标签+raw联合推断 |
| kBPS≠Mbps | 速度标签虚高 | 单位换算漏 | 按key后缀判单位 |
| Section误判 | TPDA(ASN音频)标成CAN-FD | section映射错 | ASN守卫+param验证 |
| 规则漂移 | parser与prompt不一致 | 非单一真源 | schema统一生成 |
| 前端缓存 | 改码不生效 | .next缓存 | `rm -rf web/.next` 重启 |

---

## 8. 接手模型的建议动手顺序（按投入产出比）

> 严格遵守用户铁律：**零假阳性 / 系统性修复不打补丁 / 修完审计+压测拿数据证明 / 参数=PDF原文不做语义推断 / 禁止对乱码产品自动打标签**。

### 第1优先（地基）：思瑞浦-模拟 表头碎片化
- 写 section→标准表头模板表（取每 section 内最完整+最高频的表头作模板候选，**交用户FAE确认**）。
- 写表头修复后处理：按模板映射碎片表头回标准名，**只改key不动值**（风险极低）。
- 跑全量审计 + category_pressure_test，证明 30%→0%。
- 模板顺势固化进 extract，根治复发。

### 第2优先（止血）：route.ts 23补丁 → schema声明式规则
- schema 补全 mutex/requires/enum/implies。
- route.ts 用通用规则解释器替换 23 个 Post-process。
- 跑 test_parser.ts + test_search_quality.py 确认零回归。

### 第3优先（真正的单一真源）
- 让 query_parser.ts / route.ts VALID_TAGS / tag_config.py 阈值**都读同一份 schema**。
- generate_all.py 真正生成 parser 规则表（或运行时直接读JSON）。
- 消灭 TS/Python 双写阈值。

### 第4优先（清债）：16个extract → 4个布局解析器
- 按布局类型（行优先碎片/行优先扁平/列优先转置/记录型）重组。
- 归档 63 个脚本里不再用的（6个fix_yutai_*、多个extract_missing_*等）。
- 然后才轮到纳芯微/汽车/裕太逐个调通。

---

## 9. 启动 & 验证命令

```bash
cd /Users/zhouchong/projects/warehouse/web
npm run dev                              # 前端 http://localhost:3000
rm -rf web/.next                         # 改代码不生效时全清

cd /Users/zhouchong/projects/warehouse
python3 scripts/test_all.py              # 全量测试
python3 scripts/audit_data.py --fix      # 数据审计+自动修复
python3 scripts/generate_all.py          # schema→prompt+wiki
```

环境：DeepSeek 官方直连（`https://api.deepseek.com/v1`，`DEEPSEEK_API_KEY` 在 `.env`）。
route.ts 用 `deepseek-chat` 模型做查询理解。

---

## 10. 给接手模型的核心提醒

1. **数据层是地基**。前端再聪明，`_params` 错位就一切白搭。先把思瑞浦-模拟的 30% 表头修干净。
2. **不要再加第 24 个 Post-process if**，也不要写第 17 个 extract 脚本。看到要加 if 时，先问"这能不能变成 schema 里的一条数据规则"。
3. **单一真源现在是假的**。任何标签/规则改动，先确认改的是不是会被多处重复定义的东西。
4. **零假阳性是硬约束**。修复前先全量扫同类问题，修复后必须审计+压测，用数字说话。
5. **参数 = PDF 原文**。不做语义推断，不对乱码产品自动打标签（需人工审核）。

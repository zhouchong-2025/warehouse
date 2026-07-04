# Warehouse 芯片选型搜索平台 — 架构文档

> 最后更新: 2026-07-04  
> 部署: Vercel (https://tw.zhouyixi.xyz) | 项目ID: prj_NYtRAuhHd4WroZtz0VE33VlOYwI7

---

## 1. 项目总览

### 1.1 产品定位
半导体芯片选型搜索平台，用户输入自然语言查询（如"有没有隔离驱动"、"48V转12V 1A"），系统通过「Parser + LLM」两级理解 → 约束匹配 → 排序推荐，返回最匹配的芯片型号。

### 1.2 数据规模
- **产品总数**: 2188 款（纳芯微 966 + 思瑞浦模拟 894 + 思瑞浦汽车 260 + 裕太微 68）
- **霆宝优选**: 135 款，搜索结果中置顶 + badge 标记
- **代码量**: API 层 3196 行 + 前端 1073 行 + 辅助库 551 行

### 1.3 技术栈
- 框架: Next.js 15 (App Router) + TypeScript
- AI: DeepSeek Chat API（LLM 语义理解）
- 部署: Vercel (GitHub 集成, 自动部署 master 分支)
- 域名: tw.zhouyixi.xyz (阿里云注册, DNS 指向 Vercel)

---

## 2. 核心架构

### 2.1 整体数据流

```
用户输入 query
    │
    ▼
┌─────────────────────────────────────┐
│  1. query_parser.ts (Parser层)      │  ← 确定性规则引擎
│     品类匹配 / 修饰符 / 参数提取    │     80% 查询不碰 LLM
│     输出: features, needsLLM, residual│
└─────────────────────────────────────┘
    │
    ▼  needsLLM=true?
    │
┌─────────────────────────────────────┐
│  2. route.ts (LLM层)                │  ← DeepSeek Chat API
│     SYSTEM_PROMPT + llmQuery        │     语义补全 + 非确定性推断
│     超时12s fallback到parser        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  3. must/nice 组装                  │  ← route.ts
│     品类层级消解 + 动态泛品类剔除   │     CATEGORY_HIERARCHY
│     精确值优先 + LLM nice分类       │     CATEGORY_HINT_MAP
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  4. constraint-match.ts (约束层)    │  ← 全量产品匹配 + 降级
│     tagSatisfied() — 标签命中判定   │     维度感知三级降级
│     scoreByConstraints() — 评分排序 │     霆宝优选加分
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  5. page.tsx (前端渲染)             │  ← 结果展示 + 对比面板
│     优选置顶 / badge 分层 / 建议   │     CSV导出 / 条件高亮
└─────────────────────────────────────┘
```

### 2.2 关键设计原则

| 原则 | 说明 |
|------|------|
| **LLM=语义权威, Parser=精确提取** | LLM 理解"工规→工业级"/"DCDC→降压"，Parser 只做 regex 精确数值 |
| **Parser 永不丢弃特征** | LLM 超时/失败时 fallback 到 Parser 输出，不丢失任何信息 |
| **品类标签单一真源** | CATEGORY_RULES → CATEGORY_TAG_NAMES 导出 → route.ts 复用 |
| **精确值优先** | 用户给具体数字（48V）→输出 Vin_48V，不用模糊标签（高压≥30V） |
| **泛品类动态剔除** | 具体品类存在时自动删除泛品类（DCDC→删电源，CAN-FD→删接口） |
| **零匹配守卫** | must 标签全库零命中 → 生成替代建议，不返回误导性结果 |

---

## 3. 模块详解

### 3.1 query_parser.ts (Parser 层) — 914 行

**职责**: 确定性规则引擎，处理 80% 的标准查询。

**三套规则体系**:
- `CATEGORY_RULES` — 品类匹配（~70条规则），优先级排序，先精确后模糊
- `MODIFIER_RULES` — 修饰符标签（车规/低功耗/高速/通道数等）
- `PARAM_RULES` — 数值参数提取（电压/电流/速率/分辨率），matchAll 全量

**核心输出**:
```
features:        ["隔离"]          — 已识别的标签
residualQuery:   "驱动"            — 残词（Parser 不认识的）
needsLLM:        true              — residualClean.length>0 → 触发LLM
category_hint:   "隔离"            — 品类提示
must/mustMeta:   约束化输出         — 硬约束维度标注
```

**关键设计决策**:
- `needsLLM` 阈值: residual 有任意有意义字符（含中文/数字）→触发，不再限制>3字符
- 多品类共存: `break→continue` + `seenHints`，允许不同 category_hint 标签同时存在  
- 品类维度判定: CATEGORY_TAG_NAMES 从 CATEGORY_RULES 动态导出

### 3.2 route.ts (编排层) — 990 行

**职责**: 协调 Parser + LLM，组装 final must/nice，调用约束层。

**LLM 调用的三段式**:
1. `needsLLM=false` → 纯 Parser 结果，跳过 LLM（低延迟）
2. `needsLLM=true` → Promise.race: LLM(12s) vs timeout
3. catch → fallback 到 Parser，永不丢弃特征

**must/nice 组装逻辑**:
- Parser must → 权威结构化输出
- LLM nice_features → 哪些标签放松为 nice
- LLM features → Parser 遗漏的新标签补充
- CATEGORY_HIERARCHY → 子类存在时删父类（隔离栅极驱动→删栅极驱动/驱动/隔离）
- CATEGORY_HINT_MAP → 动态泛品类剔除（DCDC hint=电源 → 删电源）

**SYSTEM_PROMPT** (74-181行):
- 四大领域知识: 电源管理 / 信号链 / 接口隔离 / 传感器驱动
- Few-shot 示例: 标准查询格式示范
- 品类层级规则: 子类/父类关系声明
- 精确数值要求: 给定具体数字→输出精确标签

**Debug 支持**:
```json
_debug: { llmCalled, llmSucceeded, llmError, llmRawFeatures, parserFeatures, residualQuery }
```

### 3.3 constraint-match.ts (约束匹配层) — 943 行

**职责**: 全量产品 × 约束条件匹配 → 评分排序。

**核心函数**:
- `tagSatisfied(product, tag, meta)` — 标签是否命中产品
  - 品类/等级: 查 section → params → features（含连字符标准化 + 品类同义词）
  - 规格数值: 查 _features token 精确匹配 + 向下兼容
  - 通用回退: 查 _params + _detail_intro + _detail_features
- `scoreByConstraints(products, must, nice, mustMeta, sortKey)` — 完整评分
  - must 全中 → tier 1; nice 加持 → 加分
  - 维度感知降级: category/grade → 可就近放松; media → 硬约束
- `applyConstraints()` — 硬过滤 + 排序

**约束维度**:
| 维度 | 说明 | 降级策略 |
|------|------|---------|
| category | 品类标签 | 绝不放松 |
| media | 物理层介质 | 硬约束 |
| spec | 规格数值 | 就近妥协，downgradable 向下兼容 |
| grade | 等级（车规/工业级） | 可放松 |

### 3.4 param-defs.ts (参数定义) — 219 行

**职责**: 所有数值参数定义的单一真源，Parser/约束层/LLM prompt 统一派生。

**已定义参数**: Mbps, kVrms, Vin, Vout, Iout, 通道数, bit, 端口数  
**扩展方式**: 加一条 ParamDef → parserRules + tagPattern + llmGuidance 三处自动生效

### 3.5 前端 page.tsx — 1073 行

**功能**: 搜索框 → API 调用 → 结果卡片 → 对比面板 → CSV 导出

**关键交互**:
- 优选料号: 置顶 + "霆宝优选" badge
- 对比面板: 产品卡片纵向展示各自参数（非矩阵表格）
- 证据来源: 参数表 / 选型表 / 产品介绍 / 产品标签
- CSV 导出: BOM 头 (\\uFEFF) 保证 Excel 中文不乱码

---

## 4. 数据层

### 4.1 products_structured.json
```
{ "vendor_slug": { "name": "厂商名", "products": [...] } }
```
每个产品结构:
```json
{
  "part_number": "TPT7482",     // 型号
  "_features": "RS-485 隔离 20Mbps",  // 特征标签(token)
  "_section": "隔离RS-485 选型表",     // 来源章节
  "_params": "VCC: 3.3V | 数据速率: 20Mbps | ...",  // 参数键值对
  "_detail_intro": "...",              // 产品介绍(零token成本用于detailBonus)
  "_detail_features": "...",           // 产品特性
  "_params_numeric": {...}             // 结构化数值
}
```

### 4.2 preferred_pns.json — 霆宝优选料号列表，135款
- 搜索结果中自动置顶
- 完全匹配 + 优选 = "霆宝优选" badge
- 非优选产品不标记

---

## 5. 部署架构

### Vercel 配置
| 项目 | 值 |
|------|-----|
| 项目ID | prj_NYtRAuhHd4WroZtz0VE33VlOYwI7 |
| 仓库 | zhouchong-2025/warehouse, 分支: master |
| 构建命令 | `next build` (跳过 prebuild 避免缓存) |
| Root Directory | web/ |
| 环境变量 | DEEPSEEK_API_KEY (encrypted) |
| 域名 | tw.zhouyixi.xyz, teampo-warehouse-mu.vercel.app |

### 部署注意事项
- **构建缓存**: prebuild 产物会被缓存，改 `buildCommand` 为 `next build` 直连
- **API key**: Vercel env var 不与本地 .env.local 同步，需独立配置
- **HMR问题**: Turbopack 对 API 路由不可靠，改 API 后需全量重启 (kill + rm .next + npm run dev)

---

## 6. 架构自检

### 6.1 已解决的问题（近期）
1. ✅ needsLLM 阈值归零 — "隔离驱动" 残词"驱动"触发 LLM
2. ✅ _debug 注入所有返回路径 — 调试 LLM 调用状态
3. ✅ too_many 守卫放行 needsLLM 查询 — Parser 不完全理解时不拦截
4. ✅ Vercel API key 同步 — 本地/生产环境 key 统一
5. ✅ 泛品类动态剔除 — CATEGORY_HINT_MAP 自动消解
6. ✅ 品类标签匹配 _features — 除 section/params 外还查特征文本
7. ✅ DCDC 品类同义词 — section 为"降压/buck"也识别为 DCDC
8. ✅ 纳芯微 I2C/RS-485 数据补全 — 966款含11款手动补入

### 6.2 潜在问题 / 技术债

| 优先级 | 问题 | 影响 | 建议 |
|--------|------|------|------|
| 🔴 P1 | `_debug` 在 catch 路径未设置 | LLM 超时时无法确认问题 | 在 catch 块也设 _debug |
| 🔴 P1 | 无请求级日志 | 生产问题无法追踪 | 加 requestId + 耗时 + 关键路径埋点 |
| 🟡 P2 | SYSTEM_PROMPT 标签列表硬编码 | 新增品类需手动同步 prompt | 改为从 CATEGORY_RULES 动态生成 |
| 🟡 P2 | constraint-match 内联 CATEGORY_SYNONYMS | 同义词散落两处 (parser/constraint) | 统一到 query_parser 导出 |
| 🟡 P2 | SEMANTIC_ALIASES 为空对象 | 语义别名引擎未投入使用 | 接入 semantic-evidence.generated.ts |
| 🟡 P2 | 品类层级消解仅支持1:1映射 | "隔离式栅极驱动器"变体需显式列出 | 考虑模糊匹配或同义词归一化 |
| 🟢 P3 | products_structured.json 5.7MB | 冷启动加载慢 | 考虑分vendor懒加载或预索引 |
| 🟢 P3 | 无产品数据版本管理 | 数据更新无迹可查 | 加入 dataVersion 字段 + 构建时校验 |
| 🟢 P3 | 约束回归测试手工运行 | 新增规则可能引入回归 | CI 集成 test_constraint_layer.py |
| 🟢 P3 | page.tsx 单文件 1073 行 | 维护困难 | 拆分为 SearchBar / ResultsList / ComparePanel 组件 |

### 6.3 架构边界模糊点

1. **Parser vs LLM 的职责边界**: 当前 `CATEGORY_RULES` 中已有语义理解（如"隔离栅极驱动" vs "非隔离栅极驱动"），这部分是否应收敛到 LLM？设计原则是 Parser 做确定性的、LLM 做模糊的 — 但当前隔离化合物规则已跨入语义范畴。

2. **must/nice 的 LLM nice_features 机制**: LLM 输出的 `nice_features` 直接决定哪些标签放松为 nice，但 LLM 可能过度放松（如把"半双工"变成 nice 导致全双工/半双工混排）。当前没有对 LLM nice 判定的校验层。

3. **品类层级消解的双向不对称**: CATEGORY_HIERARCHY 只定义了子→父方向（DCDC→电源），但父→子方向未定义。如果 LLM 输出"电源"，没有机制将其分解为 DCDC/LDO 子查询。

### 6.4 扩展方向

**增加产品记录**:
- 新增厂商: 在 `products_structured.json` 加 vendor_slug 节点
- PDF 提取: 用 MinerU API 解析选型表 PDF → extract_coord 提取 → 注入 JSON
- 优选料号: 更新 `preferred_pns.json`

**查询逻辑补强**:
- 端到端测试框架: 查询 → 期望结果 → 自动验证
- A/B 评测: LLM prompt 变体效果对比
- 用户反馈闭环: 点击/对比行为信号回传优化排序
- 跨品类推荐: 当目标品类零结果时，推荐相邻品类（如隔离RS-485→普通RS-485+外置隔离）

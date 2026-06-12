# 数值排序意图 SortIntent — 进度（2026-06-11）

## 背景
FAE 报告"高PSR的LDO"推荐没按 PSRR 从高到低排。

## 根因
1. parser 规则 `/高psrr/`（双r）漏了"高psr"（单r）→ 意图丢弃
2. 全平台排序只有布尔标签命中计数，无"按数值列排序"能力（核心缺口）
3. 整类查询中招：高PSRR/低噪声/大电流/低压差/低Iq

## 已完成（代码层，已验证）
- query_parser.ts: SortIntent 类型 + SORT_RULES(5条) + sortKey 派生
- route.ts: sortKey 独立透传（不门控以太网）
- constraint-match.ts: sortValueOf() + compareBySort() + applySort() + tier1 数值排序集成
- page.tsx: sortKey 传入 applyConstraints + banner 显示 label + 类型扩展
- next build 通过，TypeScript clean
- test_constraint_layer.py: 22/22（18 原有零回归 + 4 新 SORT_CASES）
- test_all.py: 全部通过

## 验证数据
- 高psr的ldo → PSRR 110>96>89>82... 单调递减，45款，过滤55款无PSRR数据
- 低压差ldo → Dropout 从低到高，23款
- 大电流ldo → 输出电流从大到小，45款
- require=true: 无该参数数值的产品直接不显示（FAE确认）

## 举一反三发现 + 已修根因（代码层）
- BMS AFE 误标 LDO：autofix.py PREFIX_TAG `TPB798/TPB771→LDO` 把电池监控芯片误标
- 修复1: 删除两条错误前缀规则（实测零真LDO命中，纯误伤）
- 修复2: 加架构级护栏 A5（品类互斥）：section 含电池监控/BMS/高边驱动等非稳压器品类时剥离 LDO/DCDC
- 实测 A5 精确命中 4 款误标，零真LDO误伤

## 待 FAE 确认（数据写回）
autofix.py 的 A5 护栏要生效到主数据，需运行 autofix.py 重写 products_structured.json（4款BMS去LDO标签）。
按铁律：写主数据需 FAE sign-off。当前代码已就绪，等确认后执行：
  python3 scripts/autofix.py → 验证 4款BMS不再带LDO → test_all.py 复测

## 核心文件
见 skill chipselect-platform/references/numeric-sort-intent-2026-06.md

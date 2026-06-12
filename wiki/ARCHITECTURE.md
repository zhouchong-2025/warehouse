# Teampo 选型平台 — 系统架构文档

> 版本: 2026-06-07 | 模型交接文档

## 项目概述

半导体芯片智能选型平台，支持自然语言查询 → 结构化标签 → 产品匹配 → 智能推荐。
当前覆盖：思瑞浦(3peak-analog) 861款、思瑞浦汽车(3peak-auto) 252款、纳芯微(novosense) 1066款、裕太微(yutai) 66款。

**核心价值**：FAE/PM 用自然语言描述需求（"轨到轨运放 offset 小于 1mv"），系统理解并返回精确匹配的芯片型号，不依赖对型号的记忆。

---

## 架构全景

```
用户输入 "非隔离 rs485 高速"
        │
        ▼
┌──────────────────────────────────┐
│  query_parser.ts (确定性规则引擎)  │  ← 75条品类规则 + 13条修饰符 + 14条参数
│  输出: features + exclude_tags    │     80% query不走LLM
└──────────────┬───────────────────┘
               │ needsLLM? ──Yes──→ LLM (prompt.txt) ──→ 合并结果
               │ No
               ▼
┌──────────────────────────────────┐
│  route.ts (API层)                │  ← post-process: 白名单过滤、互斥、上下限
│  输出: {features, exclude_tags,  │
│         suggestions, confidence} │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│  page.tsx (前端)                 │  ← 文本匹配 + LLM标签匹配 + exclude过滤
│  渲染产品卡片 + 建议横幅          │
└──────────────────────────────────┘
```

### 数据管道（离线）

```
PDF (思瑞浦-模拟产品选型册_2026.pdf)
  │
  ▼ extract_v5.py (文本法90% + 坐标法10%回退)
  │
  ▼ autofix.py (前缀修正 + 冲突解决 + 调用tag_config)
  │
  ▼ tag_audit.py (标签缺口/未覆盖参数/阈值自发现)
  │
  ▼ build_prompt.py → prompt.txt
  │
  ▼ products_structured.json (861款3peak-analog)
```

---

## 文件清单

| 文件 | 角色 | 关键内容 |
|------|------|----------|
| `web/app/api/interpret/query_parser.ts` | **核心引擎** | CATEGORY_RULES(75条), MODIFIER_RULES(13条), PARAM_RULES(14条), 中文数字归一化, 上下文守卫 |
| `web/app/api/interpret/route.ts` | API + post-process | LLM调用, 白名单过滤(VALID_TAGS), 互斥处理, exclude_tags透传 |
| `web/app/api/interpret/prompt.txt` | LLM系统提示 | 自动生成自build_prompt.py, few-shot示例 |
| `web/app/page.tsx` | 前端 | 文本匹配, LLM标签匹配, exclude过滤, 导出CSV |
| `web/public/data/products_structured.json` | 数据层 | 所有产品的section/features/params |
| `scripts/tag_schema.json` | **单一真源** | 品类/修饰符/参数/校验规则/同义词/已知陷阱 |
| `scripts/generate_all.py` | 生成器 | schema → prompt.txt + wiki/ |
| `scripts/validate_tags.py` | 约束引擎 | 从schema读取约束, 供autofix和audit共用 |
| `scripts/autofix.py` | 数据修复 | PREFIX_TAG, SECTION_TO_TAG, 参数→标签, 调用tag_config |
| `scripts/tag_config.py` | 标签生成 | 品类→参数→标签规则 |
| `scripts/audit_data.py` | 数据审计 | 6+项检测, 两层(自动修+弹确认), --fix自动修复 |
| `scripts/extract_v5.py` | PDF提取 | 文本法+坐标法混合 |
| `scripts/test_parser.ts` | Parser测试 | **65条**用例, 0 token, 2秒 |
| `scripts/test_search_quality.py` | 搜索质量 | **10条**用例, 验证query→产品匹配 |
| `scripts/category_pressure_test.py` | 品类压测 | 39品类, 97%通过率 |
| `wiki/` | 知识库 | 同义词映射, 已知陷阱, 标签体系, 跨厂商参数 |

---

## 关键架构决策

### 1. 确定性Parser优先 + LLM兜底
Parser处理80%查询(品类/参数明确的), LLM只处理模糊查询。
好处: 零token成本、零幻觉、可测试。

### 2. exclude_tags通道
非隔离 → exclude_tags=["隔离","隔离栅极驱动",...] → API透传 → 前端过滤产品。
单一数据流, Parser和前端消费同一套规则。

### 3. tag_schema.json单一真源
标签规则只在一处定义, generate_all.py生成prompt.txt/wiki/等派生文件。
加新标签 = 改schema一行。

### 4. 约束引擎(validate_tags.py)
标签值约束(精密≤1mV, 轨到轨需要RRI=Yes)从schema读取。
autofix和audit共用, 避免"先删后加"的死循环。

### 5. 中文数字归一化
query_parser.ts内置CN_DIGITS映射, "三发五收"→"3T5R"。
影响所有param规则。

---

## 已知Bug类别(每次调试优先检查)

| 类别 | 症状 | 修复方式 |
|------|------|----------|
| **Regex贪心** | "1mv"→"1Mbps", "1ma"→"1Mbps" | 上下文守卫(检查后续字符) |
| **标签值虚标** | "精密(≤1mV)"但Vos>1mV | tag_schema.json约束 + audit检测 |
| **Regex方向** | 只匹配"offset 1mv"不匹配"1mv offset" | 双向regex |
| **Token拆分** | 标签含空格→前端split拆散 | audit TAG_HAS_SPACES检查 |
| **auto-fix顺序** | 先删后加→死循环 | 先加后删 |
| **\\b对中文** | `\b隔离\b`不匹配中文 | 改用token匹配或加u标志 |
| **中文数字** | "三发五收"不被\d+识别 | CN_DIGITS归一化 |
| **Section误判** | TPDA(ASN音频)被标CAN-FD | autofix ASN守卫 + param验证 |
| **前端缓存** | 改代码不生效 | rm -rf .next 全清重启 |

---

## 测试体系(每次改代码跑)

```bash
python3 scripts/test_all.py   # 6秒, 全量验证
```

| 层 | 测试 | 用例数 | 耗时 |
|---|------|--------|------|
| Parser | test_parser.ts | 65 | 2s |
| 数据 | audit_data.py | 6项 | 2s |
| 搜索 | test_search_quality.py | 10 | 1s |
| 品类 | category_pressure_test.py | 39 | 60s |

---

## 待优化项

1. **PHY标签粒度**: 百兆/千兆/T1-PHY全映射到"千兆"标签, 需拆分
2. **novosense空section**: 184款产品缺section(提取格式问题), 需重提取
3. **garbled params**: 87款参数乱码(merge_headers失败), 需v5坐标法重提取
4. **parser→LLM规则同步**: Parser规则和prompt.txt规则可能漂移, 需generate_all.py自动同步
5. **前端搜索结果展示**: 产品卡片不显示关键参数值(PSRR/noise/Vos), 用户需点详情
6. **建议横幅质量**: 建议有时不够具体, 缺少参数值对比

---

## 系统性修复协议(7步)

当用户报告bug时:
1. **复现** — 确认问题
2. **归类** — 这个bug属于哪个已知类别?
3. **扫全量** — audit_data.py或自定义扫描找出所有同类问题
4. **修最底层** — 优先改tag_schema.json约束, 而非逐个改代码
5. **加回归测试** — test_parser.ts或test_search_quality.py
6. **跑test_all.py** — 确认零回归
7. **更新本文档** — 如果发现了新的bug类别

---

## 启动命令

```bash
cd /Users/zhouchong/Projects/warehouse/web
npm run dev                    # 前端 http://localhost:3000
python3 scripts/audit_data.py --fix   # 数据审计+自动修复
python3 scripts/test_all.py           # 全量测试
```

# 智能选型约束层 — 架构与进度（存档，供续接）

> 2026-06-11 | must/nice 硬约束 + 三级降级，从裕太以太网灰度推广到思瑞浦模拟全品类

## 一、核心架构（已落地）

### 问题：关键词词袋打分 ≠ 专业 FAE 筛选
旧逻辑是「标签 substring 叠加打分」，命中越多分越高。导致：
- TX/T1 等互斥项一起返回（物理层不该叠加）
- 「5口」查询把 8口、PHY 都捞出来（规格当加分项而非硬约束）

### 方案：维度感知的 must/nice 约束 + 三级降级
must 分 4 个维度（query_parser.ts 派生 mustMeta，constraint-match.ts 消费）：
- **category**（品类：交换机/运放/LDO）：硬维度，降级时绝不放松
- **media**（物理层：TX/T1/FX）：硬维度，物理层错=不能用
- **spec**（规格：端口/通道/电压/电流/速率）：软维度，可就近妥协
- **grade**（等级：车规/工业级）：软维度，可放松

降级时按维度优先级放松：先保 category+media，再松 grade，最后松 spec。

### 端口/通道向下兼容（解读B，用户确认）
- tier1：端口/通道「要N，≥N也满足」（8口可当5口用），但**精确N排最前**（exactBonus×3加权）
- 「五口交换」→ YT9215(5口精确)排前5，YT9218(8口兼容)排后面兜底
- 「8口交换机」→ 5口不满足（5<8），只出8口

### 规格超限诚实说明（选项B，用户确认）
- 端口/通道要求 > 库存最大值时（如要9口但最多8口），不展示低规格冒充
- banner 明说「交换机当前最多8口（无9口产品）…如需更多口请联系FAE评估级联方案」
- 展示库存上限（8口）产品作为能力边界

### 同义词归一 + 语义歧义消解
- 车载=车规=车用=汽车级（query_parser MODIFIER_RULES）
- 泛「车载XX」→车规等级(nice)；明确「t1/单对线」→T1物理层(must)
- 「车载五口交换机」=「车规五口交换机」结果完全一致

### 门控（灰度白名单，page.tsx CONSTRAINED_CATEGORIES）
已验证品类：以太网 / 电源 / 电源保护 / 放大器 / 比较器 / 接口 / 隔离接口 / 数据转换
未列入的品类 must 为空，走老的 substring 逻辑（零影响）。

## 二、数据层根因修复（贯穿铁律：领域知识打标，不靠前缀猜）

### 物理层介质（extract_coord.py）
FE PHY 默认含 100Base-TX 基础层（IEEE 802.3）；100FX 叠加；
T1(100Base-T1/1000Base-T1) 是替代 TX 的独立物理层，不叠加 TX。
- YT8522「FE PHY 支持100FX」→ TX + FX 都标
- YT8010A「100Base-T1」→ 仅 T1-PHY
- YT8614QC「4Fiber」→ 仅 100FX；YT8614C/H「4GCombo」→ 千兆

### 品类标签靠 section 派生，删除前缀映射误判（autofix.py）
**根除的 3 类前缀误判**（补丁式硬编码遗毒）：
- `TP60→DCDC`：误伤 TP6001/6002/6004（实为运放）
- `YT851/852/853→网卡`：误伤 85系列 PHY（PHY≠网卡）
- `YT882→交换机`：误伤 88系列 PHY
互斥校验（A3/A4块）：运放/比较器不得有 DCDC；PHY section 不得有网卡/交换机。

### DCDC = 降压 + 升压统称（autofix.py A2块）
降压/升压变换器产品补 DCDC 标签（Buck+Boost 工业统称，确定领域知识）。
「DCDC」查询召回所有开关电源，「降压」查询仍精确。77款全覆盖，0误标。

## 三、查询层物理层映射对称（query_parser.ts MODIFIER_RULES）
tx→100Base-TX，fx→100FX，t1→T1-PHY（三者对称，区别于 MAC 侧 RGMII/SGMII）。
★关键教训：「DCDC/tx/t1」查询走 parser 规则就跳过 LLM，改 route.ts 的 prompt 无效，
  真正的修复点在 query_parser.ts 规则。

## 四、回归测试（已固化）
`scripts/test_constraint_layer.py` — 12 个 case 全绿，覆盖：
物理层互斥 / 端口精确 / 网卡vs PHY / DCDC统称 / 三级降级 / 思瑞浦多品类。
用法：`npm run dev` 后 `python3 scripts/test_constraint_layer.py`。

## 五、全库健康（autofix + numerify 后）
- 各 vendor：思瑞浦模拟894 / 思瑞浦汽车260 / 纳芯微537 / 裕太68 = 1759
- 品类标签自洽审计：0问题（PHY非网卡、运放非DCDC、网卡仅YT6801系列）
- numerify：1499/1759

## 六、下一步（推广剩余品类）
扩展 CONSTRAINED_CATEGORIES 前，须对目标品类：
1. 抽样审计产品 _features 标签质量（前缀映射误判、参数乱码）
2. 跑该品类压测 case，确认 must 硬过滤召回正确
3. 通过后加入白名单
候选：BMS / 栅极驱动 / 电流传感器（纳芯微为主，标签质量待验证）

## 注意
- extract_coord.py extract_yutai() 返回 (all_products: dict[PN], seccols)
- pipeline 顺序：extract_coord --vendor → autofix.py → numerify_params.py
- 数据层根因修复，禁止在 route.ts 加 Post-process 补丁
- 补丁脚本已归档至 scripts/_archived/（fix_yutai_v3/v4, refix_yutai_fast）

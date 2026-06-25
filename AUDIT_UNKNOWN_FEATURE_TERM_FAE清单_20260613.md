# UNKNOWN_FEATURE_TERM FAE清单（2026-06-13）

目标：处理 `scripts/audit_data.py` 当前剩余的 `UNKNOWN_FEATURE_TERM` backlog。

当前状态（已收口 / CLOSED）：
- total: 0
- high: 0
- medium: 0
- low: 0
- 本轮已完成从 57 → 24 → 15 → 0 的系统收口
- 处理结论：
  1. 可并入已有 canonical/function tag 的项，已提升到规则层
  2. 其余经 FAE 拍板“不要建 tag”的项，已按描述/噪声处理

本清单已完成使命，保留作为审计收口记录。

---

## A. 候选：可直接映射到现有 canonical tag

这组不建议新建 tag，优先考虑并入现有 canonical tag。

### A1. `integreted ldo` → 候选并入 `LDO`
- count: 2
- section: `SBC`
- PNs:
  - `TPT10283Q`
  - `TPT10285Q`
- evidence:
  - `params: Integreted LDO`
- recommendation:
  - FAE 若认可 “Integrated LDO” 在当前检索体系中值得暴露，可直接映射到已有 `LDO`
  - 不建议新建 `Integrated LDO` tag
- caveat:
  - 这是复合品类 `SBC` 的内置功能，不一定需要单独暴露；取决于 FAE 是否认为用户会按“带LDO的SBC”检索

### A2. `load switch` → 候选并入 `负载开关`
- count: 1
- section: `负载开关`
- PN:
  - `TPS05S60`
- evidence:
  - `params: Load Switch`
- recommendation:
  - 实质上是 section 名复述，通常无需新增映射
  - 若保留，也只应并入现有 `负载开关`，绝不新建英文 tag
- caveat:
  - 更倾向直接加入 noise，不必专门映射

---

## B. 候选：可映射到现有 functional tag

这组不是新建品类，而是看是否并入已有功能标签。

### B1. `alert` → 候选并入 `警报输出`
- count: 1
- section: `温度传感器`
- PN:
  - `TPTMP75`
- evidence:
  - `params: ALERT,One-shot conversion`
- recommendation:
  - 若 FAE 认可 ALERT 引脚/功能可对用户形成检索价值，可映射到已有 `警报输出`

### B2. `one-shot conversion` → 需 FAE 判断是否值得建功能标签
- count: 1
- section: `温度传感器`
- PN:
  - `TPTMP75`
- evidence:
  - `params: ALERT,One-shot conversion`
- recommendation:
  - 当前库里没有现成 canonical tag 可无损承接
  - 若 FAE 认为温度传感器“单次转换”确实是常见选型条件，可后续新增 tag；否则保持 backlog 即可

---

## C. 需 FAE 判断：是否值得建新 tag / 还是仅作为描述保留

这一组不应自动猜。

### C1. 隔离栅极驱动族

#### `opto-coupler compatible input`
- count: 4
- section: `隔离栅极驱动`
- PNs:
  - `TPM23513`
  - `TPM23513B`
  - `TPM23514`
  - `TPM23525`
- recommendation:
  - FAE 判断这是否是独立检索维度
  - 如果只是兼容性 marketing 卖点，不建议建 tag

#### `deadtime control`
- count: 3
- section: `隔离栅极驱动`
- PNs:
  - `TPM21520`
  - `TPM21550`
  - `TPM21330`
- recommendation:
  - 若死区控制是驱动器常见硬需求，可考虑新增功能 tag
  - 否则保留为描述，不入标签

#### `miller clamp`
- count: 2
- section: `隔离栅极驱动`
- PNs:
  - `TPM5350MQ`
  - `TPM5355`
- recommendation:
  - 这是较明确的驱动器功能特征
  - 但是否值得进全局标签体系，需 FAE 拍板

#### `8v uvlo`
- count: 1
- section: `隔离栅极驱动`
- PN:
  - `TPM23513B`
- recommendation:
  - 更像参数阈值，不建议直接建布尔 tag
  - 若以后要支持 UVLO 检索，应走参数化，不应做单个 8V 布尔标签

#### `high cmti`
- count: 1
- section: `隔离栅极驱动`
- PN:
  - `TPM5350MQ`
- recommendation:
  - 若以后要做 CMTI，建议参数化（如 kV/us）
  - 当前不建议仅因一条文本就建 `高CMTI` 布尔 tag

### C2. 电源 / SBC

#### `isolated-buck`
- count: 2
- section: `宽压降压变换器`
- PNs:
  - `TPP38002`
  - `TPP38003`
- recommendation:
  - 这更像“隔离式 buck 拓扑/应用”概念
  - 需要 FAE 判断它在当前体系里应归为：
    1. 现有 `隔离电源`
    2. 现有 `DCDC`
    3. 新功能/拓扑标签
  - 没拍板前不要自动映射

### C3. 比较器 / 放大器 / 传感器

#### `standalone drain and emitter output`
- count: 1
- section: `比较器`
- PN:
  - `LM211`
- recommendation:
  - 更像输出级结构描述，不建议贸然建 tag

#### `with internal reference`
- count: 1
- section: `比较器`
- PN:
  - `TP2021`
- recommendation:
  - 如果 FAE 认可“内置基准比较器”是重要筛选维度，可考虑新建功能 tag

#### `comparator with internal reference`
- count: 1
- section: `比较器`
- PN:
  - `TP2021A`
- recommendation:
  - 与上一条应合并判断，不能分裂成两个 tag

#### `high-side variable gain`
- count: 1
- section: `电流信号检测放大器`
- PN:
  - `TPA127`
- recommendation:
  - “高边”本身可能有检索价值，但 “variable gain” 是否要入标签需 FAE 定
  - 若后续做，建议拆成正交维度，而不是整句硬塞成单 tag

#### `one reference pin.`
- count: 1
- section: `差动放大器`
- PN:
  - `TPA9152`
- recommendation:
  - 更像 pin/config 描述，不建议建 tag

#### `two reference pin.`
- count: 1
- section: `差动放大器`
- PN:
  - `TPA9151`
- recommendation:
  - 同上，不建议建 tag

---

## 建议处理策略

## 最终处理结果（2026-06-13）

### 已并入现有 tag
- `integreted ldo` → `LDO`
- `load switch` → `负载开关`
- `alert` → `警报输出`

### 已按“不建 tag”处理为描述/噪声
- `standalone drain and emitter output`
- `one reference pin.`
- `two reference pin.`
- `8v uvlo`
- `high cmti`
- `opto-coupler compatible input`
- `deadtime control`
- `miller clamp`
- `isolated-buck`
- `with internal reference`
- `comparator with internal reference`
- `high-side variable gain`
- `one-shot conversion`

### 审计结果
- `UNKNOWN_FEATURE_TERM`: 0
- `audit_data.py`: 零问题
- 结论：本批 backlog 已全部 closed

---

建议按下面三档拍板：

### 档1：直接系统收口（低风险）
建议你优先拍这几个：
- `integreted ldo` → 是否并入 `LDO` - 并入
- `alert` → 是否并入 `警报输出` - 是
- `load switch` → 直接当 noise 还是并入 `负载开关` - 负载开关

### 档2：暂不建 tag，直接视为描述/噪声
大概率可不进标签体系：
- `standalone drain and emitter output`
- `one reference pin.`
- `two reference pin.`
- `8v uvlo`
- `high cmti`

是的

### 档3：需要 FAE 明确认可才值得进体系
这组有一定检索意义，但不应由模型擅自决定：
- `deadtime control`
- `miller clamp`
- `opto-coupler compatible input`
- `isolated-buck`
- `with internal reference` / `comparator with internal reference`
- `one-shot conversion`
- `high-side variable gain`

是
---

## 验证命令

拍板后继续自动化处理时，统一回归：

```bash
cd /Users/zhouchong/Projects/warehouse
python3 scripts/autofix.py
python3 scripts/validate.py
python3 scripts/test_all.py
python3 scripts/test_constraint_layer.py
cd web && npm run build
```

---

## 当前结论

这批 UNKNOWN_FEATURE_TERM 已完成系统收口，当前无剩余 backlog。

换句话说：
- 审计工具层面的误报已清完
- FAE 已明确“不建 tag”的项已全部按 noise/描述处理
- 当前 `audit_data.py` 审计面板为 0/0/0/0

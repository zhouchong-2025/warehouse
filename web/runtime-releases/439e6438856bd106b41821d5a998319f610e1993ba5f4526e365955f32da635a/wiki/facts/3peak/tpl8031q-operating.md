# TPL8031Q-S 来源绑定事实

> 本页由 Fact Store 编译生成，记录型号级来源事实；修改前须核对原厂 PDF，并同步维护 Fact Store。

- 来源：`raw/Datasheet_TPL8031Q-S.pdf`
- 原 PDF SHA-256：`220942e1f3aa55f4df5794e103565c5b80129c803d82d95b04a746352af3cb60`
- 事实 SHA-256：`1b62cdca7694c32e194bcf2bfafb9c21e8bc9fa5ba065a7fd10a8016427bfc24`
- 审阅状态：`engineering_visual_reviewed`
- 判断层级：目录型号；订购后缀和实际应用工况尚未核验。

## 来源文档

- `raw/Datasheet_TPL8031Q-S.pdf`；SHA-256：`220942e1f3aa55f4df5794e103565c5b80129c803d82d95b04a746352af3cb60`；[原厂 PDF](https://static.3peak.com/res/doc/ds/Datasheet_TPL8031Q-S.pdf)

## 各文档原始陈述

| 来源文档 | 型号 | 字段 | 归一值 | 原文 | 物理页 | 事实 ID |
|---|---|---|---|---|---:|---|
| raw/Datasheet_TPL8031Q-S.pdf | TPL8031Q | vin_max | 42 | 42 V | 5 | 3peak:TPL8031Q:vin_max:p5 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL8031Q | vin_min_rule | {"operator": "max", "constantV": 3, "outputOffsetV": 1} | 3 V or VOUT(NOM) + 1 V, whichever is greater | 6 | 3peak:TPL8031Q:vin_min_rule:p6 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL8031Q | iout_max | 0.3 | 300 mA | 6 | 3peak:TPL8031Q:iout_max:p6 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL8031Q | ta_range | {"min": -40, "max": 125} | −40 to 125 °C | 5 | 3peak:TPL8031Q:ta_range:p5 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL8031Q | tj_range | {"min": -40, "max": 150} | −40 to 150 °C | 5 | 3peak:TPL8031Q:tj_range:p5 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL8031Q | theta_ja | {"package": "DFN3X3-8", "thetaJaCPerW": 45.0} | DFN3X3-8 \| 45.0 °C/W | 5 | 3peak:TPL8031Q:theta_ja:p5:dfn |
| raw/Datasheet_TPL8031Q-S.pdf | TPL8031Q | theta_ja | {"package": "EMSOP8", "thetaJaCPerW": 45.6} | EMSOP8 \| 45.6 °C/W | 5 | 3peak:TPL8031Q:theta_ja:p5:emsop |
| raw/Datasheet_TPL8031Q-S.pdf | TPL8031Q | theta_ja | {"package": "SOT223-3", "thetaJaCPerW": 65.0} | SOT223-3 \| 65.0 °C/W | 5 | 3peak:TPL8031Q:theta_ja:p5:sot223 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL8031Q | thermal_formula | {"powerDissipation": "(vin-vout)*iout+vin*ignd", "junctionTemperature": "ta+pd*thetaJa"} | PD = (VIN − VOUT) × IOUT + VIN × IGND; TJ = TA + PD × θJA | 13 | 3peak:TPL8031Q:thermal_formula:p13 |

## 冲突与裁决


## 审阅记录

- 2026-10-07；assistant `Codex`；accept_source_rows；Rendered and compared datasheet pages 5, 6 and 13, including VIN footnote and thermal equations；Values retain operating versus estimate rating, explicit package scope, and the minimum-input dependency. No application suitability or FAE sign-off was inferred.

## 条件集合与适用型号

| 条件 ID | 用途 | 适用型号或完整料号 | 限定条件 | 来源事实 |
|---|---|---|---|---|
| tpl8031q-s-operating | recommended_operation | TPL803133Q-DF6R-S, TPL803150Q-DF6R-S, TPL803133Q-EV1R-S, TPL803150Q-EV1R-S, TPL803133Q-ST4R-S, TPL803150Q-ST4R-S | {"enable": "enabled", "outputCapacitance": "requires_separate_verification", "boardThermal": "requires_separate_verification"} | 3peak:TPL8031Q:vin_max:p5, 3peak:TPL8031Q:vin_min_rule:p6, 3peak:TPL8031Q:ta_range:p5, 3peak:TPL8031Q:tj_range:p5 |
| tpl8031q-s-regulated-output | regulated_output | TPL803133Q-DF6R-S, TPL803150Q-DF6R-S, TPL803133Q-EV1R-S, TPL803150Q-EV1R-S, TPL803133Q-ST4R-S, TPL803150Q-ST4R-S | {"output": "in_regulation"} | 3peak:TPL8031Q:iout_max:p6 |
| tpl8031q-s-thermal-dfn | thermal_reference | TPL803133Q-DF6R-S, TPL803150Q-DF6R-S | {"package": "DFN3X3-8", "boardImplementation": "unknown"} | 3peak:TPL8031Q:theta_ja:p5:dfn |
| tpl8031q-s-thermal-emsop | thermal_reference | TPL803133Q-EV1R-S, TPL803150Q-EV1R-S | {"package": "EMSOP8", "boardImplementation": "unknown"} | 3peak:TPL8031Q:theta_ja:p5:emsop |
| tpl8031q-s-thermal-sot223 | thermal_reference | TPL803133Q-ST4R-S, TPL803150Q-ST4R-S | {"package": "SOT223-3", "boardImplementation": "unknown"} | 3peak:TPL8031Q:theta_ja:p5:sot223 |
| tpl8031q-s-thermal-estimate | application_estimate | TPL803133Q-DF6R-S, TPL803150Q-DF6R-S, TPL803133Q-EV1R-S, TPL803150Q-EV1R-S, TPL803133Q-ST4R-S, TPL803150Q-ST4R-S | {"boardImplementation": "unknown", "ambientTemperature": "required", "groundCurrent": "required_for_exact_power"} | 3peak:TPL8031Q:thermal_formula:p13 |

本集合记录规格书对 TPL8031Q-S 的推荐工作条件、稳压输出电流和热估算资料；六个完整料号的适用范围由单独的 ConditionSet 显式列出。
42V 是推荐工作输入上限，45V 属于绝对最大额定值，不可作为持续工作输入。
最低输入按 max(3V, 标称输出电压+1V) 计算；3V 不能直接用于 5V 输出版本。
300mA 表格条件是 VOUT 保持稳压；封装热阻和功耗公式仅用于设计估算，不能代替实际 PCB、环境温度和结温验证。

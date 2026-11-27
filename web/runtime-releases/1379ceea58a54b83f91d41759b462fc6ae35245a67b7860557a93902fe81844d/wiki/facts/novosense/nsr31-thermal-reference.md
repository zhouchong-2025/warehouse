# NSR31 工作范围与散热参考 来源绑定事实

> 本页由已审阅事实编译生成。修改参数请先更新厂商 Wiki MD，核对原 PDF 后重新编译。

- 厂商 Wiki MD：`wiki/vendors/novosense/nsr31-thermal-reference.md`；SHA-256：`e402263b24b3ff986357bb4b22e394704be2fbc92964db94dbbabcd5de9e9da4`
- 来源：`raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf`
- 原 PDF SHA-256：`e8f16e8381e63d20055c41935769f125141dd563024c74af1bb63cd4c72ab080`
- 事实 SHA-256：`e0a63e0b5599a7da40c9318b1902c364669c452ee3165372eaf3d2eb8a78a782`
- 审阅状态：`engineering_visual_reviewed`
- 判断层级：目录型号；订购后缀和实际应用工况尚未核验。

## 来源文档

- `raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf`；SHA-256：`e8f16e8381e63d20055c41935769f125141dd563024c74af1bb63cd4c72ab080`；[原厂 PDF](https://static.chipdip.ru/lib/511/DOC060511357.pdf)

## 各文档原始陈述

| 来源文档 | 型号 | 字段 | 归一值 | 原文 | 物理页 | 事实 ID |
|---|---|---|---|---|---:|---|
| raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf | NSR31xxx | vin_min | 3 | 3 | 5 | novosense:NSR31xxx:vin_min:p5 |
| raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf | NSR31xxx | vin_max | 40 | 40 | 5 | novosense:NSR31xxx:vin_max:p5 |
| raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf | NSR31xxx | iout_max | 0.15 | 150 | 5 | novosense:NSR31xxx:iout_max:p5 |
| raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf | NSR31xxx | ta_range | {"min": -40, "max": 125} | –40 °C to 125 °C | 1 | novosense:NSR31xxx:ta_range:p1 |
| raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf | NSR31xxx | theta_ja | {"package": "SOT-223", "thetaJaCPerW": 63.1} | 63.1 | 5 | novosense:NSR31xxx:theta_ja:p5:SOT-223 |
| raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf | NSR31xxx | theta_ja | {"package": "SOT-23-5L", "thetaJaCPerW": 207.9} | 207.9 | 5 | novosense:NSR31xxx:theta_ja:p5:SOT-23-5L |
| raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf | NSR31xxx | theta_ja | {"package": "DFN-8", "thetaJaCPerW": 45.8} | 45.8 | 5 | novosense:NSR31xxx:theta_ja:p5:DFN-8 |
| raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf | NSR31xxx | tj_limit | 150 | avoid long-term operating temperatures exceeding 150 °C | 11 | novosense:NSR31xxx:tj_limit:p11 |
| raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf | NSR31xxx | thermal_formula | {"powerDissipation": "(vin-vout)*iout+vin*iq", "junctionTemperature": "tc+pd*psiJc"} | PD = (VIN − VOUT) × IOUT + VIN × IQ; TJ = ΨJC × PD + TC | 11 | novosense:NSR31xxx:thermal_formula:p11 |

## 冲突与裁决


## 审阅记录

- 2026-10-09；assistant `Codex`；accept_source_rows；Rendered pages 1, 5 and 11; compared page-5 operating and thermal cells plus original prose and formula；Package-specific JEDEC thermal values and manufacturer formula are kept separate from application approval.

## 条件集合与适用型号

| 条件 ID | 用途 | 适用型号或完整料号 | 限定条件 | 来源事实 |
|---|---|---|---|---|
| nsr31-recommended-operation | recommended_operation | NSR31050-QSTBR, NSR31033-QSTBR, NSR31025-QSTBR, NSR31050-QSTAR, NSR31033-QSTAR, NSR31025-QSTAR, NSR31050-QDNR, NSR31033-QDNR, NSR31025-QDNR, NSR31150-QSTAR, NSR31133-QSTAR | {"outputRegulation": "requires_dropout_verification"} | novosense:NSR31xxx:vin_min:p5, novosense:NSR31xxx:vin_max:p5, novosense:NSR31xxx:ta_range:p1 |
| nsr31-regulated-output | regulated_output | NSR31050-QSTBR, NSR31033-QSTBR, NSR31025-QSTBR, NSR31050-QSTAR, NSR31033-QSTAR, NSR31025-QSTAR, NSR31050-QDNR, NSR31033-QDNR, NSR31025-QDNR, NSR31150-QSTAR, NSR31133-QSTAR | {"output": "requires_dropout_verification"} | novosense:NSR31xxx:iout_max:p5 |
| nsr31-thermal-sot223 | thermal_reference | NSR31050-QSTBR, NSR31033-QSTBR, NSR31025-QSTBR | {"package": "SOT-223", "boardImplementation": "JEDEC JESD 51-7 four-layer reference"} | novosense:NSR31xxx:theta_ja:p5:SOT-223 |
| nsr31-thermal-sot235l | thermal_reference | NSR31050-QSTAR, NSR31033-QSTAR, NSR31025-QSTAR, NSR31150-QSTAR, NSR31133-QSTAR | {"package": "SOT-23-5L", "boardImplementation": "JEDEC JESD 51-7 four-layer reference"} | novosense:NSR31xxx:theta_ja:p5:SOT-23-5L |
| nsr31-thermal-dfn8 | thermal_reference | NSR31050-QDNR, NSR31033-QDNR, NSR31025-QDNR | {"package": "DFN-8", "boardImplementation": "JEDEC JESD 51-7 four-layer reference"} | novosense:NSR31xxx:theta_ja:p5:DFN-8 |
| nsr31-thermal-estimate | application_estimate | NSR31050-QSTBR, NSR31033-QSTBR, NSR31025-QSTBR, NSR31050-QSTAR, NSR31033-QSTAR, NSR31025-QSTAR, NSR31050-QDNR, NSR31033-QDNR, NSR31025-QDNR, NSR31150-QSTAR, NSR31133-QSTAR | {"ambientTemperature": "required", "groundCurrent": "ignored_for_optimistic_bound", "boardImplementation": "JEDEC_reference_only"} | novosense:NSR31xxx:tj_limit:p11, novosense:NSR31xxx:thermal_formula:p11 |

θJA 仅为 JEDEC 四层参考板参数；实际 PCB、环境温度和外部器件均未核验。
第 11 页公式使用顶壳温度 TC 和 ΨJC；按 θJA 推得的环境温度上限是另外标明的乐观工程参考，不是厂家应用保证。
只在输入、电流、固定输出及封装订购关系全部明确时计算；不从推荐 VIN 范围推断低压差下稳压。

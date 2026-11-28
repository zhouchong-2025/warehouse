# NCA9617A 来源绑定事实

> 本页由 Fact Store 编译生成，记录型号级来源事实；修改前须核对原厂 PDF，并同步维护 Fact Store。

- 来源：`raw/NCA9617A_Datasheet_EN_1.0.pdf`
- 原 PDF SHA-256：`7c5708befef9d79bb72d1e2662892cba6b0c3a961a5bbe134b19b4e8f2e7678f`
- 事实 SHA-256：`7a5aa66aeb61b5badbc37cc166fe51a6ae39de7689a31349ff72b5f840e2fd3c`
- 审阅状态：`engineering_visual_reviewed`
- 判断层级：目录型号；订购后缀和实际应用工况尚未核验。

## 来源文档

- `raw/NCA9617A_Datasheet_EN_1.0.pdf`；SHA-256：`7c5708befef9d79bb72d1e2662892cba6b0c3a961a5bbe134b19b4e8f2e7678f`；[原厂 PDF](https://www.novosns.com/datasheet/NCA9617A-DMSR/NCA9617A.pdf)

## 各文档原始陈述

| 来源文档 | 型号 | 字段 | 归一值 | 原文 | 物理页 | 事实 ID |
|---|---|---|---|---|---:|---|
| raw/NCA9617A_Datasheet_EN_1.0.pdf | NCA9617A | vcca_min | 0.8 | 0.8 | 4 | novosense:NCA9617A:vcca_min:p4 |
| raw/NCA9617A_Datasheet_EN_1.0.pdf | NCA9617A | vccb_range | {"min": 2.2, "max": 5.5} | 2.2 \| 5.5 | 4 | novosense:NCA9617A:vccb_range:p4 |
| raw/NCA9617A_Datasheet_EN_1.0.pdf | NCA9617A | vcca_vccb_order | {"operator": "lte", "left": "VCCA", "right": "VCCB"} | VCCB | 4 | novosense:NCA9617A:rail_order:p4 |
| raw/NCA9617A_Datasheet_EN_1.0.pdf | NCA9617A | vcca_vccb_enabled_rule | {"left": "VCCA", "leftFactor": 0.4, "leftOffsetV": 0.8, "operator": "lte", "right": "VCCB"} | VCCA may be as high as 5.5V for overvoltage tolerance but 0.4VCCA+0.8V≤VCCB for the channels to be enabled and functional normally. | 6 | novosense:NCA9617A:enabled_rule:p6 |

## 冲突与裁决


## 审阅记录

- 2026-10-07；assistant `Codex`；accept_source_rows；Rendered and visually checked original datasheet pages 4 and 6, including table bounds and enabled-channel footnote；The four facts preserve named rails, recommended-operation relation, enabled-channel dependency and catalog-model applicability. This is source-row verification, not an application or orderable approval.

## 条件集合与适用型号

| 条件 ID | 用途 | 适用型号或完整料号 | 限定条件 | 来源事实 |
|---|---|---|---|---|
| nca9617a-recommended-rails | recommended_operation | NCA9617A | {"rails": "VCCA,VCCB", "mode": "normal_operation"} | novosense:NCA9617A:vcca_min:p4, novosense:NCA9617A:vccb_range:p4, novosense:NCA9617A:rail_order:p4 |
| nca9617a-enabled-rails | functional_dependency | NCA9617A | {"channels": "enabled", "mode": "normal_function"} | novosense:NCA9617A:enabled_rule:p6 |

适用于目录型号 NCA9617A；本集合不证明完整订购料号、封装或库存。
正常推荐工作同时要求 VCCA ≥ 0.8 V、VCCB 在 2.2–5.5 V 且 VCCA ≤ VCCB；通道启用的正常功能另需 0.4×VCCA+0.8V ≤ VCCB。
规格书提及过压容忍情形，不能借此把 VCCA 5.5 V 直接认定为任意双轨组合的推荐正常工作点。

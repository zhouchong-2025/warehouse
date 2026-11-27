# TPL8031Q-S 来源绑定事实

> 本页由 Fact Store 编译生成，记录型号级来源事实；修改前须核对原厂 PDF，并同步维护 Fact Store。

- 来源：`raw/Datasheet_TPL8031Q-S.pdf`
- 原 PDF SHA-256：`220942e1f3aa55f4df5794e103565c5b80129c803d82d95b04a746352af3cb60`
- 事实 SHA-256：`f564e329ff03bc5c6b64c4a28abbfca038b53eeefd9b4a80446efdf41f02fda0`
- 审阅状态：`engineering_visual_reviewed`
- 判断层级：规格书订购料号；实际应用工况尚未核验。

## 来源文档

- `raw/Datasheet_TPL8031Q-S.pdf`；SHA-256：`220942e1f3aa55f4df5794e103565c5b80129c803d82d95b04a746352af3cb60`；[原厂 PDF](https://static.3peak.com/res/doc/ds/Datasheet_TPL8031Q-S.pdf)

## 各文档原始陈述

| 来源文档 | 型号 | 字段 | 归一值 | 原文 | 物理页 | 事实 ID |
|---|---|---|---|---|---:|---|
| raw/Datasheet_TPL8031Q-S.pdf | TPL803133Q-DF6R-S | orderable_configuration | {"orderNumber": "TPL803133Q-DF6R-S", "outputVoltageV": 3.3, "package": "DFN3X3-8"} | TPL803133Q-DF6R-S \| 3.3 V \| DFN3X3-8 | 3 | 3peak:TPL803133Q-DF6R-S:configuration:p3 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL803150Q-DF6R-S | orderable_configuration | {"orderNumber": "TPL803150Q-DF6R-S", "outputVoltageV": 5.0, "package": "DFN3X3-8"} | TPL803150Q-DF6R-S \| 5 V \| DFN3X3-8 | 3 | 3peak:TPL803150Q-DF6R-S:configuration:p3 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL803133Q-EV1R-S | orderable_configuration | {"orderNumber": "TPL803133Q-EV1R-S", "outputVoltageV": 3.3, "package": "EMSOP8"} | TPL803133Q-EV1R-S \| 3.3 V \| EMSOP8 | 3 | 3peak:TPL803133Q-EV1R-S:configuration:p3 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL803150Q-EV1R-S | orderable_configuration | {"orderNumber": "TPL803150Q-EV1R-S", "outputVoltageV": 5.0, "package": "EMSOP8"} | TPL803150Q-EV1R-S \| 5 V \| EMSOP8 | 3 | 3peak:TPL803150Q-EV1R-S:configuration:p3 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL803133Q-ST4R-S | orderable_configuration | {"orderNumber": "TPL803133Q-ST4R-S", "outputVoltageV": 3.3, "package": "SOT223-3"} | TPL803133Q-ST4R-S \| 3.3 V \| SOT223-3 | 3 | 3peak:TPL803133Q-ST4R-S:configuration:p3 |
| raw/Datasheet_TPL8031Q-S.pdf | TPL803150Q-ST4R-S | orderable_configuration | {"orderNumber": "TPL803150Q-ST4R-S", "outputVoltageV": 5.0, "package": "SOT223-3"} | TPL803150Q-ST4R-S \| 5 V \| SOT223-3 | 3 | 3peak:TPL803150Q-ST4R-S:configuration:p3 |

## 冲突与裁决


## 审阅记录

- 2026-10-07；assistant `Codex`；accept_source_rows；Rendered PDF pages 3 and 20; checked six order-number and package rows against the images；Product Family Table binds each complete order number to one output voltage and package; Order Information repeats every order number and package. No FAE sign-off or purchasing availability was inferred.

六个订购料号的 3.3V/5.0V 与封装组合由 Rev.A.1 第 3 页逐行证明，第 20 页再次列出完整料号与封装。
这是该版规格书列出的订购配置；不等于当前可采购库存或原厂所有历史/未来料号。
SOT89-3 只出现在另一个目录型号 TPL8031 的选型行，不属于本版 TPL8031Q-S 订购表。
42V/300mA 是系列标称规格；实际工况、热限制与车规认证详情仍需另行验证。

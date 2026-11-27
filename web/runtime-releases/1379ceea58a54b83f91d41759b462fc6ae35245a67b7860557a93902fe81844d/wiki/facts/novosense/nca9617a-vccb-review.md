# NCA9617A 来源绑定事实

> 本页由 Fact Store 编译生成，记录型号级来源事实；修改前须核对原厂 PDF，并同步维护 Fact Store。

- 来源：`raw/纳芯微产品选型指南_202510.pdf`
- 原 PDF SHA-256：`5e1e90e2c8da3439fb2aa2f7bf8c9b763bbe194f7d9bd6f935c3882ea18e4b9c`
- 事实 SHA-256：`7894a9f430ef744ea33a4c5d92a35fcc46761432f285012307eca87f52f8b5d1`
- 审阅状态：`engineering_visual_reviewed`
- 判断层级：目录型号；订购后缀和实际应用工况尚未核验。

## 来源文档

- `raw/纳芯微产品选型指南_202510.pdf`；SHA-256：`5e1e90e2c8da3439fb2aa2f7bf8c9b763bbe194f7d9bd6f935c3882ea18e4b9c`
- `raw/NCA9617A_Datasheet_EN_1.0.pdf`；SHA-256：`7c5708befef9d79bb72d1e2662892cba6b0c3a961a5bbe134b19b4e8f2e7678f`；[原厂 PDF](https://www.novosns.com/datasheet/NCA9617A-DMSR/NCA9617A.pdf)

## 各文档原始陈述

| 来源文档 | 型号 | 字段 | 归一值 | 原文 | 物理页 | 事实 ID |
|---|---|---|---|---|---:|---|
| raw/纳芯微产品选型指南_202510.pdf | NCA9617A | vccb_min | 2.2 | 2.2 | 192 | novosense:NCA9617A:vccb_min:guide-table-p192 |
| raw/纳芯微产品选型指南_202510.pdf | NCA9617A | vccb_min | 2.5 | 2.5V 至 5.5V | 195 | novosense:NCA9617A:vccb_min:guide-detail-p195 |
| raw/NCA9617A_Datasheet_EN_1.0.pdf | NCA9617A | vccb_min | 2.2 | 2.2 | 4 | novosense:NCA9617A:vccb_min:datasheet-p4 |

## 冲突与裁决

- `vccb_min`：resolved；候选事实 `novosense:NCA9617A:vccb_min:guide-table-p192`, `novosense:NCA9617A:vccb_min:guide-detail-p195`, `novosense:NCA9617A:vccb_min:datasheet-p4`；采用 `novosense:NCA9617A:vccb_min:datasheet-p4`。型号规格书 EN 1.0 第 4 页推荐工作条件明确 VCCB 下限 2.2V，且与选型表第 192 页一致；选型册详情第 195 页的 2.5V 陈述保留为冲突来源。

只核 VCCB 正常工作下限，不把 VCCA 与 VCCB 合并为一个输入范围。
规格书第 6 页还有 A/B 两侧联合工作条件；本试点没有证明任意 VCCA、VCCB 组合都能工作。

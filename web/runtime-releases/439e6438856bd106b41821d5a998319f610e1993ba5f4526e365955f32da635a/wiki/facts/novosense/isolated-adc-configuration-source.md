# 隔离ADC选型表 来源绑定事实

> 本页由已审阅事实编译生成。修改参数请先更新厂商 Wiki MD，核对原 PDF 后重新编译。

- 厂商 Wiki MD：`wiki/vendors/novosense/isolated-adc-configuration-source.md`；SHA-256：`493d4868c399d096354194d15645bd66322c96c3b622ffa973074548696b7475`
- 来源：`raw/纳芯微产品选型指南_202510.pdf`
- 原 PDF SHA-256：`5e1e90e2c8da3439fb2aa2f7bf8c9b763bbe194f7d9bd6f935c3882ea18e4b9c`
- 事实 SHA-256：`25f0b8af1c6902717f7e6b4afe83cae7ce05bae448f4b127d410c9ca8945658a`
- 审阅状态：`engineering_visual_reviewed`
- 判断层级：目录型号；订购后缀和实际应用工况尚未核验。

## 来源文档

- `raw/纳芯微产品选型指南_202510.pdf`；SHA-256：`5e1e90e2c8da3439fb2aa2f7bf8c9b763bbe194f7d9bd6f935c3882ea18e4b9c`

## 各文档原始陈述

| 来源文档 | 型号 | 字段 | 归一值 | 原文 | 物理页 | 事实 ID |
|---|---|---|---|---|---:|---|
| raw/纳芯微产品选型指南_202510.pdf | NSI1306M25 | configuration_options | [{"isoKvrms": 5.0, "linearInputRangeMv": "-250~250", "inputType": "Differential", "outputType": "Digital (clock rising edge effective)", "package": "SOW-8"}, {"isoKvrms": 5.0, "linearInputRangeMv": "-250~250", "inputType": "Differential", "outputType": "Digital (clock rising edge effective)", "package": "SOW-16"}] | NSI1306M25 | 243 | novosense:NSI1306M25:configuration_options:p243 |
| raw/纳芯微产品选型指南_202510.pdf | NSI1306M05 | configuration_options | [{"isoKvrms": 5.0, "linearInputRangeMv": "-250~250", "inputType": "Differential", "outputType": "Digital (clock rising edge effective)", "package": "SOW-8"}, {"isoKvrms": 5.0, "linearInputRangeMv": "-250~250", "inputType": "Differential", "outputType": "Digital (clock rising edge effective)", "package": "SOW-16"}] | NSI1306M05 | 243 | novosense:NSI1306M05:configuration_options:p243 |
| raw/纳芯微产品选型指南_202510.pdf | NSI1305M25 | configuration_options | [{"isoKvrms": 5.0, "linearInputRangeMv": "-250~250", "inputType": "Differential", "outputType": "Digital (clock falling edge effective)", "package": "SOW-16"}] | NSI1305M25 | 243 | novosense:NSI1305M25:configuration_options:p243 |

## 冲突与裁决


## 审阅记录

- 2026-10-16；assistant `Codex`；accept_exact_isolated_adc_configuration_rows；固定 PDF 哈希、物理第243页表格行列复核；原表明确列出同型号的 SOW-8/SOW-16 封装续行。

仅记录 NSI1305M25、NSI1306M05、NSI1306M25 的原表封装配置；同型号多封装不压成单值。

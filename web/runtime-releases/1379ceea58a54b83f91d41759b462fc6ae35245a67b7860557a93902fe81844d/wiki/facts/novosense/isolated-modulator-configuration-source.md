# NSI1303x隔离ADC系列 来源绑定事实

> 本页由已审阅事实编译生成。修改参数请先更新厂商 Wiki MD，核对原 PDF 后重新编译。

- 厂商 Wiki MD：`wiki/vendors/novosense/isolated-modulator-configuration-source.md`；SHA-256：`8262b8d050c5134232df2453f3689d6246ee07ba6c1446671bf59cb56d7db4dc`
- 来源：`raw/纳芯微产品选型指南_202510.pdf`
- 原 PDF SHA-256：`5e1e90e2c8da3439fb2aa2f7bf8c9b763bbe194f7d9bd6f935c3882ea18e4b9c`
- 事实 SHA-256：`e59433c41fd0e4fd1bdc8ef4a45502bbf373510740bf36de9337870a5563d9f5`
- 审阅状态：`engineering_visual_reviewed`
- 判断层级：目录型号；订购后缀和实际应用工况尚未核验。

## 来源文档

- `raw/纳芯微产品选型指南_202510.pdf`；SHA-256：`5e1e90e2c8da3439fb2aa2f7bf8c9b763bbe194f7d9bd6f935c3882ea18e4b9c`

## 各文档原始陈述

| 来源文档 | 型号 | 字段 | 归一值 | 原文 | 物理页 | 事实 ID |
|---|---|---|---|---|---:|---|
| raw/纳芯微产品选型指南_202510.pdf | NSI1303M0x | configuration_options | [{"isoKvrms": 5.0, "linearInputRangeMv": "-50~50", "inputType": "Differential", "outputType": "Uncoded (clock rising edge effective)", "package": "SOW-8"}, {"isoKvrms": 5.0, "linearInputRangeMv": "-50~50", "inputType": "Differential", "outputType": "Uncoded (clock rising edge effective)", "package": "SOW-16"}] | NSI1303M0x | 243 | novosense:NSI1303M0x:configuration_options:p243 |

## 冲突与裁决


## 审阅记录

- 2026-10-16；assistant `Codex`；accept_explicit_ns1303m0x_packages；固定 PDF 哈希和物理第243页第二表复核；原表同一型号单元明确列出 SOW-8 和 SOW-16。

仅将 NSI1303M0x 两个封装登记为结构化选项；第243页合并封装单元格也覆盖 E2x/M2x，但其具体订购后缀尚未核实。

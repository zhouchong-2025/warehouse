# 数字隔离器选型表 来源绑定事实

> 本页由已审阅事实编译生成。修改参数请先更新厂商 Wiki MD，核对原 PDF 后重新编译。

- 厂商 Wiki MD：`wiki/vendors/novosense/nsi82xx-configuration-source.md`；SHA-256：`09b8007369093e6e13acecf8ac42012ac984050453b8f7367c4da0fe3ffb1c6b`
- 来源：`raw/纳芯微产品选型指南_202510.pdf`
- 原 PDF SHA-256：`5e1e90e2c8da3439fb2aa2f7bf8c9b763bbe194f7d9bd6f935c3882ea18e4b9c`
- 事实 SHA-256：`af5d6d90c74ad38de3fb82ad6732a12e1f48b6ecc9602d2ec4c01076d6aa6c34`
- 审阅状态：`engineering_visual_reviewed`
- 判断层级：目录型号；订购后缀和实际应用工况尚未核验。

## 来源文档

- `raw/纳芯微产品选型指南_202510.pdf`；SHA-256：`5e1e90e2c8da3439fb2aa2f7bf8c9b763bbe194f7d9bd6f935c3882ea18e4b9c`

## 各文档原始陈述

| 来源文档 | 型号 | 字段 | 归一值 | 原文 | 物理页 | 事实 ID |
|---|---|---|---|---|---:|---|
| raw/纳芯微产品选型指南_202510.pdf | NSI8220Wx | configuration_options | [{"isoKvrms": 5.0, "package": "DFN-8", "forwardReverseChannels": "2/0", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOW-16", "forwardReverseChannels": "2/0", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOWW-16", "forwardReverseChannels": "2/0", "maxDataRateMbps": 150}] | NSI8220Wx | 220 | novosense:NSI8220Wx:configuration_options:p220-r6-9 |
| raw/纳芯微产品选型指南_202510.pdf | NSI8221Wx | configuration_options | [{"isoKvrms": 5.0, "package": "SOW-8", "forwardReverseChannels": "1/1", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOW-16", "forwardReverseChannels": "1/1", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOWW-16", "forwardReverseChannels": "1/1", "maxDataRateMbps": 150}] | NSI8221Wx | 220 | novosense:NSI8221Wx:configuration_options:p220-r11-14 |
| raw/纳芯微产品选型指南_202510.pdf | NSI8222Wx | configuration_options | [{"isoKvrms": 5.0, "package": "SOW-8", "forwardReverseChannels": "0/2", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOW-16", "forwardReverseChannels": "0/2", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOWW-16", "forwardReverseChannels": "0/2", "maxDataRateMbps": 150}] | NSI8222Wx | 220 | novosense:NSI8222Wx:configuration_options:p220-r16-19 |
| raw/纳芯微产品选型指南_202510.pdf | NSI8230Wx | configuration_options | [{"isoKvrms": 5.0, "package": "SOW-16", "forwardReverseChannels": "3/0", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOWW-16", "forwardReverseChannels": "3/0", "maxDataRateMbps": 150}] | NSI8230Wx | 220 | novosense:NSI8230Wx:configuration_options:p220-r20-21 |
| raw/纳芯微产品选型指南_202510.pdf | NSI8240Wx | configuration_options | [{"isoKvrms": 5.0, "package": "SOW-16", "forwardReverseChannels": "3/1", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOWW-16", "forwardReverseChannels": "3/1", "maxDataRateMbps": 150}, {"isoKvrms": 5.0, "package": "SOW-16", "forwardReverseChannels": "4/0", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOWW-16", "forwardReverseChannels": "4/0", "maxDataRateMbps": 150}] | NSI8240Wx | 220 | novosense:NSI8240Wx:configuration_options:p220-r22-23 |
| raw/纳芯微产品选型指南_202510.pdf | NSI8241Wx | configuration_options | [{"isoKvrms": 5.0, "package": "SOW-16", "forwardReverseChannels": "3/1", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOWW-16", "forwardReverseChannels": "3/1", "maxDataRateMbps": 150}] | NSI8241Wx | 220 | novosense:NSI8241Wx:configuration_options:p220-r28-29 |
| raw/纳芯微产品选型指南_202510.pdf | NSI8242Wx | configuration_options | [{"isoKvrms": 5.0, "package": "SOW-16", "forwardReverseChannels": "2/2", "maxDataRateMbps": 150}, {"isoKvrms": 5.7, "package": "SOWW-16", "forwardReverseChannels": "2/2", "maxDataRateMbps": 150}] | NSI8242Wx | 220 | novosense:NSI8242Wx:configuration_options:p220-r32-33 |

## 冲突与裁决


## 审阅记录

- 2026-10-16；human `human_user`；accept_confirmed_nsi82xx_configuration_rows；本地 NSI82xx 多配置行复核页面逐组确认；确认每个型号的 ISO、方向通道、码流和封装组合。

仅发布用户确认的 7 个 W 后缀型号；其他 NSI82xx 型号保持现有单行数据。
ISO 与封装按原表行绑定，不做笛卡尔积。

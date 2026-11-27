# TPA626 CMRR：规格书复核

官方规格书：[https://static.3peak.com/res/doc/ds/Datasheet_TPA626.pdf](https://static.3peak.com/res/doc/ds/Datasheet_TPA626.pdf)  
版本标识：`BA20250915A9`；规格书印刷第 7 页（PDF 第 7/34 页）。

| 型号 | 字段 | 发布表头 | 发布值 | PDF 物理页 | PDF 印刷页 | 规格书表头 | 原值 | 测试条件 | 来源 URL |
| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| TPA626 | cmrr_min | CMRR (Min) (dB) | 120 | 7 | 7 | CMRR Common-Mode Rejection, Min | 120 | 0 V ≤ VIN+ ≤ 36 V；测试条件见电气特性表 | https://static.3peak.com/res/doc/ds/Datasheet_TPA626.pdf |

复核记录：原选型册物理第 26 页（印刷第 23 页）将 `CMRR (Min) (dB)` 单元格写成 `SPI/I2C`，与同页其他行的 dB 数值不一致。思瑞浦官方 TPA626 规格书电气特性表给出 CMRR 最小值 120 dB、典型值 140 dB；目录只发布与原表字段相同的最小值 120 dB。此事实来自规格书，不把选型册异常格改写为 120 dB。

# NSD7312-Q1HSPR 原厂规格书补充事实

原厂：https://www.novosns.com/Public/Uploads/uploadfile/files/20240823/NSD7312Datasheet_version_Rev1.5_EN-891.pdf

PDF SHA-256：278d4b7d1d5f66d6fd8a7b86df8b1781fcf76429d392c3611c9a041f5441cea6；EN Rev1.5。第12页订购表列出工业型号 NSD7312-DHSPR 和车规型号 NSD7312-Q1HSPR。本页下表为车规型号的复核记录；查询工业型号可通过同一规格书逐行核对适用条件。不得移用到 NSD7312A-Q1HSPR 或 NSD7310-Q1DHSPR。

| 字段 | 原值／复核转录 | PDF页 |
|---|---|---|
| Ambient temperature Ta (°C) | -40~125 | 3 |
| Junction temperature Tj (°C) | -40~150 | 3 |
| Absolute maximum VM (V) | -0.3~40 | 3 |
| Recommended VM (V) | 5~36 | 3 |
| HSOP8 dimensions (mm) | D 4.80~5.00; E1 3.80~4.00; lead span 5.80~6.20; pitch 1.27; height max 1.65 | 11 |
| VM bulk bypass recommendation (uF) | 47 or 100; plus typical 0.1 ceramic | 10 |

推荐工作 VM 5~36V 与选型册工作范围5~40V保留为不同来源，未静默覆盖。绝对最大40V不得作为持续工作范围。Ta/Tj各自保留；不保证125℃下持续2A。HSOP8尺寸不自动等于任意SOP8焊盘。47uF是参考选项，不是所有工况的输入电容保证。

# NSI84085 UL1577 隔离耐压测试额定值 来源绑定事实

> 本页由 Fact Store 编译生成，记录型号级来源事实；修改前须核对原厂 PDF，并同步维护 Fact Store。

- 来源：`raw/NSI84085_Datasheet_EN_1.1_official.pdf`
- 原 PDF SHA-256：`ad155d692ce09189d5e2ac280a4fab95e6dfcf01371b6ad6703fb84d815c4ad1`
- 事实 SHA-256：`14edda541c556c7bd74b9a6b502286d45daf1cf76ff94cb519625fc9ca850326`
- 审阅状态：`manufacturer_datasheet_reviewed`
- 判断层级：目录型号；订购后缀和实际应用工况尚未核验。

## 来源文档

- `raw/NSI84085_Datasheet_EN_1.1_official.pdf`；SHA-256：`ad155d692ce09189d5e2ac280a4fab95e6dfcf01371b6ad6703fb84d815c4ad1`；[原厂 PDF](https://www.novosns.com/en/datasheet/NSI84085-DSWR/NSI84085.pdf)

## 各文档原始陈述

| 来源文档 | 型号 | 字段 | 归一值 | 原文 | 物理页 | 事实 ID |
|---|---|---|---|---|---:|---|
| raw/NSI84085_Datasheet_EN_1.1_official.pdf | NSI84085-DSWR | isolation_withstand_vrms | 5000 | 5000 VRMS；封装：SOP16；测试条件：UL1577 qualification test, 60 seconds | 15 | novosense:NSI84085-DSWR:isolation_withstand_vrms:ul1577-rev1-1-p15 |
| raw/NSI84085_Datasheet_EN_1.1_official.pdf | NSI84085-DSSR | isolation_withstand_vrms | 3000 | 3000 VRMS；封装：SSOP16；测试条件：UL1577 qualification test, 60 seconds | 15 | novosense:NSI84085-DSSR:isolation_withstand_vrms:ul1577-rev1-1-p15 |

## 冲突与裁决


## 审阅记录

- 2026-10-24；assistant `Codex`；accept_source_rows；核对哈希固定的纳芯微原厂 NSI84085 Datasheet Rev.1.1 第15物理页（印刷页14）的 UL1577 VISO 表格与封装行。；原厂表格按封装分别给出 UL1577 隔离耐压测试值；与选型册的隔离电压字段语义不同。

仅记录规格书 UL1577 VISO 耐压测试额定值；不等同于工作隔离电压、隔离等级或系统工作电压。
按封装分别记录：SOP16 为 5000 VRMS，SSOP16 为 3000 VRMS。

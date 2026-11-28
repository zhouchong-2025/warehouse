# I2C 缓冲器和电平转换器选型表 来源绑定事实

> 本页由已审阅事实编译生成。修改参数请先更新厂商 Wiki MD，核对原 PDF 后重新编译。

- 厂商 Wiki MD：`wiki/vendors/novosense/i2c-nca9306-nca9511-rows.md`；SHA-256：`7171e42fdb0b61525e53062cfae6337587e03af5745d5127ac38f9f49456e9d9`
- 来源：`raw/纳芯微产品选型指南_202510.pdf`
- 原 PDF SHA-256：`5e1e90e2c8da3439fb2aa2f7bf8c9b763bbe194f7d9bd6f935c3882ea18e4b9c`
- 事实 SHA-256：`d4bb8380233b10fa8510729feaa179882a922d68eab51f430d9eeae8c47c82f0`
- 审阅状态：`engineering_visual_reviewed`
- 判断层级：目录型号；订购后缀和实际应用工况尚未核验。

## 型号行事实

| 型号 | 字段 | 发布值 | 原 PDF 值 | 额定类型 | 物理页 / 行 / 列 | 事实 ID |
|---|---|---|---|---|---|---|
| NCA9306 | VCC1( 最小)(V) | 1.2 | 1.2 | operating | 192 / 2 / 2 | novosense:NCA9306:vcc1_min:p192 |
| NCA9306 | VCC1( 最大)(V) | 3.3 | 3.3 | operating | 192 / 2 / 3 | novosense:NCA9306:vcc1_max:p192 |
| NCA9306 | VCC2( 最小)(V) | 1.8 | 1.8 | operating | 192 / 2 / 4 | novosense:NCA9306:vcc2_min:p192 |
| NCA9306 | VCC2( 最大)(V) | 5.5 | 5.5 | operating | 192 / 2 / 5 | novosense:NCA9306:vcc2_max:p192 |
| NCA9306 | 频率( 最大) (kHz) | 400 | 400 | unspecified | 192 / 2 / 6 | novosense:NCA9306:max_i2c_frequency:p192 |
| NCA9306 | 工作温度范围 (℃) | -40~85 | -40~85 | operating | 192 / 2 / 7 | novosense:NCA9306:operating_temperature:p192 |
| NCA9306 | 封装类型 | VSSOP-8 TSSOP-8 | VSSOP-8<br/>TSSOP-8 | unspecified | 192 / 2 / 8 | novosense:NCA9306:package:p192 |
| NCA9511 | VCC1( 最小)(V) | 2.7 | 2.7 | operating | 192 / 2 / 2 | novosense:NCA9511:vcc1_min:p192 |
| NCA9511 | VCC1( 最大)(V) | 5.5 | 5.5 | operating | 192 / 2 / 3 | novosense:NCA9511:vcc1_max:p192 |
| NCA9511 | VCC2( 最小)(V) | 2.7 | 2.7 | operating | 192 / 2 / 4 | novosense:NCA9511:vcc2_min:p192 |
| NCA9511 | VCC2( 最大)(V) | 5.5 | 5.5 | operating | 192 / 2 / 5 | novosense:NCA9511:vcc2_max:p192 |
| NCA9511 | 频率( 最大) (kHz) | 400 | 400 | unspecified | 192 / 2 / 6 | novosense:NCA9511:max_i2c_frequency:p192 |
| NCA9511 | 工作温度范围 (℃) | -40~105 | -40~105 | operating | 192 / 2 / 7 | novosense:NCA9511:operating_temperature:p192 |
| NCA9511 | 封装类型 | MSOP-8 SOP-8 | MSOP-8<br/>SOP-8 | unspecified | 192 / 2 / 8 | novosense:NCA9511:package:p192 |
| NCA9545 | 通道数 | 4 | 4 | unspecified | 192 / 2 / 2 | novosense:NCA9545:channel_count:p192 |
| NCA9545 | I2C频率(kHz) | 400 | 400 | unspecified | 192 / 2 / 4 | novosense:NCA9545:max_i2c_frequency:p192 |
| NCA9546 | 通道数 | 4 | 4 | unspecified | 192 / 3 / 2 | novosense:NCA9546:channel_count:p192 |
| NCA9546 | I2C频率(kHz) | 400 | 400 | unspecified | 192 / 3 / 4 | novosense:NCA9546:max_i2c_frequency:p192 |
| NCA9548 | 通道数 | 8 | 8 | unspecified | 192 / 4 / 2 | novosense:NCA9548:channel_count:p192 |
| NCA9548 | I2C频率(kHz) | 400 | 400 | unspecified | 192 / 4 / 4 | novosense:NCA9548:max_i2c_frequency:p192 |

## 系列共同事实

以下事实只适用于明确列出的目录型号；不能推断每个型号具有系列的全部封装或电流选项。

| 适用型号 | 字段 | 原 PDF 陈述 | 额定类型 | 物理页 | 事实 ID |
|---|---|---|---|---:|---|

仅迁入 NCA9306、NCA9511 的完整参数行，以及 NCA954x 与目录吻合的通道数和 I2C 频率格；不证明订购配置、接口板级实现或未列额定条件。
NCA954x 的 VCC 与温度差异已按型号规格书裁决；本事实集合不重新裁决这些字段。

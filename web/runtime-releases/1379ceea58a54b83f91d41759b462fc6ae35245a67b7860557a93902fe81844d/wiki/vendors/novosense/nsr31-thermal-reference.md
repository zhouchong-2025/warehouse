# 纳芯微 NSR31 工作范围与散热参考

来源：NSR31 series Datasheet (EN) 1.0，分销商镜像；物理第 1、5、11 页。原始 PDF 见 `raw/NSR31_Series_Datasheet_EN_Rev1.0_mirror.pdf`。

PDF SHA-256: `e8f16e8381e63d20055c41935769f125141dd563024c74af1bb63cd4c72ab080`

第 5 页 Recommended Operating Conditions 与 Thermal Information 的单元格分别保留。第 1 页写“ambient temperatures from –40 °C to 125 °C”。第 11 页公式按原页渲染目视核验；该页 PDF 文字层重复字母，不能直接把提取文本当成公式。功耗公式为 `PD = (VIN − VOUT) × IOUT + VIN × IQ`，结温公式为 `TJ = ΨJC × PD + TC`，并建议避免长期工作结温超过 150°C。

下列 θJA 是数据手册注明的 JEDEC JESD 51-7 四层参考板数值，不是用户 PCB 的实测热阻。以 `PD ≥ (VIN−VOUT)×IOUT` 计算的温升忽略了正的 `VIN×IQ` 项，因此推得的环境温度上限只是**乐观参考值**；不能据此宣布实际应用可用。订购号与封装的对应关系另见 [NSR31 订购表](nsr31-orderable.md)。

| 字段 | 适用封装 | 物理页 | 原表头 | 原值 | 归一值 | 单位 |
| --- | --- | --- | --- | --- | --- | --- |
| vin_min | 全系列 | 5 | Power Supply Voltage / Min | 3 | 3 | V |
| vin_max | 全系列 | 5 | Power Supply Voltage / Max | 40 | 40 | V |
| iout_max | 全系列 | 5 | Output Current Range / Max | 150 | 0.15 | A |
| ta_range | 全系列 | 1 | Product Overview / ambient temperatures | –40 °C to 125 °C | -40..125 | °C |
| theta_ja | SOT-223 | 5 | SOT-223 / θJA | 63.1 | 63.1 | °C/W |
| theta_ja | SOT-23-5L | 5 | SOT-23-5L / θJA | 207.9 | 207.9 | °C/W |
| theta_ja | DFN-8 | 5 | DFN-8 / θJA | 45.8 | 45.8 | °C/W |
| tj_limit | 全系列 | 11 | Power Dissipation and Thermal Calculations | avoid long-term operating temperatures exceeding 150 °C | 150 | °C |
| thermal_formula | 全系列 | 11 | Power Dissipation and Thermal Calculations / equations | PD = (VIN − VOUT) × IOUT + VIN × IQ; TJ = ΨJC × PD + TC | datasheet_formula | - |

# 3peak-tpt20204-a1 原厂补充证据

来源：https://static.3peak.com/res/doc/ds/Datasheet_TPT20204.pdf
SHA-256：04b985c20e58a3b7cb850a83e5c852112d0b56395aef7e375bd284a4f53fca34

仅用于明确列出的型号与条件；不是系列全量规格继承。

## TPT20204 · logic.translationDomains
事实 ID：3peak-tpt20204-a1:logic.translationDomains:2:TPT20204
适用条件：正常逻辑电平转换；VCCA≤VCCB；速率、负载、上升时间及上下电外部回路另行核验
值：{"aMin": 1.2, "aMax": 3.6, "bMin": 1.65, "bMax": 5.5, "relation": "a<=b"}
物理页 1：VCCA Range: 1.2 V to 3.6 V
物理页 1：VCCB Range: 1.65 V to 5.5 V
物理页 1：VCCA must be less than or equal to VCCB

## TPT20204 · io.poweroffIsolation
事实 ID：3peak-tpt20204-a1:io.poweroffIsolation:3:TPT20204
适用条件：任一VCC=GND时输出高阻，部分掉电保护；不代表零漏电。TPT20104 IOFF最高±5µA（物理页9）；TPT20204 IOFF最高±10µA（物理页8）；仅按各自表列端口电压及工况适用，外部上拉回路另查
值：true
物理页 1：Either VCC Input = GND, All Outputs in the High-impedance State
物理页 1：lOFF Supports Partial Power-down Mode

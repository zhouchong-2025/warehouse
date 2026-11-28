# CAN SIC（Signal Improvement Capability）检索参考

本文用于 Wiki 检索时理解 CAN 工程师使用的 SIC 术语。它是可追溯的术语上下文，不是型号参数事实，也不替代逐型号证据。

## 术语与查询边界

- 在 CAN 收发器语境中，SIC 指 **Signal Improvement Capability（信号改善能力）**，通过抑制总线线路振铃改善信号质量。
- 常见查询包括 `CAN SIC`、`SIC CAN FD`、`信号改善能力`。裸写 `SIC` 需要 CAN 语境；缩写相同不代表概念相同。
- SIC 与 CAN-FD 是两个独立维度。查询 `SIC CAN FD` 时，两者都须有型号级证据；不能由其中一个推断另一个。
- CAN SIC 不等于碳化硅器件。遇到不含 CAN 语境的化学材料查询，不应把它解释成 CAN SIC。
- 这页帮助解释术语和提供来源定位，不直接证明某型号具备 SIC、CAN-FD 或其他能力。

## 型号证据定位

思瑞浦汽车 CAN 选型表中，TPT1462Q/VQ 对应的具体订货型号行标有 CAN SIC；TPT1463Q 对应的具体订货型号行标有 CAN FD SIC。型号是否同时具备 CAN-FD、SIC、特定帧唤醒等能力，必须分别查看该订货型号的来源行，不能从系列文案扩展到未列型号。

特定帧唤醒的查询可关联原文特性 `Partial Networking`，但只在来源明确列出的型号上成立。SIC 与特定帧唤醒是不同能力，不可互相推断。

可追溯型号行见 [汽车 CAN 选型表型号行](../vendors/3peak/automotive-can-selection-rows.md) 和 [编译事实行](../facts/3peak/automotive-can-selection-rows.md)；原始资料见 `wiki/raw/papers/思瑞浦-汽车产品选型册_2026.md`。

## 标准参考

- CiA 将 CAN SIC 作为用于改善 CAN 物理层信号质量的收发器能力介绍，参见 [CiA Physical Layer Options](https://www.can-cia.org/can-knowledge/physical-layer-options) 与 [CAN Dictionary v13](https://www.can-cia.org/fileadmin/cia/documents/brochures/can_dictionary_v13_2026.pdf)。
- 项目内查询消歧规则见 [`config/semantic_evidence_rules.txt`](../../config/semantic_evidence_rules.txt)。运行时 Wiki 命中仅作上下文，型号能力仍由结构化约束与逐型号证据决定。

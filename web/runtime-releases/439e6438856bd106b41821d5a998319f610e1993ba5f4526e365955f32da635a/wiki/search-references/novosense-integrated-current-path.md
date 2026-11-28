# 纳芯微集成电流路径电流传感器检索语境

检索摘要：工程师查询“集成式电流传感器”时，结合纳芯微选型资料中的“集成式电流传感器”品类以及官方资料中“chip-level current sensor with integrated current path”的表述，理解为芯片级、集成电流路径的电流传感器。此页只帮助理解术语和区分相邻品类，不是任何具体型号的参数证据。

## 术语理解

- 中文问法：集成式电流传感器、集成电流路径的电流传感器、芯片级电流传感器。
- 英文表述：integrated current sensor、chip-level current sensor with integrated current path。
- 此处“集成”指电流路径集成在传感器芯片/封装方案中；不要把它扩展为“集成了任意信号调理、ADC、放大器或保护功能”。这些功能必须由型号级来源单独证明。
- 将该品类与选型资料中单列的“线性霍尔电流传感器”区分。用户若只说“电流传感器”，不能仅凭本页推断为集成电流路径品类。

## 选型边界

- 品类语义可帮助检索及解释候选型号；不能替代型号级筛选证据。
- 车规等级、电流量程、带宽、精度、供电、隔离和封装，均按具体型号的参数行分别核验。不得从系列介绍复制或推导型号参数。
- 如果工程师只输入专业缩写，应以对应术语及源文证据回答，不把整段产品介绍拆成标签。
- Wiki 检索命中是上下文，不是匹配证明；最终筛选仍由结构化参数和可追溯的型号证据决定。

## 来源

- 纳芯微《产品选型指南_202510》，第 17 页“NSM201x：集成式电流传感器”及型号参数表；第 23 页起“线性霍尔电流传感器”品类与型号说明。工作区来源：[wiki/raw/papers/纳芯微产品选型指南_202510.md](../raw/papers/纳芯微产品选型指南_202510.md)。
- NOVOSENSE《Product Selection Guide》，NSM201x 章节将其表述为 “Chip-level Current Sensor with Integrated Current Path”：<https://www.novosns.com/Public/Uploads/uploadfile3/files/20250403/NOVOSENSE%20Product%20Selection%20Guide_EN_202504.pdf>。
- 用户确认记录：`web/data/review/engineer_query_semantic_decisions.json` 中 `integrated-current-sensor`。该记录定义查询意图，不作为型号参数证据。

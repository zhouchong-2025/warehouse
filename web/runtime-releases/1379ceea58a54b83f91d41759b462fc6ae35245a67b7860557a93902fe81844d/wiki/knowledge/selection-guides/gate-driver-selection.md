---
id: gate-driver-selection
title: 隔离栅极驱动选型：问题、系列和具体型号
type: selection-guide
updated: 2026-10-25
---

# 隔离栅极驱动选型：问题、系列和具体型号

以完整工程问题组织知识，型号参数通过已有事实记录逐项核验。

## 使用路径

1. 先保留工程师完整问题，识别器件对象、应用背景、硬条件和偏好。多器件问题分别绑定条件。
2. “隔离单通道栅极驱动器”可拆成品类、隔离属性与通道数；通道数本身不说明半桥拓扑。[evidence:single-intro] [evidence:dual-intro]
3. CMTI、UVLO、分立输出等通过概念页理解，再按完整料号读取事实。目录里不同型号的 UVLO、封装和隔离耐压有差异。[evidence:single-table] [evidence:dual-table]
4. 对“快”“高”“宽”先提供有口径的可比较参数；只有缺少目标会改变最终选型时才澄清。不能擅自增加数值门槛。
5. 逐项给出满足、不满足或未知，引用具体行；适用于系列的介绍不自动证明每个型号满足条件。

## 可复用的问法

- “比较 NSI6601B-DSPR 和 NSI6601C-DSPR 的 UVLO，封装一样吗？”
- “找隔离双通道驱动，CMTI 最小保证 150kV/μs，有什么依据？”
- “希望 UVLO 低一些、信号传播快，先列出可比较的参数。”

这些是查询样例，不是新增术语规则；当前候选知识尚未接入线上模型编排。

## 相关知识

- [[cmti]]
- [[uvlo]]
- [[gate-driver-category-channel-output]]
- [[nsi6601-family]]
- [[nsi6602-family]]
- [[wide-input-buck]]

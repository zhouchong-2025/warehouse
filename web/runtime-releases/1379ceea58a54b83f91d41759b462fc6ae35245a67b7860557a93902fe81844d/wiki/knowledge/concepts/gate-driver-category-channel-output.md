---
id: gate-driver-category-channel-output
title: 栅极驱动：品类、通道与分立输出
type: concept
updated: 2026-10-25
---

# 栅极驱动：品类、通道与分立输出

通道数、隔离属性、输出结构和拓扑各有含义，应分别保留。

## 如何阅读

NSI6601/6601M 介绍同时写“单通道”和“分离输出用于分别控制上升和下降时间”；这说明分离输出不能直接解释为两个独立驱动通道。[evidence:single-intro]

所引 NSI6601 型号表行的特性为“分立输出”。本系列语境下，查询中的 split output / 分离输出可联系该结构，不能把这当作全品类无条件同义替换。[evidence:single-table]

NSI6602V/NSI6602N 介绍明确称双通道。品类归属、通道数、拓扑和使用方式应分别表达，不因目录名含半桥而给所有相邻型号补出相同拓扑结论。[evidence:dual-intro]

## 选型比较

需要分别控制上升与下降时间时，读取输出结构与连接说明；要求两个独立通道时，查通道数。由模型解释关系，型号满足性由对应事实和条件核验。

## 相关知识

- [[gate-driver-selection]]
- [[nsi6601-family]]
- [[nsi6602-family]]

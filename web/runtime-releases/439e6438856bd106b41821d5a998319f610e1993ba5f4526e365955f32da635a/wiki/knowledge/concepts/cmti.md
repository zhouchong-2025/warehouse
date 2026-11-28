---
id: cmti
title: CMTI：共模瞬变抗扰度及数值口径
type: concept
updated: 2026-10-25
---

# CMTI：共模瞬变抗扰度及数值口径

缩写和中文指向同一工程概念；数值比较还必须保留典型值、最小值和条件。

## 术语与证据

介绍页明确将“共模瞬变抗扰度”与 CMTI 对应。知识单元是这个指标及其口径，而非所在整段介绍。[evidence:single-intro] [evidence:dual-intro]

NSI6601 的所引选型表字段是 CMTI (Min)，NSI6602 的表列是 CMTI，介绍写 typical。即使数值相同也不能互换保证口径；编译候选保留 originalHeader 与 rating，解释层不能自行升级。[evidence:single-table] [evidence:dual-table]

## 查询约束

用户明确“最小保证”时，需由事实评估器验证口径；只有“CMTI 高”时先比较可得数据，并显示口径差异。不要把所有抗干扰描述都等同 CMTI，也不要把隔离耐压与 CMTI 当成同一个参数。

## 相关知识

- [[gate-driver-selection]]
- [[nsi6601-family]]
- [[nsi6602-family]]

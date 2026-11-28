---
id: nsi6602-family
title: NSI6602V/NSI6602N：双通道系列和 UVLO 选项
type: family
updated: 2026-10-25
---

# NSI6602V/NSI6602N：双通道系列和 UVLO 选项

系列介绍用于理解双通道与功能；UVLO、封装等按完整目录型号区分。

## 系列上下文

原文描述隔离式双通道驱动、UVLO 和可选欠压点。介绍同时罗列封装、耐压和使能信息，不能将这些选项全部赋给每个型号。[evidence:dual-intro]

## 来源差异表

下面是三个具体目录型号的原列值。[evidence:dual-table]

| 具体目录型号 | 来源字段 | 原列值 | PDF 物理页 |
| --- | --- | --- | --- |
| NSI6602VA-DLAR | VCC UVLO 阈值(V) | 6 | 262 |
| NSI6602VA-DLAR | CMTI (kV/μs) | 150 | 262 |
| NSI6602VA-DLAR | 特性 | 死区时间可调、Disable | 262 |
| NSI6602VA-DLAR | 隔离 耐压 (kVrms) | 2.5 | 262 |
| NSI6602VA-DLAR | 封装 类型 | LGA13 | 262 |
| NSI6602VB-DLAR | VCC UVLO 阈值(V) | 8 | 262 |
| NSI6602VB-DLAR | CMTI (kV/μs) | 150 | 262 |
| NSI6602VB-DLAR | 特性 | 死区时间可调、Disable | 262 |
| NSI6602VB-DLAR | 隔离 耐压 (kVrms) | 2.5 | 262 |
| NSI6602VB-DLAR | 封装 类型 | LGA13 | 262 |
| NSI6602VC-DLAR | VCC UVLO 阈值(V) | 12 | 262 |
| NSI6602VC-DLAR | CMTI (kV/μs) | 150 | 262 |
| NSI6602VC-DLAR | 特性 | 死区时间可调、Disable | 262 |
| NSI6602VC-DLAR | 隔离 耐压 (kVrms) | 2.5 | 262 |
| NSI6602VC-DLAR | 封装 类型 | LGA13 | 262 |

## 查询注意

同系列不同阈值可用于比较候选，但“可选”不代表运行时可编程。介绍中的典型 CMTI 不满足最小保证的证据要求；无法证明时保留未知。

## 相关知识

- [[gate-driver-selection]]
- [[cmti]]
- [[uvlo]]
- [[gate-driver-category-channel-output]]

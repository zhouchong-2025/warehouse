# Warehouse 搜索质量整体修复计划

> 当前分支: fix/dcdc-iout-sbc-compound-20260612
> 更新时间: 2026-06-14

目标
- 按“发现问题 → 全量审计 → 规则层修复 → 回归验证 → 前端复测”闭环，把 warehouse 的数据质量、约束排序、解释层、前端交付层系统收口。

总进度
- 已完成 22 / 25 个任务
- 当前进行中 1 个主题：隔离/非隔离标签体系收口
- 待处理 2 个主题：本轮回归收口、后续剩余审计项

一、已完成阶段

1. 前端交付层
- 首页与 /products 数据源统一到 structured 数据
- category badge 取法修正，避免参数冒充品类
- suggestion 卡支持一键采用建议并重搜
- 相关回归与构建已通过

2. vendor 聚合与排序底座
- 3peak vendor 聚合修复
- 约束层新增 tie group 内 vendor 多样性重排
- 不改主排序公式，只在完全同分时做 round-robin
- “栅极驱动”已不再被单一 vendor 霸榜

3. interpret / canonical 命名层
- canonical alias 归一完成
- 低风险 interpret 漂移已清理
- cross_ref 与约束层回归已稳定

4. TOC / section 架构收口
- TOC 审计问题已从 31 → 0
- 最后 4 个 MISSING_SECTION 已系统修复
- toc_audit / validate / test_all / constraint / build 全通过

5. 约束层灰度推广
- 以太网 / 电源 / 放大器 / 比较器 / 接口 / 隔离接口 / 数据转换 / 驱动 / 数字隔离器 已完成门控与回归

二、当前正在处理

主题：隔离 / 非隔离标签体系收口

已完成的本轮动作
- 非隔离栅极驱动 section 缺子标签的 4 款老料已自动补齐
- 隔离比较器 / 隔离电流放大器的 section→tag 映射已补齐
- 隔离子类父标签 closure 已补齐：
  - 隔离RS485 → 隔离
  - 隔离CAN → 隔离
  - 隔离I2C → 隔离
  - 隔离电源 → 隔离
  - 隔离放大器 → 隔离
  - 数字隔离器 → 隔离
- 隔离RS485 / 隔离CAN 晚期 canonicalization 已补上，避免前序规则把 section 拉回父类
- audit_data.py 的 isolation audit 已升级，避免把“非隔离”字面或 isolated-buck / flyback 这类有效隔离电源子拓扑误报成脏数据

当前审计结论
- 已消灭的假冲突/漏标桶：
  - section_parent_rs485: 4 → 0
  - section_parent_can: 2 → 0
  - isolated_section_missing_parent_tag: 7 → 0（现剩 0 actionable）
  - nonisolated_gate_missing_child_tag: 4 → 0
- 仍保留 5 个“有效例外”：
  - TPP38002 / TPP38003：Isolated-Buck
  - TPQ5180 / TPQ5180Q / TPQ5181Q：Flyback
- 这 5 款目前判断为“隔离电源子拓扑真实存在，section 仍挂在升压/降压子类”，属于有效 domain exception，不按脏数据删除标签

三、剩余修复路线

Phase A（当前）隔离体系最终收口
- [进行中] 跑全套回归，确认本轮 autofix 不引入副作用
- [待确认] 是否要把 5 款 isolated-buck / flyback 电源提升为独立 section，还是保留“子拓扑 + 隔离电源标签”双轨表达
- 产出：最终审计口径、例外白名单、前端复测点

Phase B 标签体系剩余历史债
- 清理 Q1 料号缺车规标签（历史统计约 69 条）
- 复扫协议/品类互斥残留（如隔离、总线、驱动子类）
- 扩样回归：传感器 / 电压基准 / 马达驱动等更多品类

Phase C 工程化交付
- 串联一键 CI：autofix → validate → test_all → test_constraint_layer → test_fae_interpret → build
- 固化更多专项审计脚本，减少后续人工 spot check

四、当前任务看板
- [in_progress] isolation-conflict-audit
- [pending] isolation-conflict-fix
- [pending] isolation-conflict-regression

五、交付标准
- 所有修复必须满足：
  1. 规则层/架构层修复，不手改 JSON
  2. 有审计证据
  3. 有自动化回归
  4. 能给出前端复测清单
  5. 通过 test_all.py / test_constraint_layer.py / test_fae_interpret.py / npm run build

六、下一步（我正在执行）
- 跑 autofix/validate/test_all/test_constraint_layer/test_fae_interpret/build
- 汇总本轮隔离体系修复结果
- 给你一版“还剩什么、为什么还剩、哪些是有效例外”的明确清单

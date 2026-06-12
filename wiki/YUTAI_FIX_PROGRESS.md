# 裕太数据解析修复进度（存档，供续接）

> 2026-06-10 | scripts/extract_coord.py extract_yutai() 简介/封装拆分根因修复完成
> 触发：全量审计发现 7 款简介为空（YT6801系列、YT9230L/YT9231L/YT9231LH/YT9232D）

## 根因（已定位并修复）
68系列网卡等 section 表头无独立"简介"列（has_intro=False），简介+封装码挤在
"封装"列。旧拆分逻辑假设封装码恒在末尾（`first_val[:mpkg.start()]`），但：
- 88系列：`简介 封装码`（码在尾）→ 旧逻辑对
- 68系列：`封装码 简介`（码在头）→ 旧逻辑取到空串，简介丢失

## 已完成修复（scripts/extract_coord.py，lint通过，全量审计干净）
1. 拆分逻辑（~450行）：改取封装码匹配区间**之外**的全部文字作简介
   `intro_part = (first_val[:mpkg.start()] + " " + first_val[mpkg.end():]).strip()`
   对"码在前/码在后"两种顺序都成立，不再假设位置。
2. 封装码正则（~358行）：重写为
   `r'((?:DRQFN|LQFP|QFN)[-_]?\d+(?:[/-]\d+)*(?:[-_][A-Za-z]+\d*)?)'`
   支持 QFN32/40（多封装）、QFN88-E / LQFP176-E / LQFP128_E / QFN-76（版本后缀）。

## 验证（全量68款审计 /tmp/audit_yutai.py）
- 简介为空：7 → 0
- 封装列残留简介：0
- 制程列错位：0
- YT6801 封装 QFN32/40 完整；YT8614QC 简介不带 -E 尾巴

## 收尾清单（用户铁律，进行中）
- [ ] 1. 全量重提取裕太 → 写回 web/public/data/products_structured.json（先备份）
- [ ] 2. validate_columns.py 校验 + 硬检查（口数标签==端口列GE/FE计数，防补丁回归）
- [ ] 3. 压测：「车规百兆phy tx接口」→YT8522A；「五口交换」→YT9215系列
- [ ] 4. 清理 scripts/fix_yutai_v3.py / fix_yutai_v4.py（逻辑已收敛回 extract_coord）

## 注意
- extract_yutai 返回 (all_products: dict[PN], seccols)，不是 list
- 数据层根因修复，禁止在 route.ts 加 Post-process 补丁

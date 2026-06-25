# Semantic Registry Inventory

Source of truth: `/Users/zhouchong/Projects/warehouse/config/semantic_evidence_rules.txt`

## Current migrated concepts

- 特定帧唤醒 | dimension=technology | strength=nice | include=CAN-FD,CAN,SBC
- SIC | dimension=technology | strength=nice | include=CAN-FD,CAN,RS-485,SBC
- 低功耗唤醒 | dimension=feature | strength=nice | include=CAN-FD,CAN,SBC,LIN
- 低噪声 | dimension=feature | strength=sort_hint | include=运放,比较器,LDO,电压基准
- 高PSRR | dimension=feature | strength=sort_hint | include=LDO,运放
- 轨到轨 | dimension=technology | strength=nice | include=运放,比较器
- 霍尔 | dimension=technology | strength=must | include=电流传感器,位置传感器
- 磁阻 | dimension=technology | strength=must | include=电流传感器,位置传感器,角度编码器
- 非管理型 | dimension=feature | strength=nice | include=交换机
- 千兆 | dimension=media | strength=must | include=交换机,网卡,以太网
- 车规AEC-Q100 | dimension=grade | strength=must | include=-

## Legacy rule sources still present

- `config/detail_evidence_rules.txt`: 7
- `config/tag_coverage_audit.txt`: 6
- `web/lib/synonyms.ts`: 73
- `web/app/api/interpret/query_parser.ts`: 713
- `web/app/api/interpret/constraint-match.ts`: 609

## First-batch migration status

- Done: semantic_evidence_rules.txt created
- Done: Python loader + TS runtime loader/generator added
- Done: audit_detail_evidence_tags.py switched to registry regex rules
- Done: audit_tag_coverage.py switched to registry keyword rules
- Done: constraint-match.ts semantic alias source switched to generated registry data
- Remaining: query_parser.ts scattered add-tag patterns still not migrated to registry-driven parser
- Remaining: old config/detail_evidence_rules.txt and config/tag_coverage_audit.txt can be retired after parity review
- Remaining: add automated drift check (registry txt vs generated ts) in CI/test path

## Priority next concepts to migrate

- grade mutual exclusion: 工业级 / 消费级 / 车规AEC-Q100
- 非隔离修饰符 / parent-child closure for gate drivers
- Mbps / channel count registry-backed semantic evidence
- SBC+CAN compound intent handling
- MLVDS / RS-485 strict separation guardrails
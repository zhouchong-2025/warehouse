# Systemic Semantic Search Plan (All Vendors)

> For Hermes/Codex: this plan is for the current warehouse search layer across 3peak-analog / 3peak-auto / novosense / yutai. Goal is to remove one-off alias patching and replace it with a vendor-aware, audit-driven semantic evidence system.

## Goal

Build one unified semantic-search architecture for all current product data so that:
1. features stays clean: only category / grade / isolation-style structural tags
2. semantic capability words are understood from params/detail evidence, not backfilled into product data ad hoc
3. all vendors share the same matching engine, but can have vendor-specific evidence vocabularies
4. every semantic rule is auditable, explainable, and regression-tested

## Non-goals

1. Do not rework the entire PDF extraction stack first
2. Do not replace the constraint layer with pure LLM online matching
3. Do not mass-edit product data just to satisfy search cases
4. Do not promote all categories into constrained search in one batch

## Current System State

### Strong pieces already present
- Data extraction core exists: `scripts/extract_coord.py`
- Novosense detail enrichment exists: `scripts/enrich_novosense_details.py`
- Search parser exists: `web/app/api/interpret/query_parser.ts`
- Constraint engine exists: `web/app/api/interpret/constraint-match.ts`
- Evidence audit exists: `scripts/audit_detail_evidence_tags.py`
- Broad coverage audit exists: `scripts/audit_tag_coverage.py`
- Config-based evidence rules already exist: `config/detail_evidence_rules.txt`

### Structural weakness now
The same domain knowledge is duplicated across multiple places:
- `query_parser.ts`
- `constraint-match.ts`
- `config/detail_evidence_rules.txt`
- `config/tag_coverage_audit.txt`
- `scripts/tag_schema.json`
- `web/lib/synonyms.ts`

This duplication is why a concept can be known in one layer but missed in another.

## Architecture Decision

Use a hybrid architecture:
- LLM is allowed to help discover/query-normalize offline or at interpret time
- deterministic evidence matching remains the final judge for search constraints

In short:
- LLM proposes intent / candidate semantic vocabulary
- code verifies product evidence
- audits decide whether a new phrase is trustworthy

## Unified Model

### Layer 1: Canonical semantic concepts
A small stable set of concepts, for example:
- 特定帧唤醒
- 低功耗唤醒
- SIC
n- 低噪声
- 高PSRR
- 轨到轨
- 非管理型
- 千兆
- SBC + 总线维度

This layer should stay compact and human-controlled.

### Layer 2: Evidence phrase registry
A growing phrase/evidence layer, vendor-aware if needed.
Examples:
- 特定帧唤醒 <- partial networking / selective wake / ISO 11898-6
- 低功耗唤醒 <- standby / sleep / wake pin / INH
- 低噪声 <- voltage noise / 输出噪声 / peak noise / Vn at
- 轨到轨 <- rail-to-rail / RRIO / RRI

This layer should be config/data driven, not hardcoded in TS logic.

### Layer 3: Matching policy
Per canonical concept define:
- applicable categories
- excluded categories
- fields to search (`_params`, `_detail_intro`, `_detail_features`, `_detail_apps`)
- hard/nice behavior
- optional numeric/boolean validation rules
- explanation extraction rules

This layer is deterministic and auditable.

## Vendor Strategy

### 1) Novosense
Characteristics:
- richest detail text
- strongest opportunity for prose-to-evidence understanding
- family-level detail pages and continuation-page complexity

Plan:
- treat Novosense as the primary source for semantic phrase mining
- prioritize `_detail_intro` and `_detail_features` evidence extraction
- support family-level inheritance only for technology/feature semantics, never for numeric specs
- keep detail snippets for explanation output

### 2) 3peak analog / auto
Characteristics:
- some categories are parameter-table friendly
- some auto PDF/product description fields are more directory-like
- `可替代产品` and description fields are useful, but numeric sortability is uneven by vendor/book

Plan:
- keep using `_params_numeric` as truth for numeric/spec constraints where real structured values exist
- for directory-style records, only accept semantic evidence from explicit description text, not inferred pseudo-structure
- do not over-trust extracted numeric values from generic `产品描述` blobs

### 3) Yutai
Characteristics:
- concentrated Ethernet/networking semantics
- port/media/subcategory boundaries are critical
- many useful evidence items live in `_params` rather than clean tags

Plan:
- keep category/media/subcategory strict in deterministic rules
- allow semantic evidence only on top of correct category constraints
- use Yutai as the key stress-test for category/media/spec orthogonality

## Single Source of Truth Design

Create a new human-editable text config as the primary semantic registry.

Suggested file:
- `config/semantic_evidence_rules.txt`

Suggested line format:
- `tag=特定帧唤醒 | dimension=technology | strength=nice | include=CAN-FD,CAN,SBC | exclude=LIN | fields=_params,_detail_intro,_detail_features | regex=partial\s*network|selective\s*wake|iso\s*11898-6`

This becomes the runtime source for:
1. matcher evidence checks
2. detail evidence audit
3. broad coverage audit seed generation
4. optional parser normalization hints

`detail_evidence_rules.txt` can either be replaced by this file or folded into it as v2.

## Required Code Changes

### A. Introduce unified semantic evidence loader
Create:
- `web/lib/semantic-evidence.ts`
- `scripts/lib/semantic_evidence.py` or a shared parser helper in Python

Responsibility:
- parse the config file
- normalize fields/include/exclude/strength
- expose the same semantic registry to TS matcher and Python audits

### B. Remove hand-maintained drift from constraint matcher
Modify:
- `web/app/api/interpret/constraint-match.ts`

Change:
- replace local `SEMANTIC_ALIASES` as primary mechanism
- new flow should be `evidenceSatisfied(product, tag, context)` using registry rules
- keep numeric matching (`Vin/Iout/Vout/Mbps/ports/channels`) separate from semantic evidence

### C. Parser should reference canonical concepts, not duplicate evidence vocabulary
Modify:
- `web/app/api/interpret/query_parser.ts`

Change:
- parser still resolves user query into canonical tags deterministically
- but soft-technology / modifier rules should be reviewed against the registry vocabulary
- parser should not become a second evidence engine

### D. Upgrade audits into first-class workflow
Modify/create:
- `scripts/audit_detail_evidence_tags.py`
- `scripts/audit_tag_coverage.py`
- new `scripts/mine_semantic_phrases.py`

Responsibilities:
1. precise audit: zero-false-positive regex rules
2. broad audit: detect likely missing evidence phrases
3. phrase mining: mine vendor/detail corpora and cluster candidate phrases by category

### E. Explanation snippets for UI honesty
Later integration target:
- matcher should return which field/snippet proved the hit
- UI can show direct evidence instead of only tag names

Example:
- 命中特定帧唤醒: `Selective Wake Up/Wake-Up`
- 命中低噪声: `Voltage Noise: 6.4uVrms`

## Data Discipline Rules

1. Do not add semantic prose tokens back into `_features` just to satisfy search
2. `_features` stays structural
3. real numeric truth stays in `_params_numeric`
4. semantic truth comes from auditable evidence matching over `_params` / `_detail_*`
5. directory-style vendors must not be treated as richly structured numeric data unless the field is truly structured

## Implementation Phases

### Phase 0: Freeze target behavior and inventory current rules
Objective:
- enumerate all semantic logic currently scattered in TS/Python/config

Deliverables:
- inventory doc of semantic concepts and where each is defined today
- initial registry seed merged from current sources

Files to inspect/update:
- `web/app/api/interpret/query_parser.ts`
- `web/app/api/interpret/constraint-match.ts`
- `config/detail_evidence_rules.txt`
- `config/tag_coverage_audit.txt`
- `scripts/tag_schema.json`
- `web/lib/synonyms.ts`

### Phase 1: Build unified semantic registry
Objective:
- introduce one config-driven registry

Deliverables:
- `config/semantic_evidence_rules.txt`
- TS/Python loaders
- migration of first batch concepts:
  - 特定帧唤醒
  - 低功耗唤醒
  - SIC
  - 低噪声
  - 高PSRR
  - 轨到轨
  - 非管理型
  - 千兆

### Phase 2: Switch matcher to registry-driven evidence
Objective:
- remove one-off alias dependence in matcher

Deliverables:
- `constraint-match.ts` reads registry rules
- explanation snippet capture
- regression parity with current known good cases

### Phase 3: Vendor phrase mining and audit loop
Objective:
- stop adding new phrases manually one case at a time

Deliverables:
- `scripts/mine_semantic_phrases.py`
- outputs by vendor/category:
  - phrase
  - count
  - sample PNs
  - sample snippets
  - suggested canonical tag
  - confidence bucket

Priority order:
1. Novosense detail corpus
2. 3peak-auto description corpus
3. 3peak-analog params/detail corpus
4. Yutai networking corpus

### Phase 4: Rule acceptance workflow
Objective:
- codify how a new phrase enters the system

Workflow:
1. mine candidate phrase
2. cluster to canonical tag
3. run broad audit
4. if precise enough, add to precise registry rule
5. rerun detail audit + customer queries + constraint tests
6. only then promote to runtime rule

### Phase 5: UI explanation and search quality hardening
Objective:
- make semantic matches transparent on cards and zero-result guidance

Deliverables:
- explanation snippets returned by matcher
- recommendation cards show matched/missing conditions plus direct evidence

## Test Strategy

Must add/keep these layers:

1. Parser regression
- `npx tsx scripts/test_parser.ts`

2. Constraint-layer regression
- `python3 scripts/test_constraint_layer.py`
- `npx tsx scripts/test_can_sic_ranking.ts`

3. Real-customer query regression
- `python3 scripts/test_customer_queries.py`

4. Detail evidence audits
- `python3 scripts/audit_detail_evidence_tags.py --dry-run`
- `python3 scripts/audit_tag_coverage.py`

5. Full suite
- `python3 scripts/test_all.py`
- `cd web && npm run build`

### New required tests
For each canonical concept, add at least:
- one positive representative PN
- one negative representative PN
- one query-level E2E case

Examples:
- 特定帧唤醒
  - positive: TPT1145 family
  - negative: normal CAN-FD without selective wake
- 低噪声
  - positive: products with noise evidence field
  - negative: products lacking noise evidence but same category

## Success Criteria

The project is considered successful when:
1. adding a new evidence phrase no longer requires TS business-logic edits in multiple places
2. the same canonical concept is not duplicated divergently across parser/matcher/audit/config
3. semantic search bugs are fixed by rule/config/audit changes, not by stuffing data tokens into `_features`
4. Novosense/3peak/Yutai all run through the same semantic evidence framework
5. cards can explain why a semantic capability matched
6. broad audit can surface likely vocabulary gaps before users report them

## Execution Order Recommendation

Recommended actual order:
1. Phase 0 inventory
2. Phase 1 registry file + loaders
3. Phase 2 matcher migration
4. Phase 3 phrase mining script
5. Phase 4 rule acceptance workflow
6. Phase 5 UI evidence explanation

Do not start with UI. Do not start with mass registry expansion before matcher migration.

## Immediate First Batch After Approval

If approved, start with this concrete batch:
1. create `config/semantic_evidence_rules.txt`
2. implement shared parser/loader for TS + Python
3. migrate 8 priority semantic concepts into the registry
4. switch `constraint-match.ts` to read the registry
5. add phrase-mining script for Novosense first
6. run full regression and produce audit report before touching more categories

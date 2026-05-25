# Wiki Schema

## Domain
半导体芯片产品选型知识库 — 收录纳芯微(Novosense)、思瑞浦(3PEAK)、裕太微(Yutai)等厂商的产品参数、封装、性能指标，支持横向对比和选型决策。

## Conventions
- File names: lowercase, hyphens (e.g., `novosense-nsipal9292.md`)
- Every wiki page starts with YAML frontmatter
- Use `[[wikilinks]]` to link between pages
- When updating, bump the `updated` date
- Every new page must be added to `index.md`
- Every action must be appended to `log.md`

## Frontmatter
```yaml
---
title: Page Title
created: YYYY-MM-DD
updated: YYYY-MM-DD
type: entity | concept | comparison | query
tags: [from taxonomy below]
vendor: vendor-name
sources: [raw/papers/source-file.md]
---
```

## Tag Taxonomy
- Product Type: phy, switch, ethernet, power-management, signal-chain, sensor, interface, isolation, driver, automotive
- Application: automotive, industrial, consumer, communication
- Performance: gigabit, 2.5g, 10g, fe, high-voltage, low-power, high-temp, aec-q100
- Meta: comparison, overview, key-param, selection-guide

## Page Thresholds
- **Create a page** when a product chip appears as a distinct SKU
- **Add to existing page** when new data supplements known product
- **Split a page** when it exceeds ~200 lines

## Update Policy
When new info conflicts with existing:
1. Note both positions with dates and sources
2. Mark in frontmatter: `contradictions: [page-name]`

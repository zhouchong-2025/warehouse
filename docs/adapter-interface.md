# Adapter Interface for ChipSelect Product Extraction

## Product Schema (must output)

```json
{
  "part_number": "PN-STRING",
  "_features":   "space-separated tags (工业级/车规AEC-Q100 + category + specs)",
  "_raw":        "pipe-separated raw values from PDF table",
  "_params":     "pipe-separated key: value pairs (header: cell)",
  "_section":    "original PDF section/chapter name"
}
```

## Adapter Contract

Each adapter is a standalone Python script (scripts/extract_*.py) with:

```python
def extract(pdf_path: str) -> list[dict]:
    """Parse PDF, return list of product dicts conforming to schema above."""
    pass
```

CLI wrapper for standalone use:
```bash
python3 scripts/extract_xxx.py --pdf path/to.pdf --vendor vendor-key [--dry-run]
```

## Shared Utilities (import from scripts/)

| Utility | Source | Purpose |
|---------|--------|---------|
| `PN_PAT` | extract_v4.py | PN regex: `^(?=.*[A-Z])[A-Z0-9]{2,}\d[\w\-]*$` |
| `PKG_PAT` | extract_v4.py | Package name filter |
| `merge_headers()` | extract_v4.py | Multi-line PDF header merging |
| `SECTION_TAG` | extract_v4.py | TOC section → category tag mapping |

## Pipeline (format-agnostic, shared for all vendors)

```
extract_xxx.py  →  autofix.py  →  build_prompt.py  →  route.ts
     ↑                                    ↓
  per-PDF format                    dynamic prompt
                                      from DB scan
```

## Existing Adapters

| Adapter | PDF Format | Status |
|---------|-----------|--------|
| extract_v4.py | TOC-driven, multi-row headers, "Part Number" | ✅ 思瑞浦-模拟 (897) |
| extract_auto.py | Flat table, "产品型号", category in data | ✅ 思瑞浦-汽车 (252) |

## New Adapter Checklist

1. Create `scripts/extract_XXX.py` with `extract(pdf_path)` function
2. Define CATEGORY_MAP: section name → tag
3. Handle PN detection (use shared PN_PAT)
4. Build `_params` as `"Header: Value | Header: Value"`
5. Build `_features` starting with grade + category tag
6. Set `_section` from PDF section/table name
7. Run `--dry-run` to verify category distribution
8. Run `autofix.py` + `build_prompt.py` after saving

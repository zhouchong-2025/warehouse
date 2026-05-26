#!/usr/bin/env python3
"""
PDF → Markdown conversion pipeline.
Primary data layer: converts raw PDFs to markdown in wiki/raw/papers/.
All downstream extraction reads from markdown, not PDF.
Only double-check against PDF when data seems suspicious.
"""
import pymupdf
import json
from pathlib import Path
import hashlib

RAW_DIR = Path("/Users/zhouchong/Projects/warehouse/raw")
WIKI_RAW = Path("/Users/zhouchong/Projects/warehouse/wiki/raw/papers")
MANIFEST = Path("/Users/zhouchong/Projects/warehouse/wiki/raw/manifest.json")
WIKI_RAW.mkdir(parents=True, exist_ok=True)

# ============================================================
# CONFIG: Backend selection
# Change to "mineru" when MinerU API is available
# ============================================================
EXTRACTION_BACKEND = "pymupdf"  # or "mineru"

# MinerU API config (reserved for future use)
MINERU_CONFIG = {
    "api_key": None,  # set from env or config
    "base_url": "https://mineru.net/api/v4",
    "endpoint_extract": "/extract/task",
    "endpoint_result": "/extract/result/{task_id}",
}

def pdf_to_markdown_pymupdf(pdf_path: Path) -> str:
    """Convert PDF to markdown using pymupdf."""
    doc = pymupdf.open(str(pdf_path))
    lines = [f"# {pdf_path.stem}\n\nSource: {pdf_path.name}\nPages: {len(doc)}\n"]
    
    for i, page in enumerate(doc):
        text = page.get_text()
        if text.strip():
            lines.append(f"## Page {i+1}\n\n{text.strip()}\n")
        # Also extract tables as markdown
        tables = page.find_tables()
        if tables.tables:
            lines.append(f"### Tables on Page {i+1}\n")
            for ti, table in enumerate(tables.tables):
                data = table.extract()
                if data:
                    lines.append(f"#### Table {ti+1}\n")
                    for row in data:
                        lines.append("| " + " | ".join(str(c or "") for c in row) + " |")
                    lines.append("")
    
    doc.close()
    return "\n".join(lines)

def pdf_to_markdown_mineru(pdf_path: Path) -> str:
    """Convert PDF to markdown using MinerU API (reserved)."""
    # Placeholder — implement when MinerU API is available
    raise NotImplementedError("MinerU API not yet configured. Set EXTRACTION_BACKEND='mineru' and provide API key.")

def compute_hash(filepath: Path) -> str:
    """SHA256 hash of file for change detection."""
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()

# ── Main ──
manifest = {}
if MANIFEST.exists():
    manifest = json.loads(MANIFEST.read_text())

converted = 0
skipped = 0

for pdf_path in sorted(RAW_DIR.glob("*.pdf")):
    name = pdf_path.stem
    md_path = WIKI_RAW / f"{name}.md"
    pdf_hash = compute_hash(pdf_path)
    
    # Skip if unchanged
    if name in manifest and manifest[name].get("pdf_hash") == pdf_hash and md_path.exists():
        skipped += 1
        continue
    
    print(f"Converting: {pdf_path.name} ({pdf_path.stat().st_size / 1024:.0f} KB)")
    
    if EXTRACTION_BACKEND == "mineru":
        md_content = pdf_to_markdown_mineru(pdf_path)
    else:
        md_content = pdf_to_markdown_pymupdf(pdf_path)
    
    md_path.write_text(md_content)
    
    manifest[name] = {
        "pdf": pdf_path.name,
        "pdf_hash": pdf_hash,
        "markdown": str(md_path),
        "backend": EXTRACTION_BACKEND,
        "pages": md_content.count("## Page "),
        "size_chars": len(md_content),
    }
    converted += 1

MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
print(f"\nConverted: {converted}, Skipped (unchanged): {skipped}")
print(f"Manifest: {MANIFEST}")
print(f"Backend: {EXTRACTION_BACKEND}")
if EXTRACTION_BACKEND == "pymupdf":
    print("⚠️  MinerU API not configured. Set EXTRACTION_BACKEND='mineru' in scripts/convert_pdfs.py when ready.")

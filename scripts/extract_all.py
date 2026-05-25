#!/usr/bin/env python3
"""Extract text from all PDFs using pymupdf. Save to wiki/raw/papers/"""
import pymupdf
from pathlib import Path

RAW = Path("/Users/zhouchong/Projects/warehouse/raw")
OUT = Path("/Users/zhouchong/Projects/warehouse/wiki/raw/papers")
OUT.mkdir(parents=True, exist_ok=True)

pdfs = sorted(RAW.glob("*.pdf"))
print(f"Found {len(pdfs)} PDFs\n")

for pdf_path in pdfs:
    name = pdf_path.stem
    print(f"--- {pdf_path.name} ({pdf_path.stat().st_size / 1024:.0f} KB) ---")
    
    doc = pymupdf.open(pdf_path)
    pages = len(doc)
    print(f"  Pages: {pages}")
    
    lines = []
    for i, page in enumerate(doc):
        text = page.get_text()
        if text.strip():
            lines.append(f"## Page {i+1}\n\n{text.strip()}")
    
    doc.close()
    
    out_path = OUT / f"{name}.md"
    content = f"# {name}\n\nSource: {pdf_path.name}\nPages: {pages}\n\n" + "\n\n---\n\n".join(lines)
    out_path.write_text(content)
    print(f"  => {out_path} ({len(content)} chars)\n")

print("Done!")

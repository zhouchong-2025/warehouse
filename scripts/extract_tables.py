#!/usr/bin/env python3
"""Extract tables from PDFs using pymupdf's built-in table detection."""
import pymupdf
import json
from pathlib import Path

pdf_path = "/Users/zhouchong/Projects/warehouse/raw/思瑞浦-模拟产品选型册_2026.pdf"
doc = pymupdf.open(pdf_path)

print(f"Total pages: {len(doc)}")

# Find pages with tables
for page_num in range(min(len(doc), 10)):
    page = doc[page_num]
    tables = page.find_tables()
    if tables.tables:
        print(f"\n=== Page {page_num+1}: {len(tables.tables)} table(s) ===")
        for ti, table in enumerate(tables.tables):
            print(f"\nTable {ti+1}: {len(table.row_count)} rows x {len(table.col_count)} cols")
            # Print first 5 rows
            data = table.extract()
            for ri, row in enumerate(data[:5]):
                print(f"  Row {ri}: {row}")
            if len(data) > 5:
                print(f"  ... ({len(data)} total rows)")

doc.close()

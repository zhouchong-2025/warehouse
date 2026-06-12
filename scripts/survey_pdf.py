#!/usr/bin/env python3
"""
PDF Section Survey — scan 思瑞浦-模拟 PDF for all sections and their table headers.
Output: section → column_headers mapping
"""
import fitz, json, re, sys, os

PDF = '/Users/zhouchong/Projects/warehouse/raw/思瑞浦-模拟产品选型册_2026.pdf'
OUT = os.path.join(os.path.dirname(__file__), 'pdf_survey.json')

doc = fitz.open(PDF)
sections = {}

for page_idx in range(len(doc)):
    text = doc[page_idx].get_text()
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    
    i = 0
    while i < len(lines):
        line = lines[i]
        # Detect section header: Chinese text, 2-30 chars, no "Part Number" or digits-only
        if (re.search(r'[\u4e00-\u9fff]', line) and 2 <= len(line) <= 40 
            and 'Part Number' not in line and not re.match(r'^[\d\s\.\-\(\)（）/]+$', line)
            and '目录' not in line and 'CATALOG' not in line):
            
            next_i = i + 1
            # Look ahead for "Part Number" to confirm this is a table section
            while next_i < min(len(lines), i + 5):
                if lines[next_i] == 'Part Number':
                    # Found a table section. Extract column headers
                    headers = []
                    j = next_i + 1
                    while j < len(lines) and lines[j] != 'Part Number' and not re.match(r'^[A-Z]{2,}[\d]', lines[j]):
                        if lines[j] and not re.match(r'^[\d\s\.\-～~（）/]+$', lines[j]):
                            # Clean up header text
                            h = lines[j].strip()
                            # Skip multi-line continuation fragments
                            headers.append(h)
                        j += 1
                    
                    # Merge multi-line headers (e.g., "VCC (Min)" + "(V)" → "VCC (Min) (V)")
                    merged = []
                    for h in headers:
                        if h.startswith('(') or h.startswith('（'):
                            if merged:
                                merged[-1] += ' ' + h
                            else:
                                merged.append(h)
                        else:
                            merged.append(h)
                    
                    sections[line] = {
                        'page': page_idx + 1,
                        'headers': merged,
                        'header_count': len(merged)
                    }
                    break
                next_i += 1
        i += 1

# Output
result = {k: v for k, v in sorted(sections.items())}
json.dump(result, open(OUT, 'w'), ensure_ascii=False, indent=2)

print(f'Found {len(result)} sections')
for name, info in result.items():
    print(f'  [{info["page"]}] {name} ({info["header_count"]} cols): {info["headers"]}')

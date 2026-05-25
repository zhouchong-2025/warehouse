#!/usr/bin/env python3
"""Test MinerU API extraction on a single PDF."""
import os
import sys
import time
import json
import requests
from pathlib import Path

# Load API key from project .env
env_path = Path(__file__).parent.parent / ".env"
with open(env_path) as f:
    for line in f:
        if line.startswith("MINERU_API_KEY="):
            API_KEY = line.split("=", 1)[1].strip()
            break

BASE_URL = "https://mineru.net/api/v4"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}

pdf_path = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).parent.parent / "raw" / "裕太产品选型表 20250312.pdf")
pdf_name = Path(pdf_path).name

print(f"[1/3] Uploading: {pdf_name} ({os.path.getsize(pdf_path) / 1024:.1f} KB)")

# Step 1: Get upload URL
resp = requests.get(f"{BASE_URL}/extract/upload-url", headers=HEADERS, params={"file_name": pdf_name})
print(f"  Upload URL status: {resp.status_code}")
if resp.status_code != 200:
    print(f"  Error: {resp.text}")
    sys.exit(1)

upload_data = resp.json()
upload_url = upload_data["data"]["upload_url"]
task_id = upload_data["data"]["task_id"]
print(f"  Task ID: {task_id}")

# Step 2: Upload file
with open(pdf_path, "rb") as f:
    resp = requests.put(upload_url, data=f, headers={"Content-Type": "application/pdf"})
print(f"  Upload status: {resp.status_code}")

# Step 3: Start extraction
resp = requests.post(f"{BASE_URL}/extract/task", headers=HEADERS, json={"task_id": task_id})
print(f"  Task create status: {resp.status_code}")
if resp.status_code != 200:
    print(f"  Error: {resp.text}")
    sys.exit(1)

# Step 4: Poll for completion
print(f"\n[2/3] Extracting...")
max_wait = 300  # 5 minutes
start = time.time()
while time.time() - start < max_wait:
    resp = requests.get(f"{BASE_URL}/extract/task/{task_id}", headers=HEADERS)
    if resp.status_code != 200:
        print(f"  Poll error: {resp.text}")
        time.sleep(3)
        continue
    
    data = resp.json()
    state = data["data"]["state"]
    progress = data["data"].get("progress", 0)
    print(f"  State: {state} ({progress}%)", end="\r")
    
    if state == "done":
        print(f"\n  State: {state} — done!")
        break
    elif state == "failed":
        print(f"\n  Failed: {data}")
        sys.exit(1)
    
    time.sleep(3)
else:
    print(f"\n  Timed out after {max_wait}s")
    sys.exit(1)

# Step 5: Download result
print(f"\n[3/3] Downloading result...")
resp = requests.get(f"{BASE_URL}/extract/result/{task_id}", headers=HEADERS)
if resp.status_code != 200:
    print(f"  Download error: {resp.text}")
    sys.exit(1)

result = resp.json()
content_url = result["data"]["content_url"]
print(f"  Content URL: {content_url[:80]}...")

# Download the markdown
resp = requests.get(content_url)
if resp.status_code == 200:
    out_dir = Path(__file__).parent.parent / "wiki" / "raw" / "papers"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{Path(pdf_path).stem}.md"
    out_path.write_text(resp.text)
    print(f"  Saved: {out_path}")
    print(f"  Length: {len(resp.text)} chars")
    print(f"\nPreview (first 500 chars):")
    print(resp.text[:500])
else:
    print(f"  Download failed: {resp.status_code}")
    sys.exit(1)

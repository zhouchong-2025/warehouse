#!/usr/bin/env python3
"""Shared helpers for config-driven category test runners."""

from __future__ import annotations

import json
import os
import subprocess
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"
DATA_PATH = ROOT / "web/public/data/products_structured.json"
DEFAULT_API_BASE = "http://localhost:3000"


def load_data() -> dict:
    return json.loads(DATA_PATH.read_text())


def split_csv(text: str | None) -> List[str]:
    if not text:
        return []
    return [x.strip() for x in text.split(",") if x.strip()]


def parse_bool(text: str | None) -> bool:
    return str(text or "").strip().lower() in {"1", "true", "yes", "y"}


def parse_case_file(path: str | Path) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    p = Path(path)
    for lineno, raw in enumerate(p.read_text().splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = [seg.strip() for seg in line.split("|") if seg.strip()]
        row: Dict[str, str] = {"__line__": str(lineno)}
        for part in parts:
            if "=" not in part:
                raise ValueError(f"{p}:{lineno}: missing key=value in segment: {part}")
            k, v = part.split("=", 1)
            row[k.strip()] = v.strip()
        rows.append(row)
    return rows


def query_parser_direct(query: str) -> Dict[str, Any]:
    code = (
        "import { parseQuery } from './app/api/interpret/query_parser';"
        "const q = process.env.HERMES_QUERY || '';"
        "console.log(JSON.stringify(parseQuery(q)));"
    )
    env = os.environ.copy()
    env["HERMES_QUERY"] = query
    result = subprocess.run(
        ["npx", "tsx", "-e", code],
        cwd=WEB_DIR,
        capture_output=True,
        text=True,
        timeout=60,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "parseQuery failed")
    out = result.stdout.strip().splitlines()
    if not out:
        raise RuntimeError("parseQuery produced no stdout")
    return json.loads(out[-1])


def interpret_via_api(query: str, base_url: str = DEFAULT_API_BASE) -> Dict[str, Any]:
    req = urllib.request.Request(
        f"{base_url}/api/interpret",
        data=json.dumps({"query": query}).encode(),
        headers={"Content-Type": "application/json"},
    )
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def interpret_query(query: str, mode: str = "direct", base_url: str = DEFAULT_API_BASE) -> Dict[str, Any]:
    if mode == "api":
        return interpret_via_api(query, base_url)
    return query_parser_direct(query)


def all_products(data: dict) -> List[dict]:
    return [p for vd in data.values() if isinstance(vd, dict) for p in vd.get("products", [])]


def product_pool(data: dict, pool: str) -> List[dict]:
    if pool in {"all", "*", ""}:
        return all_products(data)
    if pool not in data:
        raise KeyError(f"unknown pool/vendor: {pool}")
    return data[pool].get("products", [])


def product_features(p: dict) -> List[str]:
    return [x for x in (p.get("_features", "") or "").split() if x]


def has_any_numeric_key(p: dict, keys_any: List[str]) -> bool:
    wanted = [k.lower() for k in keys_any]
    for key in (p.get("_params_numeric") or {}).keys():
        kl = str(key).lower()
        if any(w in kl for w in wanted):
            return True
    return False

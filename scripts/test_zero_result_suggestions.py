#!/usr/bin/env python3
"""Config-driven regression for honest zero-result / near-miss suggestions."""

from __future__ import annotations

import json
import shlex
import subprocess
import sys
from pathlib import Path

from category_test_utils import ROOT, WEB_DIR, parse_case_file, split_csv

CASE_PATH = ROOT / "tests/zero_result_suggestion_sample.txt"

TS_SNIPPET = r'''
import { POST } from './app/api/interpret/route';
const query = process.env.HERMES_QUERY || '';
const req = new Request('http://localhost/api/interpret', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
POST(req as any)
  .then(async (res) => {
    console.log(await res.text());
  })
  .catch((err) => {
    console.error(String(err?.stack || err));
    process.exit(1);
  });
'''.strip()


def run_query(query: str) -> dict:
    command = (
        "set -a && source ./.env.local && set +a && "
        f"HERMES_QUERY={shlex.quote(query)} "
        f"npx tsx -e {shlex.quote(TS_SNIPPET)}"
    )
    result = subprocess.run(
        ["bash", "-lc", command],
        cwd=WEB_DIR,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "tsx query failed")
    stdout = result.stdout.strip().splitlines()
    if not stdout:
        raise RuntimeError("empty stdout from interpret route")
    return json.loads(stdout[-1])


def main() -> int:
    rows = parse_case_file(CASE_PATH)
    passed = 0
    failed = 0

    for row in rows:
        query = row["query"]
        want_reason = row.get("reason", "")
        must_contain = split_csv(row.get("contains"))
        must_not_contain = split_csv(row.get("not_contains"))
        line = row.get("__line__", "?")

        try:
            response = run_query(query)
            suggestions = response.get("suggestions") or []
            first = suggestions[0] if suggestions else {}
            text = first.get("text", "")
            reason = first.get("reason", "")

            problems: list[str] = []
            if not suggestions:
                problems.append("no suggestions returned")
            if want_reason and reason != want_reason:
                problems.append(f"reason={reason!r} != {want_reason!r}")
            missing = [x for x in must_contain if x not in text]
            forbidden = [x for x in must_not_contain if x and x in text]
            if missing:
                problems.append(f"missing substrings: {missing}")
            if forbidden:
                problems.append(f"forbidden substrings: {forbidden}")

            ok = not problems
            if ok:
                passed += 1
                print(f"✅ {query}")
                print(f"   {text}")
            else:
                failed += 1
                print(f"❌ {query}  (line {line})")
                print(f"   text:   {text}")
                print(f"   reason: {reason}")
                for p in problems:
                    print(f"   {p}")
        except Exception as exc:
            failed += 1
            print(f"❌ {query}  (line {line})")
            print(f"   ERROR: {exc}")

    total = passed + failed
    print(f"\nZero-result suggestion checks: {passed}/{total} passed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

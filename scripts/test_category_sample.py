#!/usr/bin/env python3
"""One-command runner for the small-sample category test framework."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"

CMDS = [
    ["python3", str(SCRIPTS / "test_category_invariants.py")],
    ["python3", str(SCRIPTS / "test_category_parser_matrix.py")],
    ["python3", str(SCRIPTS / "test_category_e2e.py")],
]


def main() -> int:
    all_ok = True
    for cmd in CMDS:
        print("\n" + "=" * 72)
        print("RUN", " ".join(cmd))
        print("=" * 72)
        result = subprocess.run(cmd, cwd=ROOT)
        all_ok = all_ok and (result.returncode == 0)
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

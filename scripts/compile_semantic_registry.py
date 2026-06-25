#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

from semantic_registry import DEFAULT_REGISTRY_PATH, parse_semantic_registry

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / 'web' / 'lib' / 'semantic-evidence.generated.ts'


def main() -> int:
    rules = parse_semantic_registry(DEFAULT_REGISTRY_PATH)
    payload = json.dumps(rules, ensure_ascii=False, indent=2)
    OUT_PATH.write_text(
        'import type { SemanticEvidenceRule } from "./semantic-evidence";\n\n'
        'export const GENERATED_SEMANTIC_EVIDENCE_RULES: SemanticEvidenceRule[] = '
        + payload + '\n',
        encoding='utf-8',
    )
    print(f'Compiled {len(rules)} semantic rules')
    print(f'Source: {DEFAULT_REGISTRY_PATH}')
    print(f'Output: {OUT_PATH}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

from __future__ import annotations

from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_REGISTRY_PATH = ROOT / 'config' / 'semantic_evidence_rules.txt'


SEMICOLON_LIST_FIELDS = {'aliases'}
CSV_LIST_FIELDS = {'include', 'exclude', 'fields'}
TEXT_FIELDS = {'tag', 'dimension', 'strength', 'auto', 'regex', 'keywords', 'query_regex'}


def _split_semicolon(value: str) -> List[str]:
    return [x.strip() for x in value.split(';;') if x.strip()]


def _split_csv(value: str) -> List[str]:
    return [x.strip() for x in value.split(',') if x.strip()]


def parse_semantic_registry(path: Path = DEFAULT_REGISTRY_PATH) -> List[dict]:
    rules: List[dict] = []
    for lineno, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        parts = [seg.strip() for seg in line.split(" | ") if seg.strip()]
        row: Dict[str, object] = {'_lineno': lineno}
        for part in parts:
            if '=' not in part:
                continue
            k, v = part.split('=', 1)
            key = k.strip()
            val = v.strip()
            if key in SEMICOLON_LIST_FIELDS:
                row[key] = _split_semicolon(val)
            elif key in CSV_LIST_FIELDS:
                row[key] = _split_csv(val)
            else:
                row[key] = val
        if 'tag' not in row:
            continue
        row['auto'] = str(row.get('auto', 'false')).lower() == 'true'
        row.setdefault('dimension', 'feature')
        row.setdefault('strength', 'nice')
        row.setdefault('include', [])
        row.setdefault('exclude', [])
        row.setdefault('fields', ['_params', '_detail_intro', '_detail_features'])
        row.setdefault('aliases', [])
        row.setdefault('regex', '')
        row.setdefault('keywords', '')
        row.setdefault('query_regex', '')
        rules.append(row)
    return rules


def build_alias_map(path: Path = DEFAULT_REGISTRY_PATH) -> Dict[str, List[str]]:
    out: Dict[str, List[str]] = {}
    for rule in parse_semantic_registry(path):
        tag = str(rule['tag'])
        aliases = [str(x).lower() for x in rule.get('aliases', []) if str(x).strip()]
        if not aliases:
            continue
        dedup = []
        seen = set()
        for a in aliases:
            if a not in seen:
                seen.add(a)
                dedup.append(a)
        out[tag] = dedup
    return out


def filter_rules_with_regex(path: Path = DEFAULT_REGISTRY_PATH) -> List[dict]:
    return [r for r in parse_semantic_registry(path) if str(r.get('regex', '')).strip()]


def filter_rules_with_keywords(path: Path = DEFAULT_REGISTRY_PATH) -> List[dict]:
    return [r for r in parse_semantic_registry(path) if str(r.get('keywords', '')).strip()]

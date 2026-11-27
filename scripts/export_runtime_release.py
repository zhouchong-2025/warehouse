#!/usr/bin/env python3
"""Make the minimum server release artifact from a checked source snapshot.

The source snapshot is never copied wholesale into this output. The exported
review corrections contain final evidence only, without actors or rationales.
"""

import argparse
import hashlib
import json
from pathlib import Path

from export_public_catalog import ROOT, SOURCE_RELEASES, encode

from release_catalog import release_catalog


RUNTIME_RELEASES = ROOT / 'web/runtime-releases'
SERVER_PRODUCT_FIELDS = (
    'part_number', '_section', '_sections', '_params', '_raw', '_params_numeric',
    '_search_context', '_source_facts', '_reviewed_fact_sources',
    '_configuration_options', '_orderable_configurations', '_adjustable_orderables',
    '_conditional_rate_resolution', '_operating_facts', '_topology_source',
    '_resolution_source', '_detail_adc_resolution_source',
    '_withdrawn_reviewed_fields', '_selection_status',
)
WIKI_PREFIXES = ('wiki/vendors/', 'wiki/facts/', 'wiki/search-references/',
                 'wiki/raw/papers/', 'wiki/knowledge/')
PACKET_IDENTITY_FIELDS = {
    'data/facts/entities.jsonl': ('id', 'manufacturerId', 'kind', 'name'),
    'data/facts/relations.jsonl': ('from', 'to', 'type', 'evidenceFactId'),
}


def export_runtime(release_id: str, source_releases=SOURCE_RELEASES,
                   runtime_releases=RUNTIME_RELEASES):
    if len(release_id) != 64 or any(char not in '0123456789abcdef' for char in release_id):
        raise ValueError('Invalid release ID')
    source = Path(source_releases) / release_id
    manifest = json.loads((source / 'manifest.json').read_text())
    if manifest.get('releaseId') != release_id or not isinstance(manifest.get('files'), dict):
        raise ValueError('Invalid source manifest')
    canonical = encode({'schemaVersion': 1, 'files': manifest['files']}).rstrip(b'\n')
    if hashlib.sha256(canonical).hexdigest() != release_id:
        raise ValueError('Source release manifest hash mismatch')

    def checked(relative):
        expected = manifest['files'].get(relative)
        if not expected:
            raise ValueError(f'Unregistered runtime source: {relative}')
        content = (source / relative).read_bytes()
        if hashlib.sha256(content).hexdigest() != expected:
            raise ValueError(f'Source release file changed: {relative}')
        return content

    index_path = 'web/public/data/vendor_index.json'
    index,merged_vendors,merged_lookup=release_catalog(checked,manifest['files'])
    files = {index_path: encode(index),
             'web/public/data/pn_lookup.json': encode(merged_lookup),
             'data/knowledge/pilot.compiled.json': checked('data/knowledge/pilot.compiled.json')}
    for path in ('data/evidence/compiled.json','data/extensions/compiled.json'):
        if path in manifest['files']:files[path]=checked(path)
    for path, fields in PACKET_IDENTITY_FIELDS.items():
        rows = [json.loads(line) for line in checked(path).decode('utf8').splitlines() if line.strip()]
        files[path] = b''.join(encode({key: row[key] for key in fields if key in row}) for row in rows)
    for slug in sorted(index['vendors']):
        path = f'web/public/data/vendors/{slug}.json'
        vendor = merged_vendors[slug]
        products = []
        for product in vendor['products']:
            selected = {field: product[field] for field in SERVER_PRODUCT_FIELDS if field in product}
            corrections = product.get('_manual_adjudications') or {}
            if corrections:
                selected['_published_corrections'] = {
                    header: {key: value[key] for key in (
                        'adjudicationId', 'document', 'documentSha256', 'page',
                        'originalValue', 'confirmedValue') if key in value}
                    | {'reviewed': value.get('actor') == 'human_user'}
                    for header, value in sorted(corrections.items())
                }
            products.append(selected)
        if len(products) != index['vendors'][slug]['productCount']:
            raise ValueError(f'Vendor product count changed: {slug}')
        files[path] = encode({**{key: vendor[key] for key in ('slug', 'name', 'productCount','manufacturerId') if key in vendor},
                              'products': products})
    for path in sorted(manifest['files']):
        if path.startswith(WIKI_PREFIXES) and path.endswith('.md'):
            files[path] = checked(path)
    hashes = {path: hashlib.sha256(content).hexdigest() for path, content in sorted(files.items())}
    canonical = encode({'schemaVersion': 2, 'sourceReleaseId': release_id,
                        'files': hashes}).rstrip(b'\n')
    runtime_id = hashlib.sha256(canonical).hexdigest()
    target = Path(runtime_releases) / release_id
    target.mkdir(parents=True, exist_ok=True)
    for relative, content in files.items():
        path = target / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    (target / 'manifest.json').write_bytes(encode({
        'schemaVersion': 2, 'sourceReleaseId': release_id,
        'runtimeId': runtime_id, 'files': hashes,
    }))
    return {'sourceReleaseId': release_id, 'runtimeId': runtime_id,
            'files': len(files), 'bytes': sum(len(content) for content in files.values())}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--release-id', default=None)
    parser.add_argument('--source-releases', type=Path, default=SOURCE_RELEASES)
    parser.add_argument('--output', type=Path, default=RUNTIME_RELEASES)
    args = parser.parse_args()
    release_id = args.release_id or json.loads((args.source_releases / 'current.json').read_text())['releaseId']
    print(json.dumps(export_runtime(release_id, args.source_releases, args.output), sort_keys=True))


if __name__ == '__main__':
    main()

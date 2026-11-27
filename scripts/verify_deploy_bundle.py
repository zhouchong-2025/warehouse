#!/usr/bin/env python3
"""Check the exact files that a public Git/Vercel deployment may consume."""

import hashlib
import json
from pathlib import Path

from export_public_catalog import PUBLIC_POINTER, PUBLIC_PRODUCT_FIELDS, PUBLIC_RELEASES, encode
from export_runtime_release import RUNTIME_RELEASES, SERVER_PRODUCT_FIELDS, WIKI_PREFIXES, PACKET_IDENTITY_FIELDS


def verify(release_id=None):
    release_id = release_id if release_id is not None else json.loads(PUBLIC_POINTER.read_text())['releaseId']
    if not isinstance(release_id, str) or len(release_id) != 64 or any(char not in '0123456789abcdef' for char in release_id):
        raise ValueError('Invalid public release pointer')
    public = PUBLIC_RELEASES / release_id
    runtime = RUNTIME_RELEASES / release_id
    browser_manifest = json.loads((public / 'manifest.json').read_text())
    server_manifest = json.loads((runtime / 'manifest.json').read_text())
    if browser_manifest.get('sourceReleaseId') != release_id or server_manifest.get('sourceReleaseId') != release_id:
        raise ValueError('Browser and server release differ')
    canonical = encode({'schemaVersion': 2, 'sourceReleaseId': release_id,
                        'files': server_manifest['files']}).rstrip(b'\n')
    if hashlib.sha256(canonical).hexdigest() != server_manifest.get('runtimeId'):
        raise ValueError('Server runtime manifest hash mismatch')
    allowed_server = {'web/public/data/vendor_index.json', 'web/public/data/pn_lookup.json',
                      'data/knowledge/pilot.compiled.json','data/evidence/compiled.json','data/extensions/compiled.json'}
    allowed_server.update(PACKET_IDENTITY_FIELDS)
    if not set(PACKET_IDENTITY_FIELDS) <= set(server_manifest['files']):
        raise ValueError('Server runtime is missing product-packet identity sources')
    for path, fields in PACKET_IDENTITY_FIELDS.items():
        for line in (runtime / path).read_text().splitlines():
            if line.strip() and set(json.loads(line)) - set(fields):
                raise ValueError('Internal identity review detail leaked')
    allowed_server.update(f'web/public/data/vendors/{slug}.json'
                          for slug in json.loads((public / 'vendor_index.json').read_text())['vendors'])
    if any(not (path in allowed_server or path.startswith(WIKI_PREFIXES) and path.endswith('.md'))
           for path in server_manifest['files']):
        raise ValueError('Server runtime contains an unapproved path')
    allowed_browser = {'vendor_index.json'}
    allowed_browser.update(f'vendors/{slug}.json'
                           for slug in json.loads((public / 'vendor_index.json').read_text())['vendors'])
    if set(browser_manifest['files']) != allowed_browser:
        raise ValueError('Browser export contains an unapproved path')

    for directory, manifest in ((public, browser_manifest), (runtime, server_manifest)):
        actual_files = {path.relative_to(directory).as_posix()
                        for path in directory.rglob('*') if path.is_file()}
        if actual_files != set(manifest['files']) | {'manifest.json'}:
            raise ValueError(f'Export has extra or missing files: {directory}')
        for relative, expected in manifest['files'].items():
            if hashlib.sha256((directory / relative).read_bytes()).hexdigest() != expected:
                raise ValueError(f'Export file hash mismatch: {relative}')
    total = 0
    for slug in json.loads((public / 'vendor_index.json').read_text())['vendors']:
        browser = json.loads((public / 'vendors' / f'{slug}.json').read_text())
        server = json.loads((runtime / 'web/public/data/vendors' / f'{slug}.json').read_text())
        if len(browser['products']) != len(server['products']) or browser['productCount'] != len(browser['products']):
            raise ValueError(f'Product count differs: {slug}')
        for shown, full in zip(browser['products'], server['products']):
            if set(shown) - set(PUBLIC_PRODUCT_FIELDS) or set(full) - set(SERVER_PRODUCT_FIELDS) - {'_published_corrections'}:
                raise ValueError(f'Unknown product field in export: {slug}')
            if shown.get('part_number') != full.get('part_number'):
                raise ValueError(f'Product identity differs: {slug}')
            if '_published_corrections' in full:
                for correction in full['_published_corrections'].values():
                    if set(correction) - {'adjudicationId', 'document', 'documentSha256', 'page',
                                          'originalValue', 'confirmedValue', 'reviewed'}:
                        raise ValueError('Internal review detail leaked')
        total += len(browser['products'])
    if total != browser_manifest['totalProducts']:
        raise ValueError('Export product total differs')
    return {'releaseId': release_id, 'products': total,
            'publicFiles': len(browser_manifest['files']),
            'runtimeFiles': len(server_manifest['files'])}


if __name__ == '__main__':
    print(json.dumps(verify(), sort_keys=True))

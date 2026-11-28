#!/usr/bin/env python3
"""Export the browser's explicit, versioned catalog projection.

The input is a checked local release. This export does not publish the source
release or make its private provenance files safe for a public repository.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path

from release_catalog import release_catalog


ROOT = Path(__file__).resolve().parents[1]
SOURCE_RELEASES = ROOT / 'web/public/data/releases'
PUBLIC_RELEASES = ROOT / 'web/public/data/published-releases'
PUBLIC_POINTER = ROOT / 'web/public/data/release-current.json'
PUBLIC_PRODUCT_FIELDS = (
    'part_number', '_section', '_sections', '_params', '_params_numeric',
    '_search_context', '_selection_status',
)


def encode(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True,
                       separators=(',', ':')) + '\n').encode('utf-8')


def export_catalog(release_id: str, source_releases=SOURCE_RELEASES,
                   public_releases=PUBLIC_RELEASES):
    if len(release_id) != 64 or any(char not in '0123456789abcdef' for char in release_id):
        raise ValueError('Invalid release ID')
    release = Path(source_releases) / release_id
    target = Path(public_releases) / release_id
    manifest = json.loads((release / 'manifest.json').read_text())
    if manifest.get('releaseId') != release_id or not isinstance(manifest.get('files'), dict):
        raise ValueError('Invalid source release manifest')
    canonical = json.dumps({'files': dict(sorted(manifest['files'].items())), 'schemaVersion': 1},
                           ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    if hashlib.sha256(canonical).hexdigest() != release_id:
        raise ValueError('Source release manifest hash mismatch')

    def checked_json(relative):
        expected = manifest['files'].get(relative)
        content = (release / relative).read_bytes()
        if hashlib.sha256(content).hexdigest() != expected:
            raise ValueError(f'Source release file hash mismatch: {relative}')
        return json.loads(content)

    index, merged_vendors, _ = release_catalog(lambda path: encode(checked_json(path)), manifest['files'])
    vendors = index.get('vendors')
    if not isinstance(vendors, dict) or not vendors:
        raise ValueError('Missing vendor index')
    files = {}
    public_index = {'releaseId': release_id, 'vendors': {}}
    total = 0
    for slug in sorted(vendors):
        if not slug or any(char not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for char in slug):
            raise ValueError(f'Invalid vendor slug: {slug}')
        vendor = merged_vendors[slug]
        products = vendor.get('products')
        if not isinstance(products, list) or len(products) != vendors[slug]['productCount']:
            raise ValueError(f'Vendor product count changed: {slug}')
        projected = [{field: product[field] for field in PUBLIC_PRODUCT_FIELDS if field in product}
                     for product in products]
        if any(not product.get('part_number') or not product.get('_section') for product in projected):
            raise ValueError(f'Missing browser identity or category: {slug}')
        public_vendor = {'name': vendor['name'], 'productCount': len(projected), 'products': projected}
        relative = f'vendors/{slug}.json'
        files[relative] = encode(public_vendor)
        public_index['vendors'][slug] = {'name': vendor['name'], 'productCount': len(projected)}
        total += len(projected)
    files['vendor_index.json'] = encode(public_index)
    file_hashes = {name: hashlib.sha256(content).hexdigest() for name, content in sorted(files.items())}
    files['manifest.json'] = encode({'sourceReleaseId': release_id, 'files': file_hashes,
                                     'totalProducts': total})
    target.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return {'sourceReleaseId': release_id, 'totalProducts': total,
            'vendors': len(vendors), 'bytes': sum(len(content) for content in files.values()),
            'files': len(files)}


def activate_public_catalog(release_id: str, public_releases=PUBLIC_RELEASES,
                            pointer=PUBLIC_POINTER):
    release = Path(public_releases) / release_id
    if not (release / 'manifest.json').is_file():
        raise ValueError('Missing exported browser release')
    pointer = Path(pointer)
    pointer.parent.mkdir(parents=True, exist_ok=True)
    staged = pointer.with_suffix('.json.next')
    staged.write_bytes(encode({'releaseId': release_id}))
    os.replace(staged, pointer)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--release-id', default=None)
    parser.add_argument('--source-releases', type=Path, default=SOURCE_RELEASES)
    parser.add_argument('--output', type=Path, default=PUBLIC_RELEASES)
    args = parser.parse_args()
    release_id = args.release_id or json.loads((args.source_releases / 'current.json').read_text())['releaseId']
    print(json.dumps(export_catalog(release_id, args.source_releases, args.output), sort_keys=True))


if __name__ == '__main__':
    main()

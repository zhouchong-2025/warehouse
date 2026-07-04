// data-loader.ts — Shared vendor-split data loading
// Reads vendor_index.json for metadata, then lazy-loads per-vendor product files.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(process.cwd(), 'public/data');

export interface VendorIndex {
  _dataVersion: Record<string, unknown>;
  vendors: Record<string, {
    name: string;
    productCount: number;
    pns: string[];
  }>;
}

export interface VendorData {
  slug: string;
  name: string;
  productCount: number;
  products: Record<string, unknown>[];
}

// Cache loaded data to avoid re-reading on every request
let _indexCache: VendorIndex | null = null;
const _vendorCache = new Map<string, VendorData>();

function loadIndex(): VendorIndex {
  if (_indexCache) return _indexCache;
  _indexCache = JSON.parse(readFileSync(resolve(DATA_DIR, 'vendor_index.json'), 'utf-8'));
  return _indexCache!;
}

/** Load products for a single vendor by slug */
export function loadVendor(slug: string): VendorData {
  if (_vendorCache.has(slug)) return _vendorCache.get(slug)!;
  const data = JSON.parse(readFileSync(resolve(DATA_DIR, 'vendors', `${slug}.json`), 'utf-8'));
  _vendorCache.set(slug, data);
  return data;
}

/** Load products for all vendors (parallel-eligible, but sync in Node) */
export function loadAllVendors(): VendorData[] {
  const index = loadIndex();
  return Object.keys(index.vendors).map(slug => loadVendor(slug));
}

/** Fast PN exact match — uses pn_lookup index, then loads only the matching vendor */
export function findProductByPN(pn: string): { vendor: string; product: Record<string, unknown> } | null {
  const qLower = pn.trim().toLowerCase();
  const lookup = JSON.parse(readFileSync(resolve(DATA_DIR, 'pn_lookup.json'), 'utf-8')) as Record<string, string>;
  const vendorSlug = lookup[qLower];
  if (!vendorSlug) return null;
  const vendor = loadVendor(vendorSlug);
  for (const p of vendor.products) {
    if ((p.part_number as string || '').toLowerCase() === qLower) {
      return { vendor: vendorSlug, product: p };
    }
  }
  return null;
}

/** Get vendor metadata */
export function getIndex(): VendorIndex {
  return loadIndex();
}

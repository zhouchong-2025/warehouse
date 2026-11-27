// data-loader.ts — Shared vendor-split data loading
// Pins every lookup to one immutable release directory.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { releaseFiles } from '../release-files.ts';

const POINTER = resolve(process.cwd(), 'public/data/release-current.json');

export interface VendorIndex {
  _dataVersion: Record<string, unknown>;
  vendors: Record<string, {
    name: string;
    productCount: number;
    pns: string[];
  }>;
}

export interface VendorData {
  manufacturerId?:string;
  slug: string;
  name: string;
  productCount: number;
  products: Record<string, unknown>[];
}

// Cache loaded data to avoid re-reading on every request
const _indexCache = new Map<string, VendorIndex>();
const _pnLookupCache = new Map<string, Record<string, string>>();
const _vendorCache = new Map<string, VendorData>();

export function getCurrentReleaseId(): string {
  const pointer = JSON.parse(readFileSync(POINTER, 'utf-8'));
  if (typeof pointer.releaseId !== 'string' || !/^[0-9a-f]{64}$/.test(pointer.releaseId)) {
    throw new Error('Invalid catalog release pointer');
  }
  if (process.env.NODE_ENV === 'production' &&
      pointer.releaseId !== process.env.NEXT_PUBLIC_CATALOG_BUILD_RELEASE_ID) {
    throw new Error('Catalog release changed after this Web build');
  }
  return pointer.releaseId;
}

export function isRuntimeReleaseCompatible(requestedReleaseId: string): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  try {
    return requestedReleaseId === getCurrentReleaseId();
  } catch {
    return false;
  }
}

function loadIndex(releaseId: string): VendorIndex {
  const cached = _indexCache.get(releaseId);
  if (cached) return cached;
  const index = JSON.parse(releaseFiles(releaseId).readPinned('web/public/data/vendor_index.json').toString('utf8'));
  const files=releaseFiles(releaseId);
  if(!files.runtime&&files.files['data/extensions/compiled.json']){
    const registry=JSON.parse(files.readPinned('data/extensions/compiled.json').toString('utf8'));
    for(const v of registry.vendors){if(index.vendors[v.slug])throw new Error('Vendor namespace collision');index.vendors[v.slug]={name:v.name,productCount:v.productCount,pns:v.products.map((p:{part_number:string})=>p.part_number)};}
  }
  _indexCache.set(releaseId, index);
  return index;
}

/** Load products for a single vendor by slug */
export function loadVendor(slug: string, releaseId = getCurrentReleaseId()): VendorData {
  const index = loadIndex(releaseId);
  const key = `${releaseId}:${slug}`;
  if (_vendorCache.has(key)) return _vendorCache.get(key)!;
  if (!Object.hasOwn(index.vendors, slug)) throw new Error('Unknown vendor');
  const envelope=releaseFiles(releaseId),path=`web/public/data/vendors/${slug}.json`;
  const data=envelope.files[path]?JSON.parse(envelope.readPinned(path).toString('utf8')):JSON.parse(envelope.readPinned('data/extensions/compiled.json').toString('utf8')).vendors.find((v:{slug:string})=>v.slug===slug);
  if(!data)throw new Error('Vendor artifact absent');
  const files=releaseFiles(releaseId);
  if(files.files['data/evidence/compiled.json']){
    const bundle=JSON.parse(files.readPinned('data/evidence/compiled.json').toString('utf8'));
    data.products=data.products.map((p:Record<string,unknown>)=>({...p,_evidence_bundle_hash:bundle.proofSetSha256,_evidence_claims:bundle.facts.filter((f:{vendor:string;model:string})=>f.vendor===slug&&f.model===p.part_number)}));
  }
  _vendorCache.set(key, data);
  return data;
}

/** Load products for all vendors (parallel-eligible, but sync in Node) */
export function loadAllVendors(releaseId = getCurrentReleaseId()): VendorData[] {
  const index = loadIndex(releaseId);
  return Object.keys(index.vendors).map(slug => loadVendor(slug, releaseId));
}

/** Fast PN exact match — uses pn_lookup index, then loads only the matching vendor */
export function findProductByPN(pn: string, releaseId = getCurrentReleaseId()): { vendor: string; product: Record<string, unknown> } | null {
  const qLower = pn.trim().toLowerCase();
  if (!_pnLookupCache.has(releaseId)) {
    const files=releaseFiles(releaseId);
    const lookup:Record<string,string>=JSON.parse(files.readPinned('web/public/data/pn_lookup.json').toString('utf8'));
    if(!files.runtime&&files.files['data/extensions/compiled.json']){
      const collided=new Set<string>();
      for(const v of JSON.parse(files.readPinned('data/extensions/compiled.json').toString('utf8')).vendors){
        for(const p of v.products){const key=String(p.part_number).toLowerCase();if(Object.hasOwn(lookup,key)){delete lookup[key];collided.add(key);}else if(!collided.has(key))lookup[key]=v.slug;}
      }
    }
    _pnLookupCache.set(releaseId,lookup);
  }
  const lookup = _pnLookupCache.get(releaseId)!;
  const vendorSlug = Object.hasOwn(lookup, qLower) ? lookup[qLower] : undefined;
  if (!vendorSlug) return null;
  const vendor = loadVendor(vendorSlug, releaseId);
  for (const p of vendor.products) {
    if ((p.part_number as string || '').toLowerCase() === qLower) {
      if (p._selection_status === 'identity_unverified') return null;
      return { vendor: vendorSlug, product: p };
    }
  }
  return null;
}

/** Get vendor metadata */
export function getIndex(releaseId = getCurrentReleaseId()): VendorIndex {
  return loadIndex(releaseId);
}

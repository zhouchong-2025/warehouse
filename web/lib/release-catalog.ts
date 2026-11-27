type ReleasePointer = { releaseId: string };
type VendorIndex = { vendors: Record<string, { name: string; productCount: number }> };

async function jsonResponse<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Catalog HTTP ${response.status}: ${url}`);
  return response.json() as Promise<T>;
}

export async function loadReleaseCatalog<T>(): Promise<{ releaseId: string; vendors: Record<string, T> }> {
  const pointer = await jsonResponse<ReleasePointer>('/data/release-current.json', { cache: 'no-store' });
  if (!/^[0-9a-f]{64}$/.test(pointer.releaseId)) throw new Error('Invalid catalog release pointer');
  if (process.env.NODE_ENV === 'production' &&
      pointer.releaseId !== process.env.NEXT_PUBLIC_CATALOG_BUILD_RELEASE_ID) {
    throw new Error('Catalog release changed after this Web build; rebuild the app for the active release');
  }
  const base = `/data/published-releases/${pointer.releaseId}`;
  const index = await jsonResponse<VendorIndex>(`${base}/vendor_index.json`);
  const vendors: Record<string, T> = {};
  await Promise.all(Object.keys(index.vendors).map(async slug => {
    vendors[slug] = await jsonResponse<T>(`${base}/vendors/${encodeURIComponent(slug)}.json`);
  }));
  return { releaseId: pointer.releaseId, vendors };
}

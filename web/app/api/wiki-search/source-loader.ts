import { releaseFiles } from '../release-files.ts';
import type { WikiDocument } from './retrieval';

const cache = new Map<string, WikiDocument[]>();

/** Load only hash-verified Wiki pages from one immutable release. */
export function loadWikiDocuments(releaseId: string): WikiDocument[] {
  const cached = cache.get(releaseId);
  if (cached) return cached;
  const release = releaseFiles(releaseId);
  const docs: WikiDocument[] = [];
  for (const [relativePath, expectedHash] of Object.entries(release.files)) {
    const sourceType = relativePath.startsWith('wiki/vendors/') ? 'vendor'
      : relativePath.startsWith('wiki/facts/') ? 'fact'
      : relativePath.startsWith('wiki/search-references/') || relativePath.startsWith('wiki/raw/papers/') ? 'reference' : null;
    if (!sourceType || !relativePath.endsWith('.md') || relativePath.split('/').includes('..')) continue;
    const bytes = release.readPinned(relativePath);
    docs.push({ path: relativePath, sha256: expectedHash, sourceType, content: bytes.toString('utf8') });
  }
  cache.set(releaseId, docs);
  return docs;
}

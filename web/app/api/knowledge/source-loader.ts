import { createHash } from 'crypto';
import { releaseFiles } from '../release-files.ts';

const BUNDLE_PATH = 'data/knowledge/pilot.compiled.json';
const cache = new Map<string, KnowledgeBundle>();

export interface KnowledgeCitation {
  id: string;
  kind: 'fact_refs' | 'source_excerpt';
  facts?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
export interface KnowledgePage {
  id: string;
  path: string;
  sha256: string;
  title: string;
  type: string;
  summary: string;
  aliases: string[];
  content: string;
  scope: { vendor: string; models: string[]; inheritance: 'none'; [key: string]: unknown };
  links: string[];
  citations: KnowledgeCitation[];
  limitations: unknown[];
  usage: 'context_only';
  hardFilterEligible: false;
}
export interface KnowledgeBundle {
  schemaVersion: 1;
  knowledgeVersion: string;
  status: 'candidate';
  dependencies: Record<string, string>;
  pages: KnowledgePage[];
  sourceExcerpts?: KnowledgeSourceExcerpt[];
}

export interface KnowledgeSourceExcerpt {
  id: string;
  documentId: string;
  documentSha256: string;
  page: number;
  identity: string;
  scope: 'family' | 'model';
  models: string[];
  sourceExcerpt: string;
  selectionUse: 'context_only';
}

const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

/** Load one compiled knowledge bundle and every pinned dependency from the same release. */
export function loadKnowledge(releaseId: string): KnowledgeBundle {
  const cached = cache.get(releaseId);
  if (cached) return cached;
  const release = releaseFiles(releaseId);
  const readPinned = release.readPinned;
  const bundle = JSON.parse(readPinned(BUNDLE_PATH).toString('utf8')) as KnowledgeBundle;
  if (bundle.schemaVersion !== 1 || bundle.status !== 'candidate' ||
      !/^[0-9a-f]{64}$/.test(bundle.knowledgeVersion) || !Array.isArray(bundle.pages)) {
    throw new Error('Invalid knowledge bundle');
  }
  for (const [name, expected] of Object.entries(bundle.dependencies)) {
    // Runtime export keeps the authored pages and compiled context; build-time
    // PDF and compiler hashes stay in the source release attestation.
    if (release.runtime && !release.files[name]) continue;
    if (sha256(readPinned(name)) !== expected) throw new Error(`Knowledge dependency changed: ${name}`);
  }
  for (const page of bundle.pages) {
    if (page.usage !== 'context_only' || page.hardFilterEligible !== false ||
        page.scope?.inheritance !== 'none' || sha256(page.content) !== page.sha256 ||
      bundle.dependencies[page.path] !== page.sha256 ||
      release.runtime && !release.files[page.path]) {
      throw new Error(`Invalid knowledge page scope: ${page.id}`);
    }
  }
  if (bundle.sourceExcerpts !== undefined) {
    if (!Array.isArray(bundle.sourceExcerpts) || new Set(bundle.sourceExcerpts.map(item => item.id)).size !== bundle.sourceExcerpts.length) {
      throw new Error('Invalid knowledge source excerpts');
    }
    for (const excerpt of bundle.sourceExcerpts) {
      if (excerpt.selectionUse !== 'context_only' || !['family', 'model'].includes(excerpt.scope)
          || !Number.isInteger(excerpt.page) || excerpt.page < 1 || !Array.isArray(excerpt.models)
          || excerpt.models.length < 1 || !excerpt.sourceExcerpt || !excerpt.documentSha256) {
        throw new Error(`Invalid knowledge source excerpt: ${excerpt.id}`);
      }
    }
  }
  cache.set(releaseId, bundle);
  return bundle;
}

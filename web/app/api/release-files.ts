import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve, sep } from 'path';

const sha256 = (content: Buffer | string) => createHash('sha256').update(content).digest('hex');
const sourceRoot = resolve(process.cwd(), 'public/data/releases');
const runtimeRoot = resolve(process.cwd(), 'runtime-releases');

export type ReleaseFiles = {
  root: string;
  sourceReleaseId: string;
  runtime: boolean;
  files: Record<string, string>;
  readPinned: (relativePath: string) => Buffer;
};

const cache = new Map<string, ReleaseFiles>();

export function releaseFiles(releaseId: string): ReleaseFiles {
  if (!/^[0-9a-f]{64}$/.test(releaseId)) throw new Error('Invalid release ID');
  const runtime = process.env.NODE_ENV === 'production';
  if (runtime && !existsSync(resolve(runtimeRoot, releaseId, 'manifest.json'))) {
    throw new Error(`Missing server release package: ${releaseId}`);
  }
  const key = `${runtime ? 'runtime' : 'source'}:${releaseId}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const root = resolve(runtime ? runtimeRoot : sourceRoot, releaseId);
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as {
    schemaVersion?: number; releaseId?: string; sourceReleaseId?: string;
    runtimeId?: string; files?: Record<string, string>;
  };
  if (!manifest.files || typeof manifest.files !== 'object') throw new Error('Invalid release manifest');
  const orderedFiles = Object.fromEntries(Object.entries(manifest.files)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const identity = runtime
    ? { files: orderedFiles, schemaVersion: 2, sourceReleaseId: releaseId }
    : { files: orderedFiles, schemaVersion: 1 };
  const calculated = sha256(JSON.stringify(identity));
  if (runtime ? manifest.schemaVersion !== 2 || manifest.sourceReleaseId !== releaseId
        || manifest.runtimeId !== calculated
      : manifest.schemaVersion !== 1 || manifest.releaseId !== releaseId
        || calculated !== releaseId) throw new Error('Release manifest hash mismatch');
  const result: ReleaseFiles = {
    root, sourceReleaseId: releaseId, runtime, files: manifest.files,
    readPinned(relativePath) {
      if (!relativePath || relativePath.startsWith('/') || relativePath.split('/').includes('..')) {
        throw new Error('Invalid release file path');
      }
      const expected = manifest.files![relativePath];
      if (!/^[0-9a-f]{64}$/.test(expected || '')) throw new Error(`Missing release file: ${relativePath}`);
      const path = resolve(root, relativePath);
      if (!path.startsWith(`${root}${sep}`)) throw new Error('Release file escaped root');
      const bytes = readFileSync(path);
      if (sha256(bytes) !== expected) throw new Error(`Release file hash mismatch: ${relativePath}`);
      return bytes;
    },
  };
  cache.set(key, result);
  return result;
}

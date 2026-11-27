import { NextRequest } from 'next/server';
import { getCurrentReleaseId, isRuntimeReleaseCompatible } from '../interpret/data-loader';
import { releaseFiles } from '../release-files.ts';

const PUBLIC_WIKI_PREFIXES = ['wiki/vendors/', 'wiki/facts/',
  'wiki/search-references/', 'wiki/raw/papers/'] as const;

export async function GET(request: NextRequest) {
  const releaseId = request.nextUrl.searchParams.get('releaseId') || getCurrentReleaseId();
  const path = request.nextUrl.searchParams.get('path') || '';
  if (!/^[0-9a-f]{64}$/.test(releaseId) || !isRuntimeReleaseCompatible(releaseId)) {
    return new Response('Release differs from Web build', { status: 409 });
  }
  if (!PUBLIC_WIKI_PREFIXES.some(prefix => path.startsWith(prefix)) || !path.endsWith('.md') ||
      path.startsWith('/') || path.split('/').some(segment => segment === '..' || segment === '.')) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const content = releaseFiles(releaseId).readPinned(path);
    return new Response(content.toString('utf8'), { headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=31536000, immutable',
    } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

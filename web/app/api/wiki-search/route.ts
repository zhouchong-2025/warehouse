import { NextRequest, NextResponse } from 'next/server';
import { getCurrentReleaseId, isRuntimeReleaseCompatible } from '../interpret/data-loader';
import { loadWikiDocuments } from './source-loader';
import { searchWikiDocuments } from './retrieval';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 500) : '';
    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });
    const activeReleaseId = getCurrentReleaseId();
    const requestedReleaseId = typeof body?.releaseId === 'string' ? body.releaseId : activeReleaseId;
    if (!/^[0-9a-f]{64}$/.test(requestedReleaseId)) {
      return NextResponse.json({ error: 'invalid releaseId' }, { status: 400 });
    }
    if (!isRuntimeReleaseCompatible(requestedReleaseId)) {
      return NextResponse.json({ error: 'release differs from Web build' }, { status: 409 });
    }
    const releaseId = requestedReleaseId;
    const hits = searchWikiDocuments(query, loadWikiDocuments(releaseId),
      Number.isInteger(body?.limit) ? body.limit : 8);
    return NextResponse.json({ releaseId, hits, evidencePolicy: 'context_only' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Wiki retrieval failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

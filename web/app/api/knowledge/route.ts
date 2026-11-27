import { NextRequest, NextResponse } from 'next/server';
import { getCurrentReleaseId, isRuntimeReleaseCompatible } from '../interpret/data-loader';
import { evaluateRequirements, getProductFacts, readSection, readSourceExcerpt, searchKnowledge } from './tools';

/** Read-only, release-pinned tools for a bounded Wiki selection workflow. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  const releaseId = body.releaseId ?? getCurrentReleaseId();
  if (typeof releaseId !== 'string' || !/^[0-9a-f]{64}$/.test(releaseId)) {
    return NextResponse.json({ error: 'invalid releaseId' }, { status: 400 });
  }
  if (!isRuntimeReleaseCompatible(releaseId)) {
    return NextResponse.json({ error: 'release differs from Web build' }, { status: 409 });
  }
  try {
    switch (body.action) {
      case 'search_knowledge': {
        if (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 500) {
          return NextResponse.json({ error: 'invalid query' }, { status: 400 });
        }
        return NextResponse.json(searchKnowledge(body.query.trim(), releaseId, body.limit));
      }
      case 'read_section': {
        if (typeof body.pageId !== 'string' || body.pageId.length > 100 ||
            (body.section != null && (typeof body.section !== 'string' || body.section.length > 150))) {
          return NextResponse.json({ error: 'invalid page or section' }, { status: 400 });
        }
        return NextResponse.json(readSection(body.pageId, body.section ?? null, releaseId));
      }
      case 'read_source_excerpt': {
        if (typeof body.id !== 'string' || body.id.length > 100) {
          return NextResponse.json({ error: 'invalid excerpt id' }, { status: 400 });
        }
        return NextResponse.json(readSourceExcerpt(body.id, releaseId));
      }
      case 'get_product_facts': {
        if (typeof body.vendor !== 'string' || typeof body.model !== 'string' ||
            body.vendor.length > 80 || body.model.length > 100 ||
            !Array.isArray(body.fields) || body.fields.length > 30 ||
            !body.fields.every((field: unknown) => typeof field === 'string' && field.length < 80)) {
          return NextResponse.json({ error: 'invalid product request' }, { status: 400 });
        }
        return NextResponse.json(getProductFacts(body.vendor, body.model, body.fields, releaseId));
      }
      case 'evaluate_requirements': {
        if (typeof body.vendor !== 'string' || typeof body.model !== 'string' ||
            body.vendor.length > 80 || body.model.length > 100 ||
            !Array.isArray(body.requirements) || body.requirements.length > 12 ||
            !body.requirements.every((item: unknown) => item && typeof item === 'object'
              && typeof (item as { field?: unknown }).field === 'string'
              && typeof (item as { operator?: unknown }).operator === 'string'
              && Array.isArray((item as { values?: unknown }).values)
              && ((item as { unit?: unknown }).unit === undefined || typeof (item as { unit?: unknown }).unit === 'string'))) {
          return NextResponse.json({ error: 'invalid requirements request' }, { status: 400 });
        }
        return NextResponse.json(evaluateRequirements(body.vendor, body.model, body.requirements, releaseId));
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'knowledge tool failed';
    const status = /Unknown knowledge|Exact model/.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

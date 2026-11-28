import {evidenceWorkerBase} from './worker-config';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentReleaseId, loadVendor } from '../interpret/data-loader';
import { loadWikiDocuments } from '../wiki-search/source-loader';
import { allowedManufacturerUrl, validatedResearchInput } from './policy';
import { catalogOfficialPdfUrls, planEvidenceBatch, validateCandidates } from './batch';
export const runtime = 'nodejs';

function localAvailable(req: NextRequest) {
  const origin = process.env.LOCAL_MODEL_TEST_ORIGIN || 'http://127.0.0.1:3231';
  return process.env.ONLINE_EVIDENCE_ENABLED === '1' && process.env.LOCAL_MODEL_TESTING_ONLY === '1'
    && Boolean(process.env.ONLINE_EVIDENCE_TOKEN) && req.headers.get('host') === new URL(origin).host;
}
async function worker(path: string, body?: unknown, searchRequestId?: string) {
  return fetch(`${evidenceWorkerBase()}${path}`, { method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${process.env.ONLINE_EVIDENCE_TOKEN}`, 'content-type': 'application/json', ...(searchRequestId ? {'x-selection-request-id':searchRequestId} : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(5000) });
}
export async function GET(req: NextRequest) {
  if (!localAvailable(req)) return NextResponse.json({ available: false });
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (jobId && !/^[a-f0-9]{64}$/.test(jobId)) return NextResponse.json({ error: '无效任务' }, { status: 400 });
  try {
    const response = await worker(jobId ? `/jobs/${jobId}` : '/health');
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ available: false, error: '补查服务暂不可用，原搜索结果保持不变' }, { status: 503 }); }
}
export async function POST(req: NextRequest) {
  if (!localAvailable(req) || req.headers.get('origin') !== process.env.LOCAL_MODEL_TEST_ORIGIN) {
    return NextResponse.json({ error: '本地补查尚未启用或请求来源不符' }, { status: 403 });
  }
  if (Number(req.headers.get('content-length')) > 40000) return NextResponse.json({ error: '请求过长' }, { status: 413 });
  const raw = await req.json().catch(() => null);
  const searchRequestId = typeof raw?.searchRequestId==='string' && /^[0-9a-f-]{36}$/.test(raw.searchRequestId)
    ? raw.searchRequestId : undefined;
  if (raw?.action === 'plan_batch' || raw?.action === 'start_batch') {
    const candidates = validateCandidates(raw.candidates, raw.releaseId);
    if (!candidates || raw.action === 'start_batch' && raw.consent !== true)
      return NextResponse.json({ error: '补查范围无效或尚未确认' }, { status: 400 });
    if (raw.releaseId !== getCurrentReleaseId())
      return NextResponse.json({ error: '数据版本已变化，请刷新' }, { status: 409 });
    try {
      const sources = new Map<string, string>();
      for (const candidate of candidates) {
        const product = loadVendor(candidate.vendor, raw.releaseId).products.find(p => p.part_number === candidate.pn);
        if (!product || product._selection_status === 'identity_unverified')
          return NextResponse.json({ error: '当前目录没有可核验的型号' }, { status: 404 });
        const [source] = catalogOfficialPdfUrls(candidate, product._source_facts);
        if (source) sources.set(JSON.stringify([candidate.vendor,candidate.pn]), source);
      }
      const plan = planEvidenceBatch(candidates, candidate => sources.get(JSON.stringify([candidate.vendor,candidate.pn])));
      if (raw.action === 'plan_batch') return NextResponse.json(plan);
      if (JSON.stringify(plan.groups.flatMap(group => group.candidates).map(c => [c.vendor,c.pn]).sort()) !==
          JSON.stringify(candidates.map(c => [c.vendor,c.pn]).sort()))
        return NextResponse.json({ error: '补查组已变化，请重新确认' }, { status: 409 });
      const response = await worker('/batch-jobs', {
        groups: plan.groups.map(group => ({
          url: group.sourceUrl,
          jobs: group.candidates.map(c => ({...c, releaseId: raw.releaseId, clauses: c.requirements.map(r => r.source)})),
        })),
      }, searchRequestId);
      return NextResponse.json(await response.json(), { status: response.status });
    } catch {
      return NextResponse.json({ error: '补查服务暂不可用' }, { status: 503 });
    }
  }
  const body = validatedResearchInput(raw);
  if (!body) return NextResponse.json({ error: '请确认本次补查，并选择最多5条待核条件' }, { status: 400 });
  if (body.releaseId !== getCurrentReleaseId()) return NextResponse.json({ error: '数据版本已变化，请刷新' }, { status: 409 });
  try {
    const product = loadVendor(body.vendor, body.releaseId).products.find(p => p.part_number === body.pn);
    if (!product || product._selection_status === 'identity_unverified') return NextResponse.json({ error: '当前目录没有可核验的完整型号' }, { status: 404 });
    const direct = catalogOfficialPdfUrls(body, product._source_facts);
    const knownUrls = direct.length ? direct : [...new Set(loadWikiDocuments(body.releaseId)
      .filter(d => d.sourceType !== 'reference' && d.content.toUpperCase().includes(body.pn.toUpperCase()))
      .flatMap(d => [...d.content.matchAll(/https:\/\/[^\s<>`"|)]+/g)].map(m => m[0]))
      .filter(url => allowedManufacturerUrl(url, body.vendor) && /\.pdf(?:\?|$)/i.test(url)))].slice(0,3);
    const response = await worker('/jobs', { ...body, knownUrls },searchRequestId);
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ error: '补查服务暂不可用，原搜索结果保持不变' }, { status: 503 }); }
}

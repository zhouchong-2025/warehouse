/** Version rejection happens before model invocation; the whole page must reload. */
export async function readInterpretResponse<T>(response: Response): Promise<
  { kind: 'result'; result: T } | { kind: 'reload_required' }
> {
  if (response.status === 409) return { kind: 'reload_required' };
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) throw new Error(payload?.error || `搜索服务请求失败（${response.status}），请重试。`);
  if (!payload) throw new Error('搜索服务未返回有效结果，请重试。');
  return { kind: 'result', result: payload as T };
}
export type SearchResume = { query: string; vendor: string | null; modelConsent: boolean; expiresAt: number };
/** One use, short-lived state; no credentials, results or persistent model consent. */
export function readSearchResume(raw: string | null, now: number): SearchResume | null {
  try {
    const r = JSON.parse(raw || 'null');
    return r && typeof r.query === 'string' && r.query.trim().length >= 3 && r.query.length <= 500
      && (r.vendor === null || typeof r.vendor === 'string') && typeof r.modelConsent === 'boolean'
      && Number.isFinite(r.expiresAt) && r.expiresAt > now && r.expiresAt <= now + 30000 ? r : null;
  } catch { return null; }
}

import registry from '../../../lib/manufacturers.json' with {type:'json'};
export const MANUFACTURER_DOMAINS:Record<string,string[]>=Object.fromEntries(Object.entries(registry.vendors).map(([slug,v])=>[slug,v.domains]));
export function allowedManufacturerUrl(url: string, vendor: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password
    && (!u.port || u.port === '443') && (MANUFACTURER_DOMAINS[vendor] || []).some(d => u.hostname === d || u.hostname.endsWith(`.${d}`)); }
  catch { return false; }
}
export type EvidenceRequirement={id:string;source:string;object?:string;role?:string;meaning?:string;condition?:string};
export function validatedResearchInput(body: unknown): { vendor: string; pn: string; releaseId: string; clauses: string[];requirements?:EvidenceRequirement[] } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.consent !== true || typeof b.vendor !== 'string' || !Object.hasOwn(MANUFACTURER_DOMAINS, b.vendor)
    || typeof b.pn !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+\-]{1,79}$/.test(b.pn)
    || typeof b.releaseId !== 'string' || !/^[a-f0-9]{64}$/.test(b.releaseId)
    || !Array.isArray(b.clauses) || !b.clauses.length || b.clauses.length > 5
    || b.clauses.some(s => typeof s !== 'string' || !s.trim() || s.length > 200)) return null;
  let requirements:EvidenceRequirement[]|undefined;
  if(b.requirements!==undefined){
    if(!Array.isArray(b.requirements)||b.requirements.length!==b.clauses.length||new Set(b.requirements.map(r=>r?.id)).size!==b.requirements.length)return null;
    if(b.requirements.some((r,i)=>!r||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(r.id)||r.source!==(b.clauses as string[])[i]||Object.entries(r).some(([k,v])=>!['id','source','object','role','meaning','condition'].includes(k)||typeof v!=='string'||v.length>900)))return null;
    requirements=b.requirements as EvidenceRequirement[];
  }
  return { vendor: b.vendor, pn: b.pn, releaseId: b.releaseId, clauses: requirements?b.clauses as string[]:[...new Set(b.clauses as string[])],...(requirements?{requirements}:{}) };
}

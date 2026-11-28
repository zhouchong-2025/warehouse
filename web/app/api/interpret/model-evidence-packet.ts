/** Model-facing projection only. Original references remain immutable on the
 * server for allowlisting, hash verification and binding returned citation IDs.
 * Keep quotations, IDs, model ownership, pages, conditions, scope and rating.
 */
const SERVER_METADATA=new Set(['documentSha256','factsSha256','wikiFactPage','sha256','sourceId']);
export function compactModelEvidence(value:unknown):unknown{
 if(Array.isArray(value))return value.map(compactModelEvidence);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!SERVER_METADATA.has(key)).map(([key,item])=>[key,compactModelEvidence(item)]));
}

/** Lossless, request-local dictionary for repeated citation objects. A repeated
 * fact with different scope/value/condition receives a different entry. This
 * does not drop facts, footnotes or candidate ownership. */
export function deduplicateModelEvidence(value:unknown):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.hasOwn(value,'evidenceSources'))return value;
 const candidate=(v:Record<string,unknown>)=>typeof v.factId==='string'||typeof v.quote==='string'&&typeof v.kind==='string'&&typeof v.id==='string';
 const counts=new Map<string,number>();
 const count=(v:unknown)=>{if(Array.isArray(v)){v.forEach(count);return;}if(!v||typeof v!=='object')return;
  const r=v as Record<string,unknown>;if(candidate(r)){const k=JSON.stringify(r);if(k.length>=120)counts.set(k,(counts.get(k)||0)+1);}
  Object.values(r).forEach(count);
 };count(value);
 const ids=new Map<string,string>(),sources:Record<string,unknown>={};
 const project=(v:unknown):unknown=>{if(Array.isArray(v))return v.map(project);if(!v||typeof v!=='object')return v;
  const r=v as Record<string,unknown>,key=candidate(r)?JSON.stringify(r):'';
  if(key&&(counts.get(key)||0)>1){let id=ids.get(key);if(!id){id=`s${ids.size+1}`;ids.set(key,id);sources[id]=r;}return {$evidenceRef:id};}
  return Object.fromEntries(Object.entries(r).map(([k,item])=>[k,project(item)]));
 };
 const projected=project(value) as Record<string,unknown>;
 if(!ids.size)return value;
 const result={...projected,evidenceSources:sources};
 return JSON.stringify(result).length<JSON.stringify(value).length?result:value;
}

/** Used by offline round-trip checks; never converts references into proof. */
export function expandModelEvidence(value:unknown):unknown{
 if(!value||typeof value!=='object'||Array.isArray(value)||!Object.hasOwn(value,'evidenceSources'))return value;
 const {evidenceSources,...payload}=value as Record<string,unknown>,sources=evidenceSources as Record<string,unknown>;
 const expand=(v:unknown):unknown=>{if(Array.isArray(v))return v.map(expand);if(!v||typeof v!=='object')return v;
  const r=v as Record<string,unknown>;if(Object.keys(r).length===1&&typeof r.$evidenceRef==='string'&&Object.hasOwn(sources,r.$evidenceRef))return sources[r.$evidenceRef];
  return Object.fromEntries(Object.entries(r).map(([k,item])=>[k,expand(item)]));
 };return expand(payload);
}

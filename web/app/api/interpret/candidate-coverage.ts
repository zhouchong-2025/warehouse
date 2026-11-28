import manufacturers from '../../../lib/manufacturers.json' with {type:'json'};
import {sourceFactsForProduct} from './source-facts';
/** Bounded review coverage, never a product-qualification decision. Input must
 * already be ranked by evidence. One representative per group, then fill. */
export function coverGroups<T>(ranked:readonly T[],limit:number,group:(row:T)=>string):T[]{
 const first:T[]=[],seen=new Set<string>();for(const row of ranked){const key=group(row);if(!seen.has(key)){seen.add(key);first.push(row);}}
 return [...new Set([...first,...ranked])].slice(0,Math.max(0,limit));
}
export function manufacturerGroup(vendor:unknown){const s=String(vendor);return (manufacturers.vendors as Record<string,{manufacturerId:string}>)[s]?.manufacturerId||s;}
export function requirementEvidenceRelevance(product:Record<string,unknown>,sources:readonly string[]):number{
 const facts=sourceFactsForProduct(product).map(f=>`${f.publishedHeader||f.field} ${f.publishedValue||''}`.toLowerCase()).join(' ').replace(/miller[ -]*clamp/gi,'米勒钳位');
 return sources.reduce((sum,source)=>{
  const tokens=[...(source.toLowerCase().match(/[a-z][a-z0-9-]{1,}/g)||[]),...[...source.matchAll(/[\u3400-\u9fff]{2,}/g)].flatMap(([s])=>Array.from({length:s.length-1},(_,i)=>s.slice(i,i+2)))];
  return sum+new Set(tokens.filter(t=>facts.includes(t))).size;
 },0);
}

/** Manufacturer names are catalog metadata; meaning/necessity is authored by the FAE.
 * Unknown names never discharge a manufacturer condition or silently select a brand.
 */
export function manufacturerIdForName(name:string):string|null{
 const normalized=name.trim().toLocaleLowerCase();
 const matches=new Set(Object.entries(manufacturers.vendors).filter(([slug,v])=>[slug,v.manufacturerId,v.displayName,...('aliases'in v?v.aliases as string[]:[])].some(n=>n.toLocaleLowerCase()===normalized)).map(([,v])=>v.manufacturerId));
 return matches.size===1?[...matches][0]:null;
}
export function manufacturerScopeAllows(vendor:string,u:{requirements:{necessity?:string;manufacturerConstraint?:{name:string;mode:'include'|'exclude'}}[]}):boolean{
 const constraints=u.requirements.filter(r=>r.necessity!=='preferred'&&r.manufacturerConstraint).map(r=>({id:manufacturerIdForName(r.manufacturerConstraint!.name),mode:r.manufacturerConstraint!.mode}));
 const group=manufacturerGroup(vendor),included=constraints.filter(c=>c.mode==='include');
 return (!included.length||included.some(c=>c.id===group))&&!constraints.some(c=>c.mode==='exclude'&&c.id===group);
}

/** One vendor-scope rule for registered packets and their manufacturer groups. */
export function matchingVendorSlugs(slugs:readonly string[],scope:string|null):string[]{
 return slugs.filter(slug=>!scope||slug===scope||manufacturerGroup(slug)===scope);
}

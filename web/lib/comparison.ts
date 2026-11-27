import {effectiveConditions,type OnlineRecommendation} from './online-recommendation';
import {salesEvidenceLine,type OnlineCitation} from './online-evidence-summary';
import {allowedManufacturerUrl} from '../app/api/online-evidence/policy';
import {productIdentity, type ExactSelectionResult, type Product} from '../app/product-utils';
import {parameterMatchSummary,type ParameterMatchRow} from './parameter-match-summary';
import type {QuerySpec} from '../app/api/interpret/selection-spec';
import type {LedgerEntry} from '../app/api/interpret/requirement-ledger';

export const COMPARISON_KEY='teampo:comparison:v1';
export type ComparisonCheck=Pick<LedgerEntry,'requirementId'|'source'|'object'|'condition'|'status'|'reason'|'evidence'> & {parameters?:ParameterMatchRow[]; online?: {text:string; citations:OnlineCitation[]}};
export type ComparisonState={version:1;releaseId:string;selected:string[];query:string;checks:Record<string,ComparisonCheck[]>};
export const emptyComparison=(releaseId:string):ComparisonState=>({version:1,releaseId,selected:[],query:'',checks:{}});
export function parseIdentity(value:string):[string,string]|null{
 try{const a=JSON.parse(value);return Array.isArray(a)&&a.length===2&&a.every(x=>typeof x==='string'&&x.length>0&&x.length<=160)?[a[0],a[1]]:null;}catch{return null;}
}
export function readComparison(raw:string|null,releaseId:string):ComparisonState{
 const clean=emptyComparison(releaseId);
 try{
  if(!raw||raw.length>2_000_000)return clean;
  const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.selected))return clean;
  clean.selected=[...new Set<string>(data.selected.filter((x:unknown)=>typeof x==='string'&&parseIdentity(x)).slice(0,100))];
  if(data.releaseId!==releaseId)return clean; // Selections survive; old evidence never certifies a new release.
  clean.query=typeof data.query==='string'?data.query.slice(0,2000):'';
  for(const id of clean.selected){const rows=data.checks?.[id];if(!Array.isArray(rows))continue;
   clean.checks[id]=rows.filter((r:ComparisonCheck)=>r&&['supported','contradicted','unknown','conflict','clarification'].includes(r.status)&&['requirementId','source','object','condition','reason'].every(k=>typeof (r as unknown as Record<string,unknown>)[k]==='string')&&Array.isArray(r.evidence)&&r.evidence.every(e=>e&&typeof e.document==='string'&&typeof e.originalHeader==='string'&&typeof e.originalValue==='string'&&typeof e.factId==='string'&&Number.isInteger(e.page)&&e.page>0&&(!e.wikiFactPage||typeof e.wikiFactPage==='string'&&e.wikiFactPage.startsWith('wiki/facts/')))).slice(0,50).map(({parameters,online,...row}:ComparisonCheck)=>({...row,...(online && typeof online.text==='string' && Array.isArray(online.citations) && online.citations.every(c=>c && allowedManufacturerUrl(c.url,parseIdentity(id)![0]) && Number.isInteger(c.page) && c.page>0 && typeof c.quote==='string' && /^[a-f0-9]{64}$/.test(c.sha256 || '')) ? {online} : {}),...(Array.isArray(parameters)?{
     parameters:parameters.filter(p=>p && [p.id,p.label,p.value,p.comparison].every(v=>typeof v==='string'&&v.length<=500) &&
       typeof p.unmatched==='boolean').slice(0,30),
   }:{})}));
  }
 }catch{/* Private storage unavailable/corrupt: keep a usable empty comparison. */}
 return clean;
}
export function comparisonWithResults(state:ComparisonState,query:string,results:ExactSelectionResult[],specs?:ReadonlyMap<ExactSelectionResult,QuerySpec>,online:OnlineRecommendation={}):ComparisonState{
 const checks=state.query===query?{...state.checks}:{};
 for(const item of results){const id=productIdentity(item.vendor,item.pn),ledger=item.requirementLedger;
  if(!state.selected.includes(id)||!ledger||ledger.releaseId!==state.releaseId||ledger.candidate.vendor!==item.vendor||ledger.candidate.pn!==item.pn)continue;
  const spec=specs?.get(item);
  checks[id]=effectiveConditions(item.vendor,item.pn,ledger,state.releaseId,online).map(({entry,status,online,confirmed})=>{
   const {requirementId,source,object,condition,reason,evidence}=entry;
   const requirements=spec?.requirements.filter(r=>r.engineeringRequirementId===requirementId &&
     r.source?.text && source.includes(r.source.text));
   const parameters=requirements?.length ? parameterMatchSummary({...spec!,requirements},item.parameterChecks) : [];
   const line = online ? salesEvidenceLine(online) : undefined;
   const supplemental = online && line && online.outcome!=='unknown' ? {
     text:[confirmed?'联网已确认':line.status,line.value,line.condition,line.next].filter(Boolean).join(' · '),
     citations:online.citations,
   } : undefined;
   return {requirementId,source,object,condition,status,reason,evidence,...(parameters.length?{parameters}:{}),...(supplemental?{online:supplemental}:{})};
  });
 }
 return {...state,query,checks};
}
export function comparisonHref(selected:string[],releaseId:string|null){
 const params=new URLSearchParams();if(selected.length)params.set('items',JSON.stringify(selected));if(releaseId)params.set('release',releaseId);
 return '/compare'+(params.size?'?'+params.toString():'');
}
/** Legacy links resolve only unambiguous part numbers; new links carry vendor + part. */
export function comparisonSelection(items:string|null,chips:string|null,products:{id:string;part:string}[]):string[]|null{
 if(items!==null){try{const a=JSON.parse(items);return Array.isArray(a)?[...new Set<string>(a.filter((x:unknown)=>typeof x==='string'&&parseIdentity(x)).slice(0,100))]:[];}catch{return [];}}
 if(chips!==null)return chips.split(',').flatMap(part=>{const hits=products.filter(p=>p.part===part);return hits.length===1?[hits[0].id]:[];});
 return null;
}
/** Keep original names/units/conditions; never align unrelated fields by fuzzy names. */
export function comparisonParams(p:Product):[string,string][]{
 const rows=new Map<string,string>();if(p._section)rows.set('品类',p._section);
 for(const [key,value]of Object.entries(p))if(!key.startsWith('_')&&!['part_number','vendor','__vendor'].includes(key)&&['string','number','boolean'].includes(typeof value)&&String(value).trim())rows.set(key,String(value));
 for(const pair of String(p._params||'').split(/\s*\|\s*/)){const m=pair.match(/^([^:：]+)[:：]\s*(.+)$/);if(m){const key=m[1].trim(),value=m[2].trim();if(key.startsWith('_'))continue;const prior=rows.get(key);rows.set(key,prior&&prior!==value?prior+'；'+value:value);}}
 return [...rows];
}
export const comparisonStatus:Record<ComparisonCheck['status'],string>={supported:'有证据支持',contradicted:'不满足',unknown:'待核',conflict:'证据冲突',clarification:'口径待确认'};
export function comparisonCsv(rows:{vendorName:string;product:Product;checks?:ComparisonCheck[]}[]):string{
 const keys=[...new Set(rows.flatMap(r=>comparisonParams(r.product).map(([k])=>k)))];
 const cell=(value:string)=>'"'+(/^[=+@\-\t\r]/.test(value)?"'"+value:value).replaceAll('"','""')+'"';
 const header=['厂商','型号',...keys,'本次需求核验'];
 return '\uFEFF'+[header,...rows.map(r=>{const p=new Map(comparisonParams(r.product));return[r.vendorName,r.product.part_number,...keys.map(k=>p.get(k)||''),(r.checks||[]).map(c=>`${c.source}：${comparisonStatus[c.status]}；${c.reason}${c.parameters?.length?'；'+c.parameters.map(p=>p.value+' · '+p.comparison).join('；'):''}${c.online?'；'+c.online.text+'；'+c.online.citations.map(ref=>ref.url.split('#')[0]+'#page='+ref.page).join('、'):''}`).join(' | ')];})].map(r=>r.map(cell).join(',')).join('\n');
}

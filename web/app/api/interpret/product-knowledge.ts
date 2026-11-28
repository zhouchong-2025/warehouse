import {coverGroups} from './candidate-coverage';
import {sourceFactsForProduct} from './source-facts';
import {catalogDeviceFamilies} from './device-identity';
import type {WikiDocument} from '../wiki-search/retrieval';
import {releaseFiles} from '../release-files';
import {loadAllVendors} from './data-loader';
import {loadWikiDocuments} from '../wiki-search/source-loader';
type Product=Record<string,unknown>;
export type ProductRelation={from:string;to:string;type:string;evidenceFactId:string;applicability?:{rule:string;claimId:string;modelEvidence:unknown;proofSetSha256:string}};
export type ProductPacket={
 version:1;releaseId:string;id:string;vendor:string;manufacturerId:string;pn:string;category:string;families:readonly string[];
 facts:ReturnType<typeof sourceFactsForProduct>;
 documents:{path:string;sha256:string;relation:'fact_source'|'exact_model_mention';startLines:number[];contextOnly:true}[];
 discoveryText?:string;
 relations:(ProductRelation&{evidenceStatus:'reference_bound'|'unverified'|'applicability_verified';inheritFacts:false})[];
 conflicts:{header:string;factIds:string[];status:'needs_scope_review'}[];
};
export type ProductKnowledgeIndex={releaseId:string;packets:Map<string,ProductPacket>;documents:Map<string,WikiDocument>};
const terms=(text:string)=>[...new Set([...(text.toLowerCase().match(/[a-z0-9][a-z0-9.+-]*/g)||[]),...[...text.matchAll(/[\u3400-\u9fff]{2,}/g)].flatMap(([s])=>Array.from({length:s.length-1},(_,i)=>s.slice(i,i+2)))])].filter(t=>t.length>1);
const semanticNames:Record<string,string>={levelShift:'电平转换 电平移位 level shifter logic level translator voltage translator',can:'CAN 收发器',phy:'PHY 以太网',processor:'MCU DSP 微控制器',ldo:'LDO 线性稳压',dcdc:'DC DC 降压 升压',digitalIsolation:'数字隔离器'};
/** Compile one read-only projection from a single hash-verified release. Links
 * are navigation, never authority to transfer specifications between models. */
export function compileProductKnowledge(releaseId:string,products:Product[],documents:WikiDocument[],relations:ProductRelation[]=[]):ProductKnowledgeIndex{
 const packets=new Map<string,ProductPacket>(),docs=new Map(documents.map(d=>[d.path,d]));
 const documentLines=new Map(documents.map(d=>[d.path,d.content.split('\n')]));
 const byName=new Map<string,ProductPacket[]>(),factOwners=new Map<string,Set<string>>();
 for(const p of products){
  if(p._selection_status==='identity_unverified'||typeof p.part_number!=='string'||typeof p.__vendor!=='string')continue;
  const facts=sourceFactsForProduct(p);const owner=`${p.__vendor}:${p.part_number}`;facts.forEach(f=>factOwners.set(f.id,new Set([...(factOwners.get(f.id)||[]),owner])));
  const packet:ProductPacket={version:1,releaseId,id:`${p.__vendor}:${p.part_number}`,vendor:p.__vendor,manufacturerId:String(p.__manufacturerId||p.__vendor),pn:p.part_number,category:String(p._section||''),families:catalogDeviceFamilies(p),facts,documents:[],relations:[],conflicts:[]};
  const groups=new Map<string,typeof facts>();
  for(const f of facts){const header=f.publishedHeader||f.field;groups.set(header,[...(groups.get(header)||[]),f]);}
  for(const [header,rows]of groups)if(new Set(rows.map(f=>f.publishedValue)).size>1)packet.conflicts.push({header,factIds:rows.map(f=>f.id),status:'needs_scope_review'});
  const paths=new Set(facts.map(f=>f.source.wikiFactPage).filter((path):path is string=>!!path));
  for(const path of paths){const d=docs.get(path);if(d)packet.documents.push({path,sha256:d.sha256,relation:'fact_source',startLines:[],contextOnly:true});}
  packets.set(packet.id,packet);byName.set(packet.pn.toUpperCase(),[...(byName.get(packet.pn.toUpperCase())||[]),packet]);
 }
 // Scan documents once, with exact model tokens: Q and orderable suffixes
 // are not stripped. A shared page is not a shared specification scope.
 for(const d of documents){const matches=new Map<ProductPacket,number[]>();
  documentLines.get(d.path)!.forEach((line,i)=>{for(const token of new Set(line.match(/[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)*/g)||[])){
   for(const packet of byName.get(token.toUpperCase())||[])matches.set(packet,[...(matches.get(packet)||[]),i+1]);
  }});
  for(const [packet,lines]of matches){const existing=packet.documents.find(p=>p.path===d.path);if(existing)existing.startLines=[...new Set(lines)];else packet.documents.push({path:d.path,sha256:d.sha256,relation:'exact_model_mention',startLines:[...new Set(lines)],contextOnly:true});}
 }
 for(const packet of packets.values())packet.discoveryText=packet.documents.slice(0,8).flatMap(link=>{const lines=documentLines.get(link.path)||[];return link.startLines.slice(0,3).map(n=>lines.slice(Math.max(0,n-3),n+2).join(' ').slice(0,1000));}).join(' ');
 for(const r of relations){if(!r||typeof r.from!=='string'||typeof r.to!=='string'||typeof r.type!=='string'||typeof r.evidenceFactId!=='string')continue;
  const owned=[...(factOwners.get(r.evidenceFactId)||[])].some(id=>id===r.from||id===r.to);
  const proof=packets.get(r.from)?.facts.find(f=>f.id===r.evidenceFactId&&f.origin==='reviewed_evidence');
  const applicable=owned&&proof&&r.applicability&&r.applicability.claimId===proof.id&&r.applicability.proofSetSha256===proof.source.factsSha256&&['explicit_model','document_ordering_table','reviewed_relation'].includes(r.applicability.rule)&&!!r.applicability.modelEvidence;
  for(const id of new Set([r.from,r.to]))packets.get(id)?.relations.push({...r,evidenceStatus:applicable?'applicability_verified':owned?'reference_bound':'unverified',inheritFacts:false});
 }
 return {releaseId,packets,documents:docs};
}
export function searchProductKnowledge(index:ProductKnowledgeIndex,query:string,limit=5){
 const ts=terms(query);const ranked=[...index.packets.values()].map(p=>{
  const identity=[p.pn,p.category,...p.families.flatMap(f=>[f,semanticNames[f]||''])].join(' ').toLowerCase();
  const facts=p.facts.map(f=>`${f.publishedHeader||f.field} ${f.publishedValue||''}`).join(' ').toLowerCase();
  const score=ts.reduce((n,t)=>n+(identity.includes(t)?4:facts.includes(t)?1:(p.discoveryText||'').toLowerCase().includes(t)?.5:0),0)+(query.toUpperCase().includes(p.pn.toUpperCase())?40:0);
  return {packet:p,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.packet.id.localeCompare(b.packet.id));return coverGroups(ranked,Math.max(0,Math.min(20,limit)),x=>x.packet.manufacturerId);
}
export function packetSummary(p:ProductPacket){return {id:p.id,pn:p.pn,vendor:p.vendor,manufacturerId:p.manufacturerId,category:p.category,families:p.families,totalFacts:p.facts.length,totalDocuments:p.documents.length,relations:p.relations,conflicts:p.conflicts,contextOnly:true};}
export function packetFacts(p:ProductPacket,query:string,limit=60,offset=0){
 const ts=terms(query);const ordered=p.facts.map((f,i)=>({f,i,score:ts.reduce((n,t)=>n+(`${f.publishedHeader||f.field} ${f.publishedValue||''} ${f.evidence.condition||''}`.toLowerCase().includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score||a.i-b.i);
 return ordered.slice(offset,offset+limit).map(x=>x.f);
}
const cache=new Map<string,ProductKnowledgeIndex>();
export function loadProductKnowledge(releaseId:string):ProductKnowledgeIndex{
 const prior=cache.get(releaseId);if(prior)return prior;
 const relations=releaseFiles(releaseId).readPinned('data/facts/relations.jsonl').toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
 const files=releaseFiles(releaseId);
 if(files.files['data/evidence/compiled.json']){
  const bundle=JSON.parse(files.readPinned('data/evidence/compiled.json').toString('utf8'));
  relations.push(...bundle.relations.map((r:{from:string;to:string;type:string;claimId:string;rule:string;modelEvidence:unknown})=>({from:r.from,to:r.to,type:r.type,evidenceFactId:r.claimId,applicability:{rule:r.rule,claimId:r.claimId,modelEvidence:r.modelEvidence,proofSetSha256:bundle.proofSetSha256}})));
 }
 const entities=new Map(releaseFiles(releaseId).readPinned('data/facts/entities.jsonl').toString('utf8').split('\n').filter(Boolean).map(l=>{const e=JSON.parse(l);return [e.id,e.manufacturerId] as const;}));
 const products=loadAllVendors(releaseId).flatMap(v=>v.products.map(p=>({...p,__vendor:v.slug,__manufacturerId:entities.get(`${v.slug}:${p.part_number}`)||v.manufacturerId||v.slug})));
 const index=compileProductKnowledge(releaseId,products,loadWikiDocuments(releaseId),relations);cache.set(releaseId,index);return index;
}

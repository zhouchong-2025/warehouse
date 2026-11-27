import type {RequirementLedger} from './requirement-ledger';
import type {PendingEvidenceCheck} from './pending-evidence';
type RankedEvidence={pendingChecks:PendingEvidenceCheck[];requirementLedger?:RequirementLedger};
/** Count original requirement IDs, not duplicate observations or display tags. */
export function evidenceMatchSummary(item:RankedEvidence){
 const ledger=item.requirementLedger;
 const groups=new Map<string,PendingEvidenceCheck[]>();
 for(const c of item.pendingChecks.filter(c=>!c.summaryOfRequirementIds?.length)){const key=c.requirementId||c.source;groups.set(key,[...(groups.get(key)||[]),c]);}
 const entries=ledger?.entries||[...groups.values()].map(rows=>({required:rows.some(c=>c.blocksMatch),status:rows.some(c=>c.status==='contradicted')?'contradicted':rows.every(c=>c.status==='supported')?'supported':'unknown'}));
 const required=entries.filter(e=>e.required),supported=required.filter(e=>e.status==='supported').length;
 const conflicts=required.filter(e=>['contradicted','conflict'].includes(e.status)).length;
 return {requiredTotal:required.length,requiredSupported:supported,requiredPending:required.length-supported,conflicts,
  preferredSupported:entries.filter(e=>!e.required&&e.status==='supported').length,
  complete:required.length>0&&required.every(e=>e.status==='supported')&&!item.pendingChecks.some(c=>c.blocksMatch&&c.status!=='supported'&&!c.summaryOfRequirementIds?.length&&!c.requirementId),
  possibleMismatch:item.pendingChecks.some(c=>c.attention==='possible_mismatch')};
}
/** Evidence coverage precedes model/source hints. Missing evidence never counts as met. */
export function compareEvidenceCoverage(a:RankedEvidence,b:RankedEvidence){
 const x=evidenceMatchSummary(a),y=evidenceMatchSummary(b);
 return Number(x.conflicts > 0)-Number(y.conflicts > 0)||Number(y.complete)-Number(x.complete)||y.requiredSupported-x.requiredSupported||x.conflicts-y.conflicts
  ||x.requiredPending-y.requiredPending||Number(x.possibleMismatch)-Number(y.possibleMismatch)||y.preferredSupported-x.preferredSupported;
}

/** Reorder within equal-coverage slots only. Sorting within buckets keeps the
 * ordering transitive when one candidate has a different test condition. */
export function orderComparableReadings<T extends RankedEvidence>(ranked:T[]):T[] {
 const slots=new Map<string,{index:number;item:T;value:number;direction:'lower'|'higher'}[]>();
 ranked.forEach((item,index)=>{
   const entries=item.requirementLedger?.entries.filter(entry=>entry.readings?.length) || [];
   if(entries.length!==1 || entries[0].readings!.length!==1)return;
   const reading=entries[0].readings![0];
   const key=JSON.stringify([entries[0].requirementId,reading.basis,evidenceMatchSummary(item)]);
   const bucket=slots.get(key)||[];
   bucket.push({index,item,value:reading.value,direction:reading.direction});
   slots.set(key,bucket);
 });
 const ordered=[...ranked];
 for(const bucket of slots.values()){
   const sorted=[...bucket].sort((a,b)=>a.direction==='lower'?a.value-b.value:b.value-a.value);
   bucket.forEach((slot,i)=>{ordered[slot.index]=sorted[i].item;});
 }
 return ordered;
}

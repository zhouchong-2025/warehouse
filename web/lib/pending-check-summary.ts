import type {PendingEvidenceCheck} from '../app/api/interpret/pending-evidence';
/** Group only presentation, never discard evidence or change match decisions.
 * The least certain check wins when one original phrase covers several objects.
 */
export function summarizePendingChecks(checks:readonly PendingEvidenceCheck[]){
 const groups=new Map<string,PendingEvidenceCheck[]>();
 for(const c of checks){const id=c.requirementId?`requirement:${c.requirementId}`:`source:${c.source}`;const group=groups.get(id)||[];group.push(c);groups.set(id,group);}
 const severity=(c:PendingEvidenceCheck)=>c.status==='contradicted'?3:c.attention==='possible_mismatch'?2:c.status==='unknown'?1:0;
 const rows=[...groups].map(([id,items])=>({id,source:items[0].source,check:items.reduce((a,b)=>severity(b)>severity(a)?b:a),items}));
 return{rows,critical:rows.filter(r=>severity(r.check)>=2),pending:rows.filter(r=>severity(r.check)===1),supported:rows.filter(r=>severity(r.check)===0)};
}

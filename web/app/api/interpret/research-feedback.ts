import { ordinaryAutomotiveSource } from './qualification-policy';
import { sourcesForMatchedTag } from './source-facts';
import type { EngineeringUnderstanding } from './engineering-understanding';
import type { FaeResearch } from './fae-research';
import type { PendingEvidenceCheck } from './pending-evidence';
import { requirementOptional } from './execution-contract';
/** Only independently reviewed, identity-bound conflicts may affect presentation.
 * This does not promote support claims or turn model interpretation into exclusion. */
export function researchConflictChecks(u:EngineeringUnderstanding,research:FaeResearch,pn:string,vendor:string,product?:Parameters<typeof sourcesForMatchedTag>[0]):PendingEvidenceCheck[]{
  if(research.findingsReview!=='reviewed')return [];
  return research.findings.flatMap(f=>{
    const requirement=u.requirements.find(r=>r.id===f.requirementId);
    if(!requirement||f.pn!==pn||f.vendor!==vendor||f.status!=='source_conflict'||!f.references.length)return [];
    if(product&&ordinaryAutomotiveSource(requirement.source)&&sourcesForMatchedTag(product,'车规AEC-Q100').length)return [];
    const bound=f.references.some(ref=>ref.pn===pn&&ref.vendor===vendor||ref.modelMentions?.some(m=>m.pn===pn&&m.vendor===vendor));
    if(!bound)return [];
    return [{requirementId:requirement.id,authority:'research' as const,source:requirement.source,status:'unknown' as const,blocksMatch:!requirementOptional(requirement),evidence:[],
      attention:'possible_mismatch' as const,statusText:'资料复核发现冲突风险',reason:f.reason,
      nextStep:'核对所附原厂原文及同工况适用性；资料解读不能替代确定排除判据。',researchReferences:f.references}];
  });
}

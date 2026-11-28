import type {LLMInterpretation} from '../app/product-utils';

/** A display-only projection. Keep assessments/evidence intact; never infer new matches. */
export function vendorResultView(result:LLMInterpretation,vendor:string|null,groups:readonly {key:string;slugs:readonly string[]}[]):LLMInterpretation{
 if(!result||!vendor)return result;
 const slugs=groups.find(g=>g.key===vendor)?.slugs||[vendor];
 const keep=(item:{vendor:string})=>slugs.includes(item.vendor);
 const results=result.results?.filter(keep);
 return {...result,...(results?{results,totalMatches:results.length}:{}),
  ...(result.competitorReplacement?{competitorReplacement:{...result.competitorReplacement,candidates:result.competitorReplacement.candidates.filter(keep)}}:{}),
  ...(result.replacementPilot?{replacementPilot:{...result.replacementPilot,candidates:result.replacementPilot.candidates.filter(keep)}}:{}),
  ...(result.researchLeads?{researchLeads:result.researchLeads.filter(keep)}:{}),
  ...(result.pipelineAudit?{pipelineAudit:{...result.pipelineAudit,
    deferredCandidates:result.pipelineAudit.deferredCandidates.filter(keep),
    issues:result.pipelineAudit.issues.filter(issue=>!issue.vendor || slugs.includes(issue.vendor)),
  }}:{}),
  ...(result.screeningExcluded?{screeningExcluded:result.screeningExcluded.filter(keep)}:{}),
  ...(result.excludedByOperating?{excludedByOperating:result.excludedByOperating.filter(keep)}:{}),
  ...(result.modelCheck&&!keep(result.modelCheck)?{modelCheck:undefined}:{}),
  ...(result.solutionDirections?{solutionDirections:result.solutionDirections.map(d=>({...d,parts:d.parts.filter(keep)})).filter(d=>d.parts.length)}:{}),
  ...(result.componentSearch?{componentSearch:{...result.componentSearch,modules:result.componentSearch.modules.map(m=>({...m,candidates:m.candidates.filter(keep),...(m.researchLeads?{researchLeads:m.researchLeads.filter(keep)}:{})}))}}:{}),
 };
}

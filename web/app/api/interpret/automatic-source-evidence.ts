import {evidenceWorkerBase} from '../online-evidence/worker-config';
import { allowedManufacturerUrl } from '../online-evidence/policy';
import type { PendingEvidenceCheck } from './pending-evidence';

type Candidate={score:{product:{part_number?:unknown;__vendor?:unknown}};pendingChecks:PendingEvidenceCheck[]};
type Citation={sha256:string;url:string;page:number;quote:string};
type QualifiedCheck={requirementId?:string;source:string;model:string;outcome:string;verification:string;identity:{page:number;quote:string};citations:Citation[]};

/** Bounded, request-scoped evidence: never mutates the frozen Wiki/catalog. */
export async function supplementCandidateEvidence(candidates:Candidate[],releaseId:string,fetcher:typeof fetch=fetch){
  if(process.env.FAE_AUTO_EVIDENCE_ENABLED!=='1'||process.env.ONLINE_EVIDENCE_ENABLED!=='1'||!process.env.ONLINE_EVIDENCE_TOKEN)return;
  const token=process.env.ONLINE_EVIDENCE_TOKEN;
  const call=async(path:string,body?:unknown)=>{
    const r=await fetcher(`${evidenceWorkerBase()}${path}`,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000),cache:'no-store'});
    if(!r.ok)throw new Error('原厂补证服务未完成请求');return r.json();
  };
  await Promise.all(candidates.slice(0,3).map(async candidate=>{
    const pn=String(candidate.score.product.part_number||''),vendor=String(candidate.score.product.__vendor||'');
    const pending=candidate.pendingChecks.filter(c=>c.status==='unknown'&&c.blocksMatch&&!c.summaryOfRequirementIds?.length);
    const identified=pending.filter(c=>c.requirementId);
    const targets=[...new Map((identified.length?identified:pending).map(c=>[c.requirementId||c.source,c])).values()].slice(0,5);
    const clauses=targets.map(c=>c.source);
    const requirements=identified.length?targets.map(c=>({id:c.requirementId!,source:c.source})):undefined;
    if(!clauses.length)return;
    try{
      let job=await call('/jobs',{vendor,pn,releaseId,clauses,...(requirements?{requirements}:{}),knownUrls:[]});
      const deadline=Date.now()+35000;
      while(['queued','running'].includes(job.status)&&Date.now()<deadline){
        if(!/^[a-f0-9]{64}$/.test(job.jobId||''))throw new Error('补证任务编号无效');
        await new Promise(resolve=>setTimeout(resolve,400));job=await call(`/jobs/${job.jobId}`);
      }
      if(requirements&&(job.status==='complete')&&(job.request?.vendor!==vendor||job.request?.pn!==pn||job.request?.releaseId!==releaseId||JSON.stringify(job.request?.requirements)!==JSON.stringify(requirements)))throw new Error('补证回复与当前型号、版本或需求编号不一致');
      const verified=job.status==='complete'?job.result?.verifiedChecks:[];
      for(const target of targets){
        const clause=target.source;
        const evidence=Array.isArray(verified)?verified.find((x:QualifiedCheck)=>x.model===pn&&x.source===clause&&(!requirements||x.requirementId===target.requirementId)&&x.verification==='manufacturer_literal_qualification'
          &&['supports','conflicts'].includes(x.outcome)&&x.identity?.quote&&x.citations?.length&&x.citations.every(c=>
            allowedManufacturerUrl(c.url,vendor)&&/^[a-f0-9]{64}$/.test(c.sha256)&&Number.isInteger(c.page)&&c.page>0&&c.quote.length>=12)):undefined;
        for(const check of candidate.pendingChecks.filter(c=>c.status==='unknown'&&(target.requirementId?c.requirementId===target.requirementId:c.source===clause&&!c.requirementId&&pending.filter(p=>p.source===clause).length===1))){
          if(!evidence){
            const proposal=Array.isArray(job.result?.checks)?job.result.checks.find((x:{source:string;requirementId?:string})=>x.source===clause&&(!requirements||x.requirementId===target.requirementId)):undefined;
            const citations=proposal?.citations?.filter((c:Citation)=>allowedManufacturerUrl(c.url,vendor)&&/^[a-f0-9]{64}$/.test(c.sha256)&&Number.isInteger(c.page)&&c.page>0&&c.quote.length>=12)||[];
            check.nextStep=job.status==='complete'?(proposal?.explanation||'已读取原厂补证，本次仍缺少可执行核验依据；保持待核'):'原厂补证仍在进行或超时；保留待核，不代表不支持';
            if(citations.length){check.onlineCitations=citations;check.observed=`原厂补充线索（适用性待核）：${proposal.explanation||''}`;}
            continue;
          }
          check.authority='manufacturer_literal';check.qualificationProof={vendor,pn,releaseId,kind:'manufacturer_literal_qualification',...(target.requirementId?{requirementId:target.requirementId}:{})};
          check.status=evidence.outcome==='supports'?'supported':'contradicted';check.attention=undefined;
          check.nextStep=undefined;
          check.statusText='原厂联网证据';check.reason=`原厂文件明确列出${pn}及对应资格等级，已按本次需求重新核验；不代表完整订购后缀或整机适用性，也未改写冻结目录。`;
          check.onlineCitations=evidence.citations;check.observed=`适用型号原文：${evidence.identity.quote}`;
        }
      }
      const seen=new Set<string>();
      candidate.pendingChecks=candidate.pendingChecks.filter(check=>{
        if(!check.onlineCitations?.length)return true;
        const id=`${check.requirementId||check.source}:${check.status}:${check.onlineCitations[0].sha256}`;
        if(seen.has(id))return false;seen.add(id);return true;
      });
    }catch{
      for(const check of candidate.pendingChecks.filter(c=>targets.some(t=>t.requirementId?c.requirementId===t.requirementId:c.source===t.source&&!c.requirementId)&&c.status==='unknown'))check.nextStep='已尝试自动补证，但原厂服务或文件暂不可用；保留待核，不代表型号不支持';
    }
  }));
}

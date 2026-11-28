import {hasReplacementIntent} from './query_parser';
import {manufacturerGroup} from './candidate-coverage';

const profiles = {
  SGM4717CQ: {
    manufacturer:'圣邦微', orderNumber:'SGM4717CQMS10G/TR', function:'双路 SPDT 模拟开关',
    supply:'1.8–5.5 V', temperature:'−40～125 ℃', qualification:'AEC-Q100 Grade 1',
    packageName:'MSOP-10', bandwidthMHz:300, bandwidthCondition:'典型值，V+ = 5 V',
    url:'https://sg-micro.com/cn/product/SGM4717CQ',
  },
};
const localProfiles = [{
  vendor:'3peak-auto', pn:'TPW3221Q-VS2R-S', function:'双路 SPDT 模拟开关',
  supply:'1.65–5.5 V', temperature:'−40～125 ℃', qualification:'AEC-Q100 Grade 1',
  packageName:'MSOP-10', bandwidthMHz:100, bandwidthCondition:'典型值，VCC = 5 V，RL = 50 Ω',
  url:'https://static.3peak.com/res/doc/ds/Datasheet_TPW3221Q.pdf',
}];

export type ReplacementPilot = {
  reference:{pn:string}&typeof profiles.SGM4717CQ;
  candidates:(typeof localProfiles[number]&{assessment:'evaluate'|'review'|'below_bandwidth'})[];
  customerConstraints:string;
  queryBandwidthMHz?:number;
  requiresDirectSwap:boolean;
};

export function replacementReference(query:string) {
  if (!hasReplacementIntent(query) && !/直换|替换|代换/.test(query)) return undefined;
  const match=query.match(/(?<![a-z0-9._+\/-])(SGM4717CQ)(?:MS10G\/TR)?(?![a-z0-9._+\/-])/i);
  return match ? {pn:'SGM4717CQ',...profiles.SGM4717CQ} : undefined;
}

export function compareReplacement(query:string,reference:ReplacementPilot['reference'],
  rows:readonly {vendor:string;pn:string}[],vendor:string|null):ReplacementPilot{
  const customerConstraints=query
    .replace(/(?<![a-z0-9._+\/-])SGM4717CQ(?:MS10G\/TR)?(?![a-z0-9._+\/-])/gi,'')
    .replace(/客户目前|客户|目前|现在|选用了?|采用了?|使用了?|用的|圣邦微|SGMICRO|有没有|能不能|是否|有无|能否|找一[个款颗]|方案|型号|替换|替代|代换|可以|的|吗|请|帮我|[，,。？！?！\s]/gi,'');
  const bandwidth=customerConstraints.match(/带宽(?:必须|要求|至少|不低于|≥|>=|大于|超过|>|=)?(\d+(?:\.\d+)?)MHz/i);
  const queryBandwidthMHz=bandwidth?Number(bandwidth[1]):undefined;
  const strict=!!bandwidth&&/大于|超过|>(?!=)/.test(bandwidth[0]);
  const requiresDirectSwap=/直换|不改板|原板|pin[ -]?to[ -]?pin/i.test(query);
  const candidates=localProfiles.filter(candidate=>rows.some(row=>row.pn===candidate.pn&&row.vendor===candidate.vendor) &&
    (!vendor||vendor===candidate.vendor||manufacturerGroup(candidate.vendor)===vendor))
    .map(candidate=>{
      const below=queryBandwidthMHz!==undefined&&(candidate.bandwidthMHz<queryBandwidthMHz||strict&&candidate.bandwidthMHz===queryBandwidthMHz);
      return {...candidate,assessment:below?'below_bandwidth' as const:
        customerConstraints||requiresDirectSwap?'review' as const:'evaluate' as const};
    });
  return {reference,candidates,customerConstraints:customerConstraints ? query : '',queryBandwidthMHz,requiresDirectSwap};
}

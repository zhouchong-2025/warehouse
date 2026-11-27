import {requirementOptional} from './execution-contract';
import { ordinaryAutomotiveSource } from './qualification-policy';
import { currentPulse } from './current-pulse';
import { packageScreening } from './package-screening';
import { applicationEnvelopeReason } from './application-envelope';
/** Check deferred requirements without treating missing data as a match or a contradiction. */
import { evaluateRequirement, parseParameterRequirements, readParameterFacts, sourceMeasurements, toCanonical,
  type FactProduct } from './selection-spec';
import { sourceFactsForProduct, sourcesForMatchedTag, sourcesForPrimaryIdentity, type VerifiedSource } from './source-facts';
import type { WholeQueryPlan } from './whole-query-plan';
import { mcuPendingEvidence } from './mcu-pending-evidence';
import { datasheetPendingEvidence } from './datasheet-pending-evidence';
import { CATEGORY_TAG_NAMES, categorySourceMatches } from './query_parser';
import {catalogProvesPrimaryClass} from './device-identity';
import type {EngineeringUnderstanding} from './engineering-understanding';

export type PendingEvidenceCheck = {
  summaryOfRequirementIds?:string[];
  source: string;
  requirementId?: string;
  requirementLabel?: string;
  proofKey?:string;
  authority?: 'program'|'semantic_review'|'research'|'ledger'|'manufacturer_literal'|'structured_proof';
  status: 'supported' | 'contradicted' | 'unknown';
  blocksMatch: boolean;
  reason: string;
  evidence: VerifiedSource[];
  attention?: 'possible_mismatch' | 'clarification' | 'missing_evidence';
  observed?: string;
  nextStep?: string;
  statusText?: string;
  assumption?: string;
  recommendationRank?: number;
  researchReferences?: import('./fae-research').ResearchReference[];
  qualificationProof?: {requirementId?:string;vendor:string;pn:string;releaseId:string;kind:'manufacturer_literal_qualification'};
  onlineCitations?: {url:string;page:number;quote:string;sha256:string}[];
};

export function evaluateIdentityRequirements(product:FactProduct,u:EngineeringUnderstanding):PendingEvidenceCheck[]{
  return u.requirements.filter(r=>r.identityCategory&&!r.searchFields.length&&!r.searchFeatures?.length).map(r=>{
    const evidence=sourcesForPrimaryIdentity(product,r.identityCategory!);
    const supported=catalogProvesPrimaryClass(product,r.identityCategory!)&&evidence.length>0;
    return {requirementId:r.id,authority:'program' as const,source:r.source,status:supported?'supported' as const:'unknown' as const,blocksMatch:!requirementOptional(r),evidence:supported?evidence:[],
      reason:supported?'该型号原文已支持主器件身份；不据此证明额外接口、电压、速率或应用条件':'主器件已进入对应目录，但缺少该型号身份的可核验原文',
      ...(!supported?{attention:'missing_evidence' as const}:{})};
  });
}

export function evaluatePendingEvidence(product: FactProduct, plan: WholeQueryPlan, branchIndex?: number, understanding?:EngineeringUnderstanding): PendingEvidenceCheck[] {
  const facts = sourceFactsForProduct(product);
  const activeBranch = branchIndex !== undefined ? plan.branches[branchIndex] : plan.branches.length === 1 ? plan.branches[0] : undefined;
  return plan.unresolved.map(item => {
    const source = item.source;
    const owners=understanding?.requirements.filter(r=>item.requirementId?r.id===item.requirementId&&r.source===source:r.source===source)||[];
    const optional=owners.length?owners.every(requirementOptional):/优先|最好|偏好|不要求|不需要/.test(source);
    const base = { source, blocksMatch: !optional,...(item.requirementId?{requirementId:item.requirementId}:{}),...(understanding?.intentMode!=='independent_fae'&&!item.requirementId&&owners.length===1?{requirementId:owners[0].id}:{}) };
    if(/米勒\s*钳位|miller[ -]*clamp/i.test(source)&&!/(?:不要求|不需要|不要|without)/i.test(source)){
      const evidence=sourcesForMatchedTag(product,'米勒钳位');
      if(evidence.length){const residual=source.replace(/米勒\s*钳位|miller[ -]*clamp|有没有|是否|需要|要求|支持|具备|功能|集成|内置|内部|有源|active|integrated|function|带|的|有|吗|芯片|器件|驱动器|[\s，,。.?？、；;：:！!]/gi,'');
        const compound=sourceMeasurements(source).length>0||!!residual;
        return {...base,status:compound?'unknown' as const:'supported' as const,evidence,
          reason:compound?'该型号原文已明确米勒钳位功能，钳位电流等组合指标仍须独立核验':'该型号特性/功能原文已明确米勒钳位；不据此推定钳位电流、封装或其他条件',
          ...(compound?{statusText:'米勒钳位功能有证据，组合指标待核'}:{})};
      }
    }
    const scopedBranches = plan.branches.flatMap((branch, index) => branch.must.some(item =>
      CATEGORY_TAG_NAMES.has(item.tag) && categorySourceMatches(item.tag, source)) ? [index] : []);
    if (branchIndex !== undefined && scopedBranches.length === 1 && scopedBranches[0] !== branchIndex) {
      return { ...base, blocksMatch: false, status: 'unknown' as const,
        reason: '此条件明确属于另一备选品类', evidence: [] };
    }
    if(/选择性唤醒|特定帧唤醒|partial[ -]?network|selective\s*wake/i.test(source)){
      const evidence=sourcesForMatchedTag(product,'特定帧唤醒');
      if(evidence.length){
        const compound=sourceMeasurements(source).length>0;
        return {...base,status:compound?'unknown' as const:'supported' as const,evidence,recommendationRank:1,
          reason:compound?'型号行支持选择性/特定帧唤醒，但同句的电流、模式或其他条件仍须分别核验':'型号行已有Partial Networking/Selective Wake证据，支持选择性/特定帧唤醒；不据此保证休眠电流及整机指标',
          ...(compound?{statusText:'选择性唤醒有证据，组合条件待核'}:{})};
      }
    }
    if(ordinaryAutomotiveSource(source)&&!plan.aecDocumentRequirement){
      const evidence=sourcesForMatchedTag(product,'车规AEC-Q100');
      return {...base,status:evidence.length?'supported' as const:'unknown' as const,evidence,reason:evidence.length?'具体型号已有车规等级来源，按项目普通等级口径核验；不据此宣称Grade或证书通过':'缺少该型号普通车规等级的可核验来源'};
    }
    if (/AEC\s*[- ]?Q\s*[- ]?100/i.test(source)) {
      const requestedGrade=source.match(/\bGrade\s*[-:]?\s*([0-3])\b/i);
      if(requestedGrade){
        const rows=facts.flatMap(f=>{const raw=f.publishedValue||'';
          const match=/AEC\s*[- ]?Q\s*[- ]?100[\s\S]*?\bGrade\s*[-:]?\s*([0-3])\b/i.exec(raw);
          return match?[{grade:Number(match[1]),source:f.source}]:[];});
        const wanted=Number(requestedGrade[1]),exact=rows.filter(r=>r.grade===wanted);
        const gradeOnly=!source.replace(/AEC\s*[- ]?Q\s*[- ]?100|\bGrade\s*[-:]?\s*[0-3]\b/gi,'').replace(/要求|需要|满足|符合|支持|车规|等级|认证|[\s，,、；;。:：]/g,'');
        if(exact.length)return {...base,status:gradeOnly?'supported' as const:'unknown' as const,reason:`型号来源明确列出AEC-Q100 Grade ${wanted}，不是仅按普通车规标签推定${gradeOnly?'':'；同句其他条件仍须分别核验'}`,evidence:exact.map(r=>r.source)};
        if(rows.length&&rows.every(r=>r.grade>wanted))return {...base,status:'contradicted' as const,
          reason:`要求AEC-Q100 Grade ${wanted}，型号来源仅列Grade ${[...new Set(rows.map(r=>r.grade))].join('/')}，不能用较低温度等级替代`,evidence:rows.map(r=>r.source)};
        // Operating ambient range can disprove a grade's temperature envelope,
        // but covering that envelope never proves qualification.
        const requiredAmbient:Record<number,[number,number]>={0:[-40,150],1:[-40,125],2:[-40,105],3:[-40,85]};
        const ambient=readParameterFacts(product).filter(f=>f.field==='temperatureRange'&&f.shape==='range'&&f.values.length===2
          &&f.source.verified&&/工作环境温度|ambient/i.test(f.source.field));
        if(ambient.length&&ambient.every(f=>f.values[0]>requiredAmbient[wanted][0]||f.values[1]<requiredAmbient[wanted][1]))return {...base,status:'contradicted' as const,
          reason:`要求AEC-Q100 Grade ${wanted}对应的环境工作温度覆盖${requiredAmbient[wanted][0]}~${requiredAmbient[wanted][1]}℃，型号原表仅列${ambient.map(f=>f.values.join('~')+'℃').join('、')}；范围不足，不能作为该等级候选。温度覆盖本身也不代表通过资格认证。`,evidence:ambient.map(f=>f.source.verified!)};
        return {...base,status:'unknown' as const,attention:'missing_evidence' as const,
          reason:`缺少该型号明确的AEC-Q100 Grade ${wanted}证据；普通车规标签或工作温度范围不能代替资格等级声明`,evidence:rows.map(r=>r.source)};
      }
      if (!plan.aecDocumentRequirement) {
        const grade = sourcesForMatchedTag(product, '车规AEC-Q100');
        return { ...base, status: grade.length ? 'supported' as const : 'unknown' as const,
          reason: grade.length ? '按项目约定，AEC-Q100 与车规为同一等级要求；已有型号行车规证据'
            : '缺少具体型号的车规等级证据', evidence: grade };
      }
      const evidence = sourcesForMatchedTag(product, 'AEC-Q100符合声明');
      if (evidence.length) return { ...base, status: 'supported' as const,
        reason: '已有逐型号来源支持 AEC-Q100 符合声明', evidence };
      const grades = facts.filter(fact => /产品.*等级|Rating|Grade/i.test(fact.publishedHeader || '')
        && /车规|Automotive/i.test(fact.publishedValue || ''));
      return { ...base, status: 'unknown' as const, attention: 'missing_evidence' as const,
        observed: grades.length ? '当前型号行只标车规级' : undefined,
        reason: '车规级标签不足以证明 AEC-Q100 符合声明，认证/声明条件仍可能不满足',
        nextStep: '补齐该具体型号的 AEC-Q100 声明或适用型号清单；系列共用介绍不能直接代替',
        evidence: grades.map(fact => fact.source) };
    }
    const ethernetStandards=[...source.matchAll(/\b802\.3[a-z]+\b/gi)].map(m=>m[0].toLowerCase());
    if(ethernetStandards.length){
      const rows=facts.filter(f=>/port_cell|description_cell/.test(f.field)||/端口|简介/.test(f.publishedHeader||''));
      const supported=ethernetStandards.every(w=>rows.some(f=>[...(f.publishedValue||'').matchAll(/\b802\.3[a-z]+\b/gi)].some(m=>m[0].toLowerCase()===w)));
      const standardsOnly=!source.replace(/\b(?:IEEE\s*)?802\.3[a-z]+\b/gi,'').replace(/支持|兼容|符合|标准|协议|以太网|要求|需要|以及|和|[\s，,、；;。:：]/g,'');
      return {...base,status:supported&&standardsOnly?'supported' as const:'unknown' as const,
        reason:supported?`型号原表明确支持${ethernetStandards.join('、')}；${standardsOnly?'不据此保证整条板级链路':'同句其他条件仍须分别核验'}`:`缺少该型号对${ethernetStandards.join('、')}的明确标准证据，不能用相同速率替代协议兼容性`,
        evidence:supported?rows.filter(f=>ethernetStandards.some(w=>(f.publishedValue||'').toLowerCase().includes(w))).map(f=>f.source):[]};
    }
    // A linear regulator has Iin >= Iout, hence efficiency <= Vout/Vin.
    // Apply only to an independently sourced, standalone LDO and an explicit same-branch test point.
    if (/效率|efficien/i.test(source) && activeBranch?.must.some(t => t.tag === 'LDO')
      && /LDO|线性稳压/i.test(String(product._section || ''))
      && !/DCDC|DC-DC|buck|SBC|MCU|开关|集成/i.test(String(product._section || ''))) {
      const grade = facts.filter(f => f.scope === 'self' && /LDO|线性稳压/i.test(f.source.locator.split(' / ')[0])).slice(0, 1).map(f => f.source);
      const target = source.match(/(?:≥|>=|至少|不低于)\s*(\d+(?:\.\d+)?)\s*%/);
      const point = source.match(/@\s*(\d+(?:\.\d+)?)\s*V\s*[/，,]\s*(\d+(?:\.\d+)?)\s*A/i);
      const params = activeBranch.parameters || [];
      const output = params.find(p => p.field === 'vout' && p.operator === 'eq' && p.values.length === 1 && p.strength === 'must');
      const input = params.find(p => p.field === 'vin' && p.operator === 'covers' && p.values.length === 2 && p.strength === 'must');
      const out = output && toCanonical(Number(output.values[0]), output.unit, 'V');
      const vin = point && Number(point[1]);
      const lo = input && toCanonical(Number(input.values[0]), input.unit, 'V');
      const hi = input && toCanonical(Number(input.values[1]), input.unit, 'V');
      if (grade.length && target && point && vin && Number(point[2]) > 0 && out && lo != null && hi != null
        && lo <= vin && hi >= vin && out > 0 && out < vin && out / vin * 100 < Number(target[1])) {
        return { ...base, status: 'contradicted' as const,
          observed: `单级LDO理想效率上限：${out}V/${vin}V≈${(out / vin * 100).toFixed(1)}%`,
          reason: `按线性稳压原理，即使忽略静态电流，上限也低于所需${target[1]}%；该结论不用于开关降压或多级方案`, evidence: grade };
      }
    }
    if ((/峰值|peak/i.test(source) || currentPulse(source)) && !/不超过|不高于|最多|以下|[<≤]/.test(source)) {
      const wanted = sourceMeasurements(source).map(m=>toCanonical(m.value,m.unit,'A')).filter((v):v is number=>v!==null);
      const peaks=facts.filter(f=>f.field==='peak_current_a'&&/^\d+(?:\.\d+)?$/.test(f.publishedValue||''));
      if(wanted.length===1&&peaks.length&&peaks.every(f=>Number(f.publishedValue)<wanted[0]))return {...base,status:'contradicted' as const,
        observed:`原表峰值电流：${peaks.map(f=>f.publishedValue).join('/')}A`,
        reason:`原表列出的峰值能力低于所需${wanted[0]}A，按已列能力不符合；不能用持续时间未核验掩盖幅值冲突，也不据此推断损坏极限。`,evidence:peaks.map(f=>f.source)};
    }
    const packageDecision = packageScreening(product, source);
    if (packageDecision) return packageDecision;
    const applicationReason = applicationEnvelopeReason(source);
    const applicationRows=applicationReason?facts.filter(f=>/噪声|noise|Vrms/i.test(source)?/noise|噪声/i.test(f.field+' '+f.source.originalHeader):/压差|drop.?out/i.test(source)?/dropout|压差/i.test(f.field+' '+f.source.originalHeader):false):[];
    if (applicationReason) return { ...base, status: 'unknown' as const, attention: 'missing_evidence' as const,
      observed:applicationRows.length?applicationRows.map(f=>`${f.source.originalHeader}：${f.publishedValue}`).join('；'):undefined,
      reason: applicationReason, nextStep: '补查该型号在指定工作条件下的应用曲线、参考设计或实测；结果只作待核资料，不自动判定全部满足', evidence: applicationRows.map(f=>f.source) };
    const mcu = mcuPendingEvidence(product, source, item.role);
    if (mcu) return mcu;
    const supplemental = datasheetPendingEvidence(product, source);
    if (supplemental) return supplemental;
    // A ceiling on possible drive current can disprove a requested minimum.
    // Passing this check never proves continuous-current capability.
    const currentBound = plan.screening?.find(check => check.kind === 'minimum_possible_current'
      && check.source === source);
    if (currentBound) {
      const peaks = facts.filter(fact => fact.field === 'peak_current_a'
        && /^\d+(?:\.\d+)?$/.test(fact.publishedValue || ''));
      if (peaks.length && peaks.every(fact => Number(fact.publishedValue) < currentBound.value)) {
        return { ...base, status: 'contradicted' as const,
          reason: `原表峰值电流 ${peaks.map(fact => fact.publishedValue).join('/')}A 低于要求的 ${currentBound.value}A`,
          evidence: peaks.map(fact => fact.source) };
      }
      if (peaks.length) return { ...base, status: 'unknown' as const, attention: 'missing_evidence' as const,
        statusText: `峰值 ≥${currentBound.value}A 有证据；额定／持续 ≥${currentBound.value}A 未证实`,
        observed: `原表只给峰值电流 ${peaks.map(fact => fact.publishedValue).join('/')}A`,
        reason: `未能确认的是“额定／持续输出电流 ≥${currentBound.value}A”；当前只有峰值数据，不能据此宣称完整满足电流要求`,
        nextStep: '补查具体型号的额定／持续输出电流、散热和测试条件；若需求明确为峰值，再按峰值及脉冲条件核验',
        evidence: peaks.map(fact => fact.source) };
    }
    // Package names and pin counts do not establish comparable footprint area.
    // Retain the actual row as a research lead; do not blacklist package names.
    if (/封装|\b(?:SOP|SOIC|QFN|DFN|BGA|LGA)\s*-?\s*\d/i.test(source)) {
      const packages = facts.filter(fact => fact.field === 'package');
      const target = source.match(/\b(?:SOP|SOIC|MSOP|TSSOP|QFN|DFN|BGA|LGA)-?\d+(?:X\d+)?(?:-\d+)?\b/i)?.[0];
      const normalized = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();
      if (target && packages.length === 1 && normalized(packages[0].publishedValue || '') === normalized(target)) {
        return { ...base, status: 'supported' as const, observed: `原表封装：${packages[0].publishedValue}`,
          reason: '原表型号行列出的封装与用户明确允许的封装相同', evidence: [packages[0].source] };
      }
      return { ...base, status: 'unknown' as const,
        attention: packages.length ? 'possible_mismatch' as const : 'missing_evidence' as const,
        observed: packages.length ? `原表封装：${packages.map(fact => fact.publishedValue).join('、')}` : undefined,
        reason: packages.length
          ? '封装名称与目标未建立可比较的尺寸关系，可能不满足封装限制；缺少尺寸比较证据'
          : '缺少逐型号封装及尺寸证据',
        nextStep: '比较具体订购封装的本体尺寸或 PCB 占地；不能按名字或引脚数认定更小',
        evidence: packages.map(fact => fact.source) };
    }
    if (/极限耐压|绝对最大|击穿电压/.test(source)) {
      const wanted = sourceMeasurements(source).map(item => toCanonical(item.value, item.unit, 'V'))
        .find((value): value is number => value !== null);
      const operating = readParameterFacts(product).filter(fact => fact.field === 'vin' && fact.source.verified);
      const voltageRows = facts.filter(fact => /^(?:supply_voltage|vin_v|vin_range|vin_max)$/.test(fact.field));
      const high = operating.filter(fact => fact.shape === 'range' || fact.statistic === 'max')
        .map(fact => Math.max(...fact.values));
      // Some reviewed voltage rows have an implicit V unit in the field schema.
      // Read only a whole numeric range, never a number from descriptive prose.
      for (const row of voltageRows) {
        const range = (row.publishedValue || '').match(/^([-+]?\d+(?:\.\d+)?)\s*(?:~|～|to|至|-)\s*([-+]?\d+(?:\.\d+)?)$/i);
        if (range) high.push(Number(range[2]));
      }
      const possible = wanted !== undefined && high.length > 0 && Math.max(...high) < wanted;
      const observedValues = [...new Set([...operating.map(fact => fact.source.raw),
        ...voltageRows.map(fact => fact.publishedValue).filter((value): value is string => Boolean(value))])];
      return { ...base, status: 'unknown' as const,
        attention: possible ? 'possible_mismatch' as const : 'missing_evidence' as const,
        observed: observedValues.length ? `原表工作供电：${observedValues.join('、')}V` : undefined,
        reason: possible ? `工作供电上限低于所提 ${wanted}V，是需重点核查的风险信号；工作上限不能代替极限耐压判定`
          : '缺少该型号绝对最大额定值，不能用持续工作输入范围代替',
        nextStep: '核对规格书 Absolute Maximum Ratings 中对应电源引脚的耐压及适用条件',
        evidence: [...operating.map(fact => fact.source.verified!), ...voltageRows.map(fact => fact.source)] };
    }
    const temperature = sourceMeasurements(source).some(item => toCanonical(item.value, item.unit, '°C') !== null);
    const junction = facts.filter(fact => /\bTj\b|结温/i.test(fact.publishedHeader || fact.source.originalHeader));
    if (temperature && junction.length && !/环境|结温|\bT[aj]\b/i.test(source)) {
      return { ...base, status: 'unknown' as const, attention: 'clarification' as const,
        observed: `原表结温 Tj：${junction.map(fact => fact.publishedValue).join('、')}℃`,
        reason: '若目标指环境温度，结温额定范围不能证明满足；需补环境与散热条件',
        nextStep: '明确目标是环境温度 Ta 还是结温 Tj，再核对相同口径及工作条件',
        evidence: junction.map(fact => fact.source) };
    }
    // These roles cannot be substituted with ordinary VIN/IOUT facts.
    if (/峰值|限流|极限耐压|绝对最大|击穿电压/.test(source)) {
      return { ...base, status: 'unknown' as const, reason: item.reason, evidence: [] };
    }
    const requirements = parseParameterRequirements(source).requirements.filter(requirement =>
      requirement.strength === 'must');
    if (!requirements.length || optional) {
      return { ...base, status: 'unknown' as const, attention: 'missing_evidence' as const,
        reason: item.reason, evidence: [],
        nextStep: /电容|capacit/i.test(source) ? '需查该型号应用电路在目标电压、电流和纹波条件下的输入电容要求' : undefined };
    }
    const decisions = requirements.map(requirement => evaluateRequirement(product, requirement));
    const trusted = decisions.filter(decision => decision.evidence.length > 0
      && decision.evidence.every(fact => {
        if (!fact.source.verified || fact.statistic === 'typical') return false;
        if (fact.field === 'temperatureMax' || fact.field === 'temperatureRange') {
          const junction = /\bTj\b|结温/i.test(fact.source.field);
          const ambient = /\bTa\b|环境|ambient/i.test(fact.source.field);
          if (junction && !/\bTj\b|结温/i.test(source)) return false;
          if (ambient && /\bTj\b|结温/i.test(source)) return false;
        }
        return true;
      }));
    const evidence = trusted.flatMap(decision => decision.evidence.map(fact => fact.source.verified!));
    const status = trusted.some(decision => decision.status === 'unmatched') ? 'contradicted' as const
      : trusted.length === decisions.length && trusted.every(decision => decision.status === 'matched')
        ? 'supported' as const : 'unknown' as const;
    if (status === 'unknown') return { ...base, status,
      reason: '缺少该条件的完整逐型号来源证据', evidence };
    return { ...base, status, reason: decisions.map(decision => decision.reason).join('；'), evidence };
  });
}

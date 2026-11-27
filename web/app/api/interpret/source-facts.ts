/** Reviewed facts travel with the exact catalog record used by both matchers. */
import { isPackageTag, packageMatches } from './query-specs';
import { catalogProvesPrimaryClass, catalogDeviceFamilies, isLevelTranslatorDescription } from './device-identity';
import { orderablePackageMatches, reviewedAdjustableOrderables, reviewedConfigurationOptions, reviewedOrderableConfigurations } from './selection-assessment';

type EvidenceCell = {
  physicalPage: number;
  printedPage: string;
  heading: string;
  rowIndex?: number;
  columnIndex?: number;
  originalHeader: string;
  originalValue: string;
  condition?: string;
};

type PilotFact = {
  id: string;
  vendor: string;
  model?: string;
  subjectId?: string;
  subjectKind?: string;
  family?: string;
  field: string;
  rating: string;
  sourceOnly?: boolean;
  origin?:string;
  conditions?:string;
  applicability?:{relationId:string;kind:string;source:string;requiresContextReview:boolean;sourceEvidence:unknown;targetEvidence:unknown};
  normalizedValue?: unknown;
  scope: 'self' | 'each_listed_member';
  models?: string[];
  publishedHeader?: string;
  publishedValue?: string;
  publishedFeature?: string;
  evidence: EvidenceCell;
  source: VerifiedSource;
};

export type VerifiedSource = {
  factId: string;
  document: string;
  documentSha256: string;
  factsSha256: string;
  wikiFactPage?: string;
  page: number;
  locator: string;
  originalHeader: string;
  originalValue: string;
  scope: 'catalog_model' | 'listed_family_member';
  rating: string;
};

type SourcedProduct = {
  __vendor?: unknown;
  part_number?: unknown;
  _section?: unknown;
  _params?: unknown;
  _features?: unknown;
  _topology_source?: unknown;
  _reviewed_fact_sources?: unknown;
  _manual_adjudications?: unknown;
  _published_corrections?: unknown;
  _source_facts?: unknown;
  _evidence_claims?:unknown;
  _evidence_bundle_hash?:unknown;
  _orderable_configurations?: unknown;
  _adjustable_orderables?: unknown;
  _configuration_options?: unknown;
};

const compact = (value: string) => value.replace(/\s+/g, '');

function productParams(product: SourcedProduct): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of String(product._params || '').split('|')) {
    const colon = part.search(/[:：]/);
    if (colon < 0) continue;
    out.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return out;
}

/** Returns only facts whose published row still agrees with this exact product. */
export function sourceFactsForProduct(product: SourcedProduct): PilotFact[] {
  if (typeof product.part_number !== 'string') return [];
  const candidates = Array.isArray(product._source_facts)
    ? (product._source_facts as PilotFact[]).filter(fact =>
      (typeof product.__vendor === 'string' ? fact.vendor === product.__vendor
        : fact.scope === 'self' && fact.subjectId === `${fact.vendor}:${product.part_number}`)
      && (fact.scope === 'self' ? fact.model === product.part_number
        : fact.models?.includes(product.part_number as string))) : [];
  const supplements=Array.isArray(product._evidence_claims)?(product._evidence_claims as PilotFact[]).filter(f=>f&&f.source&&f.evidence&&f.origin==='reviewed_evidence'&&f.scope==='self'&&f.vendor===product.__vendor&&f.model===product.part_number&&f.subjectId===`${product.__vendor}:${product.part_number}`&&f.source.factsSha256===product._evidence_bundle_hash&&/^[a-f0-9]{64}$/.test(f.source.factsSha256)&&f.source.factId===f.id&&f.source.originalValue===f.evidence.originalValue):[];
  if (!candidates.length) return supplements;
  const params = productParams(product);
  const accepted = candidates.filter(fact => {
    if (fact.field === 'topology') {
      const binding = product._topology_source;
      if (!binding || typeof binding !== 'object') return false;
      const source = binding as { documentSha256?: unknown; physicalPage?: unknown; originalText?: unknown;
        tableModel?: unknown; tablePhysicalPage?: unknown };
      return source.tableModel === product.part_number
        && Number.isInteger(source.tablePhysicalPage)
        && source.documentSha256 === fact.source.documentSha256
        && source.physicalPage === fact.evidence.physicalPage
        && source.originalText === fact.evidence.originalValue;
    }
    if (fact.scope !== 'self') return true;
    if (fact.sourceOnly === true) {
      return fact.subjectKind === 'catalog_model'
        && fact.subjectId === `${fact.vendor}:${fact.model}`
        && ((fact.field === 'isolation_withstand_vrms' && fact.rating === 'test_rating')
          || (fact.field === 'ethernet_copper_1000base_t_ports' && fact.rating === 'unspecified'
            && Number.isSafeInteger(fact.normalizedValue)))
        && typeof fact.normalizedValue === 'number'
        && Number.isFinite(fact.normalizedValue) && fact.normalizedValue > 0;
    }
    if (!fact.publishedHeader || !fact.publishedValue) return false;
    const current = params.get(fact.publishedHeader);
    return current !== undefined && compact(current) === compact(fact.publishedValue);
  });
  // Family claims are linked only if both working-input limits in the model's
  // actual table row still have their inspected source. A family page is never
  // used to manufacture missing model-row input values.
  const hasInputRange = accepted.some(f => f.field === 'vin_min') && accepted.some(f => f.field === 'vin_max');
  return [...accepted.filter(f => f.scope === 'self' || f.field === 'topology' || hasInputRange),...supplements];
}

export function sourceReference(fact: PilotFact): VerifiedSource {
  return fact.source;
}

export function sourceForObservedField(product: SourcedProduct, header: string, raw: string): VerifiedSource | null {
  const fact = sourceFactsForProduct(product).find(candidate =>
    candidate.scope === 'self' && candidate.publishedHeader === header && compact(candidate.publishedValue || '') === compact(raw));
  if (fact) return sourceReference(fact);
  const decisions = product._published_corrections || product._manual_adjudications;
  if (decisions && typeof decisions === 'object') {
    const decision = (decisions as Record<string, unknown>)[header];
    if (decision && typeof decision === 'object') {
      const item = decision as Record<string, unknown>;
      const observed = productParams(product).get(header);
      if (observed !== undefined && compact(observed) === compact(raw)
          && compact(String(item.confirmedValue || '')) === compact(raw)) {
        return {
          factId: String(item.adjudicationId || ''), document: String(item.document || ''),
          documentSha256: String(item.documentSha256 || ''), factsSha256: '',
          page: Number(item.page || 1), locator: '用户人工复核', originalHeader: header,
          originalValue: `PDF 原值：${String(item.originalValue || '')}；人工确认：${String(item.confirmedValue || '')}`,
          scope: 'catalog_model', rating: 'manual_adjudication',
        };
      }
    }
  }
  const sources = product._reviewed_fact_sources;
  if (!sources || typeof sources !== 'object') return null;
  const candidate = (sources as Record<string, unknown>)[header];
  if (!candidate || typeof candidate !== 'object') return null;
  const reference = candidate as VerifiedSource;
  const observed = productParams(product).get(header);
  return observed !== undefined && compact(observed) === compact(raw)
    && compact(reference.originalValue || '') === compact(raw) ? reference : null;
}

/** Exact-model grade cells and statements; legacy tags and family prose are excluded. */
export function reviewedNovosenseGrade(product: SourcedProduct): {
  industrial: VerifiedSource[]; automotive: VerifiedSource[]; aecStatement: VerifiedSource[];
} {
  const result = { industrial: [] as VerifiedSource[], automotive: [] as VerifiedSource[],
    aecStatement: [] as VerifiedSource[] };
  if (product.__vendor !== 'novosense') return result;
  for (const [header, value] of productParams(product)) {
    const category = /^(?:产品\s*等级|等级|Grade|Rating)$/i.test(header)
      ? /^(?:工业级|Industrial)$/i.test(value) ? 'industrial'
        : /^(?:车规级|车规|Automotive)$/i.test(value) ? 'automotive' : null
      : (header === '规格' || header === '应用等级') && value === '车规' ? 'automotive'
        : header === '车规声明' && /AEC\s*[- ]?Q\s*[- ]?100/i.test(value) ? 'aecStatement' : null;
    if (!category) continue;
    const source = sourceForObservedField(product, header, value);
    if (source) result[category].push(source);
  }
  // This reviewed family fact names each of four NSE425X members, and
  // sourceFactsForProduct retains it only while both model-row input limits
  // still have their own inspected sources.
  for (const fact of sourceFactsForProduct(product)) {
    if (fact.field === 'grade' && fact.scope === 'each_listed_member'
      && /AEC\s*[- ]?Q\s*[- ]?100/i.test(fact.evidence.originalValue)) {
      result.aecStatement.push(fact.source);
    }
  }
  return result;
}

/** Yutai grade claims must occur in the exact model's sourced description or note. */
export function reviewedYutaiGrade(product: SourcedProduct): {
  industrial: VerifiedSource[]; automotive: VerifiedSource[]; consumer: VerifiedSource[]; aecStatement: VerifiedSource[];
} {
  const result = { industrial: [] as VerifiedSource[], automotive: [] as VerifiedSource[],
    consumer: [] as VerifiedSource[], aecStatement: [] as VerifiedSource[] };
  if (product.__vendor !== 'yutai') return result;
  const params = productParams(product);
  for (const header of ['简介', 'Note']) {
    const value = params.get(header);
    if (!value) continue;
    const source = sourceForObservedField(product, header, value);
    if (!source) continue;
    if (/工业级/.test(value)) result.industrial.push(source);
    if (/车规/.test(value)) result.automotive.push(source);
    if (/消费级/.test(value)) result.consumer.push(source);
    if (/AEC\s*[- ]?Q\s*[- ]?100/i.test(value)) result.aecStatement.push(source);
  }
  return result;
}

export function reviewedCanFdSource(product: SourcedProduct): VerifiedSource | null {
  if (!['3peak-auto', '3peak-analog', 'novosense'].includes(String(product.__vendor || ''))) return null;
  const params = productParams(product);
  for (const header of ['产品描述', 'Features', '特征']) {
    const value = params.get(header);
    if (!value || !/\bCAN\s*[- ]?FD\b/i.test(value)) continue;
    const source = sourceForObservedField(product, header, value);
    if (source) return source;
  }
  return null;
}

export function reviewedYutaiEthernetSource(product: SourcedProduct): VerifiedSource | null {
  if (product.__vendor !== 'yutai') return null;
  const params = productParams(product);
  for (const header of ['简介', '端口', '接口', '扩展接口']) {
    const value = params.get(header);
    if (!value) continue;
    const describesEthernet = header === '简介'
      ? /PHY|网卡|交换机|(?:\d+(?:\.\d+)?\s*)?(?:GE|FE)|BASE[- ]?T/i.test(value)
      : /\b\d+(?:\.\d+)?\s*(?:GE|FE|G)\b|SGMII|XFI|802\.3|BASE[- ]?[TX]/i.test(value);
    if (!describesEthernet) continue;
    const source = sourceForObservedField(product, header, value);
    if (source) return source;
  }
  return null;
}

export function reviewedI2cSource(product: SourcedProduct): VerifiedSource | null {
  if (!((product.__vendor === '3peak-analog' && /(?:IO\s*扩展器|电平转换器)/i.test(String(product._section || '')))
    || (product.__vendor === 'novosense' && /IO\s*扩展器/i.test(String(product._section || ''))))) return null;
  const params = productParams(product);
  for (const header of ['Interface', 'Features', '接口', '特征', '功能']) {
    const value = params.get(header);
    if (!value || !/\bI\s*2\s*C\b/i.test(value)) continue;
    const source = sourceForObservedField(product, header, value);
    if (source) return source;
  }
  return null;
}

export function reviewedIsolationSource(product: SourcedProduct): VerifiedSource | null {
  const section = String(product._section || '');
  const params = productParams(product);
  if (product.__vendor === 'novosense' && /集成式电流传感器/.test(section)) {
    const header = [...params.keys()].find(key => /介电强度.*Vrms/i.test(key));
    const value = header ? params.get(header) : undefined;
    if (header && value && /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0) {
      return sourceForObservedField(product, header, value);
    }
    return null;
  }
  if (!['3peak-analog', '3peak-auto'].includes(String(product.__vendor || ''))) return null;
  for (const header of ['Features', '产品描述', 'Topology']) {
    const value = params.get(header);
    if (!value || !/\bisolat(?:ed|ion)\b|隔离/i.test(value)) continue;
    const source = sourceForObservedField(product, header, value);
    if (source) return source;
  }
  return null;
}

export function reviewedYutaiSpeedSource(product: SourcedProduct, speed: '百兆' | '千兆'): VerifiedSource | null {
  if (product.__vendor !== 'yutai') return null;
  const pattern = speed === '百兆' ? /100\s*BASE|(?:^|[^A-Z])(?:\d+\s*[*x]\s*)?FE\b/i
    : /1000\s*BASE|(?:^|[^A-Z])(?:\d+\s*[*x]\s*)?GE\b/i;
  const params = productParams(product);
  for (const header of ['简介', '端口']) {
    const value = params.get(header);
    if (!value || !pattern.test(value)) continue;
    const source = sourceForObservedField(product, header, value);
    if (source) return source;
  }
  return null;
}

export function reviewedDigitalIsolatorSources(product: SourcedProduct): VerifiedSource[] {
  if (product.__vendor !== 'novosense' || !/隔离\s*I2C/i.test(String(product._section || ''))) return [];
  const params = productParams(product);
  const grade = params.get('隔离等级');
  const rateHeader = params.has('最大码流 (Mbps)') ? '最大码流 (Mbps)' : '最大码流';
  const rate = params.get(rateHeader);
  if (!grade || !rate || !/^(?:Basic|Reinforced|基础|加强)$/i.test(grade) || !/^\d+(?:\.\d+)?$/.test(rate)) return [];
  const sources = [sourceForObservedField(product, '隔离等级', grade), sourceForObservedField(product, rateHeader, rate)];
  return sources.every(Boolean) ? sources as VerifiedSource[] : [];
}

export function reviewed4T0RSources(product: SourcedProduct): VerifiedSource[] {
  if (product.__vendor !== '3peak-analog' || !/RS-485\s*收发器/i.test(String(product._section || ''))) return [];
  const params = productParams(product);
  if (params.get('Drivers Per Package') !== '4' || params.get('Receivers Per Package') !== '0') return [];
  const sources = [sourceForObservedField(product, 'Drivers Per Package', '4'),
    sourceForObservedField(product, 'Receivers Per Package', '0')];
  return sources.every(Boolean) ? sources as VerifiedSource[] : [];
}

/** Source links are shown only for a requirement already matched by the shared evaluator. */
/** A model row under a verified original table heading proves its primary
 * class. Catalog navigation headings or shared family prose do not. */
export function sourcesForPrimaryIdentity(product:SourcedProduct,tag:string):VerifiedSource[]{
 if(!catalogProvesPrimaryClass(product,tag))return [];
 const direct=sourcesForMatchedTag(product,tag);
 const headings=sourceFactsForProduct(product).filter(f=>f.scope==='self'&&catalogProvesPrimaryClass({_section:f.evidence.heading},tag)).slice(0,1).map(sourceReference);
 return [...new Map([...direct,...headings].map(s=>[s.factId,s])).values()];
}
export function railCapabilityEvidence(product: SourcedProduct, source: string) {
  const rows: { role: 'input' | 'output'; value: string; source: VerifiedSource }[] = [];
  for (const part of String(product._params || '').split('|')) {
    const colon = part.indexOf(':'); if (colon < 0) continue;
    const header = part.slice(0,colon).trim(), value = part.slice(colon+1).trim();
    const role = /^(?:rail[- ]?(?:to[- ]?)?rail\s*(?:in|input)|轨到轨输入)$/i.test(header) ? 'input'
      : /^(?:rail[- ]?(?:to[- ]?)?rail\s*(?:out|output)|轨到轨输出)$/i.test(header) ? 'output' : null;
    const ref = role && sourceForObservedField(product, header, value);
    if (role && ref) rows.push({role,value,source:ref});
  }
  const input = /输入|\bRRI\b|RRIO/i.test(source), output = /输出|\bRRO\b|RRIO/i.test(source);
  const roles: ('input'|'output')[] = input && !output ? ['input'] : output && !input ? ['output'] : ['input','output'];
  const needed = roles.map(role=>rows.filter(r=>r.role===role));
  const status = needed.some(rs=>rs.some(r=>/^(?:no|否|不支持)$/i.test(r.value))) ? 'unmatched' as const
    : needed.every(rs=>rs.length&&rs.every(r=>/^(?:yes|是|支持)$/i.test(r.value))) ? 'matched' as const : 'unknown' as const;
  return {status,sources:needed.flatMap(rs=>rs.map(r=>r.source)),specific:input||output};
}


export function sourcesForMatchedTag(product: SourcedProduct, tag: string): VerifiedSource[] {
  if(tag==='轨到轨'){const rail=railCapabilityEvidence(product,tag);return rail.status==='matched'?rail.sources:[];}
  const available = sourceFactsForProduct(product);
  let relevant: PilotFact[] = [];
  if(tag==='工业级'){const rating=sourceForObservedField(product,'Rating','Industrial');if(rating)return [rating];}
  if(tag==='米勒钳位'){
    if(!catalogDeviceFamilies(product).includes('gateDriver'))return [];
    return available.filter(f=>f.scope==='self'&&/^(?:特性|功能|Features?|Input|产品描述|Description)$/i.test((f.publishedHeader||'').replace(/\s/g,''))
      &&/米勒\s*钳位|miller[ -]*clamp/i.test(f.publishedValue||'')
      &&!/(?:不支持|不集成|无米勒|外置|外接|external|without|not\s+(?:support|integrat)|no\s+miller)/i.test(f.publishedValue||''))
      .map(sourceReference);
  }
  if(tag==='电平转换'&&catalogProvesPrimaryClass(product,tag)){
    return available.filter(f=>/^(?:产品描述|Description|Product Family|Device Type|器件类型)$/i.test(f.publishedHeader||'')
      &&isLevelTranslatorDescription(f.publishedValue||'')
      ||/^Technology Family$/i.test(f.publishedHeader||'')&&/^(?:TXS|TXB)$/i.test(f.publishedValue||''))
      .map(f=>sourceReference(f)).filter((s):s is VerifiedSource=>!!s);
  }
  if (product.__vendor === 'novosense' && (tag === '工业级' || tag === '车规AEC-Q100')) {
    const grade = reviewedNovosenseGrade(product);
    return tag === '工业级' ? grade.industrial : [...grade.automotive, ...grade.aecStatement];
  }
  if (product.__vendor === 'yutai' && (tag === '工业级' || tag === '车规AEC-Q100'
      || tag === 'AEC-Q100符合声明')) {
    const grade = reviewedYutaiGrade(product);
    return tag === '工业级' ? grade.industrial
      : tag === 'AEC-Q100符合声明' ? grade.aecStatement
        : [...grade.automotive, ...grade.aecStatement];
  }
  if(tag==='特定帧唤醒'&&/(?:CAN\s*收发器|隔离CAN|SBC)/i.test(String(product._section||''))){
    const capability=/partial\s*network|selective\s*wake(?:[-\s]*up)?|选择性唤醒|特定帧唤醒/i;
    const denied=/(?:no|not|without|不支持|无)\s*(?:partial\s*network|selective\s*wake|选择性唤醒|特定帧唤醒)/i;
    return available.filter(f=>capability.test(f.publishedValue||'')&&!denied.test(f.publishedValue||'')
      &&/Features|产品描述|特征|功能|唤醒/i.test(f.publishedHeader||''))
      .map(f=>f.source);
  }
  if (tag === 'CAN-FD' && ['3peak-auto', '3peak-analog', 'novosense'].includes(String(product.__vendor || ''))
    && /(?:CAN\s*收发器|隔离CAN|SBC)/i.test(String(product._section || ''))) {
    const source = reviewedCanFdSource(product);
    return source ? [source] : [];
  }
  if (product.__vendor === 'yutai' && tag === '以太网') {
    const source = reviewedYutaiEthernetSource(product);
    return source ? [source] : [];
  }
  if (tag === 'I2C' && ((product.__vendor === '3peak-analog'
      && /(?:IO\s*扩展器|电平转换器)/i.test(String(product._section || '')))
      || (product.__vendor === 'novosense' && /IO\s*扩展器/i.test(String(product._section || ''))))) {
    const source = reviewedI2cSource(product);
    return source ? [source] : [];
  }
  if (tag === '隔离' && ((product.__vendor === 'novosense'
      && /集成式电流传感器/.test(String(product._section || '')))
      || (['3peak-analog', '3peak-auto'].includes(String(product.__vendor || ''))
        && /(?:变换器|马达驱动)/.test(String(product._section || ''))))) {
    const source = reviewedIsolationSource(product);
    return source ? [source] : [];
  }
  if (product.__vendor === 'yutai' && (tag === '百兆' || tag === '千兆')) {
    const source = reviewedYutaiSpeedSource(product, tag);
    return source ? [source] : [];
  }
  if (product.__vendor === '3peak-analog' && tag === 'ADC' && /传感器接口/.test(String(product._section || ''))) {
    const raw = productParams(product).get('Description') || '';
    const source = /\bADC\b/i.test(raw) ? sourceForObservedField(product, 'Description', raw) : null;
    return source ? [source] : [];
  }
  if (product.__vendor === 'novosense' && tag === '数字隔离器' && /隔离\s*I2C/i.test(String(product._section || ''))) {
    return reviewedDigitalIsolatorSources(product);
  }
  if (product.__vendor === 'novosense' && tag === '温度传感器' && /温湿度传感器/.test(String(product._section || ''))) {
    const raw = productParams(product).get('产品描述') || '';
    const source = /温湿度传感器/.test(raw) ? sourceForObservedField(product, '产品描述', raw) : null;
    return source ? [source] : [];
  }
  if (tag === '4T0R') return reviewed4T0RSources(product);
  if (product.__vendor === '3peak-analog' && /^(?:\d+通道|\d+bit)$/i.test(tag)) {
    const channel = tag.match(/^(\d+)通道$/);
    const bits = tag.match(/^(\d+)bit$/i);
    const header = channel ? 'Number of Channels' : 'Resolution';
    const required = Number((channel || bits)?.[1]);
    const raw = productParams(product).get(header) || '';
    if (/^\d+$/.test(raw) && Number(raw) >= required) {
      const source = sourceForObservedField(product, header, raw);
      return source ? [source] : [];
    }
    return [];
  }
  if (product.__vendor === '3peak-auto' && /ADC/i.test(String(product._section || '')) && /^\d+bit$/i.test(tag)) {
    const raw = productParams(product).get('产品描述') || '';
    const observed = Number(raw.match(/\b(\d+)\s*bit\b[^|]*\bADC\b/i)?.[1]);
    if (observed >= Number(tag.match(/^(\d+)/)?.[1])) {
      const source = sourceForObservedField(product, '产品描述', raw);
      return source ? [source] : [];
    }
    return [];
  }
  if (product.__vendor === 'novosense' && /模数转换器\s*ADC/i.test(String(product._section || ''))
    && /^(?:\d+通道|\d+bit)$/i.test(tag)) {
    const channel = tag.match(/^(\d+)通道$/);
    const bits = tag.match(/^(\d+)bit$/i);
    const header = channel ? '输入通道 数量' : '特征';
    const raw = productParams(product).get(header) || '';
    const observed = channel ? /^\d+$/.test(raw) ? Number(raw) : NaN
      : Number(raw.match(/(\d+)\s*位\s*ADC/i)?.[1]);
    if (observed >= Number((channel || bits)?.[1])) {
      const source = sourceForObservedField(product, header, raw);
      return source ? [source] : [];
    }
    return [];
  }
  if (product.__vendor === 'novosense' && /位置传感器专用芯片/.test(String(product._section || ''))
    && /^\d+bit$/i.test(tag)) {
    const raw = productParams(product).get('分辨率') || '';
    const observed = Number(raw.match(/^(\d+)\s*位$/)?.[1]);
    if (observed >= Number(tag.match(/^\d+/)?.[0])) {
      const source = sourceForObservedField(product, '分辨率', raw);
      return source ? [source] : [];
    }
    return [];
  }
  if (product.__vendor === 'novosense' && /(?:IO\s*扩展器|I2C\s*开关)/i.test(String(product._section || ''))
    && /^\d+通道$/.test(tag)) {
    const params = productParams(product);
    const header = params.has('通道数') ? '通道数' : '通道';
    const raw = params.get(header) || '';
    if (/^\d+$/.test(raw) && Number(raw) >= Number(tag.match(/^(\d+)/)?.[1])) {
      const source = sourceForObservedField(product, header, raw);
      return source ? [source] : [];
    }
    return [];
  }
  if (product.__vendor === '3peak-analog'
    && (tag === '车规AEC-Q100' || tag === '工业级' || tag === 'AEC-Q100符合声明')) {
    const params = productParams(product);
    const rating = params.get('Rating') || '';
    const features = params.get('Features') || '';
    const refs: VerifiedSource[] = [];
    if ((tag === '工业级' && /^Industrial$/i.test(rating))
      || (tag === '车规AEC-Q100' && /^Automotive$/i.test(rating))) {
      const source = sourceForObservedField(product, 'Rating', rating);
      if (source) refs.push(source);
    }
    if ((tag === '车规AEC-Q100' || tag === 'AEC-Q100符合声明')
      && /\bAEC\s*[- ]?Q\s*[- ]?100\s+Qualified\b/i.test(features)) {
      const source = sourceForObservedField(product, 'Features', features);
      if (source) refs.push(source);
    }
    return refs;
  }
  if (isPackageTag(tag)) {
    const generic = reviewedConfigurationOptions(product).filter(config => packageMatches(`Package: ${config.package}`, tag));
    if (generic.length) return generic.map(config => ({ ...config.source, locator: config.package,
      originalHeader: '封装类型', originalValue: config.package, scope: 'catalog_model', rating: 'configuration_option' }));
    if (product.part_number === 'NSR33xxx') {
      const configs = [...reviewedOrderableConfigurations(product), ...reviewedAdjustableOrderables(product)]
        .filter(config => orderablePackageMatches(config, tag));
      if (configs.length) return configs.map(config => ({ factId: config.source.factId,
        document: config.source.document, documentSha256: config.source.documentSha256,
        factsSha256: config.source.factsSha256, wikiFactPage: config.source.wikiFactPage,
        page: config.source.page, locator: config.orderNumber, originalHeader: 'Package',
        originalValue: config.package, scope: 'catalog_model', rating: 'orderable_configuration' }));
    }
    relevant = available.filter(f => f.field === 'package' && packageMatches(`封装: ${f.publishedValue}`, tag) === true);
    if (relevant.length === 0) {
      const params = productParams(product);
      for (const header of ['Package', '封装类型', '封装']) {
        const raw = params.get(header);
        if (raw && packageMatches(`${header}: ${raw}`, tag) === true) {
          const source = sourceForObservedField(product, header, raw);
          if (source) return [source];
        }
      }
    }
  } else if (tag === '车规AEC-Q100') {
    relevant = available.filter(f => f.field === 'grade');
  } else if (tag === 'AEC-Q100符合声明' || tag === 'AEC-Q100认证') {
    relevant = available.filter(f => f.field === 'grade'
      && /AEC\s*[- ]?\s*Q\s*[- ]?\s*100/i.test(f.evidence.originalValue)
      && (tag !== 'AEC-Q100认证' || /认证|证书|certified|certificate/i.test(f.evidence.originalValue)));
  } else if (tag.startsWith('Vin_')) {
    relevant = available.filter(f => f.field === 'vin_min' || f.field === 'vin_max');
  } else if (tag.startsWith('Iout_')) {
    relevant = available.filter(f => f.field === 'iout');
  } else if (tag.startsWith('Vout_')) {
    relevant = available.filter(f => f.field === 'vout');
    const requested = Number(tag.match(/^Vout_(\d+(?:\.\d+)?)V$/)?.[1]);
    if (Number.isFinite(requested)) {
      const orderables = reviewedOrderableConfigurations(product).filter(config => config.source.outputEvidence
        && Math.abs(config.outputVoltageV - requested) < 1e-9);
      if (orderables.length) return orderables.map(config => ({ factId: config.source.factId, document: config.source.document,
          documentSha256: config.source.documentSha256, factsSha256: config.source.factsSha256,
          page: config.source.outputEvidence!.physicalPage, locator: config.source.outputEvidence!.partNumber,
          originalHeader: config.source.outputEvidence!.originalHeader || 'Output Voltage',
          originalValue: config.source.outputEvidence!.originalValue,
          scope: 'catalog_model', rating: 'orderable_configuration' }));
    }
  } else if (tag === '降压') {
    relevant = available.filter(f => f.field === 'topology');
  } else if (tag === '网卡') {
    relevant = available.filter(f => f.publishedHeader === '简介' && /网卡|以太网控制器/i.test(f.publishedValue || ''));
  } else if (tag === 'PHY') {
    relevant = available.filter(f => f.field === 'description_cell' && /PHY/i.test(f.publishedValue || ''));
  } else if (tag === '工业级' || tag === '消费级') {
    relevant = available.filter(f => (f.field === 'description_cell' && (f.publishedValue || '').includes(tag))
      || (tag === '工业级' && f.field === 'grade' && f.publishedFeature === tag
        && /^(?:industrial|工业级)$/i.test(f.publishedValue || '')));
  } else if (tag === '2.5G') {
    relevant = available.filter(f => f.field === 'description_cell' && /2\.5G\s*PHY/i.test(f.publishedValue || ''));
  } else if (tag === 'RGMII' || tag === 'SGMII' || tag === 'USXGMII') {
    relevant = available.filter(f => f.field === 'interface_cell'
      && new RegExp(`(^|[^A-Z])${tag}([^A-Z]|$)`, 'i').test(f.publishedValue || ''));
  }
  return relevant.map(sourceReference);
}

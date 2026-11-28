// Metric names describe the user's comparison. Only qualified manufacturer
// columns may supply a comparable value. A missing column is a research gap.
import type {VerifiedSource,sourceFactsForProduct} from './source-facts';
import type {EngineeringRequirement} from './engineering-understanding';
import {PARAMETERS, readParameterFacts,type FactProduct} from './selection-spec';
import qualifiedNotes from '../../../lib/catalog-comparison-notes.json' with {type:'json'};

const metrics = {
  voltage_noise: {direction:'lower', header:/^(?:Vn|(?:input )?voltage noise density)\s*(?:at|@)\s*\d+(?:\.\d+)?\s*[kM]?Hz\s*\(Typ\)\s*\(nV\s*\/\s*(?:rtHz|√Hz)\)$/i},
  psrr: {direction:'higher', header:/^(?:PSRR|power supply rejection ratio)\b.*\bdB\b/i},
  sleep_current: {direction:'lower', header:/^(?:sleep current|休眠电流).*[(（][μµunm]?A[)）]/i},
  light_load_efficiency: {direction:'higher', header:/^(?:light[- ]load efficiency|轻载效率).*[%％]/i},
} as const;

export type ComparisonMetric = keyof typeof metrics | 'other';
export type ComparisonReading = {label:string;value:number;basis:string;direction:'lower'|'higher';source:VerifiedSource};
export function knownComparisonMetric(metric:unknown): metric is ComparisonMetric {
  return metric==='other' || typeof metric==='string' && Object.hasOwn(metrics,metric);
}
export function comparisonReadings(metric:ComparisonMetric, sources:VerifiedSource[]):ComparisonReading[] {
  if(metric==='other')return [];
  const rule=metrics[metric];
  return sources.flatMap(source=>{
    if(!rule.header.test(source.originalHeader)||!/^\s*\d+(?:\.\d+)?\s*$/.test(source.originalValue))return [];
    const value=Number(source.originalValue);
    return [{label:metric==='voltage_noise' ? value+' nV/√Hz（'+source.originalHeader.match(/(?:at|@)\s*([\d.]+\s*[kM]?Hz)/i)?.[1]+'，典型）' : source.originalHeader+' · '+source.originalValue,value,direction:rule.direction,source,
      basis:JSON.stringify([metric,source.documentSha256,source.page,source.originalHeader,source.rating])}];
  });
}

// Map the model's choice of an existing numeric field to literal cells only.
// Tag-derived hints, numerical ranges and multi-mode lists cannot rank a part.
export function catalogComparisonReadings(product:FactProduct, binding:EngineeringRequirement,
  facts:ReturnType<typeof sourceFactsForProduct>):ComparisonReading[] {
  const field=binding.comparisonField, direction=binding.comparisonDirection;
  if (!field || !direction || !Object.hasOwn(PARAMETERS,field)) return [];
  const readings:ComparisonReading[]=[];
  for (const parameter of readParameterFacts(product)) {
    if (parameter.field!==field || parameter.source.kind!=='table') continue;
    const source=parameter.source.verified;
    if (!source || source.scope!=='catalog_model') continue;
    const fact=facts.find(f=>f.source.factId===source.factId && f.scope==='self' && !f.applicability);
    if (!fact || fact.publishedHeader!==parameter.source.field || fact.publishedValue!==parameter.source.raw) continue;
    const raw=source.originalValue.trim();
    const symmetric=parameter.shape==='range' && /^±/.test(raw) && parameter.values[0]===-parameter.values[1];
    if (parameter.shape!=='scalar' && !symmetric) continue;
    if (!/^(?:±|[-+])?\s*\d+(?:\.\d+)?\s*[^\d\s]*$/u.test(raw)) continue;
    const value=symmetric?parameter.values[1]:parameter.values[0];
    if (!Number.isFinite(value)) continue;
    const condition=fact.evidence.condition || fact.conditions || '';
    const table=fact.evidence.heading;
    const basis=JSON.stringify([field,direction,source.documentSha256,source.wikiFactPage||source.page,
      table,source.originalHeader,source.rating,condition]);
    const note=qualifiedNotes.find(n=>n.vendor===product.__vendor && n.part===product.part_number &&
      n.field===field && n.documentSha256===source.documentSha256 && n.header===source.originalHeader &&
      (!n.package || facts.some(f=>f.field==='package' && f.scope==='self' && f.source.originalValue===n.package)));
    const unit=source.originalHeader.match(/[(（]([a-zA-ZµμΩ°℃%/]+)[)）]$/)?.[1];
    const plainNumber=/^[-+]?\d+(?:\.\d+)?$/.test(raw);
    const shown=unit && plainNumber
      ? PARAMETERS[field].label+' '+raw+' '+unit+'（'+source.originalHeader+'）'
      : source.originalHeader+' '+raw;
    const detail=note ? note.summary+'（原厂第'+note.page+'页）' : condition || '表中未列测试工况';
    readings.push({label:shown+' · 同表数值'+(direction==='lower'?'小':'大')+'者优先；'+detail,value,basis,direction,source});
  }
  return readings;
}

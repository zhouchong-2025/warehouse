// Metric names describe the user's comparison. Only qualified manufacturer
// columns may supply a comparable value. A missing column is a research gap.
import type {VerifiedSource} from './source-facts';

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

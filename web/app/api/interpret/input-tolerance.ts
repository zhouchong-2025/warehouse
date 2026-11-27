import { toCanonical, sourceMeasurements } from './selection-spec';
/** Reproducible arithmetic on an explicit source expression, not an invented user limit. */
export function deriveInputTolerance(source: string) {
  const m=source.match(/([-+]?\d+(?:\.\d+)?)\s*([kmuμµ]?V)\s*±\s*(\d+(?:\.\d+)?)\s*(%|[kmuμµ]?V)(?![A-Za-z])/i);
  if(!m)return null;
  if(!/^[\s（(]*(?:(?:输入|供电|电压|工作|范围|VIN|VCCA|VCCB|input|supply)[\s:：=]*)*$/i.test(source.slice(0,m.index))
    || !/^[\s)）]*(?:持续|工作|供电|输入|范围)?[\s)）]*$/.test(source.slice(m.index!+m[0].length)))return null;
  const nominal=toCanonical(Number(m[1]),m[2],'V');
  const delta=m[4]==='%'?nominal===null?null:Math.abs(nominal)*Number(m[3])/100:toCanonical(Number(m[3]),m[4],'V');
  if(nominal===null||delta===null||!Number.isFinite(nominal)||!Number.isFinite(delta))return null;
  return {kind:m[4]==='%'?'relative_tolerance' as const:'absolute_tolerance' as const,nominal,delta,
    bounds:[Number((nominal-delta).toPrecision(12)),Number((nominal+delta).toPrecision(12))] as [number,number],expression:m[0]};
}
export function matchesInputTolerance(source: string,values: number[],unit: string) {
  if(typeof source!=='string'||!Array.isArray(values)||typeof unit!=='string')return false;
  const d=deriveInputTolerance(source);return !!d&&values.length===2&&values.every((v,i)=>{
    const n=toCanonical(Number(v),unit,'V');return n!==null&&Math.abs(n-d.bounds[i])<=Math.max(1e-10,Math.abs(d.bounds[i])*1e-10);
  });
}

/** Explicit bipolar measurement range, not a supply-rail or accuracy assumption. */
export function deriveSymmetricCurrentRange(source: string) {
  const measurements = sourceMeasurements(source);
  if (measurements.length !== 1) return null;
  const m=measurements[0], prefix=source.slice(0,m.start).trimEnd();
  const magnitude=toCanonical(m.value,m.unit,'A');
  if(!prefix.endsWith('±')||magnitude===null||magnitude<=0)return null;
  return {kind:'symmetric_range' as const,bounds:[-magnitude,magnitude] as [number,number],
    expression:source.slice(source.lastIndexOf('±',m.start),m.end)};
}
export function matchesSymmetricCurrentRange(source: string,values: number[],unit: string) {
  if(typeof source!=='string'||!Array.isArray(values)||typeof unit!=='string')return false;
  const range=deriveSymmetricCurrentRange(source);
  return !!range&&values.length===2&&values.every((value,index)=>{
    const n=toCanonical(value,unit,'A');return n!==null&&Math.abs(n-range.bounds[index])<1e-10;
  });
}

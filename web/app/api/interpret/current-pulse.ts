import { sourceMeasurements, toCanonical } from './selection-spec';
/** A finite current/time operating point is not a continuous chip current rating. */
export function currentPulse(source: string): { amperes: number; seconds: number } | null {
  const measurements = sourceMeasurements(source);
  const currents = measurements.flatMap(m => { const n=toCanonical(m.value,m.unit,'A');return n===null?[]:[n]; });
  const durations = measurements.flatMap(m => { const n=toCanonical(m.value,m.unit,'s');return n===null?[]:[n]; });
  return currents.length===1&&durations.length===1&&currents[0]>0&&durations[0]>0
    ? {amperes:currents[0],seconds:durations[0]} : null;
}

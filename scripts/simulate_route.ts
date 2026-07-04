import { parseQuery } from '../web/app/api/interpret/query_parser.ts';

// Simulate route.ts logic from lines 265-590
const query = '八切一开关，2 通道';
const parsed = parseQuery(query);

// Line 265: result = llmResult (confidence=high, no LLM)
const llmResult: any = {
  features: parsed.features,
  must: parsed.must,
  mustMeta: parsed.mustMeta,
  nice: parsed.nice,
  sortKey: parsed.sortKey,
  vendor: null,
  category_hint: parsed.category_hint,
  explanation: parsed.explanation,
  confidence: parsed.confidence,
  suggestions: [],
};
const result: any = llmResult;

// Line 270-333
if (parsed.must && parsed.must.length > 0) {
  result.must = [...parsed.must];

  const maxVin = Math.max(...parsed.must
    .filter((f: string) => /^Vin_(\d+\.?\d*)V$/.test(f))
    .map((f: string) => parseFloat(f.match(/^Vin_(\d+\.?\d*)V$/)![1])), 0);
  const maxIout = Math.max(...parsed.must
    .filter((f: string) => /^Iout_(\d+\.?\d*)A$/.test(f))
    .map((f: string) => parseFloat(f.match(/^Iout_(\d+\.?\d*)A$/)![1])), 0);
  const maxChan = Math.max(...parsed.must
    .filter((f: string) => /^(\d+)通道$/.test(f))
    .map((f: string) => parseInt(f.match(/^(\d+)通道$/)![1])), 0);
  const maxPort = Math.max(...parsed.must
    .filter((f: string) => /^(\d+)口$/.test(f))
    .map((f: string) => parseInt(f.match(/^(\d+)口$/)![1])), 0);
  const maxVout = Math.max(...parsed.must
    .filter((f: string) => /^Vout_(\d+\.?\d*)V$/.test(f))
    .map((f: string) => parseFloat(f.match(/^Vout_(\d+\.?\d*)V$/)![1])), 0);

  const parserKnown = new Set([...result.must, ...(parsed.nice || [])]);
  for (const f of result.features) {
    if (!parserKnown.has(f) && !result.must.includes(f)) {
      const vinM = f.match(/^Vin_(\d+\.?\d*)V$/);
      const ioutM = f.match(/^Iout_(\d+\.?\d*)A$/);
      const chanM = f.match(/^(\d+)通道$/);
      const portM = f.match(/^(\d+)口$/);
      const voutM = f.match(/^Vout_(\d+\.?\d*)V$/);
      if (vinM && parseFloat(vinM[1]) < maxVin) continue;
      if (ioutM && parseFloat(ioutM[1]) < maxIout) continue;
      if (chanM && parseInt(chanM[1]) < maxChan) continue;
      if (portM && parseInt(portM[1]) < maxPort) continue;
      if (voutM && parseFloat(voutM[1]) < maxVout) continue;
      result.must.push(f);
    }
  }

  if (!(parsed as any)._multiCategory) {
    result.nice = parsed.nice || [];
  } else if (!result.nice) {
    result.nice = [];
  }
  result.mustMeta = parsed.mustMeta || [];
}

console.log('After merge:');
console.log('  must:', result.must);
console.log('  mustMeta tags:', (result.mustMeta || []).map((m: any) => m.tag));

// Simulate post-processing that might affect must (lines 361-590)
// Channel count
const chM = query.match(/(\d+)\s*[通道路]/);
if (chM) {
  const t = chM[1] + '通道';
  if (!result.features.includes(t)) result.features.push(t);
}

// Line 586-590: multiCategory rebuild
if ((parsed as any)._multiCategory && result.nice && result.nice.length > 0) {
  const niceSet = new Set(result.nice as string[]);
  result.must = result.features.filter((f: string) => !niceSet.has(f));
  console.log('_multiCategory rebuild triggered! nice:', result.nice);
}

console.log('After post-process:');
console.log('  must:', result.must);
console.log('  features:', result.features);

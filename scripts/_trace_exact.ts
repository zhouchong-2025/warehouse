// Trace exactBonus for TPA5602, TP5552, TP5554
import { readFileSync } from 'fs';

// Minimal copy of the functions from constraint-match.ts
function channelCountOf(product: any): number | null {
  let best: number | null = null;
  const paramsText = String(product._params || '');
  for (const re of [
    /(number of channels?|channel count|通道数|通道数量|adc input channel|input channel(?:\s+数量)?|参考\s*通道数|输入通道\s*数量)\s*[:：]\s*(\d+)/gi,
    /(\d+)\s*通道/gi,
    /\b(\d+)\s*ch\b/gi,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(paramsText)) !== null) {
      const n = parseInt(m[m.length - 1], 10);
      if (!Number.isNaN(n)) best = best == null ? n : Math.max(best, n);
    }
  }
  const feats = (product._features || '').toLowerCase();
  for (const tk of feats.split(/\s+/)) {
    const m = tk.match(/^(\d+)通道/);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) best = best == null ? n : Math.max(best, n);
  }
  return best;
}

function portCountOf(product: any, tokens: string[]): number | null {
  let best: number | null = null;
  for (const tk of tokens) {
    const m = tk.match(/^(\d+)口$/);
    if (m) { const n = parseInt(m[1], 10); best = best == null ? n : Math.max(best, n); }
  }
  return best;
}

function bitResolutionOf(product: any, tokens: string[]): number | null {
  let best: number | null = null;
  for (const tk of tokens) {
    const m = tk.match(/^(\d+)bit$/);
    if (m) { const n = parseInt(m[1], 10); best = best == null ? n : Math.max(best, n); }
  }
  return best;
}

function exactSpecHit(product: any, meta: any): boolean {
  if (meta.value == null) return false;
  const tokens = (product._features || "").toLowerCase().split(/\s+/);
  if (meta.family === '通道') {
    const count = channelCountOf(product);
    return count === meta.value;
  }
  if (meta.family === '端口') {
    const count = portCountOf(product, tokens);
    return count === meta.value;
  }
  return false;
}

const data = JSON.parse(readFileSync('web/public/data/products_structured.json', 'utf-8'));

for (const pn of ['TPA5602', 'TP5552', 'TP5554']) {
  for (const [v, vd] of Object.entries(data)) {
    for (const p of (vd as any).products) {
      if (p.part_number === pn) {
        const ch = channelCountOf(p);
        const meta = { tag: '2通道', family: '通道', value: 2, downgradable: true, dimension: 'spec' };
        const exact = exactSpecHit(p, meta);
        console.log(`${pn}: channelCount=${ch}, exactSpecHit for 2通道=${exact}`);
      }
    }
  }
}

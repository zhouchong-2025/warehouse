// Quick test: channelCountOf for TPA5602 and TP5554
import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('web/public/data/products_structured.json', 'utf-8'));

// Copy channelCountOf from constraint-match.ts (same regex logic)
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

for (const [v, vd] of Object.entries(data)) {
  for (const p of (vd as any).products) {
    if (['TPA5602', 'TP5554', 'TP5552'].includes(p.part_number)) {
      const ch = channelCountOf(p);
      console.log(`${p.part_number} (${v}): channelCount=${ch}`);
    }
  }
}

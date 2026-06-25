// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { parseQuery } from '../web/app/api/interpret/query_parser';
import { scoreByConstraints, type ConstraintProduct } from '../web/app/api/interpret/constraint-match';

const dataPath = path.join(process.cwd(), 'web/public/data/products_structured.json');
const root = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const products: ConstraintProduct[] = [];
for (const [vendor, bucket] of Object.entries<any>(root)) {
  for (const p of bucket.products || []) {
    products.push({ ...p, __vendor: vendor, __vendorGroup: vendor });
  }
}

function sortedCards(query: string) {
  const parsed = parseQuery(query);
  const scored = scoreByConstraints(products, parsed.must || [], parsed.nice || [], parsed.mustMeta || [])
    .sort((a, b) =>
      (b.fullMatch ? 1 : 0) - (a.fullMatch ? 1 : 0) ||
      a.mustMiss.length - b.mustMiss.length ||
      b.exactBonus - a.exactBonus ||
      b.niceHit.length - a.niceHit.length ||
      b.score - a.score ||
      String(a.product.part_number || '').localeCompare(String(b.product.part_number || ''))
    );
  return { parsed, scored };
}

const q1 = sortedCards('八切一开关');
if (q1.parsed.needsLLM) throw new Error('八切一开关 should be handled by direct parser, not LLM fallback');
for (const feat of ['模拟开关', '8:1']) {
  if (!(q1.parsed.features || []).includes(feat)) throw new Error(`八切一开关 missing feature ${feat}`);
}

const q2 = sortedCards('八切一模拟开关 2通道');
for (const feat of ['模拟开关', '8:1', '2通道']) {
  if (!(q2.parsed.features || []).includes(feat)) throw new Error(`八切一模拟开关 2通道 missing feature ${feat}`);
}

const top = q2.scored.slice(0, 8).map((s) => ({
  pn: s.product.part_number,
  hit: s.mustHit,
  miss: s.mustMiss,
  score: s.score,
  exact: s.exactBonus,
}));
const allCards = q2.scored.map((s) => ({
  pn: s.product.part_number,
  hit: s.mustHit,
  miss: s.mustMiss,
  score: s.score,
  exact: s.exactBonus,
}));

const top1 = top[0];
if (!top1) throw new Error('No analog switch candidates returned');
if (!top1.hit.includes('8:1')) throw new Error(`Top analog switch must preserve 8:1, got ${JSON.stringify(top1)}`);
if (top1.miss.includes('8:1')) throw new Error(`Top analog switch must not miss 8:1, got ${JSON.stringify(top1)}`);
if (top1.pn === 'TPW4052' || top1.pn === 'TPWH4052') throw new Error(`4:1 dual-channel part incorrectly ranked first: ${top1.pn}`);

const tpw4051 = allCards.find((x) => x.pn === 'TPW4051');
const tpw4052 = allCards.find((x) => x.pn === 'TPW4052');
if (!tpw4051 || !tpw4052) throw new Error(`Missing expected comparison parts. top=${JSON.stringify(top)} all=${JSON.stringify(allCards.slice(0,20))}`);
if (!(tpw4051.score > tpw4052.score)) {
  throw new Error(`Expected 8:1 single-channel TPW4051 to outrank 4:1 dual-channel TPW4052 for query 八切一模拟开关 2通道. tpw4051=${tpw4051.score}, tpw4052=${tpw4052.score}`);
}
if (!tpw4051.hit.includes('8:1') || tpw4051.miss.includes('8:1')) {
  throw new Error(`TPW4051 should satisfy 8:1 and only miss 2通道. got=${JSON.stringify(tpw4051)}`);
}
if (!tpw4052.miss.includes('8:1')) {
  throw new Error(`TPW4052 should be marked as missing 8:1. got=${JSON.stringify(tpw4052)}`);
}

console.log('✅ analog switch parser/ranking regression passed');
console.log(`top1=${top1.pn} hit=${top1.hit.join(',')} miss=${top1.miss.join(',') || '-'} score=${top1.score}`);
console.log(`tpw4051=${tpw4051.score} tpw4052=${tpw4052.score}`);

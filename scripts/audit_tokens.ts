import fs from 'fs';

// Load all products and extract unique _features tokens
const data = JSON.parse(fs.readFileSync('web/public/data/products_structured.json', 'utf8'));
const allTokens = new Map<string, number>(); // token → count
for (const [, blob] of Object.entries(data) as any) {
  for (const p of (blob as any).products || []) {
    const tokens = (p._features || '').toLowerCase().split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      allTokens.set(t, (allTokens.get(t) || 0) + 1);
    }
  }
}

// Load parser rules to see what's covered
// (Using static analysis below — no need to import parseQuery)

// Actually, let's just look at tokens that look like technical terms
// and aren't obviously covered. Filter criteria:
// - Appears in ≥ 3 products (not noise)
// - Contains letters or mixed alnum (technical terms)
// - NOT all-numeric or purely Chinese (those are usually covered)
// - NOT already an obvious parsable token

// Common tokens that we KNOW are covered by parser rules:
const knownCovered = new Set([
  // From CATEGORY_RULES: these generate tags
  'dcdc', 'ldo', 'adc', 'dac', 'can-fd', 'lin', 'rs-485', 'rs-232',
  'i2c', 'sbc', 'mlvds', '隔离rs485', '隔离can', '隔离i2c',
  '以太网', '交换机', '网卡', 't1-phy',
  // From MODIFIER_RULES
  '车规aec-q100', '工业级', '消费级',
  // Interface standards
  'rgmii', 'sgmii', 'qsgmii', 'rmii', 'mii',
  // Common numeric families
  '100base-tx', '100fx', '百兆', '千兆',
]);

// Find technical tokens not in knownCovered
const candidates: [string, number][] = [];
for (const [token, count] of allTokens) {
  if (count < 3) continue; // skip rare tokens
  if (knownCovered.has(token)) continue;
  // Skip numeric-only tokens, pure Chinese (usually covered by category rules)
  if (/^\d+(\.\d+)?(v|a|m?v|m?a|m?w|m?hz|mbps|k?hz|bit|口|通道|路|kv|kvrms)?$/.test(token)) continue;
  if (/^[a-z]+$/.test(token) && token.length <= 2) continue; // 2-letter abbreviations (noise)
  if (/^(vout_|vin_|iout_)\d/.test(token)) continue; // parametric tokens
  // Focus on technical/interface/protocol tokens
  candidates.push([token, count]);
}

// Sort by frequency desc
candidates.sort((a, b) => b[1] - a[1]);

console.log('=== Potential missing parser targets (top 50 by frequency) ===');
for (const [token, count] of candidates.slice(0, 50)) {
  console.log(`  ${token.padEnd(25)} ${count} products`);
}

// Also check: what unique "section" names exist? These are category labels.
console.log('\n=== Unique _section values ===');
const sections = new Set<string>();
for (const [, blob] of Object.entries(data) as any) {
  for (const p of (blob as any).products || []) {
    if (p._section) sections.add(p._section);
  }
}
for (const s of [...sections].sort()) {
  console.log(`  ${s}`);
}

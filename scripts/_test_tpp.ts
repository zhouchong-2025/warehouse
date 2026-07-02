// Direct test of constraint matching for TPP21206 vs "5V→1.2V 8A" query
const fs = require('fs');
const path = require('path');

// Load products
const data = JSON.parse(fs.readFileSync('web/public/data/products_structured.json', 'utf8'));
let tpp21206 = null;
for (const vk of Object.keys(data)) {
  const vd = data[vk];
  if (!vd || !vd.products) continue;
  const found = vd.products.find(p => p.part_number === 'TPP21206');
  if (found) { tpp21206 = found; break; }
}

if (!tpp21206) { console.log('TPP21206 not found'); process.exit(1); }

// Simulate mustMeta from API
const mustMeta = [
  { tag: '降压', dimension: 'category' },
  { tag: 'DCDC', dimension: 'category' },
  { tag: 'Iout_8A', dimension: 'spec', family: 'Iout', value: 8 },
  { tag: 'Vin_5V', dimension: 'spec', family: 'Vin', value: 5 },
  { tag: 'Vout_1.2V', dimension: 'spec', family: 'Vout', value: 1.2 },
  { tag: '低噪声', dimension: 'spec' },
];

// Import constraint-match
const { tagSatisfied } = require('./app/api/interpret/constraint-match');

console.log('=== TPP21206 constraint test ===');
console.log('features:', tpp21206._features);
console.log('params_numeric keys:', Object.keys(tpp21206._params_numeric || {}));
console.log();

for (const meta of mustMeta) {
  const result = tagSatisfied(tpp21206, meta.tag, meta);
  console.log(`${meta.tag} (${meta.dimension}${meta.family ? '/'+meta.family+'='+meta.value : ''}): ${result ? '✅ HIT' : '❌ MISS'}`);
}

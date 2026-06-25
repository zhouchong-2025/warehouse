// Verify sort keys for TP5552, TPA5602, TP5554 using actual constraint-match.ts
import { scoreByConstraints } from './web/app/api/interpret/constraint-match';

const products = [
  { part_number: 'TP5552', _features: '运放 工业级', _params: 'Number of Channels: 2 | Supply Voltage (Min) (V): 1.8 | Supply Voltage (Max) (V): 5.5 | Rail-Rail In: Yes | Rail-Rail Out: Yes | Vos (Max) (mV): 0.005' },
  { part_number: 'TPA5602', _features: '运放 工业级', _params: 'Number of Channels: 2 | Supply Voltage (Min) (V): 2.5 | Supply Voltage (Max) (V): 5.5 | Rail-Rail In: Yes | Rail-Rail Out: Yes | Vos (Max) (mV): 0.006' },
  { part_number: 'TP5554', _features: '运放 工业级', _params: 'Number of Channels: 4 | Supply Voltage (Min) (V): 1.8 | Supply Voltage (Max) (V): 5.5 | Rail-Rail In: Yes | Rail-Rail Out: Yes | Vos (Max) (mV): 0.005' },
] as any;

const must = ['运放', '轨到轨', 'Vos_<=1mV', 'Vin_5V', '2通道'];
const mustMeta = [
  { tag: '运放', dimension: 'category' as const },
  { tag: '轨到轨', dimension: 'spec' as const },
  { tag: 'Vos_<=1mV', dimension: 'spec' as const, family: 'Vos', value: 1 },
  { tag: 'Vin_5V', dimension: 'spec' as const, family: 'Vin', value: 5 },
  { tag: '2通道', dimension: 'spec' as const, family: '通道', value: 2, downgradable: true },
];

const scored = scoreByConstraints(products, must, [], mustMeta);
for (const s of scored) {
  console.log(`${s.product.part_number}: mustHit=[${s.mustHit}], mustMiss=[${s.mustMiss}], exactBonus=${s.exactBonus}, categoryHit=${s.categoryHit}, score=${s.score}`);
}

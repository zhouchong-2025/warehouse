// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { parseQuery } from '../web/app/api/interpret/query_parser';
import { applyConstraints, scoreByConstraints, tagSatisfied, type ConstraintProduct, type ConstraintScore } from '../web/app/api/interpret/constraint-match';

type VendorBlob = { name: string; products: Record<string, string>[] };

type UiLikeCard = {
  pn: string;
  vendor: string;
  matchedTerms: string[];
  missingTerms: string[];
  matchSummary: string;
  referenceOnly: boolean;
  score: number;
};

const root = path.dirname(path.dirname(path.resolve(__filename)));
const dataPath = path.join(root, 'web/public/data/products_structured.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as Record<string, VendorBlob>;

function vendorGroupKey(vendorSlug: string): string {
  return ['3peak-analog', '3peak-auto'].includes(vendorSlug) ? '3peak' : vendorSlug;
}

const allProducts: ConstraintProduct[] = Object.entries(data).flatMap(([vendor, blob]) =>
  blob.products.map((product) => ({
    ...product,
    __vendor: vendor,
    __vendorGroup: vendorGroupKey(vendor),
  }))
);

function mapCard(s: ConstraintScore, niceRequested: string[]): UiLikeCard {
  const missingNice = niceRequested.filter((tag) => !s.niceHit.includes(tag));
  const missingTerms = [...s.mustMiss, ...missingNice];
  const matchedCount = s.mustHit.length + s.niceHit.length;
  const totalRequested = s.mustHit.length + s.mustMiss.length + niceRequested.length;
  return {
    pn: String(s.product.part_number || ''),
    vendor: String(s.product.__vendor || ''),
    matchedTerms: [...s.mustHit, ...s.niceHit],
    missingTerms,
    matchSummary: `${matchedCount}/${totalRequested} 条件`,
    referenceOnly: missingTerms.length > 0,
    score: s.score,
  };
}

function rankCards(query: string): { parsed: ReturnType<typeof parseQuery>; cards: UiLikeCard[]; tier?: number } {
  const parsed = parseQuery(query);
  if (!parsed.must || parsed.must.length === 0) {
    throw new Error(`Query ${query} has no must constraints: ${JSON.stringify(parsed)}`);
  }
  const productPool = allProducts.filter((p) => {
    if (!parsed.vendor) return true;
    if (parsed.vendor === '3peak') return p.__vendorGroup === '3peak';
    return p.__vendorGroup === parsed.vendor || p.__vendor === parsed.vendor;
  });
  const useTiered = !!parsed.category_hint;
  const raw = useTiered
    ? applyConstraints(productPool, parsed.must, parsed.nice || [], parsed.mustMeta, parsed.sortKey).items
    : scoreByConstraints(productPool, parsed.must, parsed.nice || [], parsed.mustMeta).sort((a, b) =>
        (b.fullMatch ? 1 : 0) - (a.fullMatch ? 1 : 0)
        || a.mustMiss.length - b.mustMiss.length
        || b.exactBonus - a.exactBonus
        || b.niceHit.length - a.niceHit.length
        || b.score - a.score
      );
  return { parsed, cards: raw.map((s) => mapCard(s, parsed.nice || [])) };
}

// Case 1: Novosense SIC exact-vs-reference distinction
const canSic = rankCards('can sic');
if (!canSic.parsed.must.includes('CAN-FD')) throw new Error(`parseQuery('can sic') missing must CAN-FD: ${JSON.stringify(canSic.parsed)}`);
if (!(canSic.parsed.nice || []).includes('SIC')) throw new Error(`parseQuery('can sic') missing nice SIC: ${JSON.stringify(canSic.parsed)}`);
const topCan = canSic.cards[0];
if (topCan.matchSummary !== '2/2 条件' || topCan.referenceOnly || topCan.missingTerms.length !== 0 || !topCan.matchedTerms.includes('SIC')) {
  throw new Error(`Top SIC card summary wrong: ${JSON.stringify(topCan)}`);
}
const nca1462 = canSic.cards.find((c) => c.pn === 'NCA1462-Q1');
if (!nca1462) throw new Error(`Expected NCA1462-Q1 in CAN+SIC results`);
if (nca1462.matchSummary !== '2/2 条件' || nca1462.referenceOnly || !nca1462.matchedTerms.includes('SIC')) {
  throw new Error(`Expected NCA1462-Q1 to stay a direct SIC recommendation: ${JSON.stringify(nca1462)}`);
}
const nca1043 = canSic.cards.find((c) => c.pn === 'NCA1043B-Q1');
if (!nca1043) throw new Error(`Expected NCA1043B-Q1 in CAN fallback list`);
if (nca1043.matchSummary !== '1/2 条件' || !nca1043.referenceOnly || !nca1043.missingTerms.includes('SIC')) {
  throw new Error(`Expected NCA1043B-Q1 downgraded as reference lacking SIC: ${JSON.stringify(nca1043)}`);
}
if (!(nca1462.score > nca1043.score)) {
  throw new Error(`Expected SIC-capable NCA1462 score > non-SIC NCA1043. nca1462=${nca1462.score}, nca1043=${nca1043.score}`);
}

// Case 2: 3peak analog should also use the same 2/2 condition display for nice-tags
const lowNoiseRef = rankCards('低噪声 电压基准');
const topRef = lowNoiseRef.cards[0];
if (topRef.vendor !== '3peak-analog') throw new Error(`Expected 3peak-analog top vendor for low-noise reference, got ${topRef.vendor}`);
if (topRef.matchSummary !== '2/2 条件' || topRef.referenceOnly || !topRef.matchedTerms.includes('低噪声')) {
  throw new Error(`Expected low-noise voltage reference top card to show 2/2 direct recommendation: ${JSON.stringify(topRef)}`);
}

// Case 3: YT library / ethernet queries should also stop looking like flat 10-point ties.
const switchCase = rankCards('5口千兆交换机 非管理型');
const topSwitch = switchCase.cards[0];
if (topSwitch.vendor !== 'yutai') throw new Error(`Expected Yutai ethernet result on top, got ${topSwitch.vendor}`);
if (topSwitch.matchSummary !== '3/4 条件' || !topSwitch.referenceOnly || !topSwitch.missingTerms.includes('非管理型')) {
  throw new Error(`Expected 5-port gigabit switch card to transparently show missing 非管理型: ${JSON.stringify(topSwitch)}`);
}

console.log('✅ Global priority/reference delivery regression passed');
console.log(`CAN+SIC top1=${topCan.pn} ${topCan.matchSummary}`);
console.log(`CAN reference=${nca1043.pn} ${nca1043.matchSummary} missing=${nca1043.missingTerms.join('、')}`);
console.log(`VoltageRef top1=${topRef.pn} ${topRef.matchSummary}`);
console.log(`Ethernet top1=${topSwitch.pn} ${topSwitch.matchSummary} missing=${topSwitch.missingTerms.join('、')}`);

// Case 4: 特定帧唤醒必须能从 params/detail 证据识别，不依赖 features 回填
const pnWake = rankCards('can fd 支持特定帧唤醒');
const topPnWake = pnWake.cards[0];
if (topPnWake.matchSummary !== '2/2 条件' || topPnWake.referenceOnly || !topPnWake.matchedTerms.includes('特定帧唤醒')) {
  throw new Error(`Expected partial-networking CAN top card to show 2/2 direct recommendation: ${JSON.stringify(topPnWake)}`);
}
const tpt1145Family = pnWake.cards.find((c) => c.pn.includes('TPT1145'));
if (!tpt1145Family) throw new Error('Expected TPT1145 family in 特定帧唤醒 results');
if (tpt1145Family.matchSummary !== '2/2 条件' || tpt1145Family.referenceOnly || !tpt1145Family.matchedTerms.includes('特定帧唤醒')) {
  throw new Error(`Expected TPT1145 family to satisfy 特定帧唤醒 via params evidence: ${JSON.stringify(tpt1145Family)}`);
}
console.log(`PartialNetworking top1=${topPnWake.pn} ${topPnWake.matchSummary}`);

// Case 5: 千兆/子品类/grade 需走 registry + 运行时证据，不依赖回填 prose feature
const gigabitNic = rankCards('网卡 消费级 千兆');
const topGigabitNic = gigabitNic.cards[0];
if (topGigabitNic.pn !== 'YT6801' || topGigabitNic.matchSummary !== '3/3 条件' || topGigabitNic.referenceOnly) {
  throw new Error(`Expected gigabit consumer NIC top1=YT6801 direct match: ${JSON.stringify(topGigabitNic)}`);
}

const gigabitSwitch = rankCards('千兆交换机');
const topGigabitSwitch = gigabitSwitch.cards[0];
if (topGigabitSwitch.pn !== 'YT9215S' || topGigabitSwitch.matchSummary !== '2/2 条件' || topGigabitSwitch.referenceOnly) {
  throw new Error(`Expected gigabit switch top1=YT9215S direct match: ${JSON.stringify(topGigabitSwitch)}`);
}

// Case 6: 非隔离 must 不能误混到隔离子品类
const nonIsoGate = rankCards('非隔离栅极驱动');
const topNonIsoGate = nonIsoGate.cards[0];
if (topNonIsoGate.pn !== 'TPM1020' || topNonIsoGate.matchSummary !== '1/1 条件' || topNonIsoGate.referenceOnly) {
  throw new Error(`Expected non-isolated gate driver top1=TPM1020 direct match: ${JSON.stringify(topNonIsoGate)}`);
}

// Case 7: 霍尔语义须能作为 must 命中 detail/params 证据
const hallCurrent = rankCards('霍尔 电流传感器');
const topHallCurrent = hallCurrent.cards[0];
if (topHallCurrent.pn !== 'NSM2012P' || topHallCurrent.matchSummary !== '2/2 条件' || topHallCurrent.referenceOnly || !topHallCurrent.matchedTerms.includes('霍尔')) {
  throw new Error(`Expected Hall current sensor top1=NSM2012P direct match: ${JSON.stringify(topHallCurrent)}`);
}

console.log(`GigabitNIC top1=${topGigabitNic.pn} ${topGigabitNic.matchSummary}`);
console.log(`GigabitSwitch top1=${topGigabitSwitch.pn} ${topGigabitSwitch.matchSummary}`);
console.log(`NonIsoGate top1=${topNonIsoGate.pn} ${topNonIsoGate.matchSummary}`);
console.log(`HallCurrent top1=${topHallCurrent.pn} ${topHallCurrent.matchSummary}`);

// Case 7b: 技术路线必须保住；纳芯微没有“霍尔马达驱动”证据时，不应把普通马达驱动作为当前推荐返回。
const hallMotorNovo = rankCards('纳芯微 霍尔马达驱动 推荐');
if (hallMotorNovo.cards.length !== 0) {
  throw new Error(`Expected no Novosense Hall motor-driver recommendation without 霍尔 evidence, got ${hallMotorNovo.cards.slice(0, 5).map((c) => `${c.pn}:${c.matchSummary}:${c.missingTerms.join('/')}`).join(',')}`);
}
console.log('HallMotorNovosense guard: no feature/technology hit → no recommendation card');

// Case 8: 低功耗唤醒只认正向唤醒证据；Standby-only 不能放行
const tpt1042 = allProducts.find((p) => p.part_number === 'TPT1042');
const nca1044 = allProducts.find((p) => p.part_number === 'NCA1044-Q1');
const tpt1043 = allProducts.find((p) => p.part_number === 'TPT1043');
const tpt1021q = allProducts.find((p) => p.part_number === 'TPT1021Q');
const nca1021 = allProducts.find((p) => p.part_number === 'NCA1021S-Q1SPR');
if (!tpt1042 || !nca1044 || !tpt1043 || !tpt1021q || !nca1021) throw new Error('Missing low-power wake regression fixtures');
if (tagSatisfied(tpt1042, '低功耗唤醒')) throw new Error('Expected TPT1042 standby-only CAN FD transceiver to NOT satisfy 低功耗唤醒');
if (tagSatisfied(nca1044, '低功耗唤醒')) throw new Error('Expected NCA1044-Q1 standby-only CAN FD transceiver to NOT satisfy 低功耗唤醒');
if (!tagSatisfied(tpt1043, '低功耗唤醒')) throw new Error('Expected TPT1043 with INH to satisfy 低功耗唤醒');
if (!tagSatisfied(tpt1021q, '低功耗唤醒')) throw new Error('Expected TPT1021Q with INH/WAKE pin to satisfy 低功耗唤醒');
if (!tagSatisfied(nca1021, '低功耗唤醒')) throw new Error('Expected NCA1021S-Q1SPR with remote/local wake + INH to satisfy 低功耗唤醒');
console.log('LowPowerWake guard: standby-only blocked, wake-capable parts allowed');

// Case 9: LIN must not fuzzy-match English substrings like linear / line-driver in params.
const tpc112s1 = allProducts.find((p) => p.part_number === 'TPC112S1');
const nsr31xxx = allProducts.find((p) => p.part_number === 'NSR31xxx');
const tpt1021eq = allProducts.find((p) => p.part_number === 'TPT1021EQ');
const nca1021dnr = allProducts.find((p) => p.part_number === 'NCA1021S-Q1DNR');
if (!tpc112s1 || !nsr31xxx || !tpt1021eq || !nca1021dnr) throw new Error('Missing LIN regression fixtures');
const linMeta = { tag: 'LIN', dimension: 'category' } as const;
if (tagSatisfied(tpc112s1, 'LIN', linMeta as any)) throw new Error('Expected DAC TPC112S1 to NOT satisfy LIN category matching');
if (tagSatisfied(nsr31xxx, 'LIN', linMeta as any)) throw new Error('Expected LDO NSR31xxx to NOT satisfy LIN category matching');
if (!tagSatisfied(tpt1021eq, 'LIN', linMeta as any)) throw new Error('Expected true LIN transceiver TPT1021EQ to satisfy LIN category matching');
if (!tagSatisfied(nca1021dnr, 'LIN', linMeta as any)) throw new Error('Expected true LIN transceiver NCA1021S-Q1DNR to satisfy LIN category matching');

const lin3peak = rankCards('思瑞浦 lin');
const topLin3peak = lin3peak.cards[0];
if (!topLin3peak.pn.startsWith('TPT102') || topLin3peak.matchSummary !== '1/1 条件' || topLin3peak.referenceOnly) {
  throw new Error(`Expected 3peak LIN top card to be a direct LIN transceiver, got ${JSON.stringify(topLin3peak)}`);
}
if (lin3peak.cards.slice(0, 10).some((c) => !c.pn.startsWith('TPT102'))) {
  throw new Error(`Expected 3peak LIN top10 to contain only LIN transceivers, got ${lin3peak.cards.slice(0, 10).map((c) => c.pn).join(',')}`);
}

const linNovosense = rankCards('纳芯微 lin');
const topLinNovosense = linNovosense.cards[0];
if (!topLinNovosense.pn.startsWith('NCA1021S-') || topLinNovosense.matchSummary !== '1/1 条件' || topLinNovosense.referenceOnly) {
  throw new Error(`Expected Novosense LIN top card to be a direct LIN transceiver, got ${JSON.stringify(topLinNovosense)}`);
}
if (linNovosense.cards.slice(0, 10).some((c) => !c.pn.startsWith('NCA1021S-'))) {
  throw new Error(`Expected Novosense LIN top10 to exclude non-LIN-category junk, got ${linNovosense.cards.slice(0, 10).map((c) => c.pn).join(',')}`);
}
console.log(`LIN3peak top1=${topLin3peak.pn} ${topLin3peak.matchSummary}`);
console.log(`LINNovosense top1=${topLinNovosense.pn} ${topLinNovosense.matchSummary}`);

const adc168 = rankCards('ADC 16bit 8通道');
const adc168Top = adc168.cards[0];
if (adc168Top.referenceOnly || adc168Top.matchSummary !== '3/3 条件') {
  throw new Error(`Expected ADC 16bit 8通道 top card to be a full direct match, got ${JSON.stringify(adc168Top)}`);
}
if (!['TPAFE5160', 'TPAFE5162', 'TPAFE5165H8', 'TPAFE51736S8', 'TPC51701'].includes(adc168Top.pn)) {
  throw new Error(`Unexpected ADC 16bit 8通道 top1 ${adc168Top.pn}`);
}
if (adc168.cards.slice(0, 5).some((c) => c.referenceOnly)) {
  throw new Error(`Expected ADC 16bit 8通道 top5 to all be direct matches, got ${adc168.cards.slice(0, 5).map((c) => `${c.pn}:${c.matchSummary}`).join(',')}`);
}
console.log(`ADC16bit8ch top1=${adc168Top.pn} ${adc168Top.matchSummary}`);

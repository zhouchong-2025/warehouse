#!/usr/bin/env python3
"""Re-apply all lost route.ts patches cleanly."""
import os

path = "/Users/zhouchong/Projects/warehouse/web/app/api/interpret/route.ts"
with open(path, "r") as f:
    text = f.read()

changes = 0

# 1. Import applyConstraints
old = "import { tagSatisfied } from './constraint-match';"
new = "import { tagSatisfied, applyConstraints } from './constraint-match';"
if old in text:
    text = text.replace(old, new); changes += 1; print("1. applyConstraints import ✓")
else:
    print("1. SKIP - already done" if "applyConstraints" in text else "1. FAIL")

# 2. Preferred PNs block (after DEEPSEEK_API_KEY line)
old = 'const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";\n\nconst SYSTEM_PROMPT'
new = '''const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";

// ── Preferred PNs (霆宝优选方案) ──
let PREFERRED_PNS: Set<string> = new Set();
try {
  const raw = readFileSync(resolve(process.cwd(), "public/data/preferred_pns.json"), "utf-8");
  const map: Record<string, string> = JSON.parse(raw);
  PREFERRED_PNS = new Set(Object.keys(map));
} catch { /* file missing — no preferred boost */ }

const SYSTEM_PROMPT'''
if old in text:
    text = text.replace(old, new); changes += 1; print("2. Preferred PNs block ✓")
else:
    print("2. SKIP" if "PREFERRED_PNS" in text else "2. FAIL")

# 3. Expand all array
old = '''const all: { pn: string; ft: string; params: string; detailIntro: string; detailFeatures: string }[] = [];
      for (const [slug, v] of Object.entries(products) as any[]) {
        const vendorGroup = ['3peak-analog', '3peak-auto'].includes(String(slug)) ? '3peak' : String(slug);
        if (effectiveVendor && vendorGroup !== effectiveVendor && String(slug) !== effectiveVendor) continue;
        for (const p of (v as any).products) all.push({
          pn: p.part_number,
          ft: (p._features || "").toLowerCase(),
          params: (p._params || ""),
          detailIntro: (p._detail_intro || ""),
          detailFeatures: (p._detail_features || ""),
        });
      }'''
new = '''const all: { pn: string; ft: string; params: string; detailIntro: string; detailFeatures: string; paramsNumeric: any; part_number: string; _features: string; _params: string; _detail_intro: string; _detail_features: string; _params_numeric: any; __vendor: string; __vendorGroup: string; _section: string }[] = [];
      const vendorSlugByPn = new Map<string, string>();
      for (const [slug, v] of Object.entries(products) as any[]) {
        const vendorGroup = ['3peak-analog', '3peak-auto'].includes(String(slug)) ? '3peak' : String(slug);
        if (effectiveVendor && vendorGroup !== effectiveVendor && String(slug) !== effectiveVendor) continue;
        for (const p of (v as any).products) {
          all.push({
            pn: p.part_number,
            ft: (p._features || "").toLowerCase(),
            params: (p._params || ""),
            detailIntro: (p._detail_intro || ""),
            detailFeatures: (p._detail_features || ""),
            paramsNumeric: p._params_numeric || {},
            part_number: p.part_number,
            _features: p._features || "",
            _params: p._params || "",
            _detail_intro: p._detail_intro || "",
            _detail_features: p._detail_features || "",
            _params_numeric: p._params_numeric || {},
            __vendor: String(slug),
            __vendorGroup: vendorGroup,
            _section: p._section || "",
          });
          vendorSlugByPn.set(p.part_number, String(slug));
        }
      }'''
if old in text:
    text = text.replace(old, new); changes += 1; print("3. all array ✓")
else:
    print("3. SKIP" if "vendorSlugByPn" in text else ("3. FAIL - not found"))
    if "vendorSlugByPn" not in text:
        # Try finding the start
        idx = text.find("const all: { pn: string; ft: string; params: string; detailIntro: string; detailFeatures: string }[] = [];")
        if idx >= 0:
            print(f"  Found at byte {idx}")
        else:
            print("  NOT found anywhere")

# 4. Fix requestedTags
old = "const requestedTags: string[] = [...new Set([...features, ...(result.nice || [])])];"
new = "const requestedTags: string[] = result.must || [];\n      const mustMetaByTag = new Map(((result.mustMeta || []) as any[]).map((m: any) => [m.tag, m]));"
if old in text:
    text = text.replace(old, new); changes += 1; print("4. requestedTags ✓")
else:
    print("4. SKIP" if "mustMetaByTag" in text else "4. FAIL")

# 5. Fix semanticHit
old = '''const semanticHit = (p: { ft: string; params?: string; detailIntro?: string; detailFeatures?: string }, feature: string) => {
        const meta = mustMetaByTag.get(feature);
        if (meta) {
          return tagSatisfied({
            _features: p.ft,
            _params: p.params || "",
            _detail_intro: p.detailIntro || "",
            _detail_features: p.detailFeatures || "",
          } as any, feature, meta as any);'''
new = '''const semanticHit = (p: { ft: string; params?: string; detailIntro?: string; detailFeatures?: string; paramsNumeric?: any; _section?: string }, feature: string) => {
        const meta = mustMetaByTag.get(feature);
        if (meta) {
          return tagSatisfied({
            _features: p.ft,
            _params: p.params || "",
            _detail_intro: p.detailIntro || "",
            _detail_features: p.detailFeatures || "",
            _params_numeric: p.paramsNumeric || {},
            _section: p._section || "",
          } as any, feature, meta as any);'''
if old in text:
    text = text.replace(old, new); changes += 1; print("5. semanticHit ✓")
else:
    print("5. SKIP" if "paramsNumeric" in text else "5. FAIL")

# 6. Replace exactMatches early return + full pipeline
old_pipeline = '''if (exactMatches.length > 0 && exactMatches.length <= 10) return NextResponse.json(result);
      
      // 全命中查询只允许"结果太多，建议加参数"，不允许落入"最接近/未完全匹配"话术。
      if (exactMatches.length > 30 && features.length <= 2) {
        const samplePn = exactMatches.slice(0, 3).map(p => p.pn).join("、");
        result.suggestions.push({ text: `匹配${exactMatches.length}款，建议添加具体参数缩小范围。当前结果含${samplePn}等。`, query, reason: "too_many" });
        return NextResponse.json(result);
      }

      if (exactMatches.length > 0 || hasHardConstraints) return NextResponse.json(result);

      // Score products — isolation priority when user asked for it'''
new_pipeline = '''if (exactMatches.length > 0 && exactMatches.length <= 10) {
        // Fall through to constraint pipeline
      }

      // 全命中查询只允许"结果太多，建议加参数"，不允许落入"最接近/未完全匹配"话术。
      if (exactMatches.length > 30 && features.length <= 1) {
        const samplePn = exactMatches.slice(0, 3).map(p => p.pn).join("、");
        result.suggestions.push({ text: `匹配${exactMatches.length}款，建议添加具体参数缩小范围。当前结果含${samplePn}等。`, query, reason: "too_many" });
        return NextResponse.json(result);
      }

      // ── Orphan guard ──
      const orphanTags = (result.must || []).filter((tag: string) =>
        !all.some((p: any) => semanticHit(p, tag))
      );
      if (orphanTags.length > 0 && (result.must || []).length > 0) {
        result.suggestions.push({
          text: `目前没有「${orphanTags.join('、')}」相关产品。可尝试换个关键词。`,
          query, reason: 'no_match'
        });
        return NextResponse.json(result);
      }

      // ── Tiered constraint pipeline ──
      const constrained = applyConstraints(all as any, result.must || [], result.nice || [], result.mustMeta, result.sortKey);
      const scoredExact = constrained.items.map((s: any) => ({
        pn: s.product.part_number || s.product.pn,
        vendor: s.product.__vendor || '',
        tier: constrained.tier,
        hitCount: s.mustHit.length,
        missingTags: s.mustMiss,
        downgradeHits: s.downgradeHits || {},
      }));
      // ── Preferred PNs boost: 霆宝优选料号在同 tier 内置顶 ──
      const isPreferred = (pn: string) => PREFERRED_PNS.has(pn.toUpperCase());
      const preferred = scoredExact.filter((r: any) => isPreferred(r.pn));
      const rest = scoredExact.filter((r: any) => !isPreferred(r.pn));
      (result as any).results = [...preferred, ...rest];
      return NextResponse.json(result);

      // Score products — isolation priority when user asked for it'''

if old_pipeline in text:
    text = text.replace(old_pipeline, new_pipeline); changes += 1; print("6. Pipeline ✓")
else:
    print("6. FAIL - pipeline not found")

# 7. Remove old scoring code
old_scoring_start = "      // Score products — isolation priority when user asked for it"
old_scoring_end = '''    } catch (e) {
      console.error("Suggestion error:", e);
      result.suggestions.push({ text: "未找到完全匹配的产品，请尝试放宽搜索条件", query, reason: "no_match" });
    }'''
if old_scoring_start in text and old_scoring_end in text:
    si = text.find(old_scoring_start)
    ei = text.find(old_scoring_end)
    text = text[:si] + text[ei:]  # Remove scoring code but keep catch block
    changes += 1; print("7. Old scoring removed ✓")
else:
    print("7. FAIL - scoring not found")

# 8. LLM prompt: RMII, BASE-T, few-shot, tags
for old_s, new_s, label in [
    ("- 以太网: 百兆/千兆/2.5G + 接口(RGMII/SGMII/QSGMII) + 端口数",
     "- 以太网: 百兆/千兆/2.5G + 接口(RGMII/RMII/SGMII/QSGMII) + 端口数",
     "8a. RMII"),
    ("- T1单对线: 100Base-T1/1000Base-T1→T1-PHY",
     "- T1单对线: 100Base-T1/1000Base-T1→T1-PHY\n- BASE-T协议里的数字就是速率: 100BASE-T1=100Mbps, 1000BASE-T1=1000Mbps。用户提BASE-T时务必输出对应Mbps值",
     "8b. BASE-T"),
    ('"千兆","100FX"',
     '"千兆","100FX"',
     "8c. skip"),  # already correct
    ("T1-PHY, SGMII, RGMII, QSGMII, 交换机,",
     "T1-PHY, SGMII, RGMII, RMII, QSGMII, USXGMII, 交换机,",
     "8d. tag list"),
    ("Q: 千兆phy 光口\nA: {\"features\":[\"千兆\",\"100FX\"],\"vendor\":null,\"category_hint\":\"以太网\",\"explanation\":\"千兆以太网PHY，光口对应光纤介质\",\"confidence\":\"high\"}\n\n== 意图识别",
     "Q: 千兆phy 光口\nA: {\"features\":[\"千兆\",\"100FX\"],\"vendor\":null,\"category_hint\":\"以太网\",\"explanation\":\"千兆以太网PHY，光口对应光纤介质\",\"confidence\":\"high\"}\n\nQ: 车规 100BASE-T1 RGMII\nA: {\"features\":[\"车规AEC-Q100\",\"100Mbps\",\"T1-PHY\",\"RGMII\"],\"vendor\":null,\"category_hint\":\"以太网\",\"explanation\":\"车规百兆T1以太网PHY，MAC侧RGMII接口\",\"confidence\":\"high\"}\n\n== 意图识别",
     "8e. few-shot"),
]:
    if old_s in text:
        text = text.replace(old_s, new_s); changes += 1; print(f"{label} ✓")
    else:
        print(f"{label} SKIP" if new_s in text else f"{label} FAIL")

# 9. VALID_TAGS
old_v = '"QSGMII","交换机","网卡",'
new_v = '"QSGMII","RMII","USXGMII","交换机","网卡",'
if old_v in text:
    text = text.replace(old_v, new_v); changes += 1; print("9. VALID_TAGS ✓")
else:
    print("9. SKIP" if '"RMII","USXGMII"' in text else "9. FAIL")

with open(path, "w") as f:
    f.write(text)
print(f"\nTotal changes: {changes}")

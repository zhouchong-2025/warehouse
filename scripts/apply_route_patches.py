#!/usr/bin/env python3
"""Apply ALL route.ts patches that were lost."""

with open("/Users/zhouchong/Projects/warehouse/web/app/api/interpret/route.ts", "r") as f:
    text = f.read()

changes = 0

# 1. Expand all array
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
    text = text.replace(old, new); changes += 1; print("1. all array ✓")
else:
    print("1. FAIL - all array")

# 2. Fix requestedTags
old2 = 'const requestedTags: string[] = [...new Set([...features, ...(result.nice || [])])];'
new2 = 'const requestedTags: string[] = result.must || [];\n      const mustMetaByTag = new Map(((result.mustMeta || []) as any[]).map((m: any) => [m.tag, m]));'
if old2 in text:
    text = text.replace(old2, new2); changes += 1; print("2. requestedTags ✓")
else:
    print("2. FAIL")

# 3. Fix semanticHit
old3 = '''const semanticHit = (p: { ft: string; params?: string; detailIntro?: string; detailFeatures?: string }, feature: string) => {
        const meta = mustMetaByTag.get(feature);
        if (meta) {
          return tagSatisfied({
            _features: p.ft,
            _params: p.params || "",
            _detail_intro: p.detailIntro || "",
            _detail_features: p.detailFeatures || "",
          } as any, feature, meta as any);'''
new3 = '''const semanticHit = (p: { ft: string; params?: string; detailIntro?: string; detailFeatures?: string; paramsNumeric?: any; _section?: string }, feature: string) => {
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
if old3 in text:
    text = text.replace(old3, new3); changes += 1; print("3. semanticHit ✓")
else:
    print("3. FAIL")

# 4. Remove exactMatches early return
old4 = "if (exactMatches.length > 0 && exactMatches.length <= 10) return NextResponse.json(result);"
new4 = "if (exactMatches.length > 0 && exactMatches.length <= 10) {\n        // Fall through to constraint pipeline\n      }"
if old4 in text:
    text = text.replace(old4, new4); changes += 1; print("4. exactMatch return ✓")
else:
    print("4. FAIL")

# 5. Replace hardConstraints return + old scoring with pipeline
old5 = "if (exactMatches.length > 0 || hasHardConstraints) return NextResponse.json(result);"
new5 = '''// ── Orphan guard ──
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
      (result as any).results = constrained.items.map((s: any) => ({
        pn: s.product.part_number || s.product.pn,
        vendor: s.product.__vendor || '',
        tier: constrained.tier,
        hitCount: s.mustHit.length,
        missingTags: s.mustMiss,
        downgradeHits: s.downgradeHits || {},
      }));
      return NextResponse.json(result);'''
if old5 in text:
    text = text.replace(old5, new5); changes += 1; print("5. pipeline ✓")
else:
    print("5. FAIL")

# 6. Remove old scoring code
old_start = "      // Score products — isolation priority when user asked for it"
old_end = '''    } catch (e) {
      console.error("Suggestion error:", e);
      result.suggestions.push({ text: "未找到完全匹配的产品，请尝试放宽搜索条件", query, reason: "no_match" });
    }'''
if old_start in text and old_end in text:
    si = text.find(old_start)
    ei = text.find(old_end)
    text = text[:si] + old_end + text[ei+len(old_end):]
    changes += 1; print("6. old scoring removed ✓")
else:
    print("6. FAIL - boundaries not found")

# 7. LLM prompt changes
for old_s, new_s, label in [
    ("- 以太网: 百兆/千兆/2.5G + 接口(RGMII/SGMII/QSGMII) + 端口数",
     "- 以太网: 百兆/千兆/2.5G + 接口(RGMII/RMII/SGMII/QSGMII) + 端口数",
     "7a. prompt RMII"),
    ("- T1单对线: 100Base-T1/1000Base-T1→T1-PHY",
     "- T1单对线: 100Base-T1/1000Base-T1→T1-PHY\n- BASE-T协议里的数字就是速率: 100BASE-T1=100Mbps, 1000BASE-T1=1000Mbps。用户提BASE-T时务必输出对应Mbps值",
     "7b. BASE-T rule"),
    ('Q: 千兆phy 光口\nA: {"features":["千兆","100FX"],"vendor":null,"category_hint":"以太网","explanation":"千兆以太网PHY，光口对应光纤介质","confidence":"high"}',
     'Q: 千兆phy 光口\nA: {"features":["千兆","100FX"],"vendor":null,"category_hint":"以太网","explanation":"千兆以太网PHY，光口对应光纤介质","confidence":"high"}\n\nQ: 车规 100BASE-T1 RGMII\nA: {"features":["车规AEC-Q100","100Mbps","T1-PHY","RGMII"],"vendor":null,"category_hint":"以太网","explanation":"车规百兆T1以太网PHY，MAC侧RGMII接口","confidence":"high"}',
     "7c. few-shot"),
    ("T1-PHY, SGMII, RGMII, QSGMII, 交换机,",
     "T1-PHY, SGMII, RGMII, RMII, QSGMII, USXGMII, 交换机,",
     "7d. tag list"),
]:
    if old_s in text:
        text = text.replace(old_s, new_s); changes += 1; print(f"{label} ✓")
    else:
        print(f"{label} FAIL")

# 8. VALID_TAGS
old8 = '"QSGMII","交换机","网卡",'
new8 = '"QSGMII","RMII","USXGMII","交换机","网卡",'
if old8 in text:
    text = text.replace(old8, new8); changes += 1; print("8. VALID_TAGS ✓")
else:
    print("8. FAIL")

with open("/Users/zhouchong/Projects/warehouse/web/app/api/interpret/route.ts", "w") as f:
    f.write(text)
print(f"\nTotal changes: {changes}")

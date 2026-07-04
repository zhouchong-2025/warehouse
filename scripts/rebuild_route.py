#!/usr/bin/env python3
"""One-shot rebuild of route.ts with all changes."""
path = "/Users/zhouchong/Projects/warehouse/web/app/api/interpret/route.ts"
with open(path, "r") as f:
    text = f.read()

print(f"Starting: {len(text)} chars, {text.count(chr(10))} lines")
changes = 0

# 1. Import applyConstraints
old = "import { tagSatisfied } from './constraint-match';"
new = "import { tagSatisfied, applyConstraints } from './constraint-match';"
if old in text:
    text = text.replace(old, new); changes += 1; print("1. import ✓")
else:
    print("1. SKIP" if "applyConstraints" in text else "1. FAIL")

# 2. Preferred PNs block
old = 'const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";\n\nconst SYSTEM_PROMPT'
new = 'const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";\n\n// ── Preferred PNs (霆宝优选方案) ──\nlet PREFERRED_PNS: Set<string> = new Set();\ntry {\n  const raw = readFileSync(resolve(process.cwd(), "public/data/preferred_pns.json"), "utf-8");\n  const map: Record<string, string> = JSON.parse(raw);\n  PREFERRED_PNS = new Set(Object.keys(map));\n} catch { /* file missing */ }\n\nconst SYSTEM_PROMPT'
if old in text:
    text = text.replace(old, new); changes += 1; print("2. preferred PNs ✓")
else:
    print("2. SKIP" if "PREFERRED_PNS" in text else "2. FAIL")

# 3. Expand all array + vendorSlugByPn
old = 'const all: { pn: string; ft: string; params: string; detailIntro: string; detailFeatures: string }[] = [];\n      for (const [slug, v] of Object.entries(products) as any[]) {\n        const vendorGroup = [\'3peak-analog\', \'3peak-auto\'].includes(String(slug)) ? \'3peak\' : String(slug);\n        if (effectiveVendor && vendorGroup !== effectiveVendor && String(slug) !== effectiveVendor) continue;\n        for (const p of (v as any).products) all.push({\n          pn: p.part_number,\n          ft: (p._features || "").toLowerCase(),\n          params: (p._params || ""),\n          detailIntro: (p._detail_intro || ""),\n          detailFeatures: (p._detail_features || ""),\n        });\n      }'
new = 'const all: { pn: string; ft: string; params: string; detailIntro: string; detailFeatures: string; paramsNumeric: any; part_number: string; _features: string; _params: string; _detail_intro: string; _detail_features: string; _params_numeric: any; __vendor: string; __vendorGroup: string; _section: string }[] = [];\n      const vendorSlugByPn = new Map<string, string>();\n      for (const [slug, v] of Object.entries(products) as any[]) {\n        const vendorGroup = [\'3peak-analog\', \'3peak-auto\'].includes(String(slug)) ? \'3peak\' : String(slug);\n        if (effectiveVendor && vendorGroup !== effectiveVendor && String(slug) !== effectiveVendor) continue;\n        for (const p of (v as any).products) {\n          all.push({\n            pn: p.part_number,\n            ft: (p._features || "").toLowerCase(),\n            params: (p._params || ""),\n            detailIntro: (p._detail_intro || ""),\n            detailFeatures: (p._detail_features || ""),\n            paramsNumeric: p._params_numeric || {},\n            part_number: p.part_number,\n            _features: p._features || "",\n            _params: p._params || "",\n            _detail_intro: p._detail_intro || "",\n            _detail_features: p._detail_features || "",\n            _params_numeric: p._params_numeric || {},\n            __vendor: String(slug),\n            __vendorGroup: vendorGroup,\n            _section: p._section || "",\n          });\n          vendorSlugByPn.set(p.part_number, String(slug));\n        }\n      }'
if old in text:
    text = text.replace(old, new); changes += 1; print("3. all array ✓")
else:
    print("3. FAIL" if "vendorSlugByPn" not in text else "3. SKIP")

# 4. Fix requestedTags
old = 'const requestedTags: string[] = [...new Set([...features, ...(result.nice || [])])];'
new = 'const requestedTags: string[] = result.must || [];\n      const mustMetaByTag = new Map(((result.mustMeta || []) as any[]).map((m: any) => [m.tag, m]));'
if old in text:
    text = text.replace(old, new); changes += 1; print("4. requestedTags ✓")
else:
    print("4. SKIP" if "mustMetaByTag" in text else "4. FAIL")

# 5. Fix semanticHit
old = 'const semanticHit = (p: { ft: string; params?: string; detailIntro?: string; detailFeatures?: string }, feature: string) => {\n        const meta = mustMetaByTag.get(feature);\n        if (meta) {\n          return tagSatisfied({\n            _features: p.ft,\n            _params: p.params || "",\n            _detail_intro: p.detailIntro || "",\n            _detail_features: p.detailFeatures || "",\n          } as any, feature, meta as any);'
new = 'const semanticHit = (p: { ft: string; params?: string; detailIntro?: string; detailFeatures?: string; paramsNumeric?: any; _section?: string }, feature: string) => {\n        const meta = mustMetaByTag.get(feature);\n        if (meta) {\n          return tagSatisfied({\n            _features: p.ft,\n            _params: p.params || "",\n            _detail_intro: p.detailIntro || "",\n            _detail_features: p.detailFeatures || "",\n            _params_numeric: p.paramsNumeric || {},\n            _section: p._section || "",\n          } as any, feature, meta as any);'
if old in text:
    text = text.replace(old, new); changes += 1; print("5. semanticHit ✓")
else:
    print("5. SKIP" if "paramsNumeric" in text else "5. FAIL")

# 6. Pipeline: replace exactMatches return + old scoring with pipeline + preferred
old = 'if (exactMatches.length > 0 && exactMatches.length <= 10) return NextResponse.json(result);\n      \n      // 全命中查询只允许"结果太多，建议加参数"，不允许落入"最接近/未完全匹配"话术。\n      if (exactMatches.length > 30 && features.length <= 2) {\n        const samplePn = exactMatches.slice(0, 3).map(p => p.pn).join("、");\n        result.suggestions.push({ text: `匹配${exactMatches.length}款，建议添加具体参数缩小范围。当前结果含${samplePn}等。`, query, reason: "too_many" });\n        return NextResponse.json(result);\n      }\n\n      if (exactMatches.length > 0 || hasHardConstraints) return NextResponse.json(result);\n\n      // Score products — isolation priority when user asked for it'
new = 'if (exactMatches.length > 0 && exactMatches.length <= 10) {\n        // Fall through to constraint pipeline\n      }\n\n      // 全命中查询只允许"结果太多，建议加参数"——放宽为仅单品类纯泛查\n      if (exactMatches.length > 30 && features.length <= 1) {\n        const samplePn = exactMatches.slice(0, 3).map(p => p.pn).join("、");\n        result.suggestions.push({ text: `匹配${exactMatches.length}款，建议添加具体参数缩小范围。当前结果含${samplePn}等。`, query, reason: "too_many" });\n        return NextResponse.json(result);\n      }\n\n      // ── Orphan guard ──\n      const orphanTags = (result.must || []).filter((tag: string) =>\n        !all.some((p: any) => semanticHit(p, tag))\n      );\n      if (orphanTags.length > 0 && (result.must || []).length > 0) {\n        result.suggestions.push({\n          text: `目前没有「${orphanTags.join(\'、\')}」相关产品。可尝试换个关键词。`,\n          query, reason: \'no_match\'\n        });\n        return NextResponse.json(result);\n      }\n\n      // ── Tiered constraint pipeline ──\n      const constrained = applyConstraints(all as any, result.must || [], result.nice || [], result.mustMeta, result.sortKey);\n      const scoredExact = constrained.items.map((s: any) => ({\n        pn: s.product.part_number || s.product.pn,\n        vendor: s.product.__vendor || \'\',\n        tier: constrained.tier,\n        hitCount: s.mustHit.length,\n        missingTags: s.mustMiss,\n        downgradeHits: s.downgradeHits || {},\n      }));\n      // ── Preferred PNs boost: 霆宝优选料号在同 tier 内置顶 ──\n      const isPreferred = (pn: string) => PREFERRED_PNS.has(pn.toUpperCase());\n      const preferred = scoredExact.filter((r: any) => isPreferred(r.pn));\n      const rest = scoredExact.filter((r: any) => !isPreferred(r.pn));\n      (result as any).results = [...preferred, ...rest];\n      return NextResponse.json(result);\n\n      // Score products — isolation priority when user asked for it'
if old in text:
    text = text.replace(old, new); changes += 1; print("6. pipeline+preferred ✓")
else:
    print("6. FAIL" if "orphan guard" not in text else "6. SKIP")

# 7. Remove old scoring code (between "Score products" marker and the catch block)
old_start = "      // Score products — isolation priority when user asked for it"
old_end = '    } catch (e) {\n      console.error("Suggestion error:", e);\n      result.suggestions.push({ text: "未找到完全匹配的产品，请尝试放宽搜索条件", query, reason: "no_match" });\n    }'
if old_start in text and old_end in text:
    si = text.find(old_start)
    ei = text.find(old_end)
    text = text[:si] + text[ei:]
    changes += 1; print("7. old scoring removed ✓")
else:
    print("7. FAIL" if "Score products" not in text else "7. end marker missing")

# 8. LLM prompt fixes: RMII, BASE-T, few-shot, tag list
for old_s, new_s, label in [
    ("接口(RGMII/SGMII/QSGMII)", "接口(RGMII/RMII/SGMII/QSGMII)", "8a. RMII"),
    ("T1单对线: 100Base-T1/1000Base-T1→T1-PHY\n- 隔离产品",
     "T1单对线: 100Base-T1/1000Base-T1→T1-PHY\n- BASE-T协议里的数字就是速率: 100BASE-T1=100Mbps, 1000BASE-T1=1000Mbps。用户提BASE-T时务必输出对应Mbps值\n- 隔离产品",
     "8b. BASE-T"),
    ('Q: 千兆phy 光口\nA: {"features":["千兆","100FX"],"vendor":null,"category_hint":"以太网","explanation":"千兆以太网PHY，光口对应光纤介质","confidence":"high"}\n\n== 意图识别',
     'Q: 千兆phy 光口\nA: {"features":["千兆","100FX"],"vendor":null,"category_hint":"以太网","explanation":"千兆以太网PHY，光口对应光纤介质","confidence":"high"}\n\nQ: 车规 100BASE-T1 RGMII\nA: {"features":["车规AEC-Q100","100Mbps","T1-PHY","RGMII"],"vendor":null,"category_hint":"以太网","explanation":"车规百兆T1以太网PHY，MAC侧RGMII接口","confidence":"high"}\n\n== 意图识别',
     "8c. few-shot"),
    ("T1-PHY, SGMII, RGMII, QSGMII, 交换机,",
     "T1-PHY, SGMII, RGMII, RMII, QSGMII, USXGMII, 交换机,",
     "8d. tag list"),
    ('"QSGMII","交换机","网卡",',
     '"QSGMII","RMII","USXGMII","交换机","网卡",',
     "8e. VALID_TAGS"),
]:
    if old_s in text:
        text = text.replace(old_s, new_s); changes += 1; print(f"{label} ✓")
    else:
        print(f"{label} SKIP" if new_s in text else f"{label} FAIL")

with open(path, "w") as f:
    f.write(text)
print(f"\nDone: {changes} changes, {len(text)} chars, {text.count(chr(10))} lines")

"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { expandSearch } from "@/lib/synonyms";
import { applyConstraints, scoreByConstraints, describeMatch, crossRefSearch, tagSatisfied, type ConstraintScore, type CrossRefHit } from "@/app/api/interpret/constraint-match";
import SearchBar from "@/app/components/SearchBar";
import ResultsList from "@/app/components/ResultsList";
import ComparePanel from "@/app/components/ComparePanel";
import {
  type Product,
  type VendorData,
  type SearchResult,
  type VendorFilterOption,
  type LLMInterpretation,
  getDisplayParams,
  getEvidenceSources,
  getCategoryBadge,
  CATEGORY_BADGE_SET,
} from "@/app/product-utils";

const VENDOR_GROUPS = [
  { key: "3peak", name: "思瑞浦", slugs: ["3peak-analog", "3peak-auto"] },
] as const;

function vendorMatchesFilter(vendorSlug: string, activeVendor: string | null, vendorFilters: VendorFilterOption[]): boolean {
  if (!activeVendor) return true;
  const filter = vendorFilters.find((v) => v.key === activeVendor);
  return filter ? filter.slugs.includes(vendorSlug) : vendorSlug === activeVendor;
}

function vendorGroupKey(vendorSlug: string): string {
  const group = VENDOR_GROUPS.find((g) => (g.slugs as readonly string[]).includes(vendorSlug));
  return group ? group.key : vendorSlug;
}

// 约束层灰度门控: 仅对"已验证数据标签质量"的品类启用约束层(must硬过滤+降级+sortKey排序).
// 验证记录: 以太网(裕太微68款) / 电源·放大器·接口·数据转换(思瑞浦模拟894款) / 驱动(173款,跨3vendor) 已压测通过.
// 2026-06-12 推广: 隔离(数字隔离器81款, 数据速率47/81; category_hint='隔离'经验证仅落数字隔离器, 不与已推广品类冲突).
// 模块级单一真源: results 初筛召回 与 isConstrainedQuery 共用, 避免非约束品类被误放宽初筛.
const CONSTRAINED_CATEGORIES = new Set(["以太网", "电源", "电源保护", "放大器", "比较器", "接口", "隔离接口", "数据转换", "驱动", "隔离", "IO", "电压基准"]);

export default function Home() {
  const [data, setData] = useState<Record<string, VendorData>>({});
  const [search, setSearch] = useState("");
  const [activeVendor, setActiveVendor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [llmResult, setLlmResult] = useState<LLMInterpretation>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [compareList, setCompareList] = useState<string[]>([]);
  const [preferredPns, setPreferredPns] = useState<Set<string>>(new Set());

  const toggleCompare = (part: string) => {
    setCompareList((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
    );
  };

  const applySuggestion = (query: string) => {
    if (!query.trim()) return;
    setSearch(query);
    setSearchTrigger((c) => c + 1);
  };

  useEffect(() => {
    fetch("/data/products_structured.json")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
    // Load preferred PNs (霆宝优选)
    fetch("/data/preferred_pns.json")
      .then((r) => r.json())
      .then((map) => {
        const pns = new Set<string>(Object.keys(map).map(k => k.toUpperCase()));
        setPreferredPns(pns);
      })
      .catch(() => {});
  }, []);

  // Shared fetch function
  const doSearch = async (query: string) => {
    if (!query.trim() || query.trim().length < 3) {
      setLlmResult(null);
      return;
    }
    setLlmLoading(true);
    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), vendor: activeVendor }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.error) setLlmResult(data);
      }
    } catch {} 
    finally { setLlmLoading(false); }
  };

  // Debounced auto-search on typing
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim() || search.trim().length < 3) {
      setLlmResult(null);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(search), 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Immediate search on button/Enter
  useEffect(() => {
    if (searchTrigger > 0 && search.trim().length >= 3) {
      doSearch(search);
    }
  }, [searchTrigger]);

  const vendors: VendorFilterOption[] = useMemo(() => {
    const entries = Object.entries(data).filter(([k]) => !String(k).startsWith('_'));
    const groupedSlugs = new Set<string>();
    const filters: VendorFilterOption[] = [];

    for (const group of VENDOR_GROUPS) {
      const present = group.slugs.filter((slug) => data[slug]);
      if (!present.length) continue;
      present.forEach((slug) => groupedSlugs.add(slug));
      filters.push({
        key: group.key,
        name: group.name,
        productCount: present.reduce((sum, slug) => sum + (data[slug]?.productCount || 0), 0),
        slugs: present,
      });
    }

    for (const [slug, v] of entries) {
      if (groupedSlugs.has(slug)) continue;
      filters.push({
        key: slug,
        name: v.name,
        productCount: v.productCount,
        slugs: [slug],
      });
    }

    return filters;
  }, [data]);

  // Build flat product list
  const allProducts = useMemo(() => {
    const all: { vendor: string; vendorName: string; product: Product }[] = [];
    for (const [slug, v] of Object.entries(data).filter(([k]) => !String(k).startsWith('_'))) {
      for (const p of v.products) {
        all.push({ vendor: slug, vendorName: v.name, product: p });
      }
    }
    return all;
  }, [data]);

  // Scored search with term matching
  const results = useMemo(() => {
    // Clean input: strip punctuation, normalize whitespace, lowercase
    const clean = (s: string) =>
      s
        // Systematic mixed-script normalization:
        // users often type queries like “MEMS麦克风 / CAN收发器 / I2S接口” without spaces,
        // while product text is extracted as "MEMS 麦克风 / CAN 收发器 / I2S 接口".
        // Insert spaces only at ASCII-letter↔CJK boundaries (not pure digit↔CJK, so "16通道" stays intact).
        .replace(/([A-Za-z][A-Za-z0-9+-]*)([\u4e00-\u9fff])/g, "$1 $2")
        .replace(/([\u4e00-\u9fff])([A-Za-z][A-Za-z0-9+-]*)/g, "$1 $2")
        .replace(/[，,、。．.；;：:！!？?（）()【】\[\]『』""'']/g, " ")
        .replace(/[吗呢啊吧呀嘛哦哈]/g, " ")  // 中文语气词/疑问词 → 非检索语义
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    
    const q = clean(search);
    if (!q) return null;

    const expandedQ = expandSearch(q);
    const allTerms = expandedQ.split(/\s+/).filter(Boolean);
    
    // Split into "must match" (original terms) and "boost" (synonym terms)
    const originalTerms = q.split(/\s+/).filter(Boolean);
    // Also try matching common natural language wrappers like "支持X" → "X"
    const unwrappedTerms = originalTerms.map((t) =>
      t.replace(/^(支持|需要|要求|寻找|找|要|带|有)/, "")
    );
    const phraseQuery = originalTerms.length > 1 ? q : "";
    const boostTerms = allTerms.filter((t) => !originalTerms.includes(t));

    // 约束品类召回: 当约束层将接管此查询时, 初筛只需保证 must 的【品类维度】标签命中,
    // 不要求 nice/sortKey 派生标签(如"高速(≥50MHz)")字面命中——那些是排序意图, 产品文档不会字面写,
    // 强行参与 AND 文本初筛会把整个结果集滤空(2026-06-12 "高速栅极驱动"零结果根因). 过滤交约束层.
    // 门控: 仅约束品类放宽; 非约束品类走老逻辑不受影响.
    const willConstrain = !!(llmResult?.must && llmResult.must.length > 0 &&
      llmResult.category_hint && CONSTRAINED_CATEGORIES.has(llmResult.category_hint));
    const mustCategoryTags: string[] = willConstrain
      ? llmResult!.must!.filter((t) => {
          const m = llmResult!.mustMeta?.find((mm) => mm.tag === t);
          return !m || m.dimension === "category" || m.dimension === "media";
        }).map((t) => t.toLowerCase())
      : [];

    const scored: SearchResult[] = [];

    for (const { vendor, vendorName, product } of allProducts) {
      if (!vendorMatchesFilter(vendor, activeVendor, vendors)) continue;

      const searchable = Object.values(product)
        .filter((v): v is string => typeof v === "string")
        .join(" ")
        .toLowerCase();

      const matched: string[] = [];
      let score = 0;

      // MUST match ALL original terms (AND logic) — no false positives
      // Exception: if phrase query matches entirely, that counts
      const phraseMatched = phraseQuery && searchable.includes(phraseQuery);
      
      let allOriginalMatched = true;
      for (let i = 0; i < originalTerms.length; i++) {
        const term = originalTerms[i];
        const unwrapped = unwrappedTerms[i];
        // Try original term first, then unwrapped version
        const effectiveTerm = searchable.includes(term) ? term : 
                              (unwrapped !== term && searchable.includes(unwrapped) ? unwrapped : null);
        
        if (effectiveTerm) {
          matched.push(effectiveTerm);
          const partField = (product.part_number + " " + (product._section || "") + " " + (product._features || "")).toLowerCase();
          score += partField.includes(effectiveTerm) ? 3 : 1;
          // Exact PN match or PN prefix match → huge boost
          const pnLower = product.part_number.toLowerCase();
          if (pnLower === effectiveTerm) score += 100;
          else if (pnLower.startsWith(effectiveTerm)) score += 50;
        } else {
          allOriginalMatched = false;
        }
      }

      // Product qualifies only if: all original terms match, OR phrase query matches,
      // OR LLM high-confidence features ALL match (enforce every constraint)
      const llmAllMatched = llmResult?.confidence === "high" && llmResult.features.length > 0 &&
        llmResult.features.every((f) => {
          const ft = f.toLowerCase();
          // Word-boundary match: split searchable into tokens, check exact token match
          const tokens = searchable.split(/\s+/);
          return tokens.includes(ft);
        });
      
      // 约束品类召回通路: 产品 _features 含全部 must 品类标签即通过初筛(放宽 AND 文本匹配).
      // 仅 willConstrain 时 mustCategoryTags 非空; 召回后由约束层做 must 硬过滤 + sortKey 排序.
      const mustCategoryMatched = mustCategoryTags.length > 0 && (() => {
        return llmResult!.must!.every((mt) => {
          const meta = llmResult!.mustMeta?.find((mm) => mm.tag === mt);
          if (meta && meta.dimension !== "category" && meta.dimension !== "media") return true;
          return tagSatisfied(product, mt, meta);
        });
      })();

      // Lightweight category guard (ALL queries, not just constrained):
      // if parser identified a category, product MUST carry it in _features.
      // Prevents "八切一开关" from returning ADC, "高边开关" from returning 模拟开关, etc.
      const categoryMustTags = (llmResult?.mustMeta ?? [])
        .filter(m => m.dimension === 'category')
        .map(m => m.tag.toLowerCase());
      if (categoryMustTags.length > 0 &&
          !categoryMustTags.some(ct => (product._features || '').toLowerCase().split(/\s+/).includes(ct))) continue;

      if (!allOriginalMatched && !phraseMatched && !llmAllMatched && !mustCategoryMatched) continue;

      // Score boost terms (synonyms add weight)
      for (const term of boostTerms) {
        if (searchable.includes(term)) {
          matched.push(term);
          score += 0.5;
        }
      }

      // Bonus for matching many terms
      score += matched.length * 0.5;

      // LLM-interpreted features get high bonus; ALL matched = huge priority
      if (llmResult?.features && llmResult.features.length > 0) {
        let llmMatchCount = 0;
        for (const ft of llmResult.features) {
          if (searchable.includes(ft.toLowerCase())) {
            matched.push("🤖 " + ft);
            llmMatchCount++;
            score += 3;
          }
        }
        // Products matching ALL LLM features get massive priority boost
        if (llmMatchCount === llmResult.features.length) {
          score += 20; // "perfect fit" bonus
        }
      }

      if (matched.length > 0) {
        scored.push({ vendor, vendorName, product, score, matchedTerms: matched });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [allProducts, search, activeVendor, llmResult, vendors]);

  // Filter products by exclude_tags from parser/LLM response (single source of truth)
  const filteredResults = results && llmResult?.exclude_tags?.length
    ? results.filter(r => {
        const tokens = (r.product._features || '').toLowerCase().split(/\s+/);
        const excludeSet = new Set(llmResult.exclude_tags!.map(t => t.toLowerCase()));
        return !tokens.some(t => excludeSet.has(t));
      })
    : results;

  // ── 约束层: must/nice 硬过滤 + 三级降级 ──
  // 门控常量 CONSTRAINED_CATEGORIES 已提升到模块级(见文件顶部), results 初筛召回与此处共用单一真源.
  const isConstrainedQuery = !!(llmResult?.must && llmResult.must.length > 0 && llmResult.category_hint && CONSTRAINED_CATEGORIES.has(llmResult.category_hint));
  const constraintView = useMemo(() => {
    if (!llmResult?.must || llmResult.must.length === 0) return null;
    // API already determined no_match → skip client-side constraints, show empty
    const hasNoMatch = (llmResult.suggestions || []).some((s: any) => s.reason === 'no_match');
    if (hasNoMatch) return { tier: null, banner: '', items: [] };
    const must = llmResult.must;
    const nice = llmResult.nice || [];
    const mustMeta = llmResult.mustMeta || [];
    const sortKey = llmResult.sortKey;

    // ★ 约束层激活时使用全量产品(过滤vendor), 不做 textSearch 初筛
    //   因为数值阈值判断(如 Iout>=1A / Vin covers 5V)在 tagSatisfied 中通过
    //   _params_numeric 比较完成, 而 textSearch 的裸字符串 includes("1a") 无法
    //   处理 "iout_3a"(3A≥1A 应通过) 这类语义.
    const excludeSet = new Set((llmResult.exclude_tags || []).map((t: string) => t.toLowerCase()));
    const vendorPool = allProducts
      .filter(r => vendorMatchesFilter(r.vendor, activeVendor, vendors))
      .filter(r => {
        if (excludeSet.size === 0) return true;
        const tokens = (r.product._features || '').toLowerCase().split(/\\s+/);
        return !tokens.some(t => excludeSet.has(t));
      })
      .map(r => ({
        ...r.product,
        part_number: r.product.part_number,  // 显式保留
        __vendor: r.vendor,
        __vendorGroup: vendorGroupKey(r.vendor),
      }));

    const constrainedResult = isConstrainedQuery
      ? applyConstraints(vendorPool, must, nice, mustMeta, sortKey, search)
      : null;
    const has2_5G = (s: ConstraintScore) =>
      (s.product._features || '').toLowerCase().split(/\s+/).includes('2.5g');
    const items = constrainedResult
      ? [...constrainedResult.items.filter(s => s.categoryHit)]
          .sort((a, b) =>
            (b.fullMatch ? 1 : 0) - (a.fullMatch ? 1 : 0)
            || a.mustMiss.length - b.mustMiss.length
            || b.exactBonus - a.exactBonus
            || b.niceHit.length - a.niceHit.length
            || b.score - a.score
            || ((preferredPns.has(b.product.part_number?.toUpperCase() || '') ? 1 : 0)
                - (preferredPns.has(a.product.part_number?.toUpperCase() || '') ? 1 : 0))
            || ((has2_5G(a) ? 1 : 0) - (has2_5G(b) ? 1 : 0))
          )
    : scoreByConstraints(vendorPool, must, nice, mustMeta, search)
        .filter(s => s.categoryHit)
        .sort((a, b) =>
          (b.fullMatch ? 1 : 0) - (a.fullMatch ? 1 : 0)
          || (b.categoryHit ? 1 : 0) - (a.categoryHit ? 1 : 0)
          || a.mustMiss.length - b.mustMiss.length
          || b.exactBonus - a.exactBonus
          || b.niceHit.length - a.niceHit.length
          || b.score - a.score
          || ((preferredPns.has(b.product.part_number?.toUpperCase() || '') ? 1 : 0)
              - (preferredPns.has(a.product.part_number?.toUpperCase() || '') ? 1 : 0))
          || ((has2_5G(a) ? 1 : 0) - (has2_5G(b) ? 1 : 0))
        );
    // Debug: preferred PN sorting
    if (items.length > 0 && preferredPns.size > 0) {
      console.log('[preferred] loaded', preferredPns.size, 'PNs, first 3 results:',
        items.slice(0, 5).map(s => ({
          pn: s.product.part_number,
          preferred: preferredPns.has((s.product.part_number || '').toUpperCase()),
          score: s.score, fullMatch: s.fullMatch, mustMiss: s.mustMiss.length
        })));
    }
    const vendorByPn = new Map(vendorPool.map(r => [r.part_number, { vendor: r.__vendor, vendorName: (data[r.__vendor] as VendorData)?.name || '' }]));
    return { items, vendorByPn, niceRequested: nice, tier: constrainedResult?.tier ?? null, banner: constrainedResult?.banner ?? '' };
  }, [isConstrainedQuery, allProducts, activeVendor, vendors, llmResult, data, preferredPns]);

  // ── 竞品型号反查(cross_ref): 扫全库"可替代产品"字段, 确定性检索 ──
  // 不走文本初筛(竞品型号在可替代产品字段, 非常规 searchable), 直接全库 crossRefSearch.
  const crossRef = useMemo(() => {
    if (llmResult?.intent !== 'cross_ref' || !llmResult.crossRefTarget) return null;
    const prods = allProducts.map(r => r.product);
    const hits = crossRefSearch(prods as any, llmResult.crossRefTarget);
    const vendorByPn = new Map(allProducts.map(r => [r.product.part_number, { vendor: r.vendor, vendorName: r.vendorName }]));
    return { target: llmResult.crossRefTarget, hits, vendorByPn };
  }, [llmResult, allProducts]);

  // 最终展示列表: cross_ref反查 > 约束层 > 老逻辑
  const displayResults: SearchResult[] = crossRef
    ? crossRef.hits.map((h: CrossRefHit) => {
        const v = crossRef.vendorByPn.get(h.product.part_number || "") || { vendor: "", vendorName: "" };
        return {
          vendor: v.vendor,
          vendorName: v.vendorName,
          product: h.product as Product,
          score: h.matchType === 'exact' ? 100 : 80,
          matchedTerms: [`可替代 ${crossRef.target}`, h.matchType === 'exact' ? '精确对标' : '系列对标'],
        };
      })
    : constraintView
    ? (() => {
        const base = constraintView.items.map((s: ConstraintScore) => {
          const v = constraintView.vendorByPn?.get(s.product.part_number || "") || { vendor: "", vendorName: "" };
          const missingNice = (constraintView.niceRequested || []).filter((tag) => !s.niceHit.includes(tag));
          const missingTerms = [...s.mustMiss, ...missingNice];
          const matchedCount = s.mustHit.length + s.niceHit.length;
          const totalRequested = s.mustHit.length + s.mustMiss.length + (constraintView.niceRequested || []).length;
          const matchedAll = [...s.mustHit, ...s.niceHit];
          const nicePartial = s.mustMiss.length === 0 && missingNice.length > 0;
          return {
            vendor: v.vendor,
            vendorName: v.vendorName,
            product: s.product as Product,
            score: s.score,
            matchedTerms: matchedAll,
            missingTerms,
            missingNice,
            matchSummary: totalRequested > 0 ? `${matchedCount}/${totalRequested} 条件` : undefined,
            referenceOnly: s.mustMiss.length > 0,
            nicePartial,
            evidence: getEvidenceSources(s.product as Product, matchedAll),
            downgradeHits: s.downgradeHits || {},
          };
        });
        // Merge API near-miss results (tier=0): enrich existing referenceOnly items with Rdson
        const apiResults = (llmResult as any)?.results || [];
        const apiNearMiss = apiResults.filter((r: any) => r.tier === 0 && r.rdson);
        const enrichedPns = new Set<string>();
        for (const item of base) {
          if (!item.referenceOnly) continue;
          const nr = apiNearMiss.find((r: any) => r.pn === item.product.part_number);
          if (nr) {
            item.matchSummary = `Rdson=${nr.rdson}，电流能力待FAE确认`;
            item.missingTerms = ['Iout数据未收录'];
            (item as any).faeNearMiss = true;
            enrichedPns.add(nr.pn);
          }
        }
        // Safety net: push any near-miss products not already in base
        for (const nr of apiNearMiss) {
          if (enrichedPns.has(nr.pn)) continue;
          const ap = allProducts.find(a => a.product.part_number === nr.pn);
          if (!ap) continue;
          base.push({
            vendor: (nr.vendor || ap.vendor) as string,
            vendorName: ap.vendorName,
            product: ap.product,
            score: 0,
            matchedTerms: (llmResult?.must || []).filter((t: string) => !t.startsWith('Iout_')),
            missingTerms: ['Iout数据未收录'],
            missingNice: [],
            nicePartial: false,
            matchSummary: `Rdson=${nr.rdson}，电流能力待FAE确认`,
            referenceOnly: true,
            evidence: [],
            downgradeHits: {} as Record<string, string>,
          });
        }
        return base;
      })()
    : (filteredResults || []);

  const visibleSuggestions = useMemo(() => {
    const suggestions = llmResult?.suggestions || [];
    // Always show no_match — user asked for something that doesn't exist
    const noMatch = suggestions.filter((s) => s.reason === 'no_match');
    if (noMatch.length > 0) return noMatch;
    if (!constraintView || constraintView.tier !== 1) return suggestions;
    return suggestions.filter((s) => s.reason === 'too_many' || s.reason === 'data_missing' || s.reason === 'llm_rescue' || s.reason === 'fae_near_miss');
  }, [llmResult, constraintView]);

  const totalProducts = vendors.reduce((s, v) => s + v.productCount, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#0d1117]">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0d1117]/90 border-b border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1e6ef0] to-[#58a6ff] flex items-center justify-center text-white font-bold text-sm">TP</div>
            <div>
              <h1 className="text-lg font-bold text-white">Teampo 选型平台</h1>
              <p className="text-xs text-[#8b949e] hidden sm:block">Teampo 选型平台 · {totalProducts} 产品 · {vendors.length} 厂商</p>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/compare" className="text-[#58a6ff] hover:text-white transition-colors">对比</a>
          </nav>
        </div>
      </header>

      <SearchBar
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={() => setSearchTrigger(c => c + 1)}
        llmLoading={llmLoading}
        llmResult={llmResult}
        totalProducts={totalProducts}
        vendorCount={vendors.length}
      />

      <ResultsList
        loading={loading}
        results={results}
        displayResults={displayResults}
        constraintView={constraintView}
        llmResult={llmResult}
        crossRef={crossRef}
        search={search}
        visibleSuggestions={visibleSuggestions}
        onApplySuggestion={applySuggestion}
        compareList={compareList}
        onToggleCompare={toggleCompare}
        preferredPns={preferredPns}
        vendors={vendors}
        totalProducts={totalProducts}
        activeVendor={activeVendor}
        onVendorChange={setActiveVendor}
      />

      <ComparePanel
        compareList={compareList}
        allProducts={allProducts}
        onToggleCompare={toggleCompare}
        onClear={() => setCompareList([])}
      />

      <footer className="border-t border-[#30363d] py-6 text-center text-xs text-[#484f58]">
        Teampo · {totalProducts} products · {vendors.length} vendors · 智能语义搜索
      </footer>

      {/* Teampo Intelligence badge */}
      <div className="fixed bottom-4 right-4 z-50 bg-gradient-to-r from-[#1e6ef0]/15 to-[#58a6ff]/10 border border-[#1e6ef0]/30 rounded-lg px-3.5 py-1.5 text-[11px] text-[#58a6ff] backdrop-blur-sm tracking-wide select-none pointer-events-none">
        ⚡ Teampo Intelligence v1.0
      </div>
    </div>
  );
}

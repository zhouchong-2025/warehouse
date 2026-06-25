"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { expandSearch } from "@/lib/synonyms";
import { applyConstraints, scoreByConstraints, describeMatch, crossRefSearch, tagSatisfied, type ConstraintScore, type CrossRefHit } from "@/app/api/interpret/constraint-match";

type Product = Record<string, string>;
type VendorData = { name: string; productCount: number; products: Product[] };

type SearchResult = {
  vendor: string;
  vendorName: string;
  product: Product;
  score: number;
  matchedTerms: string[];
  missingTerms?: string[];
  matchSummary?: string;
  referenceOnly?: boolean;
  evidence?: { term: string; source: string }[];
  downgradeHits?: Record<string, string>;  // 降级匹配: tag → 实际值
};

type VendorFilterOption = {
  key: string;
  name: string;
  productCount: number;
  slugs: string[];
};

type LLMInterpretation = {
  features: string[];
  vendor: string | null;
  category_hint: string | null;
  explanation: string;
  confidence: string;
  suggestions?: { text: string; query: string; reason: string }[];
  exclude_tags?: string[];
  must?: string[];
  nice?: string[];
  mustMeta?: import("@/app/api/interpret/constraint-match").MustConstraint[];
  sortKey?: import("@/app/api/interpret/constraint-match").SortIntent;
  intent?: 'spec_search' | 'cross_ref';
  crossRefTarget?: string;
} | null;

const CATEGORY_BADGE_PRIORITY = [
  "隔离栅极驱动", "非隔离栅极驱动", "栅极驱动", "数字隔离器", "隔离电源", "隔离放大器",
  "马达驱动", "模拟开关", "电平转换", "IO扩展器", "IO扩展", "交换机", "网卡", "以太网供电",
  "CAN-FD", "LIN", "RS-485", "RS-232", "MLVDS", "SBC",
  "DCDC", "降压", "升压", "LDO", "电压基准", "ADC", "DAC",
  "比较器", "运放", "放大器",
  "电流传感器", "温度传感器", "压力传感器", "线性位置传感器", "磁阻角度编码器", "霍尔角度编码器",
  "磁阻开关/锁存器", "霍尔开关/锁存器", "位置传感器", "速度传感器",
  "负载开关", "高边开关", "高边驱动", "电源时序", "复位芯片", "电子保险丝", "理想二极管",
  "电池监控", "BMS", "传感器接口", "匹配电阻", "视频滤波", "音频功放", "音频总线", "逻辑门",
] as const;

const CATEGORY_BADGE_SET = new Set<string>(CATEGORY_BADGE_PRIORITY);

const VENDOR_GROUPS = [
  { key: "3peak", name: "思瑞浦", slugs: ["3peak-analog", "3peak-auto"] },
] as const;

function getCategoryBadge(product: Product): string {
  const tokens = (product._features || "").split(/\s+/).filter(Boolean);
  for (const tag of CATEGORY_BADGE_PRIORITY) {
    if (tokens.includes(tag)) return tag;
  }
  return (product._section || "").trim();
}

// 2026-06-16: 追踪标签匹配的证据来源
function getEvidenceSources(product: Product, matchedTerms: string[]): { term: string; source: string }[] {
  const evidence: { term: string; source: string }[] = [];
  const detailIntro = (product._detail_intro || "").toLowerCase();
  const detailFeatures = (product._detail_features || "").toLowerCase();
  const params = (product._params || "").toLowerCase();
  const section = (product._section || "").toLowerCase();
  const features = (product._features || "").toLowerCase();

  for (const term of matchedTerms) {
    const t = term.toLowerCase();
    const sources: string[] = [];

    // Check detail fields first (most valuable evidence for tech tags)
    if (detailIntro.length > 10 && (detailIntro.includes(t) || detailFeatures.includes(t))) {
      // More specific detection for tech terms
      const techTerms: Record<string, RegExp> = {
        '霍尔': /(?:线性)?霍尔|hall\s*effect/i,
        '磁阻': /tmr|amr|磁阻|magnetoresistive/i,
        'SIC': /\bsic\b|signal.improvement/i,
        '特定帧唤醒': /selective\s*wake|partial\s*network|特定帧唤醒/i,
      };
      const techRe = techTerms[term];
      const target = detailIntro + ' ' + detailFeatures;
      if (techRe && techRe.test(target)) {
        sources.push('产品介绍');
      } else {
        sources.push('产品介绍');
      }
    }

    // Check params
    if (params.length > 5 && params.includes(t)) {
      sources.push('参数表');
    }

    // Check section (authoritative for category)
    if (section.length > 3 && section.includes(t)) {
      sources.push('选型表');
    }

    // Features always （作为默认）
    if (features.includes(t)) {
      sources.push('产品标签');
    }

    evidence.push({
      term,
      source: sources[0] || '产品标签',  // 优先展示最有价值的来源
    });
  }
  return evidence;
}

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
    const entries = Object.entries(data);
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
    for (const [slug, v] of Object.entries(data)) {
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
      ? applyConstraints(vendorPool, must, nice, mustMeta, sortKey)
      : null;
    const items = constrainedResult
      ? constrainedResult.items.filter(s => s.categoryHit)  // 约束路径也必须命中品类标签
    : scoreByConstraints(vendorPool, must, nice, mustMeta)
        .filter(s => s.categoryHit)  // 非约束路径必须命中品类标签
        .sort((a, b) =>
          (b.fullMatch ? 1 : 0) - (a.fullMatch ? 1 : 0)
          || (b.categoryHit ? 1 : 0) - (a.categoryHit ? 1 : 0)
          || a.mustMiss.length - b.mustMiss.length
          || b.exactBonus - a.exactBonus
          || b.niceHit.length - a.niceHit.length
          || b.score - a.score
        );
    const vendorByPn = new Map(vendorPool.map(r => [r.part_number, { vendor: r.__vendor, vendorName: (data[r.__vendor] as VendorData)?.name || '' }]));
    return { items, vendorByPn, niceRequested: nice, tier: constrainedResult?.tier ?? null, banner: constrainedResult?.banner ?? '' };
  }, [isConstrainedQuery, allProducts, activeVendor, vendors, llmResult, data]);

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
    ? constraintView.items.map((s: ConstraintScore) => {
        const v = constraintView.vendorByPn.get(s.product.part_number || "") || { vendor: "", vendorName: "" };
        const missingNice = constraintView.niceRequested.filter((tag) => !s.niceHit.includes(tag));
        const missingTerms = [...s.mustMiss, ...missingNice];
        const matchedCount = s.mustHit.length + s.niceHit.length;
        const totalRequested = s.mustHit.length + s.mustMiss.length + constraintView.niceRequested.length;
        const matchedAll = [...s.mustHit, ...s.niceHit];
        return {
          vendor: v.vendor,
          vendorName: v.vendorName,
          product: s.product as Product,
          score: s.score,
          matchedTerms: matchedAll,
          missingTerms,
          matchSummary: totalRequested > 0 ? `${matchedCount}/${totalRequested} 条件` : undefined,
          referenceOnly: missingTerms.length > 0,
          evidence: getEvidenceSources(s.product as Product, matchedAll),
          downgradeHits: s.downgradeHits || {},
        };
      })
    : (filteredResults || []);

  const visibleSuggestions = useMemo(() => {
    const suggestions = llmResult?.suggestions || [];
    if (!constraintView || constraintView.tier !== 1) return suggestions;
    return suggestions.filter((s) => s.reason === 'too_many');
  }, [llmResult, constraintView]);

  const totalProducts = vendors.reduce((s, v) => s + v.productCount, 0);

  // Get displayable params for a product
  const getDisplayParams = (p: Product): [string, string][] => {
    const parsedParams: [string, string][] = (p._params || "")
      .split(" | ")
      .map((pair): [string, string] | null => {
        const idx = pair.indexOf(": ");
        if (idx <= 0) return null;
        return [pair.slice(0, idx).trim(), pair.slice(idx + 2).trim()];
      })
      .filter((x): x is [string, string] => !!x && !!x[1]);

    const preferredParamOrder = [
      "供电电压(V)", "VIO 电压(V)", "输入电压", "工作电压 (V)", "工作电压(V)",
      "最大工作速率 （Mbps)", "最大工作速率(Mbps)", "低功耗模式", "封装类型", "封装", "MSL",
      "工作温度范围 (℃)", "工作温度 (℃)", "AEC-Q100",
    ];
    const chosen: [string, string][] = [];
    const seen = new Set<string>();
    for (const key of preferredParamOrder) {
      const hit = parsedParams.find(([k]) => k === key);
      if (hit && !seen.has(hit[0])) {
        chosen.push(hit);
        seen.add(hit[0]);
      }
    }
    for (const pair of parsedParams) {
      if (!seen.has(pair[0])) {
        chosen.push(pair);
        seen.add(pair[0]);
      }
      if (chosen.length >= 6) break;
    }
    if (chosen.length > 0) return chosen.slice(0, 6);

    const priority = [
      "_section", "package", "封装", "status", "状态", "supply_v_min", "supply_v_max",
      "gbw_mhz", "channels", "rating", "temp_range", "工作温度",
      "description", "产品描述", "category", "process_node", "ports",
    ];
    const params: [string, string][] = [];
    for (const key of priority) {
      if (p[key] && p[key].length < 60) {
        params.push([key.replace(/_/g, " "), p[key]]);
      }
    }
    for (const [k, v] of Object.entries(p)) {
      if (!priority.includes(k) && v && v.length < 40 && k !== "part_number" && k !== "vendor_section" && !k.startsWith("param_")) {
        if (params.length < 8) params.push([k.replace(/_/g, " "), v]);
      }
    }
    return params.slice(0, 6);
  };

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

      {/* Hero + Search */}
      <section className="relative overflow-hidden border-b border-[#30363d]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e6ef0]/10 via-transparent to-[#58a6ff]/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-20 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold mb-4">
            <span className="text-gradient">Teampo</span>
            <span className="text-white"> 选型平台</span>
          </h2>
          <p className="text-[#8b949e] text-lg max-w-2xl mx-auto mb-8">
            纳芯微 · 思瑞浦 · 裕太微 — {totalProducts} 个芯片，智能评分排序
          </p>
          <div className="max-w-xl mx-auto relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索型号、参数或销售用语，如 CAN-FD 特定帧唤醒..."
              className="w-full px-5 py-3.5 pr-12 rounded-xl bg-[#161b22] border border-[#30363d] text-white placeholder-[#484f58] focus:outline-none focus:border-[#1e6ef0] focus:ring-2 focus:ring-[#1e6ef0]/20 text-base transition-all"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && search.trim()) setSearchTrigger(c => c + 1); }}
            />
            <button
              onClick={() => {
                if (search.trim().length >= 3) setSearchTrigger(c => c + 1);
              }}
              disabled={llmLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-[#1e6ef0]/10 hover:bg-[#1e6ef0]/20 border border-[#1e6ef0]/30 hover:border-[#1e6ef0]/50 transition-all disabled:opacity-50"
              title="搜索"
            >
              {llmLoading ? (
                <div className="w-4 h-4 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4 text-[#58a6ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </button>
          </div>
          {/* Synonym hint */}
          {search.trim() && (() => {
            const expanded = expandSearch(search.trim());
            const originalTerms = search.trim().toLowerCase().split(/\s+/);
            const newTerms = expanded.split(/\s+/).filter(t => !originalTerms.includes(t));
            if (newTerms.length === 0) return null;
            return (
              <div className="mt-2 flex items-center justify-center gap-1 text-xs text-[#484f58]">
                <span>🔍 智能匹配:</span>
                {newTerms.slice(0, 5).map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-[#1e6ef0]/10 text-[#58a6ff]">{t}</span>
                ))}
              </div>
            );
          })()}
          {/* LLM interpretation */}
          {llmLoading && (
            <div className="mt-2 flex items-center justify-center gap-2 text-xs text-[#484f58]">
              <div className="w-3 h-3 border border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
              <span>AI 正在理解您的需求...</span>
            </div>
          )}
          {llmResult && !llmLoading && (
            <div className="mt-2 max-w-xl mx-auto p-3 rounded-lg bg-[#3fb950]/5 border border-[#3fb950]/20 text-left">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-[#3fb950] font-medium">🤖 AI 理解:</span>
                <span className="text-xs text-[#8b949e]">置信度 {llmResult.confidence}</span>
              </div>
              <p className="text-xs text-[#e6edf3]">{llmResult.explanation}</p>
              {llmResult.features.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {llmResult.features.map(f => (
                    <span key={f} className="text-[10px] px-1.5 py-0.5 rounded bg-[#3fb950]/15 text-[#3fb950]">{f}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Vendor filters */}
      <div className="sticky top-[57px] z-40 backdrop-blur-xl bg-[#0d1117]/90 border-b border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex gap-2 overflow-x-auto">
          <button onClick={() => setActiveVendor(null)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${!activeVendor ? "bg-[#1e6ef0] text-white" : "bg-[#161b22] text-[#8b949e] hover:text-white border border-[#30363d]"}`}>
            全部 ({totalProducts})
          </button>
          {vendors.map((v) => (
            <button key={v.key} onClick={() => setActiveVendor(activeVendor === v.key ? null : v.key)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${activeVendor === v.key ? "bg-[#1e6ef0] text-white" : "bg-[#161b22] text-[#8b949e] hover:text-white border border-[#30363d]"}`}>
              {v.name} ({v.productCount})
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#1e6ef0] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results ? (
          <>
            <div className="mb-4 text-sm text-[#8b949e] flex items-center justify-between">
              <span>找到 {displayResults.length} 个匹配 · {constraintView && (constraintView.tier || 0) > 1 ? "降级排序" : (llmResult?.sortKey ? llmResult.sortKey.label : "按相关度排序")}</span>
              <span className="text-xs">显示 {Math.min(displayResults.length, 200)} 个</span>
            </div>

            {/* 竞品反查横幅(cross_ref): 命中=厂商声称标注; 零命中=诚实降级 */}
            {crossRef && crossRef.hits.length > 0 && (
              <div className="mb-4 max-w-3xl bg-[#1e6ef0]/8 border border-[#1e6ef0]/30 rounded-lg p-3">
                <p className="text-[#e6edf3] text-sm">
                  找到 {crossRef.hits.length} 款标称可替代 <span className="font-semibold">{crossRef.target}</span> 的国产料。
                  替代关系来自厂商「可替代产品」标注，建议 FAE 核对通道数/隔离电压/速率等关键参数后选型。
                </p>
              </div>
            )}
            {crossRef && crossRef.hits.length === 0 && (
              <div className="mb-4 max-w-3xl bg-[#d29922]/8 border border-[#d29922]/30 rounded-lg p-3">
                <p className="text-[#e6edf3] text-sm">
                  暂未找到标称可替代 <span className="font-semibold">{crossRef.target}</span> 的国产料（目前替代标注主要覆盖思瑞浦汽车产品线）。
                  建议改用品类+参数搜索（如「2通道数字隔离器 100Mbps」）按规格找等效料。
                </p>
              </div>
            )}

            {/* 约束横幅 — tier2/3 降级说明, 或 tier1 带排序意图(高PSRR等)的说明 */}
            {constraintView && constraintView.banner && (
              <div className="mb-4 max-w-3xl bg-[#d29922]/8 border border-[#d29922]/30 rounded-lg p-3">
                <p className="text-[#e6edf3] text-sm">{constraintView.banner}</p>
              </div>
            )}

            {/* Suggestion banner — always show when AI has advice */}
            {visibleSuggestions.length > 0 && displayResults.length > 0 && !constraintView?.banner && (
              <div className="mb-4 max-w-3xl">
                {visibleSuggestions.map((s, i) => (
                  <div key={i} className="bg-[#d29922]/5 border border-[#d29922]/20 rounded-lg p-3 mb-2">
                    <p className="text-[#e6edf3] text-sm">{s.text}</p>
                    {s.query && s.query !== search && (
                      <button
                        onClick={() => applySuggestion(s.query)}
                        className="mt-2 text-xs px-2.5 py-1 rounded border border-[#d29922]/30 text-[#d29922] hover:bg-[#d29922]/10 transition-colors"
                      >
                        用这个条件重搜
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {displayResults.slice(0, 200).map(({ vendor, vendorName, product, score, matchedTerms, missingTerms, matchSummary, referenceOnly, evidence, downgradeHits }) => (
                <div key={`${vendor}-${product.part_number}`} className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#1e6ef0] hover:shadow-[0_0_16px_rgba(30,110,240,0.1)] transition-all group">
                  {/* Part number + vendor + score */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-mono font-bold text-[#58a6ff] group-hover:text-white transition-colors text-sm truncate max-w-[65%]">
                      {product.part_number}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e6ef0]/15 text-[#8b949e] whitespace-nowrap">
                      {vendorName} · {matchSummary || score.toFixed(1)}
                    </span>
                  </div>

                  {/* Category tag from _features (more reliable than _section) */}
                  {(() => {
                    const categoryTag = getCategoryBadge(product);
                    const isCanonicalCategory = CATEGORY_BADGE_SET.has(categoryTag);
                    return categoryTag ? (
                      <div className={`mb-2 text-xs px-2 py-0.5 rounded inline-block ${isCanonicalCategory ? "text-[#3fb950] bg-[#3fb950]/10" : "text-[#8b949e] bg-[#8b949e]/10"}`}>
                        {categoryTag}
                      </div>
                    ) : null;
                  })()}

                  {/* Match quality badge */}
                  {matchSummary ? (
                    <div className="mb-2 flex flex-wrap items-center gap-1">
                      <span className={`text-[10px] px-1 py-0.5 rounded ${referenceOnly ? "bg-[#d29922]/20 text-[#d29922]" : downgradeHits && Object.keys(downgradeHits).length > 0 ? "bg-[#1e6ef0]/15 text-[#58a6ff]" : "bg-[#3fb950]/20 text-[#3fb950]"}`}>
                        {referenceOnly ? "参考料" : downgradeHits && Object.keys(downgradeHits).length > 0 ? `降级兼容 (${Object.values(downgradeHits).join('、')})` : "优先推荐"}
                      </span>
                      {missingTerms && missingTerms.length > 0 && (
                        <span className="text-[10px] px-1 py-0.5 rounded bg-[#f85149]/10 text-[#ff7b72]">
                          缺少 {missingTerms.slice(0, 2).join('、')}
                        </span>
                      )}
                    </div>
                  ) : score >= 30 ? (
                    <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-[#3fb950]/20 text-[#3fb950]">精确匹配</span>
                  ) : score >= 10 ? (
                    <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-[#d29922]/20 text-[#d29922]">接近匹配</span>
                  ) : null}

                  {/* Params */}
                  <div className="space-y-1">
                    {getDisplayParams(product).map(([key, val]) => (
                      <div key={key} className="flex items-baseline gap-1 text-xs">
                        <span className="text-[#484f58] min-w-[55px] truncate">{key}:</span>
                        <span className="text-[#e6edf3] truncate">{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Matched terms highlight with evidence source */}
                  {matchedTerms.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {matchedTerms.slice(0, 4).map(t => {
                        const ev = evidence?.find(e => e.term === t);
                        return (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#d29922]/15 text-[#d29922]">
                          ✓ {t}{ev?.source && ev.source !== '产品标签' ? <span className="text-[#8b949e] ml-0.5">({ev.source})</span> : null}
                        </span>
                        );
                      })}
                    </div>
                  )}

                  <button
                    onClick={() => toggleCompare(product.part_number)}
                    className={`mt-3 text-xs px-2 py-1 rounded transition-all ${
                      compareList.includes(product.part_number)
                        ? "bg-[#3fb950]/20 text-[#3fb950] border border-[#3fb950]/30"
                        : "text-[#1e6ef0] hover:text-[#58a6ff]"
                    }`}
                  >
                    {compareList.includes(product.part_number) ? "✓ 已加入对比" : "+ 加入对比"}
                  </button>
                </div>
              ))}
            </div>

            {displayResults.length > 200 && (
              <div className="text-center py-8 text-[#8b949e] text-sm">显示前 200 个 · 请缩小搜索范围</div>
            )}

            {displayResults.length === 0 && search.trim() && (
              <div className="text-center py-12 text-[#8b949e]">
                {visibleSuggestions.length > 0 ? (
                  <div className="max-w-xl mx-auto text-left space-y-3">
                    <div className="text-2xl mb-2">💡 建议</div>
                    {visibleSuggestions.map((s, i) => (
                      <div key={i} className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
                        <p className="text-[#e6edf3] text-sm leading-relaxed">{s.text}</p>
                        {s.query && s.query !== search && (
                          <button
                            onClick={() => applySuggestion(s.query)}
                            className="mt-3 text-xs px-2.5 py-1 rounded border border-[#1e6ef0]/30 text-[#58a6ff] hover:bg-[#1e6ef0]/10 transition-colors"
                          >
                            查看这组结果
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-4">🔍</div>
                    <p>未找到匹配 &quot;{search}&quot; 的芯片</p>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-[#8b949e]">
            <div className="text-5xl mb-4">🔎</div>
            <p className="text-lg">输入型号、参数或需求开始搜索</p>
            <p className="text-sm mt-2">试试：CAN-FD · 小封装 · 车规隔离</p>
          </div>
        )}
      </main>

      {/* Compare Panel */}
      {compareList.length > 0 && (() => {
        const selected = allProducts.filter((ap) =>
          compareList.includes(ap.product.part_number)
        );

        // Parse a product's _params into key:value lines
        const parseParams = (p: Product): [string, string][] => {
          const raw = p._params || "";
          if (!raw) return [];
          return raw.split(" | ").map((pair): [string, string] => {
            const idx = pair.indexOf(": ");
            if (idx > 0) return [pair.slice(0, idx), pair.slice(idx + 2)] as [string, string];
            return ["参数", pair] as [string, string];
          }).filter(([, v]) => v);
        };

        // Get extra fields (not _params, part_number, vendor_section)
        const getExtra = (p: Product): [string, string][] => {
          const prio = ["_section", "_features", "_application", "_category", "category"];
          const extras: [string, string][] = [];
          for (const key of prio) {
            if (p[key]) extras.push([key.replace(/_/g, " "), p[key]]);
          }
          return extras;
        };

        const exportCSV = () => {
          const allKeys = new Set<string>();
          const rows: Record<string, string>[] = [];
          for (const { product, vendorName } of selected) {
            const row: Record<string, string> = { "型号": product.part_number, "厂商": vendorName };
            for (const [k, v] of parseParams(product)) { row[k] = v; allKeys.add(k); }
            for (const [k, v] of getExtra(product)) { row[k] = v; allKeys.add(k); }
            rows.push(row);
          }
          const header = ["型号", "厂商", ...allKeys];
          const csvRows = rows.map(r => header.map(h => `"${(r[h]||"").replace(/"/g, '""')}"`).join(","));
          const csv = [header.map(h => `"${h}"`).join(","), ...csvRows].join("\n");
          const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "teampo_compare.csv"; a.click();
          URL.revokeObjectURL(url);
        };

        return (
          <div className="sticky bottom-0 z-40 bg-[#0d1117]/95 backdrop-blur-xl border-t-2 border-[#1e6ef0] shadow-[0_-8px_32px_rgba(0,0,0,0.5)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-bold text-sm">📊 产品对比 ({selected.length} 个)</h3>
                  <button onClick={() => setCompareList([])} className="text-xs text-[#8b949e] hover:text-white">清除</button>
                </div>
                <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg bg-[#3fb950]/15 border border-[#3fb950]/30 text-[#3fb950] text-xs font-medium hover:bg-[#3fb950]/25 transition-all">
                  📥 导出 CSV
                </button>
              </div>

              {/* Product cards — each as a vertical column */}
              <div className={`grid gap-3 max-h-[50vh] overflow-y-auto ${selected.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : selected.length === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
                {selected.map(({ product, vendorName }) => {
                  const params = parseParams(product);
                  const extras = getExtra(product);
                  return (
                    <div key={product.part_number} className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
                      {/* Header */}
                      <div className="px-3 py-2 bg-[#1c2333] border-b border-[#30363d] flex items-center justify-between">
                        <div>
                          <div className="font-mono font-bold text-[#58a6ff] text-sm">{product.part_number}</div>
                          <div className="text-[10px] text-[#8b949e]">{vendorName}</div>
                        </div>
                        <button onClick={() => toggleCompare(product.part_number)} className="text-[#8b949e] hover:text-white text-lg leading-none">×</button>
                      </div>
                      {/* Params */}
                      <div className="px-3 py-2 space-y-1 max-h-[40vh] overflow-y-auto">
                        {/* Section tag */}
                        {product._section && (
                          <div className="text-[10px] px-1.5 py-0.5 rounded bg-[#3fb950]/10 text-[#3fb950] inline-block mb-1">
                            {product._section}
                          </div>
                        )}
                        {/* Feature tags */}
                        {product._features && (
                          <div className="flex flex-wrap gap-1 mb-1">
                            {product._features.split(" ").filter(Boolean).map(f => (
                              <span key={f} className="text-[9px] px-1 py-0.5 rounded bg-[#d29922]/10 text-[#d29922]">{f}</span>
                            ))}
                          </div>
                        )}
                        {/* Document params */}
                        {params.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-[#30363d]">
                            <div className="text-[10px] text-[#484f58] mb-1 font-medium">📋 原始文档参数</div>
                            {params.map(([k, v]) => (
                              <div key={k} className="flex items-baseline gap-1 text-[11px] py-0.5">
                                <span className="text-[#8b949e] min-w-[60px] shrink-0">{k}</span>
                                <span className="text-[#e6edf3] break-all">{v}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Extra fields */}
                        {extras.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-[#30363d]">
                            {extras.map(([k, v]) => (
                              <div key={k} className="flex items-baseline gap-1 text-[11px] py-0.5">
                                <span className="text-[#8b949e] min-w-[60px] shrink-0">{k}</span>
                                <span className="text-[#e6edf3] break-all">{v}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

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

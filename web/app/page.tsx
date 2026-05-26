"use client";

import { useState, useEffect, useMemo } from "react";
import { expandSearch } from "@/lib/synonyms";

type Product = Record<string, string>;
type VendorData = { name: string; productCount: number; products: Product[] };

type SearchResult = {
  vendor: string;
  vendorName: string;
  product: Product;
  score: number;
  matchedTerms: string[];
};

type LLMInterpretation = {
  features: string[];
  vendor: string | null;
  category_hint: string | null;
  explanation: string;
  confidence: string;
} | null;

export default function Home() {
  const [data, setData] = useState<Record<string, VendorData>>({});
  const [search, setSearch] = useState("");
  const [activeVendor, setActiveVendor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [llmResult, setLlmResult] = useState<LLMInterpretation>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [compareList, setCompareList] = useState<string[]>([]);

  const toggleCompare = (part: string) => {
    setCompareList((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
    );
  };

  useEffect(() => {
    fetch("/data/products_structured.json")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  // LLM query interpretation (debounced)
  useEffect(() => {
    if (!search.trim() || search.trim().length < 3) {
      setLlmResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      setLlmLoading(true);
      try {
        const res = await fetch("/api/interpret", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: search.trim() }),
        });
        if (res.ok) {
          const data = await res.json();
          if (!data.error) setLlmResult(data);
        }
      } catch {} 
      finally { setLlmLoading(false); }
    }, 600);
    return () => clearTimeout(timer);
  }, [search]);

  const vendors = useMemo(() => Object.entries(data), [data]);

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
        .replace(/[，,、。．.；;：:！!？?（）()【】\[\]『』""'']/g, " ")
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

    const scored: SearchResult[] = [];

    for (const { vendor, vendorName, product } of allProducts) {
      if (activeVendor && vendor !== activeVendor) continue;

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
        } else {
          allOriginalMatched = false;
        }
      }

      // Product qualifies only if: all original terms match, OR phrase query matches,
      // OR LLM high-confidence features ALL match (enforce every constraint)
      const llmAllMatched = llmResult?.confidence === "high" && llmResult.features.length > 0 &&
        llmResult.features.every((f) => searchable.includes(f.toLowerCase()));
      
      if (!allOriginalMatched && !phraseMatched && !llmAllMatched) continue;

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
  }, [allProducts, search, activeVendor, llmResult]);

  const totalProducts = vendors.reduce((s, [, v]) => s + v.productCount, 0);

  // Get displayable params for a product
  const getDisplayParams = (p: Product): [string, string][] => {
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1e6ef0] to-[#58a6ff] flex items-center justify-center text-white font-bold text-sm">CS</div>
            <div>
              <h1 className="text-lg font-bold text-white">ChipSelect</h1>
              <p className="text-xs text-[#8b949e] hidden sm:block">芯片选型平台 · {totalProducts} 产品 · {vendors.length} 厂商</p>
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
            <span className="text-gradient">半导体芯片</span>
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
              placeholder="搜索型号、参数或销售用语，如 CAN FD 特定帧唤醒..."
              className="w-full px-5 py-3.5 rounded-xl bg-[#161b22] border border-[#30363d] text-white placeholder-[#484f58] focus:outline-none focus:border-[#1e6ef0] focus:ring-2 focus:ring-[#1e6ef0]/20 text-base transition-all"
              autoFocus
            />
            <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b949e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
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
          {vendors.map(([slug, v]) => (
            <button key={slug} onClick={() => setActiveVendor(activeVendor === slug ? null : slug)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${activeVendor === slug ? "bg-[#1e6ef0] text-white" : "bg-[#161b22] text-[#8b949e] hover:text-white border border-[#30363d]"}`}>
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
              <span>找到 {results.length} 个匹配 · 按相关度排序</span>
              <span className="text-xs">显示 {Math.min(results.length, 200)} 个</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {results.slice(0, 200).map(({ vendor, vendorName, product, score, matchedTerms }) => (
                <div key={`${vendor}-${product.part_number}`} className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#1e6ef0] hover:shadow-[0_0_16px_rgba(30,110,240,0.1)] transition-all group">
                  {/* Part number + vendor + score */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-mono font-bold text-[#58a6ff] group-hover:text-white transition-colors text-sm truncate max-w-[65%]">
                      {product.part_number}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e6ef0]/15 text-[#8b949e] whitespace-nowrap">
                      {vendorName} · {score.toFixed(1)}
                    </span>
                  </div>

                  {/* Section hint */}
                  {product._section && (
                    <div className="mb-2 text-xs text-[#3fb950] bg-[#3fb950]/10 px-2 py-0.5 rounded inline-block">
                      {product._section}
                    </div>
                  )}

                  {/* Params */}
                  <div className="space-y-1">
                    {getDisplayParams(product).map(([key, val]) => (
                      <div key={key} className="flex items-baseline gap-1 text-xs">
                        <span className="text-[#484f58] min-w-[55px] truncate">{key}:</span>
                        <span className="text-[#e6edf3] truncate">{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Matched terms highlight */}
                  {matchedTerms.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {matchedTerms.slice(0, 4).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#d29922]/15 text-[#d29922]">
                          ✓ {t}
                        </span>
                      ))}
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

            {results.length > 200 && (
              <div className="text-center py-8 text-[#8b949e] text-sm">显示前 200 个 · 请缩小搜索范围</div>
            )}

            {results.length === 0 && (
              <div className="text-center py-20 text-[#8b949e]">
                <div className="text-4xl mb-4">🔍</div>
                <p>未找到匹配 &quot;{search}&quot; 的芯片</p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-[#8b949e]">
            <div className="text-5xl mb-4">🔎</div>
            <p className="text-lg">输入型号、参数或需求开始搜索</p>
            <p className="text-sm mt-2">试试：便宜运放 · CAN FD · 小封装 · 车规隔离</p>
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
          a.href = url; a.download = "chipselect_compare.csv"; a.click();
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
        ChipSelect · {totalProducts} products · 4 vendors · 智能语义搜索
      </footer>
    </div>
  );
}

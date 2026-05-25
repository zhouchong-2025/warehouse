"use client";

import { useState, useEffect, useMemo } from "react";
import { expandSearch } from "@/lib/synonyms";

type Product = Record<string, string>;
type VendorData = { name: string; productCount: number; products: Product[] };

export default function Home() {
  const [data, setData] = useState<Record<string, VendorData>>({});
  const [search, setSearch] = useState("");
  const [activeVendor, setActiveVendor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/products_structured.json")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const vendors = useMemo(() => Object.entries(data), [data]);
  const allProducts = useMemo(() => {
    const all: { vendor: string; vendorName: string; product: Product }[] = [];
    for (const [slug, v] of Object.entries(data)) {
      for (const p of v.products) {
        all.push({ vendor: slug, vendorName: v.name, product: p });
      }
    }
    return all;
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const expandedQ = q ? expandSearch(q) : "";
    const searchTerms = expandedQ ? expandedQ.split(/\s+/) : [];
    
    return allProducts.filter(({ vendor, product }) => {
      if (activeVendor && vendor !== activeVendor) return false;
      if (!q) return true;
      
      // Build searchable text from all product fields
      const searchable = Object.values(product)
        .filter((v): v is string => typeof v === "string")
        .join(" ")
        .toLowerCase();
      
      // Match if ANY expanded term is found
      return searchTerms.some((term) => searchable.includes(term));
    });
  }, [allProducts, search, activeVendor]);

  const totalProducts = vendors.reduce((s, [, v]) => s + v.productCount, 0);

  // Get displayable params for a product (most important ones)
  const getDisplayParams = (p: Product): [string, string][] => {
    const priority = [
      "package", "封装", "status", "状态", "supply_v_min", "supply_v_max",
      "gbw_mhz", "channels", "rating", "temp_range", "工作温度",
      "description", "产品描述", "category", "process_node", "ports",
    ];
    const params: [string, string][] = [];
    for (const key of priority) {
      if (p[key] && p[key].length < 60) {
        params.push([key, p[key]]);
      }
    }
    // Add any other non-empty short params
    for (const [k, v] of Object.entries(p)) {
      if (!priority.includes(k) && v && v.length < 40 && k !== "part_number" && k !== "vendor") {
        if (params.length < 8) params.push([k, v]);
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1e6ef0] to-[#58a6ff] flex items-center justify-center text-white font-bold text-sm">
              CS
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">ChipSelect</h1>
              <p className="text-xs text-[#8b949e] hidden sm:block">
                芯片选型平台 · {totalProducts} 产品 · {vendors.length} 厂商
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <a
              href="/compare"
              className="text-[#58a6ff] hover:text-white transition-colors"
            >
              对比
            </a>
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
            纳芯微 · 思瑞浦 · 裕太微 — 1641 个芯片，结构化参数，一键对比
          </p>
          <div className="max-w-xl mx-auto relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索型号或参数，如 LM2902、便宜运放、网口芯片..."
              className="w-full px-5 py-3.5 rounded-xl bg-[#161b22] border border-[#30363d] text-white placeholder-[#484f58] focus:outline-none focus:border-[#1e6ef0] focus:ring-2 focus:ring-[#1e6ef0]/20 text-base transition-all"
              autoFocus
            />
            <svg
              className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b949e]"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          {/* Synonym expansion hint */}
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
                {newTerms.length > 5 && <span>+{newTerms.length - 5} more</span>}
              </div>
            );
          })()}
        </div>
      </section>

      {/* Vendor filters */}
      <div className="sticky top-[57px] z-40 backdrop-blur-xl bg-[#0d1117]/90 border-b border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveVendor(null)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
              !activeVendor
                ? "bg-[#1e6ef0] text-white"
                : "bg-[#161b22] text-[#8b949e] hover:text-white border border-[#30363d]"
            }`}
          >
            全部 ({totalProducts})
          </button>
          {vendors.map(([slug, v]) => (
            <button
              key={slug}
              onClick={() => setActiveVendor(activeVendor === slug ? null : slug)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeVendor === slug
                  ? "bg-[#1e6ef0] text-white"
                  : "bg-[#161b22] text-[#8b949e] hover:text-white border border-[#30363d]"
              }`}
            >
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
        ) : (
          <>
            <div className="mb-4 text-sm text-[#8b949e] flex items-center justify-between">
              <span>
                {search || activeVendor
                  ? `找到 ${filtered.length} 个匹配的芯片`
                  : `共 ${totalProducts} 个芯片 · 输入型号或参数开始搜索`}
              </span>
              {filtered.length > 0 && (
                <span className="text-xs">
                  显示 {Math.min(filtered.length, 200)} / {filtered.length}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.slice(0, 200).map(({ vendor, vendorName, product }) => (
                <div
                  key={`${vendor}-${product.part_number}`}
                  className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] hover:border-[#1e6ef0] hover:shadow-[0_0_16px_rgba(30,110,240,0.1)] transition-all group"
                >
                  {/* Part number + vendor */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="font-mono font-bold text-[#58a6ff] group-hover:text-white transition-colors text-sm truncate max-w-[70%]">
                      {product.part_number}
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e6ef0]/15 text-[#8b949e] whitespace-nowrap">
                      {vendorName}
                    </span>
                  </div>

                  {/* Params */}
                  <div className="space-y-1">
                    {getDisplayParams(product).map(([key, val]) => (
                      <div key={key} className="flex items-baseline gap-1 text-xs">
                        <span className="text-[#484f58] min-w-[60px] truncate">
                          {key.replace(/_/g, " ")}:
                        </span>
                        <span className="text-[#e6edf3] truncate">{val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Add to compare */}
                  <a
                    href={`/compare?chips=${encodeURIComponent(product.part_number)}`}
                    className="mt-3 inline-block text-xs text-[#1e6ef0] hover:text-[#58a6ff] transition-colors"
                  >
                    + 加入对比
                  </a>
                </div>
              ))}
            </div>

            {filtered.length > 200 && (
              <div className="text-center py-8 text-[#8b949e] text-sm">
                显示前 200 个结果，请使用更精确的搜索词缩小范围
              </div>
            )}

            {!loading && search && filtered.length === 0 && (
              <div className="text-center py-20 text-[#8b949e]">
                <div className="text-4xl mb-4">🔍</div>
                <p>未找到匹配 &quot;{search}&quot; 的芯片</p>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-[#30363d] py-6 text-center text-xs text-[#484f58]">
        ChipSelect — 芯片选型平台 · pymupdf 表格提取 · {totalProducts} 个结构化产品
      </footer>
    </div>
  );
}

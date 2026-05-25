"use client";

import { useState, useEffect, useMemo } from "react";

interface ProductEntry {
  part_number: string;
}

interface VendorData {
  slug: string;
  name: string;
  source: string;
  totalChars: number;
  pageCount: number;
  products: ProductEntry[];
  productCount: number;
}

export default function Home() {
  const [data, setData] = useState<Record<string, VendorData>>({});
  const [search, setSearch] = useState("");
  const [activeVendor, setActiveVendor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/products.json")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const vendors = useMemo(() => Object.values(data), [data]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const results: { vendor: string; vendorName: string; part: string }[] = [];

    for (const [slug, v] of Object.entries(data)) {
      if (activeVendor && slug !== activeVendor) continue;
      for (const p of v.products) {
        if (!q || p.part_number.toLowerCase().includes(q)) {
          results.push({
            vendor: slug,
            vendorName: v.name,
            part: p.part_number,
          });
        }
      }
    }
    return results;
  }, [data, search, activeVendor]);

  const totalProducts = vendors.reduce((s, v) => s + v.productCount, 0);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0d1117]/90 border-b border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1e6ef0] to-[#58a6ff] flex items-center justify-center text-white font-bold text-sm">
              CS
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">ChipSelect</h1>
              <p className="text-xs text-[#8b949e] hidden sm:block">芯片选型平台</p>
            </div>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/compare" className="text-[#58a6ff] hover:text-white transition-colors">
              对比
            </a>
            <span className="text-[#8b949e] text-xs">
              {totalProducts} 个产品 · {vendors.length} 个厂商
            </span>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#30363d]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e6ef0]/10 via-transparent to-[#58a6ff]/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold mb-4">
            <span className="text-gradient">半导体芯片</span>
            <span className="text-white"> 选型平台</span>
          </h2>
          <p className="text-[#8b949e] text-lg max-w-2xl mx-auto mb-8">
            纳芯微 · 思瑞浦 · 裕太微 — 快速查找、筛选、对比芯片参数
          </p>

          {/* Search */}
          <div className="max-w-xl mx-auto relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入芯片型号搜索，如 YT8531、NSI824x..."
              className="w-full px-5 py-3.5 rounded-xl bg-[#161b22] border border-[#30363d] text-white placeholder-[#484f58] focus:outline-none focus:border-[#1e6ef0] focus:ring-2 focus:ring-[#1e6ef0]/20 text-base transition-all"
              autoFocus
            />
            <svg
              className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8b949e]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
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
            全部厂商 ({totalProducts})
          </button>
          {vendors.map((v) => (
            <button
              key={v.slug}
              onClick={() => setActiveVendor(activeVendor === v.slug ? null : v.slug)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeVendor === v.slug
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
            <div className="mb-4 text-sm text-[#8b949e]">
              {search || activeVendor
                ? `找到 ${filtered.length} 个匹配的芯片`
                : `显示全部 ${totalProducts} 个芯片 · 输入型号开始搜索`}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filtered.slice(0, 500).map((item) => (
                <a
                  key={`${item.vendor}-${item.part}`}
                  href={`/products?q=${item.part}`}
                  className="block p-3 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-[#1e6ef0] hover:shadow-[0_0_16px_rgba(30,110,240,0.1)] transition-all group"
                >
                  <div className="text-sm font-mono font-semibold text-[#58a6ff] group-hover:text-white transition-colors truncate">
                    {item.part}
                  </div>
                  <div className="text-xs text-[#8b949e] mt-1 truncate">
                    {item.vendorName}
                  </div>
                </a>
              ))}
            </div>

            {filtered.length > 500 && (
              <div className="text-center py-8 text-[#8b949e] text-sm">
                显示前 500 个结果，请使用更精确的搜索词
              </div>
            )}

            {!loading && search && filtered.length === 0 && (
              <div className="text-center py-20 text-[#8b949e]">
                <div className="text-4xl mb-4">🔍</div>
                <p>未找到匹配 &quot;{search}&quot; 的芯片</p>
                <p className="text-sm mt-2">请尝试其他关键词或浏览厂商分类</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#30363d] py-6 text-center text-xs text-[#484f58]">
        ChipSelect — 芯片选型平台 · 数据来源：厂商公开选型手册
      </footer>
    </div>
  );
}

"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loadReleaseCatalog } from "@/lib/release-catalog";
import { getCategoryBadge, getDisplayParams } from "@/app/product-utils";

type Product = Record<string, string>;

interface VendorData {
  slug?: string;
  name: string;
  source?: string;
  products: Product[];
  productCount: number;
}

function ProductContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("q") || "";
  const [data, setData] = useState<Record<string, VendorData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReleaseCatalog<VendorData>()
      .then(({ vendors }) => setData(vendors))
      .finally(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    if (!slug.trim() || !Object.keys(data).length) return [];
    const q = slug.toLowerCase();
    const items: { product: Product; vendorName: string; vendorSlug: string }[] = [];
    for (const [vendorSlug, v] of Object.entries(data).filter(([k]) => !String(k).startsWith('_'))) {
      for (const p of v.products) {
        if ((p.part_number || "").toLowerCase().includes(q)) {
          items.push({
            product: p,
            vendorName: v.name,
            vendorSlug,
          });
        }
      }
    }
    return items.slice(0, 200);
  }, [data, slug]);

  if (!slug) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-[#8b949e] text-lg">请输入芯片型号</p>
          <a href="/" className="text-[#58a6ff] hover:text-white mt-4 inline-block">
            ← 返回首页搜索
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0d1117]/90 border-b border-[#30363d]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <a
            href="/"
            className="text-[#58a6ff] hover:text-white transition-colors text-sm flex items-center gap-1"
          >
            ← 返回
          </a>
          <span className="text-[#8b949e]">/</span>
          <span className="text-white font-mono font-semibold">{slug}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#1e6ef0] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length > 0 ? (
          <div>
            <div className="mb-4 text-sm text-[#8b949e]">
              找到 {results.length} 个匹配 “{slug}” 的芯片
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {results.map((item) => {
                const badge = getCategoryBadge(item.product);
                return (
                  <div
                    key={`${item.vendorSlug}-${item.product.part_number}`}
                    className="p-4 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-[#1e6ef0] transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-mono font-semibold text-[#58a6ff] text-lg break-all">
                        {item.product.part_number}
                      </div>
                      <div className="text-[10px] px-1.5 py-0.5 rounded bg-[#1e6ef0]/15 text-[#8b949e] whitespace-nowrap">
                        {item.vendorName}
                      </div>
                    </div>

                    {badge && (
                      <div className="mt-2 mb-2 text-xs text-[#3fb950] bg-[#3fb950]/10 px-2 py-0.5 rounded inline-block">
                        {badge}
                      </div>
                    )}

                    <div className="space-y-1">
                      {getDisplayParams(item.product).slice(0, 4).map(([key, val]) => (
                        <div key={key} className="flex items-baseline gap-1 text-xs">
                          <span className="text-[#484f58] min-w-[55px] truncate">{key}:</span>
                          <span className="text-[#e6edf3] truncate">{val}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex gap-3 text-xs">
                      <a
                        href={`/compare?chips=${item.product.part_number}`}
                        className="text-[#1e6ef0] hover:text-[#58a6ff]"
                      >
                        添加到对比 →
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-[#8b949e] text-lg">
              未找到匹配 “{slug}” 的芯片
            </p>
            <a href="/" className="text-[#58a6ff] hover:text-white mt-4 inline-block">
              ← 返回首页
            </a>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Products() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#1e6ef0] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ProductContent />
    </Suspense>
  );
}

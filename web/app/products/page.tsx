"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface ProductEntry {
  part_number: string;
}

interface VendorData {
  slug: string;
  name: string;
  source: string;
  products: ProductEntry[];
  productCount: number;
}

function ProductContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("q") || "";
  const [data, setData] = useState<Record<string, VendorData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/products.json")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    if (!slug.trim() || !Object.keys(data).length) return [];
    const q = slug.toLowerCase();
    const items: { part: string; vendorName: string; vendorSlug: string }[] =
      [];
    for (const [, v] of Object.entries(data)) {
      for (const p of v.products) {
        if (p.part_number.toLowerCase().includes(q)) {
          items.push({
            part: p.part_number,
            vendorName: v.name,
            vendorSlug: v.slug,
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
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

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#1e6ef0] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : results.length > 0 ? (
          <div>
            <div className="mb-4 text-sm text-[#8b949e]">
              找到 {results.length} 个匹配 &quot;{slug}&quot; 的芯片
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {results.map((item) => (
                <div
                  key={`${item.vendorSlug}-${item.part}`}
                  className="p-4 rounded-lg bg-[#161b22] border border-[#30363d] hover:border-[#1e6ef0] transition-all"
                >
                  <div className="font-mono font-semibold text-[#58a6ff] text-lg">
                    {item.part}
                  </div>
                  <div className="text-xs text-[#8b949e] mt-2">
                    {item.vendorName}
                  </div>
                  <a
                    href={`/compare?chips=${item.part}`}
                    className="text-xs text-[#1e6ef0] hover:text-[#58a6ff] mt-2 inline-block"
                  >
                    添加到对比 →
                  </a>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-[#8b949e] text-lg">
              未找到匹配 &quot;{slug}&quot; 的芯片
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

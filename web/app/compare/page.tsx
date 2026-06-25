"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Product = Record<string, unknown> & { part_number?: string };

function toDisplayValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value
      .map((item) => toDisplayValue(item))
      .filter((item): item is string => Boolean(item));
    return items.length ? items.join(" | ") : null;
  }
  return null;
}

function CompareContent() {
  const searchParams = useSearchParams();
  const initialChips = searchParams.get("chips") || "";
  const [data, setData] = useState<Record<string, { name: string; products: Product[] }>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetch("/data/products_structured.json")
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        if (initialChips) {
          setSelected(initialChips.split(",").map(decodeURIComponent));
        }
      });
  }, [initialChips]);

  const allParts = useMemo(() => {
    const parts: { part: string; vendorName: string; product: Product }[] = [];
    for (const [, v] of Object.entries(data)) {
      for (const p of v.products) {
        if (!p.part_number) continue;
        parts.push({ part: p.part_number!, vendorName: v.name, product: p });
      }
    }
    return parts;
  }, [data]);

  const selectedProducts = useMemo(
    () => allParts.filter((p) => selected.includes(p.part)),
    [allParts, selected]
  );

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.toLowerCase();
    return allParts
      .filter((p) => p.part.toLowerCase().includes(q))
      .slice(0, 15);
  }, [allParts, searchTerm]);

  const toggleSelect = (part: string) => {
    setSelected((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
    );
  };

  // Get common params across selected products
  const commonParams = useMemo(() => {
    if (selectedProducts.length === 0) return [];
    const paramSet = new Set<string>();
    for (const { product } of selectedProducts) {
      for (const key of Object.keys(product)) {
        if (key !== "part_number" && key !== "vendor" && toDisplayValue(product[key])) {
          paramSet.add(key);
        }
      }
    }
    // Sort: put common params first
    const counts: Record<string, number> = {};
    for (const { product } of selectedProducts) {
      for (const key of paramSet) {
        if (toDisplayValue(product[key])) counts[key] = (counts[key] || 0) + 1;
      }
    }
    return [...paramSet].sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
  }, [selectedProducts]);

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0d1117]/90 border-b border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-[#58a6ff] hover:text-white text-sm">
              ← 首页
            </a>
            <span className="text-[#8b949e]">/</span>
            <h1 className="text-white font-bold">芯片对比</h1>
          </div>
          <span className="text-xs text-[#8b949e]">
            已选 {selected.length} 个
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Search */}
        <div className="mb-8">
          <div className="relative max-w-xl">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索芯片型号添加到对比..."
              className="w-full px-4 py-3 rounded-xl bg-[#161b22] border border-[#30363d] text-white placeholder-[#484f58] focus:outline-none focus:border-[#1e6ef0] focus:ring-2 focus:ring-[#1e6ef0]/20 transition-all"
            />
          </div>
          {searchResults.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {searchResults.map((p) => (
                <button
                  key={p.part}
                  onClick={() => { toggleSelect(p.part); setSearchTerm(""); }}
                  className={`p-2 rounded-lg text-sm text-left transition-all ${
                    selected.includes(p.part)
                      ? "bg-[#1e6ef0]/20 border border-[#1e6ef0] text-[#58a6ff]"
                      : "bg-[#161b22] border border-[#30363d] text-[#e6edf3] hover:border-[#1e6ef0]"
                  }`}
                >
                  <div className="font-mono font-semibold truncate">{p.part}</div>
                  <div className="text-xs text-[#8b949e]">{p.vendorName}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected chips */}
        {selectedProducts.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              {selectedProducts.map(({ part, vendorName }) => (
                <span
                  key={part}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e6ef0]/15 border border-[#1e6ef0]/30 text-[#58a6ff] text-sm font-mono"
                >
                  {part}
                  <span className="text-[10px] text-[#8b949e]">{vendorName}</span>
                  <button
                    onClick={() => toggleSelect(part)}
                    className="text-[#8b949e] hover:text-white"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={() => setSelected([])}
                className="text-xs text-[#8b949e] hover:text-white ml-2"
              >
                清除全部
              </button>
            </div>

            {/* Comparison table */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="min-w-[120px]">参数</th>
                    {selectedProducts.map(({ part, vendorName }) => (
                      <th key={part} className="font-mono min-w-[160px]">
                        <div>{part}</div>
                        <div className="text-[10px] font-normal text-[#8b949e]">
                          {vendorName}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {commonParams.map((param) => (
                    <tr key={param}>
                      <td className="font-medium text-[#8b949e] text-xs">
                        {param.replace(/_/g, " ")}
                      </td>
                      {selectedProducts.map(({ part, product }) => {
                        const displayValue = toDisplayValue(product[param]);
                        return (
                          <td
                            key={part}
                            className={`text-sm ${
                              displayValue ? "text-[#e6edf3]" : "text-[#30363d]"
                            }`}
                          >
                            {displayValue || "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-[#8b949e]">
            <div className="text-5xl mb-4">⚖️</div>
            <p className="text-lg mb-2">选择芯片开始对比</p>
            <p className="text-sm">
              搜索型号添加到对比列表，参数自动展开
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Compare() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1e6ef0] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CompareContent />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";

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

export default function Compare() {
  const [data, setData] = useState<Record<string, VendorData>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetch("/data/products.json")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const allParts = useMemo(() => {
    const parts: { part: string; vendor: string; vendorName: string }[] = [];
    for (const [, v] of Object.entries(data)) {
      for (const p of v.products) {
        parts.push({ part: p.part_number, vendor: v.slug, vendorName: v.name });
      }
    }
    return parts;
  }, [data]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const q = searchTerm.toLowerCase();
    return allParts
      .filter((p) => p.part.toLowerCase().includes(q))
      .slice(0, 20);
  }, [allParts, searchTerm]);

  const toggleSelect = (part: string) => {
    setSelected((prev) =>
      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
    );
  };

  return (
    <div className="min-h-screen bg-[#0d1117]">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#0d1117]/90 border-b border-[#30363d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="text-[#58a6ff] hover:text-white transition-colors text-sm"
            >
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
              placeholder="搜索芯片型号添加到对比列表..."
              className="w-full px-4 py-3 rounded-xl bg-[#161b22] border border-[#30363d] text-white placeholder-[#484f58] focus:outline-none focus:border-[#1e6ef0] focus:ring-2 focus:ring-[#1e6ef0]/20 transition-all"
            />
          </div>

          {searchResults.length > 0 && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {searchResults.map((p) => (
                <button
                  key={`${p.vendor}-${p.part}`}
                  onClick={() => {
                    toggleSelect(p.part);
                    setSearchTerm("");
                  }}
                  className={`p-2 rounded-lg text-sm text-left transition-all ${
                    selected.includes(p.part)
                      ? "bg-[#1e6ef0]/20 border border-[#1e6ef0] text-[#58a6ff]"
                      : "bg-[#161b22] border border-[#30363d] text-[#e6edf3] hover:border-[#1e6ef0]"
                  }`}
                >
                  <div className="font-mono font-semibold truncate">
                    {p.part}
                  </div>
                  <div className="text-xs text-[#8b949e] truncate">
                    {p.vendorName}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected chips */}
        {selected.length > 0 ? (
          <div>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {selected.map((part) => (
                <span
                  key={part}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e6ef0]/15 border border-[#1e6ef0]/30 text-[#58a6ff] text-sm font-mono"
                >
                  {part}
                  <button
                    onClick={() => toggleSelect(part)}
                    className="text-[#8b949e] hover:text-white"
                  >
                    ×
                  </button>
                </span>
              ))}
              {selected.length > 0 && (
                <button
                  onClick={() => setSelected([])}
                  className="text-xs text-[#8b949e] hover:text-white ml-2"
                >
                  清除全部
                </button>
              )}
            </div>

            {/* Comparison table placeholder */}
            <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>参数</th>
                    {selected.map((part) => (
                      <th key={part} className="font-mono">
                        {part}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    "封装",
                    "制程",
                    "工作温度",
                    "端口",
                    "接口",
                    "状态",
                    "兼容型号",
                  ].map((param) => (
                    <tr key={param}>
                      <td className="font-medium text-[#8b949e]">{param}</td>
                      {selected.map((part) => (
                        <td key={part} className="text-[#e6edf3]">
                          —
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 p-4 rounded-lg bg-[#1e6ef0]/5 border border-[#1e6ef0]/20">
              <p className="text-sm text-[#8b949e]">
                💡 当前为数据结构框架。完整参数对比需从 PDF 中提取结构化字段后填充。参数数据将在 MinerU 提取完成后自动补全。
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 text-[#8b949e]">
            <div className="text-5xl mb-4">⚖️</div>
            <p className="text-lg mb-2">选择芯片开始对比</p>
            <p className="text-sm">
              在上方搜索框输入芯片型号，添加到对比列表
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

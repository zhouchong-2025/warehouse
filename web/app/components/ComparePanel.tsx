"use client";

import { type Product } from "@/app/product-utils";

type Props = {
  compareList: string[];
  allProducts: { vendor: string; vendorName: string; product: Product }[];
  onToggleCompare: (part: string) => void;
  onClear: () => void;
};

// Parse a product's _params into key:value lines
function parseParams(p: Product): [string, string][] {
  const raw = p._params || "";
  if (!raw) return [];
  return raw.split(" | ").map((pair): [string, string] => {
    const idx = pair.indexOf(": ");
    if (idx > 0) return [pair.slice(0, idx), pair.slice(idx + 2)] as [string, string];
    return ["参数", pair] as [string, string];
  }).filter(([, v]) => v);
}

// Get extra fields (not _params, part_number, vendor_section)
function getExtra(p: Product): [string, string][] {
  const prio = ["_section", "_features", "_application", "_category", "category"];
  const extras: [string, string][] = [];
  for (const key of prio) {
    if (p[key]) extras.push([key.replace(/_/g, " "), p[key]]);
  }
  return extras;
}

export default function ComparePanel({
  compareList,
  allProducts,
  onToggleCompare,
  onClear,
}: Props) {
  if (compareList.length === 0) return null;

  const selected = allProducts.filter((ap) =>
    compareList.includes(ap.product.part_number)
  );

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
            <button onClick={onClear} className="text-xs text-[#8b949e] hover:text-white">清除</button>
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
                  <button onClick={() => onToggleCompare(product.part_number)} className="text-[#8b949e] hover:text-white text-lg leading-none">×</button>
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
}

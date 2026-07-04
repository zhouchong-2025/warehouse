"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Product = Record<string, string>;

interface VendorData {
  slug?: string;
  name: string;
  source?: string;
  products: Product[];
  productCount: number;
}

const CATEGORY_BADGE_PRIORITY = [
  "隔离栅极驱动", "非隔离栅极驱动", "栅极驱动", "数字隔离器", "隔离电源", "隔离放大器",
  "马达驱动", "模拟开关", "电平转换", "IO扩展", "交换机", "网卡", "以太网供电",
  "CAN-FD", "LIN", "RS-485", "RS-232", "MLVDS", "SBC",
  "DCDC", "降压", "升压", "LDO", "电压基准", "ADC", "DAC",
  "比较器", "运放", "放大器",
  "电流传感器", "温度传感器", "压力传感器", "位置传感器", "速度传感器",
  "负载开关", "高边开关", "高边驱动", "电源时序", "复位芯片", "电子保险丝", "理想二极管",
  "电池监控", "BMS", "传感器接口", "匹配电阻", "视频滤波", "音频功放", "音频总线", "逻辑门",
] as const;

function getCategoryBadge(product: Product): string {
  const tokens = (product._features || "").split(/\s+/).filter(Boolean);
  for (const tag of CATEGORY_BADGE_PRIORITY) {
    if (tokens.includes(tag)) return tag;
  }
  return (product._section || "").trim();
}

function getDisplayParams(p: Product): [string, string][] {
  const priority = [
    "package", "封装", "status", "状态", "rating", "channels", "ports",
    "supply_v_min", "supply_v_max", "temp_range", "工作温度",
    "description", "产品描述",
  ];
  const params: [string, string][] = [];
  for (const key of priority) {
    if (p[key] && p[key].length < 60) {
      params.push([key.replace(/_/g, " "), p[key]]);
    }
  }
  for (const [k, v] of Object.entries(p)) {
    if (!priority.includes(k) && v && v.length < 40 && !["part_number", "vendor_section", "_features", "_section", "_raw"].includes(k) && !k.startsWith("param_")) {
      if (params.length < 6) params.push([k.replace(/_/g, " "), v]);
    }
  }
  return params.slice(0, 4);
}

function ProductContent() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("q") || "";
  const [data, setData] = useState<Record<string, VendorData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/data/products_structured.json")
      .then((r) => r.json())
      .then(setData)
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
                      {getDisplayParams(item.product).map(([key, val]) => (
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

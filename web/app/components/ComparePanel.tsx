"use client";

import Link from "next/link";
import { productIdentity, type Product } from "@/app/product-utils";

type Props = {
  compareList: string[];
  compareHref: string;
  allProducts: { vendor: string; vendorName: string; product: Product }[];
  onToggleCompare: (vendor: string, part: string) => void;
  onClear: () => void;
};

export default function ComparePanel({
  compareList,
  compareHref,
  allProducts,
  onToggleCompare,
  onClear,
}: Props) {
  if (compareList.length === 0) return null;

  const selected = allProducts.filter((ap) =>
    compareList.includes(productIdentity(ap.vendor, ap.product.part_number))
  );


  return (
    <div className="sticky bottom-0 z-40 bg-[#0d1117]/95 backdrop-blur-xl border-t-2 border-[#1e6ef0] shadow-[0_-8px_32px_rgba(0,0,0,0.5)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <h3 className="text-white font-bold text-sm">产品对比 ({selected.length} 个)</h3>
            <button onClick={onClear} className="text-xs text-[#8b949e] hover:text-white">清除</button>
          </div>
          <Link href={compareHref} className="text-sm text-[#79c0ff] underline">打开完整对比 →</Link>

        </div>

        <div className="flex flex-wrap gap-2">{selected.map(({product,vendor,vendorName})=><button key={productIdentity(vendor,product.part_number)} onClick={()=>onToggleCompare(vendor,product.part_number)} className="rounded-full border border-[#31556d] px-3 py-2 text-xs text-[#c9d1d9]">{product.part_number} · {vendorName} ×</button>)}</div>
      </div>
    </div>
  );
}

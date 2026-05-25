export interface Product {
  slug: string;
  name: string;
  vendor: string;
  category: string;
  description: string;
  package_type: string;
  process_node: string;
  status: string;
  temp_range: string;
  ports: string;
  interface_type: string;
  notes: string;
  raw_section: string;
}

export interface VendorInfo {
  slug: string;
  name: string;
  chineseName: string;
  pdfSource: string;
  productCount: number;
}

export const VENDORS: VendorInfo[] = [
  {
    slug: "yutai",
    name: "Yutai Micro",
    chineseName: "裕太微",
    pdfSource: "裕太产品选型表 20250312",
    productCount: 0,
  },
  {
    slug: "3peak-analog",
    name: "3PEAK Analog",
    chineseName: "思瑞浦-模拟",
    pdfSource: "思瑞浦-模拟产品选型册_2026",
    productCount: 0,
  },
  {
    slug: "3peak-auto",
    name: "3PEAK Automotive",
    chineseName: "思瑞浦-汽车",
    pdfSource: "思瑞浦-汽车产品选型册_2026",
    productCount: 0,
  },
  {
    slug: "novosense",
    name: "Novosense",
    chineseName: "纳芯微",
    pdfSource: "纳芯微产品选型指南_202510",
    productCount: 0,
  },
];

export function getContentPath(relativePath: string): string {
  // In production (static export), content is in public/wiki/
  // In dev, we read from the project-root wiki/ symlink
  const base = process.env.CONTENT_BASE || "public/wiki";
  return `${base}/${relativePath}`;
}

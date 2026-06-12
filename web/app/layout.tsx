import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teampo 选型平台",
  description:
    "纳芯微、思瑞浦、裕太微等半导体芯片产品选型对比平台。快速查找、筛选、对比芯片参数。",
  keywords: ["芯片选型", "半导体", "纳芯微", "思瑞浦", "裕太微", "PHY", "以太网"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="min-h-full flex flex-col bg-[#0d1117]">
        {children}
      </body>
    </html>
  );
}

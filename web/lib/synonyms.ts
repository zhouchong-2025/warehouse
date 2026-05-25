// Sales-friendly synonym mapping.
// When a user types a non-technical term, expand it to matching technical terms.
export const SALES_SYNONYMS: Record<string, string[]> = {
  // Cost / Value
  "便宜": ["量产", "通用", "low cost", "工业级"],
  "高性价比": ["量产", "通用", "Production", "工业级"],
  "低成本": ["low cost", "量产"],
  "经济型": ["通用", "量产"],
  
  // Power / Efficiency
  "省电": ["低功耗", "low power", "low Iq"],
  "低功耗": ["low power", "low Iq", "nano power"],
  
  // Size / Package
  "小封装": ["SOT23", "SOT353", "DFN", "QFN", "WLCSP", "小尺寸"],
  "小尺寸": ["SOT23", "SOT353", "DFN", "WLCSP"],
  "微型": ["WLCSP", "DFN", "SOT353"],
  
  // Category translation (Chinese → technical)
  "网口芯片": ["PHY", "Ethernet", "收发器", "transceiver"],
  "以太网": ["Ethernet", "PHY", "收发器"],
  "网络芯片": ["Ethernet", "PHY", "transceiver"],
  
  // Speed
  "高速": ["high speed", "high-speed", "GHz", "Mbps"],
  "快的": ["high speed", "高速"],
  
  // Safety / Reliability
  "安全": ["隔离", "isolation", "AEC-Q100"],
  "可靠": ["AEC-Q100", "车规", "automotive", "工业级"],
  
  // Business / Supply chain
  "主流": ["量产", "Production", "MP"],
  "大批量": ["量产", "Production", "MP"],
  "有货": ["Production", "量产", "MP"],
  "交期短": ["Production", "量产", "MP"],
  "样品": ["Production", "量产", "MP", "sample"],
  
  // Localization
  "国产": ["P2P", "pin-to-pin", "兼容"],
  "替代": ["P2P", "pin-to-pin", "兼容", "alternatives"],
  "国产替代": ["P2P", "pin-to-pin", "兼容"],
  
  // Application domains
  "汽车": ["automotive", "AEC", "Q100", "车规"],
  "车规": ["automotive", "AEC-Q100", "Q1"],
  "工业": ["industrial", "工业级"],
  "消费": ["consumer", "消费级"],
};

// Get expanded search terms for a query
export function expandSearch(query: string): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const expanded = new Set<string>();
  
  for (const term of terms) {
    expanded.add(term); // always include original
    // Check synonyms
    for (const [key, synonyms] of Object.entries(SALES_SYNONYMS)) {
      if (key.toLowerCase() === term || key.includes(term) || term.includes(key)) {
        for (const s of synonyms) {
          expanded.add(s.toLowerCase());
        }
      }
    }
  }
  
  return [...expanded].join(" ");
}

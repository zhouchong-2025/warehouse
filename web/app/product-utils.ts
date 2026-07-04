// Shared types and utilities used across page.tsx and its child components

export type Product = Record<string, string>;
export type VendorData = { name: string; productCount: number; products: Product[] };

export type SearchResult = {
  vendor: string;
  vendorName: string;
  product: Product;
  score: number;
  matchedTerms: string[];
  missingTerms?: string[];
  missingNice?: string[];
  nicePartial?: boolean;
  matchSummary?: string;
  referenceOnly?: boolean;
  evidence?: { term: string; source: string }[];
  downgradeHits?: Record<string, string>;
};

export type VendorFilterOption = {
  key: string;
  name: string;
  productCount: number;
  slugs: string[];
};

export type LLMInterpretation = {
  features: string[];
  vendor: string | null;
  category_hint: string | null;
  explanation: string;
  confidence: string;
  suggestions?: { text: string; query: string; reason: string }[];
  exclude_tags?: string[];
  must?: string[];
  nice?: string[];
  mustMeta?: import("@/app/api/interpret/constraint-match").MustConstraint[];
  sortKey?: import("@/app/api/interpret/constraint-match").SortIntent;
  intent?: 'spec_search' | 'cross_ref';
  crossRefTarget?: string;
} | null;

export const CATEGORY_BADGE_PRIORITY = [
  "隔离栅极驱动", "非隔离栅极驱动", "栅极驱动", "数字隔离器", "隔离电源", "隔离放大器",
  "马达驱动", "模拟开关", "电平转换", "IO扩展器", "IO扩展", "交换机", "网卡", "以太网供电",
  "CAN-FD", "LIN", "RS-485", "RS-232", "MLVDS", "SBC",
  "DCDC", "降压", "升压", "LDO", "电压基准", "ADC", "DAC",
  "比较器", "运放", "放大器",
  "电流传感器", "温度传感器", "压力传感器", "线性位置传感器", "磁阻角度编码器", "霍尔角度编码器",
  "磁阻开关/锁存器", "霍尔开关/锁存器", "位置传感器", "速度传感器",
  "负载开关", "高边开关", "高边驱动", "电源时序", "复位芯片", "电子保险丝", "理想二极管",
  "电池监控", "BMS", "传感器接口", "匹配电阻", "视频滤波", "音频功放", "音频总线", "逻辑门",
] as const;

export const CATEGORY_BADGE_SET = new Set<string>(CATEGORY_BADGE_PRIORITY);

export function getCategoryBadge(product: Product): string {
  const tokens = (product._features || "").split(/\s+/).filter(Boolean);
  for (const tag of CATEGORY_BADGE_PRIORITY) {
    if (tokens.includes(tag)) return tag;
  }
  return (product._section || "").trim();
}

// 2026-06-16: 追踪标签匹配的证据来源
export function getEvidenceSources(product: Product, matchedTerms: string[]): { term: string; source: string }[] {
  const evidence: { term: string; source: string }[] = [];
  const detailIntro = (product._detail_intro || "").toLowerCase();
  const detailFeatures = (product._detail_features || "").toLowerCase();
  const params = (product._params || "").toLowerCase();
  const section = (product._section || "").toLowerCase();
  const features = (product._features || "").toLowerCase();

  for (const term of matchedTerms) {
    const t = term.toLowerCase();
    const sources: string[] = [];

    if (detailIntro.length > 10 && (detailIntro.includes(t) || detailFeatures.includes(t))) {
      const techTerms: Record<string, RegExp> = {
        '霍尔': /(?:线性)?霍尔|hall\s*effect/i,
        '磁阻': /tmr|amr|磁阻|magnetoresistive/i,
        'SIC': /\bsic\b|signal.improvement/i,
        '特定帧唤醒': /selective\s*wake|partial\s*network|特定帧唤醒/i,
      };
      const techRe = techTerms[term];
      const target = detailIntro + ' ' + detailFeatures;
      if (techRe && techRe.test(target)) {
        sources.push('产品介绍');
      } else {
        sources.push('产品介绍');
      }
    }

    if (params.length > 5 && params.includes(t)) {
      sources.push('参数表');
    }

    if (section.length > 3 && section.includes(t)) {
      sources.push('选型表');
    }

    if (features.includes(t)) {
      sources.push('产品标签');
    }

    evidence.push({
      term,
      source: sources[0] || '产品标签',
    });
  }
  return evidence;
}

// Get displayable params for a product
export function getDisplayParams(p: Product): [string, string][] {
  const parsedParams: [string, string][] = (p._params || "")
    .split(" | ")
    .map((pair): [string, string] | null => {
      const idx = pair.indexOf(": ");
      if (idx <= 0) return null;
      return [pair.slice(0, idx).trim(), pair.slice(idx + 2).trim()];
    })
    .filter((x): x is [string, string] => !!x && !!x[1]);

  const preferredParamOrder = [
    "供电电压(V)", "VIO 电压(V)", "输入电压", "工作电压 (V)", "工作电压(V)",
    "最大工作速率 （Mbps)", "最大工作速率(Mbps)", "低功耗模式", "封装类型", "封装", "MSL",
    "工作温度范围 (℃)", "工作温度 (℃)", "AEC-Q100",
  ];
  const chosen: [string, string][] = [];
  const seen = new Set<string>();
  for (const key of preferredParamOrder) {
    const hit = parsedParams.find(([k]) => k === key);
    if (hit && !seen.has(hit[0])) {
      chosen.push(hit);
      seen.add(hit[0]);
    }
  }
  for (const pair of parsedParams) {
    if (!seen.has(pair[0])) {
      chosen.push(pair);
      seen.add(pair[0]);
    }
    if (chosen.length >= 6) break;
  }
  if (chosen.length > 0) return chosen.slice(0, 6);

  const priority = [
    "_section", "package", "封装", "status", "状态", "supply_v_min", "supply_v_max",
    "gbw_mhz", "channels", "rating", "temp_range", "工作温度",
    "description", "产品描述", "category", "process_node", "ports",
  ];
  const params: [string, string][] = [];
  for (const key of priority) {
    if (p[key] && p[key].length < 60) {
      params.push([key.replace(/_/g, " "), p[key]]);
    }
  }
  for (const [k, v] of Object.entries(p)) {
    if (!priority.includes(k) && v && v.length < 40 && k !== "part_number" && k !== "vendor_section" && !k.startsWith("param_")) {
      if (params.length < 8) params.push([k.replace(/_/g, " "), v]);
    }
  }
  return params.slice(0, 6);
}

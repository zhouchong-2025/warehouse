// ── LLM Numeric Fallback ──
// When regex extractors fail but _params contains family-related keywords,
// batch-fallback to LLM for numeric extraction. One LLM call per family per request.

import type { ConstraintProduct } from './constraint-match';

const FAMILY_HINTS: Record<string, RegExp> = {
  '通道': /通道|正向.*反向|channel/i,
  'Iout': /输出电流|电流限制|iout|current|current_limit/i,
  'Mbps': /mbps|码流|数据速率|data.*rate/i,
  'bit': /bit|位|分辨/i,
  'kVrms': /kvrms|隔离电压|isolation/i,
  '端口': /端口|port/i,
};

interface LlmFallbackItem {
  pn: string;
  params: string;
}

// Collect products where regex fails for a family but keywords suggest data exists.
// Returns Map<family, Set<pn>>
function collectLlmCandidates(
  products: ConstraintProduct[],
  families: string[],
  extractors: Record<string, (p: ConstraintProduct, toks: string[]) => number | null>
): Map<string, Set<string>> {
  const candidateMap = new Map<string, Set<string>>();
  for (const family of families) {
    const hintRe = FAMILY_HINTS[family];
    if (!hintRe) continue;
    const extractor = extractors[family];
    if (!extractor) continue;
    const pnSet = new Set<string>();
    for (const p of products) {
      const pn = String((p as any).pn || (p as any).part_number || "");
      const toks = (p._features || '').toLowerCase().split(/\s+/);
      // Regex succeeded? Skip.
      if (extractor(p, toks) != null) continue;
      // Keywords present? Candidate for LLM.
      if (hintRe.test(p._params || '')) {
        pnSet.add(pn);
      }
    }
    if (pnSet.size > 0) candidateMap.set(family, pnSet);
  }
  return candidateMap;
}

function buildLlmExtractPrompt(family: string, items: LlmFallbackItem[]): string {
  const pnList = items.map(i => `[${i.pn}] ${i.params.slice(0, 300)}`).join('\n');
  const rules: Record<string, string> = {
    '通道': '规则: "正向/反向通道: X/Y"→X+Y; "X通道"→X; "通道数: X"→X。取所有变体的最大值。',
    'Iout': '规则: 提取最大输出电流(A)。"电流限制: XA"→X; "Iout: XmA"→X/1000。取最大值。',
    'Mbps': '规则: 提取最大数据速率(Mbps)。"最大码流: X Mbps"→X; "data rate: X"→X。取最大值。',
    'bit': '规则: 提取分辨率(bit)。"12bit"→12; "分辨率: 16位"→16。取最大值。',
    'kVrms': '规则: 提取隔离电压(kVrms)。"隔离电压: X kV"→X; "ISO: X kVrms"→X。取最大值。',
  };
  return `你是半导体数据提取助手。从产品参数中提取数值。

参数: ${family}
${rules[family] || '提取该参数的最大值。'}
产品列表:
${pnList}

仅输出JSON: {产品型号: 数值, ...}`;
}

export async function batchLlmExtract(
  family: string,
  items: LlmFallbackItem[],
  apiKey: string
): Promise<Map<string, number>> {
  if (!apiKey || items.length === 0) return new Map();
  const prompt = buildLlmExtractPrompt(family, items);
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 500 }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!resp.ok) return new Map();
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return new Map();
    const result = JSON.parse(jsonMatch[0]);
    const map = new Map<string, number>();
    for (const [pn, val] of Object.entries(result)) {
      const num = typeof val === 'number' ? val : parseFloat(String(val));
      if (!Number.isNaN(num)) map.set(pn.toUpperCase(), num);
    }
    return map;
  } catch {
    return new Map();
  }
}

// DEEPSEEK_API_KEY placeholder — injected at call time from route.ts
let _llmApiKey = '';
export function setLlmApiKey(key: string) { _llmApiKey = key; }

export async function runLlmFallbacks(
  products: ConstraintProduct[],
  usedFamilies: string[],
  extractors: Record<string, (p: ConstraintProduct, toks: string[]) => number | null>
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (!_llmApiKey) return result;
  
  const candidates = collectLlmCandidates(products, usedFamilies, extractors);
  for (const [family, pnSet] of candidates) {
    const items: LlmFallbackItem[] = [];
    for (const p of products) {
      const pn = String((p as any).pn || (p as any).part_number || "");
      if (pnSet.has(pn)) {
        items.push({ pn, params: p._params || '' });
      }
    }
    if (items.length > 0) {
      const cache = await batchLlmExtract(family, items, _llmApiKey);
      result.set(family, cache);
    }
  }
  return result;
}

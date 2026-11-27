/** Explicit query roles and package constraints shared by the parser and matcher. */
export function explicitVoltageRoles(query: string): { tags: string[]; consumed: string[] } {
  const tags: string[] = [], consumed: string[] = [];
  const claimed: [number, number][] = [];
  const patterns: [RegExp, string][] = [
    [/(?:输入(?:电压)?|供电(?:电压)?|vin|input(?:\s+voltage)?)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*v\b/gi, 'Vin'],
    [/(?:输出(?:电压)?|vout|output(?:\s+voltage)?)\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*v\b/gi, 'Vout'],
    [/(\d+(?:\.\d+)?)\s*v\s*(?:输入(?:电压)?|供电(?:电压)?|input(?:\s+voltage)?)/gi, 'Vin'],
    [/(\d+(?:\.\d+)?)\s*v\s*(?:输出(?:电压)?|output(?:\s+voltage)?)/gi, 'Vout'],
  ];
  const candidates = patterns.flatMap(([pattern, role]) => [...query.matchAll(pattern)].map(match => ({ match, role })))
    .sort((a, b) => a.match.index! - b.match.index!);
  for (const { match, role } of candidates) {
    const start = match.index!, end = start + match[0].length;
    if (claimed.some(([lo, hi]) => start < hi && end > lo)) continue;
    const value = Number(match[1]);
    if (!(value > 0 && value <= 600)) continue;
    tags.push(`${role}_${value}V`);
    consumed.push(match[0]);
    claimed.push([start, end]);
  }
  return { tags: [...new Set(tags)], consumed };
}

export const PACKAGE_QUERY = /\b(?:(?:HMSOP|NSOT|SOT|SOP|SOIC|MSOP|TSSOP|HSOP|HTSSOP|SOW|DUB|QFN|DFN|TO|LQFP|BGA)\s*-?\s*\d+(?:\s*-\s*\d+)?[A-Z]*(?:\s*封装)?|HMSOP\s*封装)/gi;
// SOP-8/SOP8 are spelling variants; the pin suffix in SOT23-5 must survive.
const normalizePackage = (text: string) => text.replace(/封装|\s/g, '').toUpperCase().replace(/^([A-Z]+)-(?=\d)/, '$1');
export const packageTag = (text: string) => `${normalizePackage(text)}封装`;
export const isPackageTag = (tag: string) => /^(?:(?:HMSOP|NSOT|SOT|SOP|SOIC|MSOP|TSSOP|HSOP|HTSSOP|SOW|DUB|QFN|DFN|TO|LQFP|BGA)\d+(?:-\d+)?[A-Z]*|HMSOP)封装$/i.test(tag);

export function packageMatches(params: string, tag: string): boolean | null {
  const expected = normalizePackage(tag);
  const fields = params.split('|').filter(entry => /^(?:package|封装(?:类型|形式)?)\s*[:：]/i.test(entry.trim()));
  if (!fields.length) return null;
  const tokens = fields.flatMap(field => field.slice(field.search(/[:：]/) + 1).toUpperCase()
    .match(/[A-Z]+\s*-?\s*\d+(?:\s*-\s*\d+)?[A-Z0-9.]*|\bHMSOP\b/g) || []);
  if (!tokens.length) return null;
  return tokens.some(token => {
    const actual = normalizePackage(token);
    return actual === expected || (!expected.includes('-') && actual.startsWith(`${expected}-`));
  });
}

/** A deterministic field cannot acquire a second, conflicting value from a model. */
export function mergeModelFeatures(parsed: string[], proposed: string[]): string[] {
  const family = (tag: string) => tag.match(/^(Vin|Vout|Iout)_/)?.[1] || (isPackageTag(tag) ? 'Package' : '');
  const owned = new Set(parsed.map(family).filter(Boolean));
  return [...new Set([...parsed, ...proposed.filter(tag => !owned.has(family(tag)))])];
}

export function isExplicitPreference(query: string, tag: string): boolean {
  const grade: Record<string, string> = {
    '车规AEC-Q100': '车规|车载|汽车级|automotive|AEC[ -]?Q100',
    '工业级': '工业级|工规|industrial',
    '消费级': '消费级',
  };
  const phrase = grade[tag] || (isPackageTag(tag) ? tag.replace('封装', '').replace(/([A-Z]+)(\d+)/, '$1[\\s-]*$2') + '(?:封装)?' : '');
  return !!phrase && new RegExp(`(?:优先|最好|尽量|偏好|prefer(?:red)?)[\\s用是为:：]*(?:${phrase})|(?:${phrase})\\s*(?:优先|更好|preferred)`, 'i').test(query);
}
/** Ordinary AEC-Q100 means automotive grade in this selection workflow. */
export const AEC_DOCUMENT_QUERY = /aec\s*[- ]?q\s*[- ]?100.{0,20}(?:证书|测试报告|验证报告|认证证明|certificate|test\s*report|qualification\s*report)|(?:证书|测试报告|验证报告|认证证明|certificate|test\s*report|qualification\s*report).{0,20}aec\s*[- ]?q\s*[- ]?100/i;

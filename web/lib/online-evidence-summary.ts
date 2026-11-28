export type OnlineCitation = { url: string; page: number; quote: string; sha256?: string };
export type OnlineCheck = {
  requirementId?: string;
  verification?: string;
  model?: string;
  source: string;
  outcome: string;
  explanation: string;
  conditions?: string;
  citations: OnlineCitation[];
};

type SalesEvidenceLine = {label: string; status: string; value?: string; condition?: string; next?: string};

export function salesEvidenceLine(check: OnlineCheck): SalesEvidenceLine {
  const label = check.source.trim();
  const isPsrr = /\bpsrr?\b|电源抑制比/i.test(label);
  const isNoise = /噪声|\bnoise\b/i.test(label);
  const shortLabel = isPsrr && /^(?:高\s*)?(?:psrr?|电源抑制比)(?:\s*抑制)?$/i.test(label) ? '电源抑制比（PSRR）' : label;
  if (!check.citations.length) return {label:shortLabel,status:'待补资料',next:'请确认是否有原厂规格书或测试报告'};
  if (check.outcome === 'conflicts') return {label:shortLabel,status:'可能不符',next:'请与 FAE 核对规格和实际工况'};

  const explanation = check.explanation;
  // Compact old and new responses without another model request. Only use the
  // concise format when a single specification and its qualifiers are explicit.
  if (isPsrr) {
    // Read values and operating conditions from the same cited specification row.
    const rowPattern = /(?:PSRR\s+)?power[\s-]+supply[\s-]+rejection\s+ratio\s+V\s*_?\s*CM\s*=\s*([\d.]+)\s*V\s*[,;，]?\s*V\s*_?\s*S\s*=\s*([\d.]+)\s*V?\s*(?:to|至|到|～|~|–|-)\s*([\d.]+)\s*V\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*dB\b/i;
    const row = check.citations.map(c => rowPattern.exec(c.quote)).find(Boolean);
    if (row) {
      const [, commonMode, lowSupply, highSupply, first, second] = row;
      const stats = explanation + ' ' + (check.conditions || '');
      const qualified = (word: string, numeric: string) =>
        new RegExp(word + '(?:值)?\\s*(?:为|是|[:：])?\\s*' + numeric.replace('.', '\\.') + '\\s*dB', 'i').test(stats);
      const value = qualified('(?:最小|\\bmin(?:imum)?\\.?)', first) && qualified('(?:典型|\\btyp(?:ical)?\\.?)', second)
        ? `最小 ${first} dB，典型 ${second} dB` : `规格表列值 ${first} / ${second} dB（列别待核）`;
      return {label:shortLabel,status:'已查到规格',value,
        condition:`输入共模 ${commonMode} V，供电 ${lowSupply}–${highSupply} V`,
        next:'客户有指定频率时，由 FAE 核对该频点'};
    }
  }
  if (check.outcome !== 'supports') {
    if (/效率|负载.*(?:瞬态|瞬变|阶跃)|efficiency|load (?:step|transient)/i.test(label) && explanation.trim()) {
      const sentence = explanation.trim().match(/^[^。！？]+[。！？]?/)?.[0];
      return {label:shortLabel,status:'工况待核',next:sentence || explanation.trim()};
    }
    const graphOnly = isPsrr && check.citations.every(c=>/figure|frequency|vs\.|曲线/i.test(c.quote));
    return {label:shortLabel,status:'待核实',next:graphOnly ? '本次只引用了曲线，未取得可核验的 PSRR 数值' :
      '本次引用未确认该条件的具体规格'};
  }
  if (isNoise && /^(?:低噪声|噪声)$/i.test(label)) {
    const text = explanation + ' ' + (check.conditions || '');
    const density = /电压噪声密度\s*(?:典型(?:值)?\s*(?:为|[:：])?\s*)?(\d+(?:\.\d+)?)\s*nV\s*\/\s*√Hz\s*[（(]\s*(?:f\s*=\s*)?(\d+(?:\.\d+)?)\s*(kHz|Hz)/i.exec(text);
    const explicitlyTypical = /(?:密度[^；。]{0,70}典型|均为典型|典型值口径)/i.test(text);
    const quoteMatches = density && check.citations.some(c => {
      const numbers: string[] = c.quote.match(/\d+(?:\.\d+)?/g) || [];
      return /noise density|low noise/i.test(c.quote) && /nV\s*\/\s*√Hz/i.test(c.quote) &&
        numbers.includes(density[1]) && new RegExp('(?:^|[^0-9.])' + density[2].replace('.','\\.') + '\\s*' + density[3], 'i').test(c.quote);
    });
    if (density && explicitlyTypical && quoteMatches) return {
      label:'输入电压噪声密度',status:'已查到规格', value:`${density[1]} nV/√Hz`,
      condition:`${density[2]} ${density[3]}，典型值`, next:'客户有噪声上限或频段时，请补充目标',
    };
  }
  if (/^(?:轨到轨|RRIO|轨到轨输入[/、与和]?输出)$/i.test(label) && check.citations.some(citation =>
      /^(?:rail[- ]to[- ]rail (?:input and output|i\/o)|轨到轨输入(?:及|与|和)输出)[.。]?$/i.test(citation.quote.trim()))) {
    return {label:'轨到轨',status:'已查到规格',value:'支持轨到轨输入和输出'};
  }
  // Avoid cutting a qualified engineering claim midway and turning it into a
  // broad promise. Long or compound results retain the full text on demand.
  const value = explanation.trim();
  const condition = check.conditions?.trim();
  // A self-contained specification sentence can be shown even when the
  // following engineering notes are long. Keep its bound and operating point.
  const spec = /^([^。！？；]{1,80}(?:典型|最小|最大)[^。！？；（）()]{1,55})[（(]([^（）()。！？；]{1,65})[）)][。.]?/.exec(value);
  if (spec && /\d/.test(spec[2]) && /\d\s*(?:[μµnumkMGT]?V|[μµnumkM]?A|[kMGT]?Hz|dB|Ω|°C|ns|ms|W)\b/i.test(spec[1])) {
    const numbers = (text: string): string[] => text.match(/\d+(?:\.\d+)?/g) || [];
    const required = numbers(spec[0]);
    if (check.citations.some(c => required.every(n => numbers(c.quote).includes(n))))
      return {label:shortLabel,status:'规格摘录',value:spec[1],condition:spec[2]};
  }
  if (value && value.length <= 115 && (!condition || condition.length <= 100))
    return {label:shortLabel,status:'已查到规格',value,condition};
  const firstSentence = value.match(/^[^。！？]+[。！？]/)?.[0]?.trim();
  if (firstSentence && firstSentence.length <= 115 && condition && condition.length <= 100 &&
      /\d|明确支持|明确列出|明确提供/.test(firstSentence))
    return {label:shortLabel,status:'规格摘录',value:firstSentence,condition};
  return {label:shortLabel,status:'资料需复核'};
}

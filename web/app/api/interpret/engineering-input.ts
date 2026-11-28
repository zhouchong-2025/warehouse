/** Normalize a small, auditable typography allowlist, never global Unicode NFKC or unit case. */
export function normalizeEngineeringInput(text: string): string {
  return text
    .replace(/[０-９Ａ-Ｚａ-ｚ＋－．／％＜＞＝]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))
    .replace(/[\u00A0\u202F\u3000]/g,' ')
    .replace(/(?<=[A-Za-z0-9μµΩ])[\u200B\u2060\uFEFF](?=[A-Za-z0-9μµΩ])/g,'')
    .replace(/[\u2010\u2011\uFE63]/g,'-').replace(/﹢/g,'+')
    .replace(/(?<=[A-Za-z])−(?=[A-Za-z])/g,'-')
    .replace(/\b([A-Za-z]+\s*\d+)−(?=\d)/g,'$1-')
    .replace(/Ω/g,'Ω')
    .replace(/≦/g,'≤').replace(/≧/g,'≥')
    .replace(/\+\s*\/\s*-\s*(?=\d)/g,'±')
    .replace(/(?<![A-Za-z0-9_])([−+-]?\d+(?:\.\d+)?)\s*[—‒∼〜]\s*([−+-]?\d+(?:\.\d+)?\s*(?:[kmuμµ]?V|[munpμµ]?A|[kMG]?Hz|[kMG]?bps|°C|℃|%))(?=$|[^A-Za-z0-9])/g,'$1~$2')
    .replace(/\[([^\]]+)\]\(mailto:[^)]*\)/gi,(whole,label:string)=>
      /\d\s*(?:[kmunpμµ]?V|[kmunpμµ]?A|Hz|Ω|℃|°C)/i.test(label)&&!/[a-z][a-z]{2,}@/i.test(label)?label.replace(/^mailto:/i,''):whole)
    .replace(/\bmailto:(?=\d+(?:\.\d+)?(?:[kmuμµ]?V|[kmuμµ]?A)@)/gi,'')
    .replace(/\\([~±≤≥×])/g,'$1');
}

/** Direction overrides can change displayed numeric order; do not silently strip or guess them. */
export function hasDirectionalNumberControls(text:string):boolean{
  return /[\u202A-\u202E\u2066-\u2069]/.test(text);
}

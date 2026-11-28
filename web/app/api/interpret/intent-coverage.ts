export function selectionRequestOnly(source:string):boolean{
  return /^(?:请|帮我)?(?:选哪[颗款]|推荐哪[颗款]|给[个一]推荐|选型建议|(?:推荐|给出|提供)(?:具体|可用|合适)?(?:型号|料号)|推荐|有吗|有没有|有(?:现成|可用|对应|合适)型号吗)[？?。！!]*$/.test(source.replace(/\s/g,''));
}

/** Coverage is a loss detector, not a semantic classifier or a product fact. */
export function uncoveredCharacters(query:string,sources:string[]):string{
  const covered = new Uint8Array(query.length);
  for (const source of sources) {
    if (!source) continue;
    // A repeated phrase must be covered at every occurrence, not only indexOf's first one.
    let at = query.indexOf(source);
    while (at >= 0) {
      covered.fill(1, at, at + source.length);
      at = query.indexOf(source, at + source.length);
    }
  }
  return query.split('').map((c,i)=>covered[i]?' ':c).join('');
}
export function uncoveredIntent(query: string, sources: string[]): string[] {
  const masked=uncoveredCharacters(query,sources);
  const residuals: string[] = [];
  for (const clause of query.matchAll(/[^，,；;。\n]+/g)) {
    if(selectionRequestOnly(clause[0].trim()))continue;
    const start = clause.index!;
    let residual = '';
    for (let i = 0; i < clause[0].length; i++) residual += masked[start+i];
    // Only connective/request scaffolding is ignored; unknown technical language is retained.
    const meaningful = residual.replace(/请问|帮我|帮忙|寻找|找个|找一款|需要|要求|有没有|是否有|能否|可以|支持|具备|用于|以及|并且|同时|最好|优先|或者|或是|以上|以下|至少|不超过|的|和|与|及|转|到|为|要|是|个|款/g, '')
      .replace(/[\s\p{P}\p{S}]/gu, '');
    if (/[\p{L}\p{N}]{2}/u.test(meaningful)) residuals.push(clause[0].trim());
  }
  return [...new Set(residuals)];
}

/** Keep omitted number/unit fragments visible even when the unit is unfamiliar. */
export function uncoveredQuantityFragments(query: string, sources: string[]): string[] {
  const residual = uncoveredCharacters(query, sources);
  const fragments = [...query.matchAll(/(?<![A-Za-z0-9.+-])\d+(?:\.\d+)?\s*\p{Script=Han}(?=的|[，,；;。！？!?]|$)/gu)];
  return [...new Set(fragments.filter(match => {
    const start = match.index!;
    const source = match[0];
    // Ordinary time references and request scaffolding do not assert a spec.
    if (/[年月日颗款个]$/u.test(source)) return false;
    return /[\d\p{Script=Han}]/u.test(residual.slice(start, start + source.length));
  }).map(match => match[0]))];
}

import { sourceFactsForProduct, type VerifiedSource } from './source-facts';
import type { FactProduct } from './selection-spec';
import type { PendingEvidenceCheck } from './pending-evidence';
export type PackageLimit = { sides: [number, number]; basis: 'body_nominal' | 'body_maximum' | 'pcb' | 'overall'; assumed: boolean };
export function packageLimit(source: string): PackageLimit | null {
  if (/不要|排除|不选|平方|mm²|mm2/i.test(source)) return null;
  if (!/封装|package|尺寸|占地|footprint/i.test(source)) return null;
  const m = source.match(/(\d+(?:\.\d+)?)\s*(?:mm|毫米)?\s*[×x*]\s*(\d+(?:\.\d+)?)\s*(?:mm|毫米)?(?![A-Za-zμµ])(?!\s*[×x*]\s*\d)/i);
  if (!m || /\d\s*[×x*]\s*\d\s*[×x*]\s*\d/i.test(source) || /至少|大于|不小于|[>≥]/.test(source)) return null;
  const sides = [Number(m[1]), Number(m[2])].sort((a,b)=>a-b) as [number,number];
  if (sides.some(n=>n<=0||n>100)) return null;
  const basis = /PCB|焊盘|占地|占板|板上空间|footprint|land.pattern/i.test(source) ? 'pcb' : /含引脚|总外形|overall/i.test(source) ? 'overall'
    : /严格|最大外形|最大尺寸|含公差|绝对尺寸|maximum/i.test(source) ? 'body_maximum' : 'body_nominal';
  return {sides,basis,assumed:basis==='body_nominal'&&!/本体|body|标称|nominal/i.test(source)};
}
export type DimensionOption = { label: string; sides: [number,number] | null; source: VerifiedSource };
export function packageDimensionOptions(product: FactProduct): DimensionOption[] {
  const rows = sourceFactsForProduct(product).filter(f=>f.scope==='self'&&/^(?:package|package_cell|package_type)$/.test(f.field));
  const seen = new Set<string>();const options: DimensionOption[]=[];
  for (const row of rows) for (const piece of (row.publishedValue||'').split(/[,，、;/|]+/)) {
    const label=piece.trim();if(!label||seen.has(label))continue;seen.add(label);
    // Parse dimensions printed in the package cell; never infer from pin count or a package family name.
    const d=label.match(/(\d+(?:\.\d+)?)\s*(?:mm|毫米)?\s*[×x*]\s*(\d+(?:\.\d+)?)\s*(?:mm|毫米)?/i);
    options.push({label,sides:d?[Number(d[1]),Number(d[2])].sort((a,b)=>a-b) as [number,number]:null,source:row.source});
  }
  return options;
}
export function packageScreening(product: FactProduct, source: string): PendingEvidenceCheck | null {
  const limit=packageLimit(source);if(!limit)return null;
  const options=packageDimensionOptions(product);
  const assumption=limit.assumed?`先按封装本体标称长宽不超过 ${limit.sides.join('×')}mm 筛选；未将其理解成PCB焊盘占地或含公差的最大外形。`:undefined;
  const base={source,blocksMatch:!/优先|最好|偏好|尽量|不要求|不需要/.test(source),assumption};
  const evidence=[...new Map(options.map(o=>[o.source.factId,o.source])).values()];
  const observed=options.length?`原厂目录封装选项：${options.map(o=>o.label).join('、')}`:undefined;
  if(limit.basis!=='body_nominal')return {...base,status:'unknown',statusText:'已理解尺寸口径，待核机械尺寸图',observed,evidence,
    reason:'当前封装名称中的标称本体尺寸不能证明PCB占地、含引脚外形或公差最大值；按你指定的口径核对具体封装图。',nextStep:'核对完整封装代码的尺寸图或推荐焊盘图，不需要再次确认已明确的口径。'};
  const fits=options.filter(o=>o.sides&&o.sides.every((n,i)=>n<=limit.sides[i]+1e-9));
  const unknown=options.some(o=>!o.sides);
  if(fits.length)return {...base,status:options.length===1?'supported':'unknown',statusText:options.length===1?'本体标称尺寸有目录证据':'有尺寸合适的封装选项，订购版本待核',observed,evidence,
    recommendationRank:2,reason:`${fits.map(o=>`${o.label}（${o.sides!.join('×')}mm）`).join('、')}符合本体标称长宽限制。${options.length>1?'该目录型号还列有其他封装，优先核对上述版本的完整订购代码与所需电压/功能组合。':'这一结论只核验尺寸单项，不代表散热、焊盘占地及其他指标全部满足。'}`,
    nextStep:'优先核对所列小封装的完整订购代码、散热和应用条件。'};
  if(options.length&&!unknown)return {...base,status:'contradicted',observed,evidence,reason:`目录列出的本体标称长宽均超出 ${limit.sides.join('×')}mm，按长宽逐项比较，未用面积或脚数替代。`};
  return {...base,status:'unknown',statusText:'按默认尺寸口径继续筛选，封装尺寸待补',observed,evidence,recommendationRank:0,
    reason:'已理解尺寸限制；现有封装记录未给出足够长宽。可继续保留为资料线索，优先补查具体封装版本，不把缺尺寸误判成不满足。',nextStep:'查原厂该封装代码的本体标称尺寸；不靠QFN/DFN/SOT名称或脚数猜尺寸。'};
}

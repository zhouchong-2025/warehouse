// constraint-match.ts
// must/nice 约束匹配 + 维度感知的三级降级兜底
//
// 设计原则(FAE级筛选, 非关键词词袋):
//   1. must 分维度: category(品类,绝不放松) > media(物理层,硬) > spec(规格,可就近) > grade(等级,可放松)
//   2. 降级时按维度优先级放松: 先保品类+物理层, 再松等级, 最后松规格(端口就近)
//   3. 端口/通道向下兼容: 要5口, 9口/11口也能用(多口可作少口), 但精确5口排最前
//   4. 零结果不冷处理: 说清楚"为了找到产品, 放松了哪个维度", 主动给替代方案

export type ConstraintDimension = 'category' | 'media' | 'spec' | 'grade';
export interface MustConstraint {
  tag: string;
  dimension: ConstraintDimension;
  family?: string;
  value?: number;
  downgradable?: boolean;  // 端口/通道: 要N, ≥N也可
}

export type ConstraintProduct = {
  part_number?: string;
  _features?: string;
  _section?: string;
  _params?: string;
  _params_numeric?: Record<string, unknown>;
  [k: string]: unknown;
};

// 排序意图(与 query_parser.ts 的 SortIntent 同构; 在此重声明避免跨目录类型耦合)
export interface SortIntent {
  param: string;
  paramKeys: string[];       // _params_numeric 字段名小写子串候选
  direction: 'high' | 'low';
  require: boolean;          // true=无该参数数值的产品过滤掉
  label: string;
}

// 从产品的 _params_numeric 取排序数值. 命中多个候选字段时, 按方向取最优(high→max, low→min).
// 无任何命中字段或字段无数值 → 返回 null(require 模式下会被过滤; 否则排最后).
export function sortValueOf(product: ConstraintProduct, sk: SortIntent): number | null {
  const pn = product._params_numeric;
  if (!pn || typeof pn !== 'object') return null;
  let best: number | null = null;
  for (const [key, val] of Object.entries(pn)) {
    const kl = key.toLowerCase();
    if (!sk.paramKeys.some((pk) => kl.includes(pk))) continue;
    // val 形如 {value, unit, raw} 或区间 {min,max}. 取标量 value(无则 range 的代表值).
    const v = val as { value?: unknown; min?: unknown; max?: unknown } | null;
    let num: number | null = null;
    if (v && typeof v.value === 'number') num = v.value;
    else if (v && typeof v.max === 'number') num = v.max as number;
    if (num == null || Number.isNaN(num)) continue;
    if (best == null) best = num;
    else best = sk.direction === 'high' ? Math.max(best, num) : Math.min(best, num);
  }
  return best;
}

// 比较两个产品的排序数值. require/有值优先, 然后按方向. 返回负=a在前.
function compareBySort(a: ConstraintProduct, b: ConstraintProduct, sk: SortIntent): number {
  const va = sortValueOf(a, sk);
  const vb = sortValueOf(b, sk);
  if (va == null && vb == null) return 0;
  if (va == null) return 1;   // 无值排后
  if (vb == null) return -1;
  return sk.direction === 'high' ? vb - va : va - vb;
}

// 单个 must 约束是否被产品满足。meta 提供维度/向下兼容语义。
//   - 端口/通道(downgradable): 产品规格 ≥ 要求值即满足(多口可作少口用); 精确相等在排序时加权
//   - 其他: 产品 token 等于约束, 或包含约束作为完整段
export function tagSatisfied(product: ConstraintProduct, tag: string, meta?: MustConstraint): boolean {
  const feats = (product._features || "").toLowerCase();
  const tokens = feats.split(/\s+/).filter(Boolean);
  const t = tag.toLowerCase();

  // 端口/通道向下兼容: 要 N口/N通道, 产品 ≥N 即满足
  if (meta?.downgradable && meta.value != null && (meta.family === '端口' || meta.family === '通道')) {
    const unit = meta.family === '端口' ? '口' : '通道';
    return tokens.some((tk) => {
      const m = tk.match(new RegExp(`^(\\d+)${unit}`));
      return m !== null && +m[1] >= meta.value!;
    });
  }

  // 端口精确(无 meta 时的回退, 防 15口 误配 5口)
  const portMatch = t.match(/^(\d+)口$/);
  if (portMatch) {
    const n = portMatch[1];
    return tokens.some((tk) => {
      const m = tk.match(/^(\d+)口/);
      return m !== null && m[1] === n;
    });
  }

  return tokens.some((tk) => tk === t || tk.includes(t));
}

// 端口/通道是否"精确"满足(用于排序: 精确5口 优于 9口降级)
//   - 端口/通道: 产品含 N口/N通道 token 且 N === 要求值
//   - Iout/Vin 等累积阈值规格: 产品该 family 的"最高档" === 要求值即精确
//     (6A产品最高档=6满足"要6A"精确; 12A产品最高档=12 → 降级命中, 排在精确档之后)
function exactSpecHit(product: ConstraintProduct, meta: MustConstraint): boolean {
  if (meta.value == null) return false;
  const tokens = (product._features || "").toLowerCase().split(/\s+/);
  if (meta.family === '端口' || meta.family === '通道') {
    const unit = meta.family === '端口' ? '口' : '通道';
    return tokens.some((tk) => {
      const m = tk.match(new RegExp(`^(\\d+)${unit}`));
      return m !== null && +m[1] === meta.value;
    });
  }
  // 累积阈值规格(Iout_<n>A / Vin_<n>V): 取产品该 family 最高数值档与要求值比较
  if (meta.family === 'Iout' || meta.family === 'Vin') {
    const prefix = meta.family === 'Iout' ? 'iout_' : 'vin_';
    const suffix = meta.family === 'Iout' ? 'a' : 'v';
    let maxVal = -1;
    for (const tk of tokens) {
      if (tk.startsWith(prefix) && tk.endsWith(suffix)) {
        const num = parseFloat(tk.slice(prefix.length, -suffix.length));
        if (!Number.isNaN(num) && num > maxVal) maxVal = num;
      }
    }
    return maxVal === meta.value;
  }
  return false;
}

export type ConstraintScore = {
  product: ConstraintProduct;
  mustHit: string[];      // 满足的 must
  mustMiss: string[];     // 缺失的 must
  niceHit: string[];      // 满足的 nice
  fullMatch: boolean;     // must 全满足
  score: number;          // 排序分
  exactBonus: number;     // 精确规格命中数(端口/通道精确, 用于排序: 精确优于向下兼容)
  missDims: ConstraintDimension[];  // 缺失约束所属维度(用于降级话术)
};

// 把 must(string[]) + mustMeta 对齐成带维度的约束列表。
// 无 mustMeta 时(向后兼容)默认每个 must 都是 category 维度(最保守, 不放松)。
function alignMeta(must: string[], mustMeta?: MustConstraint[]): MustConstraint[] {
  if (mustMeta && mustMeta.length === must.length) return mustMeta;
  const byTag = new Map((mustMeta || []).map((m) => [m.tag, m]));
  return must.map((t) => byTag.get(t) || { tag: t, dimension: 'category' as ConstraintDimension });
}

// 对一组产品按 must/nice 评分(不过滤, 仅打分排序用)
export function scoreByConstraints(
  products: ConstraintProduct[],
  must: string[],
  nice: string[],
  mustMeta?: MustConstraint[]
): ConstraintScore[] {
  const metas = alignMeta(must, mustMeta);
  return products.map((product) => {
    const mustHit: string[] = [];
    const mustMiss: string[] = [];
    const missDims: ConstraintDimension[] = [];
    let exactBonus = 0;
    for (const meta of metas) {
      if (tagSatisfied(product, meta.tag, meta)) {
        mustHit.push(meta.tag);
        if (exactSpecHit(product, meta)) exactBonus++;
      } else {
        mustMiss.push(meta.tag);
        missDims.push(meta.dimension);
      }
    }
    const niceHit = nice.filter((n) => tagSatisfied(product, n));
    const fullMatch = mustMiss.length === 0;
    // 分数: must命中×10(主导) + 精确规格×3(精确5口优于9口降级) + nice命中×1
    const score = mustHit.length * 10 + exactBonus * 3 + niceHit.length;
    return { product, mustHit, mustMiss, niceHit, fullMatch, score, exactBonus, missDims };
  });
}

export type ConstraintResult = {
  tier: 1 | 2 | 3;                  // 1=全命中 2=部分降级 3=品类兜底
  banner: string;                   // 顶部说明横幅
  items: ConstraintScore[];         // 排序后的结果
};

const DIM_LABEL: Record<ConstraintDimension, string> = {
  category: '品类', media: '物理层接口', spec: '规格', grade: '等级',
};

// 维度感知的三级降级筛选主入口
//   tier1: must 全满足(端口/通道向下兼容). 精确规格排最前.
//   tier2: 无全满足 → 在"保住品类+物理层"的前提下, 按维度优先级放松(先松等级, 再松规格).
//          banner 说清楚为了找到产品放松了哪个维度.
//   tier3: 连品类都没有 → 少量最接近 + 方向性建议.
export function applyConstraints(
  products: ConstraintProduct[],
  must: string[],
  nice: string[],
  mustMeta?: MustConstraint[],
  sortKey?: SortIntent
): ConstraintResult {
  const metas = alignMeta(must, mustMeta);
  const scored = scoreByConstraints(products, must, nice, mustMeta);

  // 维度优先级: category/media 是"硬维度"(降级时必须保住), spec/grade 是"软维度"(可放松)
  const hardTags = new Set(metas.filter((m) => m.dimension === 'category' || m.dimension === 'media').map((m) => m.tag));
  const isHardSatisfied = (s: ConstraintScore) => [...hardTags].every((t) => s.mustHit.includes(t));

  // ── 排序意图(高/低 + 参数 → 数值排序) ──
  // require=true: 无该参数数值的产品直接出局(查"高PSRR"就该有PSRR数据, FAE确认).
  // 命中产品按数值方向排序, 数值相同再用约束分细排.
  const applySort = (arr: ConstraintScore[]): ConstraintScore[] => {
    if (!sortKey) return arr;
    let pool = arr;
    if (sortKey.require) {
      pool = arr.filter((s) => sortValueOf(s.product, sortKey) != null);
    }
    return [...pool].sort(
      (a, b) => compareBySort(a.product, b.product, sortKey)
        || b.exactBonus - a.exactBonus || b.niceHit.length - a.niceHit.length || b.score - a.score
    );
  };

  // tier1: must 全满足. 有排序意图→数值排序(require时先过滤无数据); 否则 精确规格 > nice > score
  const full = scored.filter((s) => s.fullMatch);
  if (full.length > 0) {
    const sortedFull = sortKey ? applySort(full) : full.sort((a, b) => b.exactBonus - a.exactBonus || b.niceHit.length - a.niceHit.length || b.score - a.score);
    if (sortedFull.length > 0) {
      const banner = sortKey ? `共 ${sortedFull.length} 款匹配，${sortKey.label}排序：` : "";
      return { tier: 1, banner, items: sortedFull };
    }
    // require 排序把全部过滤光了(全匹配但都无该参数数值) → 落到 tier2 诚实说明
  }

  // tier2: 保住所有硬维度(品类+物理层)的产品里降级. 这些产品品类对、物理层对, 只是规格/等级不完全匹配.
  const hardOk = scored.filter((s) => hardTags.size > 0 && isHardSatisfied(s));
  if (hardOk.length > 0) {
    // ── 规格超限检测(选项B): 对端口/通道这类可向下兼容的spec, 若库存最大值 < 要求值,
    //    说明需求超出产品能力上限. 此时不展示用不了的低规格产品, 而是诚实说明上限. ──
    const hardOkProducts = hardOk.map((s) => s.product);
    const overLimit: { family: string; want: number; max: number }[] = [];
    for (const m of metas) {
      if (!m.downgradable || m.value == null || (m.family !== '端口' && m.family !== '通道')) continue;
      const unit = m.family === '端口' ? '口' : '通道';
      let maxInStock = 0;
      for (const p of hardOkProducts) {
        const toks = (p._features || "").toLowerCase().split(/\s+/);
        for (const tk of toks) {
          const mm = tk.match(new RegExp(`^(\\d+)${unit}`));
          if (mm) maxInStock = Math.max(maxInStock, +mm[1]);
        }
      }
      if (maxInStock > 0 && maxInStock < m.value) {
        overLimit.push({ family: m.family, want: m.value, max: maxInStock });
      }
    }

    if (overLimit.length > 0) {
      // 规格超限: 展示库存中规格最高的少量产品(最接近能力边界), banner 明确说明上限
      const ol = overLimit[0];
      const unit = ol.family === '端口' ? '口' : '通道';
      const kept = [...hardTags].join("、");
      // 取该 spec 达到库存上限的产品(规格最高的), 作为"能力边界"展示
      const atMax = hardOk
        .filter((s) => {
          const toks = (s.product._features || "").toLowerCase().split(/\s+/);
          return toks.some((tk) => {
            const mm = tk.match(new RegExp(`^(\\d+)${unit}`));
            return mm !== null && +mm[1] === ol.max;
          });
        })
        .sort((a, b) => b.niceHit.length - a.niceHit.length || b.score - a.score)
        .slice(0, 5);
      const banner = `${kept}当前最多 ${ol.max}${unit}（无 ${ol.want}${unit} 产品）。以下是端口数最高的 ${atMax.length} 款；如需更多${unit}请联系 FAE 评估级联方案。`;
      return { tier: 2, banner, items: atMax };
    }

    // 常规降级: 缺得越少越好 → 精确规格 → nice. (缺的都是软维度: 规格就近/等级放松)
    hardOk.sort((a, b) => a.mustMiss.length - b.mustMiss.length || b.exactBonus - a.exactBonus || b.niceHit.length - a.niceHit.length || b.score - a.score);
    const top = hardOk.slice(0, 8);
    // 统计放松了哪些软维度(取并集), 生成诚实话术
    const relaxedDims = [...new Set(top[0].missDims)].map((d) => DIM_LABEL[d]);
    const relaxedTags = [...new Set(top[0].mustMiss)];
    const kept = [...hardTags].join("、");
    const banner = relaxedTags.length
      ? `没有完全匹配的产品。已保证${kept}一致，放宽了${relaxedDims.join("、")}（${relaxedTags.join("、")}），以下 ${top.length} 款最接近：`
      : `没有完全匹配的产品，以下 ${top.length} 款最接近：`;
    return { tier: 2, banner, items: top };
  }

  // tier3: 连硬维度(品类)都没有满足的 → 命中任意 must 的, 取分最高少量, 给方向建议
  const any = scored.filter((s) => s.mustHit.length > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  const catTags = metas.filter((m) => m.dimension === 'category').map((m) => m.tag);
  return {
    tier: 3,
    banner: any.length > 0
      ? `没有「${catTags.join("、") || must.join("、")}」品类的完全匹配产品。以下是部分相关的，供参考：`
      : `没有找到「${catTags.join("、") || must.join("、")}」相关产品。可尝试放宽条件或换个说法。`,
    items: any,
  };
}

// 生成单个产品的"满足/缺什么"话术(代码生成, 确定性, 零幻觉)
export function describeMatch(s: ConstraintScore): string {
  const total = s.mustHit.length + s.mustMiss.length;
  const hit = s.mustHit.length ? `满足 ${s.mustHit.length}/${total}：${s.mustHit.join(" ✓ ")} ✓` : `满足 0/${total}`;
  const miss = s.mustMiss.length ? `  ·  缺：${s.mustMiss.join("、")}` : "";
  return hit + miss;
}

import { sourceFactsForProduct, type VerifiedSource } from './source-facts';
import type { ConstraintProduct } from './constraint-match';
import type { WholeQueryPlan } from './whole-query-plan';
export type SolutionDirection = {
  title: string; status: 'unverified_architecture'; explanation: string;
  parts: {pn: string; vendor: string; category: string; loadType: string; evidence: VerifiedSource[]}[];
  pending: string[];
};
/** Components of an unverified circuit are never promoted to chip-level matches. */
export function solutionDirections(query: string, plan: WholeQueryPlan, products: ConstraintProduct[]): SolutionDirection[] {
  if (!plan.branches.some(b=>b.must.some(t=>['马达驱动','直流马达驱动','步进马达驱动'].includes(t.tag)))
    || /(?:不要|不允许|不能|禁止|不接受)(?:使用|用|加)?\s*(?:外置|外接)|只(?:要|接受|用)\s*(?:集成|单芯片)/.test(query)) return [];
  const parts=products.filter(p=>/电机预驱|马达预驱|motor.*pre.?driv/i.test(String(p._section||''))).flatMap(p=>{
    const load=sourceFactsForProduct(p).find(f=>f.field==='load_type'||f.publishedHeader==='负载类型');
    if(!load)return [];
    if(/无刷|三相|步进/.test(query)&&!['无刷','三相','步进'].filter(x=>query.includes(x)).every(x=>(load.publishedValue||'').includes(x)))return [];
    return [{pn:String(p.part_number),vendor:String(p.__vendor),category:String(p._section),loadType:load.publishedValue||'',evidence:[load.source]}];
  }).slice(0,5);
  return parts.length?[{title:'预驱器＋外置MOS功率级',status:'unverified_architecture',
    explanation:'库中有预驱器条目，可作为另一种电路方案的资料入口。电机电流由外置功率级及电路决定，不能把预驱器的栅极驱动电流当作电机输出电流；这些条目尚未证明适用本次需求。',
    parts,pending:[...new Set([...plan.branches.flatMap(b=>(b.parameters||[]).filter(p=>p.strength==='must').map(p=>p.source)),...plan.unresolved.map(p=>p.source),'电机类型与功率级拓扑、MOS及电流采样配置、脉冲安全工作区、限流/堵转策略、散热与整板面积'])]}]:[];
}

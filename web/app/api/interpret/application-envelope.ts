/** Circuit/application specifications cannot be proved by an unrelated scalar chip rating. */
export function applicationEnvelopeReason(source: string): string | null {
  if (/抛负载|load[ -]?dump|浪涌|surge|瞬态.*(?:承受|耐压)/i.test(source)) return '需核对电压幅值、持续时间、引脚及保护电路，并区分期间正常工作还是仅不损坏；工作输入范围或绝对最大值单项不能证明整段瞬态要求';
  if (/(?:[npμµu]?V|[npμµu]?A)\s*\/\s*(?:√\s*Hz|rtHz|srHz)|噪声(?:谱)?密度|noise\s*(?:spectral\s*)?density/i.test(source)) return '需核对输入/输出参考噪声谱密度、指定频点或频段、增益与工作条件；不能用积分RMS噪声、峰峰值或失调电压替代。未指定频点时保留待核，不能擅自改成带宽积分指标。';
  if (/(?:噪声|noise).*\d|\d.*(?:噪声|noise)|[μµu]Vrms/i.test(source)) return '需核对指定频段内的积分RMS噪声、输出电压、负载和输出电容；单频噪声谱密度、峰峰值、失调或其他频段不能代替。';
  if (/压差|drop.?out/i.test(source)) return '需核对原句负载电流下的压差及温度、最大/典型口径；不能把压差当作输出电压，也不能按其他负载的典型值保证满足。';
  if (/纹波|ripple|mV\s*(?:pp|p-p)/i.test(source)) return '需在目标输入、输出和负载下核对输出电容、ESR、电感、开关模式、布局及测量带宽；低噪声标签或失调电压不能证明峰峰值纹波';
  if (/负载.*(?:瞬变|阶跃|跳变)|load[ -]?(?:transient|step)/i.test(source)) return '保留负载起止电流、变化时间和方向；还需核对允许的输出过冲/欠冲及恢复时间，持续输出2A本身不能证明瞬态响应';
  if (/效率|efficien/i.test(source)) return '需在原句指定的输入电压、输出电压和负载工作点核对效率曲线或实测；峰值效率、其他工作点或输出电流容量不能代替';
  if (/(?:封装|package|footprint).*(?:\d\s*[×x*]\s*\d.*mm|尺寸|占地|外形)/i.test(source)) return '需核对具体订购封装的长宽及其口径（本体或PCB占地）；引脚数和封装名称不能证明尺寸上限';
  return null;
}

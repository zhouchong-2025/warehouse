/** Project-approved ordinary grade semantics, not a certificate equivalence claim. */
export const PROJECT_QUALIFICATION_POLICY = '项目资格口径：用户仅要求普通“车规/车规级/AEC-Q100”而未明确Grade、证书或报告时，目录具体型号Rating=Automotive/车规级的已核验来源可支持这一普通等级筛选。不要擅自增加Grade 1、温度等级或证书/测试报告要求，不把型号行未写AEC字样误判为普通车规要求缺证。同一精确型号Note明确声明AEC-Q100 Automotive时，目录同时写工业级并不自动构成车规冲突；可能是覆盖范围、选型表分组或共用描述，按更具体的资格声明核验，不可用工业级字样否定型号级明确声明。明确资格主体与Grade以该型号原文为准。此约定不证明实际资格认证，也不适用于用户明确提出的Grade、证书、报告或功能安全要求；这些必须单独按原始证据核验。';
export function ordinaryAutomotiveSource(source:string):boolean {
  if(!/车规|汽车级|automotive|AEC\s*[- ]?Q\s*[- ]?100/i.test(source))return false;
  return !source.replace(/AEC\s*[- ]?Q\s*[- ]?100|车规(?:级)?|汽车级|automotive/gi,'')
    .replace(/(?:要求|需要|满足|符合|支持|的|等级)|[\s，,。；;：:、]/g,'');
}

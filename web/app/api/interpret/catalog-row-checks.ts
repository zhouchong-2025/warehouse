import {resolveCatalogPredicate} from './catalog-predicate';
import {sourceFactsForProduct, type VerifiedSource} from './source-facts';
import {manufacturerGroup, manufacturerIdForName} from './candidate-coverage';
import {spokenNumber} from './spoken-measurements';
import type {EngineeringUnderstanding} from './engineering-understanding';
import type {PendingEvidenceCheck} from './pending-evidence';
import type {ConstraintProduct} from './constraint-match';

function exactCells(product:ConstraintProduct) {
  return sourceFactsForProduct(product).filter(f=>f.scope==='self'&&!f.applicability&&!f.sourceOnly)
    .map(f=>({header:f.publishedHeader||'',value:f.publishedValue||'',source:f.source}));
}
const description=/^(简介|产品描述|Description|Product Family)$/i;
const humidityClause=/^(?:一颗)?(?:同时)?(?:测量?|量)?(?:温度[和与]湿度|温湿度)(?:传感器)?$/;
const lineProtocol=/^(?:现场已经布了一对双绞线[，,]\s*)?(?:要走|支持)?10\s*BASE[- ]?T1L$/i;
export function mandatoryIdentity(u:EngineeringUnderstanding|undefined,categories:string[]) {
  const required=u?.requirements.filter(r=>r.necessity!=='preferred').map(r=>r.source.trim().replace(/[，。？！,?!]+$/,''))||[];
  if(categories.some(tag=>tag==='PHY'||tag==='T1-PHY')&&required.some(s=>lineProtocol.test(s)))return 't1l';
  if(categories.includes('温度传感器')&&required.some(s=>humidityClause.test(s)))return 'humidity';
  return undefined;
}
export function provesIdentity(p:ConstraintProduct, kind:ReturnType<typeof mandatoryIdentity>) {
  if(!kind)return false;
  return exactCells(p).some(c=>description.test(c.header)&&(kind==='t1l'?/\b10base[- ]?t1l\b/i:/温湿度传感器|humidity.*temperature sensor/i).test(c.value));
}

/** Only consume entire atomic clauses. A trailing qualification must remain pending. */
export function catalogRowChecks(p:ConstraintProduct,u:EngineeringUnderstanding):PendingEvidenceCheck[] {
  const cells=exactCells(p),out:PendingEvidenceCheck[]=[];
  for(const r of u.requirements){
    const s=r.source.trim().replace(/[，。？！,?!]+$/,'');
    const match=(header:RegExp,value:RegExp)=>cells.find(c=>header.test(c.header)&&value.test(c.value))?.source;
    let evidence:(VerifiedSource|undefined)[]=[];
    let contradicted=false;
    // A proof covers a complete original clause using cells of this exact part.
    // Keep a separate proof marker so a failed search binding can be discharged per part.
    let exactProof=false;
    const brand=r.manufacturerConstraint;
    const clause=brand?.mode==='include'&&manufacturerIdForName(brand.name)===manufacturerGroup(p.__vendor)&&s.startsWith(brand.name+'的')
      ? s.slice(brand.name.length+1) : s;
    if(/^(?:千兆铜口|1000BASE[- ]?T)\s*PHY$/i.test(clause)){
      const copper=sourceFactsForProduct(p).filter(f=>f.scope==='self'&&f.field==='ethernet_copper_1000base_t_ports');
      if(copper.length){evidence=copper.map(f=>f.source);exactProof=true;}
    }
    const predicate=resolveCatalogPredicate(r,cells,p.__vendor,p._section);
    if(predicate){evidence=predicate.evidence;contradicted=predicate.contradicted;exactProof=true;}
    if(/^(?:千兆网卡(?:芯片)?|PCIe网卡芯片)$/i.test(clause)&&/网卡/.test(String(p._section))){
      evidence=/^PCIe/i.test(clause)?[match(description,/网卡/),match(/^接口$/,/^PCIe\b/i)]:[match(description,/千兆网卡/)];
      exactProof=true;
    }
    const bus=s.match(/^(?:数字接口必须支持|主控得走|主机接|走|支持)\s*(SPI|PCIe|I2C|RMII)(?:读角度)?$/i);
    if(bus&&(!s.startsWith('主机接')||/网卡|以太网控制器/.test(String(p._section)))&&(!s.endsWith('读角度')||p._section==='霍尔角度编码器选型表')){evidence=[match(/^(接口|数字接口|接口类型|Digital Interface)$/i,new RegExp('\\b'+bus[1]+'\\b','i'))];exactProof=true;}
    if(/^(?:要霍尔的|霍尔角度编码器)$/.test(clause)&&p._section==='霍尔角度编码器选型表'){
      evidence=[match(/^磁感应\s*原理$/, /霍尔/)];exactProof=true;
    }
    if(/^(?:要|过|通过|需要)?AEC[- ]?Q100(?:的)?$/i.test(s)){
      const cell=cells.find(c=>c.header.replace(/\s/g,'').toUpperCase()==='AEC-Q100'&&/^(是|否)$/.test(c.value));
      if(cell){evidence=[cell.source];contradicted=cell.value==='否';exactProof=true;}
    }
    if(/^(?:可调并联电压基准|基准电压能调)$/.test(s)&&p._section==='并联型电压基准'){
      const cell=cells.find(c=>/^Output Voltage$/i.test(c.header)&&/^(Adjustable|Fixed)\b/i.test(c.value));
      if(cell){evidence=[cell.source];contradicted=/^Fixed/i.test(cell.value);exactProof=true;}
    }
    if(humidityClause.test(s))evidence=[match(description,/温湿度传感器/)];
    if(/^(?:(?:MCU|主控)(?:侧)?(?:用|走|出)?)?(?:支持)?(I2C|RMII)(?:接口|读)?$/i.test(s)){
      const token=/RMII/i.test(s)?/\bRMII\b/i:/\bI2C\b/i;
      evidence=[match(/^(接口类型|接口|Digital Interface)$/i,token)];
    }
    if(lineProtocol.test(s))evidence=[match(description,/\b10base[- ]?t1l\b/i)];
    if(/^(?:现场)?(?:已经)?布了(?:一对|单对)双绞线$/.test(s))evidence=[match(description,/\b10base[- ]?t1l\b/i)];
    if(/^(?:工程样片|工程样品)(?:也)?可以$/.test(s))evidence=[match(/^(状态|Status)$/i,/^(?:Engineering Sample|ES|MP|Production)$/i)];
    if(/^(?:做)?(?:傻瓜|非管理型)(?:交换机)?(?:就行)?$/.test(s))evidence=[match(description,/傻瓜|unmanaged/i)];
    const ports=s.match(/^([\d一二两三四五六七八九十]+)(?:个|路|口)?千兆(?:网口|端口)(?:要互通)?$/);
    if(ports&&/交换机/.test(String(p._section))){
      const n=spokenNumber(ports[1]);const c=cells.find(c=>c.header==='端口'&&/^(\d+)\s*\*?\s*GE\b/i.test(c.value));
      if(n!==null&&c){
        const count=Number.parseInt(c.value,10);
        if(count===n)evidence=[c.source];
        else if(count<n&&/^\d+\s*GE(?:\s+LRE[\d-]+)?$/i.test(c.value)){evidence=[c.source];contradicted=true;}
      }
    }
    if(/^(?:用)?I2C(?:同时)?读(?:充电和放电|充放电)电流$/i.test(s))evidence=[match(/^Digital Interface$/i,/\bI2C\b/i),match(/^Features$/i,/\bBidirectional\b/i)];
    if(/^(?:同时)?读(?:充电和放电|充放电)电流$/.test(s))evidence=[match(/^Features$/i,/\bBidirectional\b/i)];
    if(/^(?:串|串联)(?:分流|采样)电阻$/.test(s))evidence=[match(/^Shunt Offset/i,/\d/)];
    const numberCell=(header:RegExp,wanted:number,compare:(actual:number,wanted:number)=>boolean)=>{
      const rows=cells.filter(c=>header.test(c.header.trim()));
      if(!rows.length||rows.some(c=>!/^\d+(?:\.\d+)?$/.test(c.value.trim())))return;
      const decisions=rows.map(c=>compare(Number(c.value),wanted));
      if(decisions.some(v=>v!==decisions[0]))return;
      evidence=rows.map(c=>c.source);contradicted=!decisions[0];exactProof=true;
    };
    const bits=s.match(/^(?:分辨率)?(?:至少|不低于|≥)\s*([\d一二两三四五六七八九十百]+)\s*(?:位|bits?)$/i);
    if(bits){
      const n=spokenNumber(bits[1]);
      if(n!==null)numberCell(/ADC|DAC|模数|数模/i.test(String(p._section))&&!/模数\/数模/.test(String(p._section))
        ?/^Resolution(?:\s*\(Bits\))?$/i:/^Resolution\s*\(Bits\)$/i,n,(a,b)=>a>=b);
    }
    const isolation=s.match(/^隔离电压\s*(?:至少|不低于|≥|>=)\s*([\d.一二两三四五六七八九十百点]+)\s*(千伏|kV|伏|V)$/i);
    if(isolation){
      const n=spokenNumber(isolation[1]);
      if(n!==null)numberCell(/^隔离电压\s*[（(]kV[)）]$/i,n*(/^(伏|V)$/i.test(isolation[2])?0.001:1),(a,b)=>a>=b);
    }
    if(/^[单双]通道$/.test(s))numberCell(/^Number of Channels$|^通道数$/i,s[0]==='单'?1:2,(a,b)=>a===b);
    const serialInterface=s.match(/^(?:必须(?:是|支持)?\s*|需要(?:是|支持)?\s*|支持\s*)?(SPI|I2C)\s*接口$/i);
    if(serialInterface&&/数模转换器|\bDAC\b/i.test(String(p._section))){
      const cell=cells.find(c=>/^(?:Interface Type|接口类型)$/i.test(c.header)&&/^(?:SPI|I2C)$/i.test(c.value.trim()));
      if(cell){evidence=[cell.source];contradicted=cell.value.trim().toUpperCase()!==serialInterface[1].toUpperCase();exactProof=true;}
    }
    const voltageDac=s.match(/^(?:([单双])通道\s*)?电压输出(?:的?\s*DAC)?$/i);
    if(voltageDac&&/数模转换器|\bDAC\b/i.test(String(p._section))){
      const output=cells.find(c=>/^Output Type$/i.test(c.header));
      const channel=voltageDac[1]&&cells.find(c=>/^Number of Channels$/i.test(c.header)&&/^\d+$/.test(c.value));
      const voltage=output&&/^(?:buffer+ed\s+|unbuffered\s+)?voltage(?:\s*,\s*current)?$/i.test(output.value.trim());
      const currentOnly=output&&/^(?:current|4\s*~\s*20\s*mA\s*,\s*loop)$/i.test(output.value.trim());
      if(currentOnly||channel&&Number(channel.value)!==(voltageDac[1]==='单'?1:2)){
        evidence=[...(currentOnly?[output!.source]:[]),...(channel?[channel.source]:[])];contradicted=true;exactProof=true;
      }else if(voltage&&(!voltageDac[1]||channel)){
        evidence=[output!.source,...(channel?[channel.source]:[])];exactProof=true;
      }
    }
    const line=s.match(/^(\d+(?:\.\d+)?)\s*(?:伏|V)(?:的)?(?:电池线|母线)(?:上)?$/i);
    if(line&&/数字式电流\/功率检测器/.test(String(p._section))){
      const c=cells.find(c=>/^Common Mode Voltage.*\(V\)$/i.test(c.header));
      const range=c?.value.match(/^(-?\d+(?:\.\d+)?)\s*[~～]\s*(\d+(?:\.\d+)?)$/);
      if(c&&range){evidence=[c.source];contradicted=Number(line[1])<Number(range[1])||Number(line[1])>Number(range[2]);}
    }
    const refs=evidence.filter((x):x is VerifiedSource=>!!x);
    if(refs.length&&refs.length===evidence.length)out.push({requirementId:r.id,source:r.source,authority:'program',...(exactProof?{proofKey:'catalog.completeClause'}:ports?{proofKey:'switch.gigabitPorts'}:{}),status:contradicted?'contradicted':'supported',blocksMatch:r.necessity!=='preferred',evidence:refs,reason:(predicate&&'detail' in predicate?predicate.detail+'；型号原表 ':contradicted?r.source+'：型号原表 ':'')+refs.map(x=>x.originalHeader+'：'+x.originalValue).join('；')});
  }
  return out;
}

export function incompatibleCatalogPackages(query:string, products:ConstraintProduct[]):string|undefined{
  if(!/替换|替掉|直换|原位替代|直接替代/.test(query)||!/不改|原板|原位|直换|直接替/.test(query))return;
  const tokens=new Set((query.match(/[a-z][a-z0-9_-]*\d[a-z0-9_-]*/gi)||[]).map(t=>t.toUpperCase()));
  const rows=products.filter(p=>p._selection_status!=='identity_unverified'&&tokens.has(String(p.part_number).toUpperCase()));
  if(rows.length!==2||rows[0].part_number===rows[1].part_number)return;
  const positions=rows.map(p=>query.toUpperCase().indexOf(String(p.part_number).toUpperCase())).sort((a,b)=>a-b);
  if(!/替换|替掉|直换|替代|换成|换为/.test(query.slice(positions[0],positions[1])))return;
  const packages=rows.map(p=>[...new Set(exactCells(p).filter(c=>/^(Package|封装形式|封装类型|封装)$/i.test(c.header)).map(c=>c.value.trim().toUpperCase()))]);
  const pinCounts=packages.map(v=>v.length===1?v[0].match(/^(?:MSOP|SOP|TSSOP|SOIC|QFN|DFN|LQFP|TQFP)[- ]?(\d+)$/)?.[1]:undefined);
  if(!pinCounts[0]||!pinCounts[1]||pinCounts[0]===pinCounts[1])return;
  return rows.map((p,i)=>p.part_number+' 为 '+packages[i][0]).join('，')+'。引脚数量不同，不能在现有 PCB 上直接替换。';
}

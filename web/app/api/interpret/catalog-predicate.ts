import {manufacturerGroup, manufacturerIdForName} from './candidate-coverage';
import {spokenNumber} from './spoken-measurements';
import type {EvidenceQuery} from './evidence-contract';
import type {VerifiedSource} from './source-facts';

export const catalogPredicateFields={
  'shunt.maxSinkCurrent':{kind:'minimum',unit:'mA',roles:['load','regulated_output','capability'],description:'并联基准阴极的最大灌电流能力下限，gte，单位mA'},
  'ambient.operatingRange':{kind:'range',roles:['environment'],description:'环境工作温度范围；covers，values为摄氏度上下限，不含结温、存储温度'},
  'ethernet.gigabitPorts':{kind:'tuple',roles:['resource','capability','signal_interface'],description:'单芯片千兆网络端口数，eq，values为[端口数, 是否要求独立]。数量不足可判冲突，仅有数量不能证明多口独立'},
  'encoder.output':{kind:'enum',values:['UVW','ABZ','PWM'],roles:['signal_interface','capability'],description:'所需编码器输出，eq，任一附加工况须单独核验'},
  'ethernet.nicInterface':{kind:'tuple',roles:['signal_interface','capability'],description:'完整的单口千兆PCIe网卡身份，eq，values为["PCIe",1,1000]，单位Mbps'},
};

type Requirement={source:string;role?:string;manufacturerConstraint?:{name:string;mode:string}|null;evidenceQuery?:EvidenceQuery};
type Cell={header:string;value:string;source:VerifiedSource};

// Legacy contracts lack a typed predicate. Consume the complete clause before
// recovering one. Extra qualifiers, negation, or an incompatible role stay unknown.
export function groundedCatalogPredicate(r:Requirement):EvidenceQuery|undefined{
  let text=r.source.trim().replace(/[，。？！,?!]+$/,'').replace(/\s+/g,'');
  const brand=r.manufacturerConstraint;
  if(brand?.mode==='include'&&text.startsWith(brand.name+'的'))text=text.slice(brand.name.length+1);
  const allowed=(key:keyof typeof catalogPredicateFields)=>!r.role||catalogPredicateFields[key].roles.includes(r.role);
  const temp=text.match(/^(?:工作温度(?:范围)?(?:必须覆盖)?|(?:工作)?环境(?:温度)?(?:必须覆盖)?|(?=零下))((?:零下|零上|负|正|[-−+])?[\d.一二两三四五六七八九十百零点]+)(?:℃|°C|度)?(?:到|至|~|～)((?:零下|零上|负|正|[-−+])?[\d.一二两三四五六七八九十百零点]+)(?:℃|°C|度)(?:都得能用)?$/i);
  if(temp&&allowed('ambient.operatingRange')){
    const lo=spokenNumber(temp[1]),hi=spokenNumber(temp[2]);
    if(lo!==null&&hi!==null&&lo<=hi)return {key:'ambient.operatingRange',operator:'covers',values:[lo,hi]};
  }
  const ports=text.match(/^(?:(?:一颗芯片|单芯片)(?:带|支持)|就)?([\d一二两三四五六七八九十]+)个(独立)?千兆(?:网口|以太网端口)$/);
  if(ports&&allowed('ethernet.gigabitPorts')){
    const n=spokenNumber(ports[1]);
    if(n!==null&&n>0)return {key:'ethernet.gigabitPorts',operator:'eq',values:[n,!!ports[2]]};
  }
  const filler=/必须支持|需要支持|必须|需要|支持|得有|要有|要能|具备/g;
  const output=text.match(/UVW|ABZ|PWM/i);
  if(output&&allowed('encoder.output')&&/输出/.test(text)&&!text.replace(output[0],'').replace(/增量输出|输出/,'').replace(filler,'')){
    if(/增量输出/.test(text)&&/^PWM$/i.test(output[0]))return;
    return {key:'encoder.output',operator:'eq',values:[output[0].toUpperCase()]};
  }
  if(allowed('ethernet.nicInterface')&&/网卡/.test(text)&&/单口|单端口/.test(text)&&/千兆/.test(text)&&/PCIe/i.test(text)
    &&!text.replace(/网卡芯片|网卡/,'').replace(/单端口|单口/,'').replace('千兆','').replace(/PCIe/i,'').replace(filler,'')){
    return {key:'ethernet.nicInterface',operator:'eq',values:['PCIe',1,1000]};
  }
  if(!allowed('shunt.maxSinkCurrent')||!/灌/.test(text))return;
  const quantity=text.match(/(\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万点]+)(毫安培?|mA|安培?|A)/i);
  if(!quantity)return;
  const skeleton=text.replace(quantity[0],'#');
  // Bare "最大灌电流100mA" leaves the comparator unspecified.
  if(!/至少|不能低于|不低于|≥|>=|要能灌|以上/.test(skeleton)
    ||skeleton.replace(/最大灌电流|阴极灌电流|灌电流|灌/,'').replace(/不能低于|不低于|至少|≥|>=|以上/,'').replace(/要能|能/,'').replace('#',''))return;
  const value=spokenNumber(quantity[1]);
  if(value===null||value<=0)return;
  return {key:'shunt.maxSinkCurrent',operator:'gte',values:[value*(/^(安|A)/i.test(quantity[2])?1000:1)]};
}

export function catalogPredicateAgrees(q:EvidenceQuery,r:Requirement){
  const grounded=groundedCatalogPredicate(r);
  return !!grounded&&q.key===grounded.key&&q.operator===grounded.operator&&JSON.stringify(q.values)===JSON.stringify(grounded.values);
}

export function resolveCatalogPredicate(r:Requirement,cells:Cell[],vendor:unknown,section:unknown){
  if(r.manufacturerConstraint&&(r.manufacturerConstraint.mode!=='include'||manufacturerIdForName(r.manufacturerConstraint.name)!==manufacturerGroup(vendor)))return;
  const q=r.evidenceQuery??groundedCatalogPredicate(r);
  if(!q||r.evidenceQuery&&!catalogPredicateAgrees(q,r))return;
  const matching=(header:RegExp)=>cells.filter(c=>header.test(c.header.trim()));
  const decide=(rows:Cell[],judge:(value:string)=>boolean|undefined)=>{
    if(!rows.length)return;
    const values=rows.map(c=>judge(c.value.trim()));
    if(values[0]===undefined||values.some(x=>x!==values[0]))return;
    return {evidence:rows.map(c=>c.source),contradicted:!values[0]};
  };
  switch(q.key){
    case 'ambient.operatingRange':
      return decide(matching(/^(?:工作环境温度|环境工作温度|Ambient Temperature)(?:\s*\(°C\))?$/i),v=>{
        const range=v.match(/^([+-]?\d+(?:\.\d+)?)(?:\s*°C|℃)?\s*[-~～–]\s*([+-]?\d+(?:\.\d+)?)(?:\s*°C|℃)$/i);
        if(range&&Number(range[1])<=Number(range[2]))return Number(range[1])<=Number(q.values[0])&&Number(range[2])>=Number(q.values[1]);
      });
    case 'ethernet.gigabitPorts':
      if(!/网卡|以太网控制器/.test(String(section)))return;
      const rows=matching(/^端口$/);
      const verdict=decide(rows,v=>{
        const ports=v.match(/^(\d+)\s*[*×]?\s*GE$/i);
        if(!ports)return;
        const count=Number(ports[1]),wanted=Number(q.values[0]);
        if(count<wanted)return false;
        if(count===wanted&&(count===1||!q.values[1]))return true;
      });
      if(verdict?.contradicted&&rows.length===1)return {...verdict,detail:`要求 ${q.values[0]} 个千兆端口，该型号只有 ${parseInt(rows[0].value.trim(),10)} 个`};
      return verdict;
    case 'encoder.output':{
      const header=q.values[0]==='PWM'?/^PWM\s*输出$/i:q.values[0]==='UVW'?/^UVW\s*增量输出$/i:/^ABZ\s*增量输出$/i;
      return decide(matching(header),v=>v==='是'?true:v==='否'?false:undefined);
    }
    case 'shunt.maxSinkCurrent':
      if(section!=='并联型电压基准')return;
      return decide(matching(/^Isink\s*\(max\)\s*\(mA\)$/i),v=>/^\d+(?:\.\d+)?$/.test(v)?Number(v)>=Number(q.values[0]):undefined);
    case 'ethernet.nicInterface':{
      const proofs=[decide(matching(/^(简介|产品描述|Description|Product Family)$/i),v=>/千兆网卡/.test(v)||undefined),
        decide(matching(/^端口$/),v=>/^1GE$/i.test(v)||undefined),decide(matching(/^接口$/),v=>/^PCIe\b/i.test(v)||undefined)];
      if(proofs.every(p=>p!==undefined))return {evidence:proofs.flatMap(p=>p.evidence),contradicted:false};
    }
  }
}

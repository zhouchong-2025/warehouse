/** Lexical quantities only. Does not infer device roles, limits, tolerance or intent. */
export const SPOKEN_UNITS: Record<string, [string, number]> = {
  伏:['V',1],伏特:['V',1],毫伏:['V',1e-3],毫伏特:['V',1e-3],微伏:['V',1e-6],微伏特:['V',1e-6],千伏:['V',1e3],千伏特:['V',1e3],
  安:['A',1],安培:['A',1],毫安:['A',1e-3],毫安培:['A',1e-3],微安:['A',1e-6],微安培:['A',1e-6],纳安:['A',1e-9],纳安培:['A',1e-9],
  赫:['Hz',1],千赫:['Hz',1e3],兆赫:['Hz',1e6],吉赫:['Hz',1e9],赫兹:['Hz',1],千赫兹:['Hz',1e3],兆赫兹:['Hz',1e6],吉赫兹:['Hz',1e9],
  秒:['s',1],毫秒:['s',1e-3],微秒:['s',1e-6],纳秒:['s',1e-9],
  欧姆:['Ω',1],千欧姆:['Ω',1e3],兆欧姆:['Ω',1e6],毫欧姆:['Ω',1e-3],
  法拉:['F',1],毫法:['F',1e-3],微法:['F',1e-6],纳法:['F',1e-9],皮法:['F',1e-12],
};
const CHARS='零〇一二两三四五六七八九十百千万点';
const NUMBER='(?:(?:零下|零上)?[-+−]?\\d+(?:\\.\\d+)?|(?:零下|零上|负|正)?['+CHARS+']+?)';
const UNIT='(?:'+Object.keys(SPOKEN_UNITS).sort((a,b)=>b.length-a.length).join('|')+'|摄氏度|度|℃|°C|[munpμµ]?A|[kmuμµ]?V|[kMG]?Hz|[muμµn]?s|[pnumμµ]?F)';
const DIGITS:Record<string,number>={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
export function spokenNumber(raw:string):number|null{
  const sign=/^(?:零下|负|−|-)/.test(raw)?-1:1, text=raw.replace(/^(?:零[上下]|[负正−+-])/,'');
  if(/^\d+(?:\.\d+)?$/.test(text))return sign*Number(text);
  const parts=text.split('点');if(parts.length>2||!parts[0])return null;
  const integer=parts[0];let value=0;
  if(integer.length===1&&Object.hasOwn(DIGITS,integer))value=DIGITS[integer];
  else {
    // Reject digit concatenations and ambiguous colloquial forms like 三五/一百二.
    if(!/[十百千万]/.test(integer))return null;
    let digit:number|null=null, lastUnit=100000, lastWasZero=false;
    for(const c of integer){
      if(Object.hasOwn(DIGITS,c)){
        if(DIGITS[c]===0){if(digit!==null)return null;lastWasZero=true;continue;}
        if(digit!==null)return null;digit=DIGITS[c];
      }else{
        const unit:Record<string,number>={十:10,百:100,千:1000,万:10000};const scale=unit[c];
        if(!scale||scale>=lastUnit||lastWasZero&&digit===null)return null;
        if(digit===null&&!(c==='十'&&value===0))return null;
        value+=(digit??1)*scale;digit=null;lastUnit=scale;lastWasZero=false;
      }
    }
    if(digit!==null){if(lastUnit>10&&!lastWasZero)return null;value+=digit;}
  }
  if(parts.length===2){if(!parts[1]||![...parts[1]].every(c=>Object.hasOwn(DIGITS,c)&&c!=='两'))return null;value+=Number('0.'+[...parts[1]].map(c=>DIGITS[c]).join(''));}
  return sign*value;
}
export function spokenMeasurements(text:string){
  const rows:{value:number;unit:string;text:string;start:number;end:number}[]=[];
  const fragment=(at:number)=>new RegExp('[\\w.零〇一二两三四五六七八九十百千万点负正]$').test(text.slice(0,at)) || /(?:\d[.,]\s*|\d\s*[\/∕⁄×*·]\s*|\d\s+|\d\s*(?:\^|\*\*)\s*|[\d.⁻⁺√])$/u.test(text.slice(0,at));
  const range=new RegExp(`(${NUMBER})\\s*(${UNIT})?\\s*(?:~|～|–|至|到|-)\\s*(${NUMBER})\\s*(${UNIT})(?![A-Za-z]|全|规)`,'g');
  for(const m of text.matchAll(range)){
    if(fragment(m.index!)||!/[\p{Script=Han}〇]/u.test(m[1]+m[3]+(m[2]||'')+m[4]))continue;
    const a=spokenNumber(m[1]),b=spokenNumber(m[3]);if(a===null||b===null)continue;
    const start=m.index!,end=start+m[0].length,right=start+m[0].lastIndexOf(m[3]);
    rows.push({value:a,unit:m[2]||m[4],text:m[1],start,end:start+m[1].length},{value:b,unit:m[4],text:text.slice(right,end),start:right,end});
  }
  const scalar=new RegExp(`(${NUMBER})\\s*(${UNIT})(?![A-Za-z]|全|规)`,'g');
  for(const m of text.matchAll(scalar)){
    if(!/[\p{Script=Han}〇]/u.test(m[1]+m[2])||fragment(m.index!)||rows.some(r=>m.index!>=r.start&&m.index!<r.end))continue;
    if(m[0]==='三安'&&/^(?:半导体|光电)/.test(text.slice(m.index!+m[0].length)))continue;
    const value=spokenNumber(m[1]);if(value===null)continue;
    rows.push({value,unit:m[2],text:m[0],start:m.index!,end:m.index!+m[0].length});
  }
  return rows.sort((a,b)=>a.start-b.start);
}

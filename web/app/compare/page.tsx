"use client";
import ParameterMatchLines from '../components/ParameterMatchLines';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {loadReleaseCatalog} from '@/lib/release-catalog';
import {productIdentity,type VendorData} from '@/app/product-utils';
import {COMPARISON_KEY,readComparison,comparisonSelection,comparisonParams,comparisonCsv,comparisonHref,comparisonStatus,type ComparisonState} from '@/lib/comparison';

export default function Compare(){
 const [data,setData]=useState<Record<string,VendorData>>({});
 const [comparison,setComparison]=useState<ComparisonState|null>(null);
 const [search,setSearch]=useState('');const [error,setError]=useState('');const [storageError,setStorageError]=useState(false);
 const [retry,setRetry]=useState(0);
 const parts=useMemo(()=>Object.entries(data).flatMap(([vendor,v])=>v.products.filter(p=>p.part_number&&p._selection_status!=='identity_unverified').map(product=>({id:productIdentity(vendor,product.part_number),part:product.part_number,vendor,vendorName:v.name,product}))),[data]);
 useEffect(()=>{
  let active=true;setError('');
  loadReleaseCatalog<VendorData>().then(({releaseId,vendors})=>{
   if(!active)return;setData(vendors);let raw=null;try{raw=sessionStorage.getItem(COMPARISON_KEY);}catch{setStorageError(true);}
   const saved=readComparison(raw,releaseId),params=new URLSearchParams(window.location.search);
   const products=Object.entries(vendors).flatMap(([vendor,v])=>v.products.filter(p=>p._selection_status!=='identity_unverified').map(p=>({id:productIdentity(vendor,p.part_number),part:p.part_number})));
   const requested=comparisonSelection(params.get('items'),params.get('chips'),products);
   const selected=requested??saved.selected;
   const stale=params.has('release')&&params.get('release')!==releaseId;
   const next={...saved,selected,...(stale?{query:'',checks:{}}:{})};setComparison(next);
   try{sessionStorage.setItem(COMPARISON_KEY,JSON.stringify(next));}catch{setStorageError(true);}
  }).catch(()=>{if(active)setError('对比资料暂时无法加载，请重试。');});
  return()=>{active=false;};
 },[retry]);
 const save=(next:ComparisonState)=>{setComparison(next);try{sessionStorage.setItem(COMPARISON_KEY,JSON.stringify(next));}catch{setStorageError(true);}window.history.replaceState(null,'',comparisonHref(next.selected,next.releaseId));};
 const toggle=(id:string)=>{if(!comparison)return;const selected=comparison.selected.includes(id)?comparison.selected.filter(x=>x!==id):[...comparison.selected,id];save({...comparison,selected});};
 const selected=parts.filter(p=>comparison?.selected.includes(p.id));
 const missing=comparison?.selected.filter(id=>!parts.some(p=>p.id===id))||[];
 const matches=search.trim()?parts.filter(p=>(p.part+' '+p.vendorName).toLowerCase().includes(search.trim().toLowerCase())).slice(0,15):[];
 const fields=[...new Set(selected.flatMap(p=>comparisonParams(p.product).map(([key])=>key)))];
 const requirements=[...new Map(selected.flatMap(p=>(comparison?.checks[p.id]||[]).map(c=>[c.requirementId,c] as const))).values()];
 const exportCsv=()=>{const csv=comparisonCsv(selected.map(p=>({...p,checks:comparison?.checks[p.id]})));const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='teampo_compare.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);};
 return <main className="min-h-screen bg-[#0d1117] text-[#e6edf3] px-4 py-6 sm:px-6">
  <div className="max-w-7xl mx-auto space-y-5">
   <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-4"><Link href="/" className="text-[#58a6ff]">← 返回选型</Link><h1 className="text-xl font-semibold">产品对比（{selected.length}）</h1></div>
    <div className="flex gap-3"><button disabled={!selected.length} onClick={exportCsv} className="rounded border border-[#31556d] px-3 py-2 text-sm disabled:opacity-50">导出 CSV</button><button disabled={!comparison?.selected.length} onClick={()=>comparison&&save({...comparison,selected:[],checks:{}})} className="text-sm disabled:opacity-50">清除全部</button></div>
   </header>
   <p className="text-sm text-[#8b949e]">直接比较已有目录资料及本次搜索保存的核验依据，不调用模型。数值仅在单位、额定角色和测试条件一致时可比较；空白不代表不支持。</p>
   {error&&<p role="alert" className="text-amber-300">{error}<button onClick={()=>setRetry(n=>n+1)} className="ml-3 underline">重试</button></p>}
   {!comparison&&!error&&<p>正在加载对比资料…</p>}
   {storageError&&<p className="text-sm text-amber-300">浏览器存储不可用，需求核验记录可能无法跨页面保留；型号可通过当前页面链接携带。</p>}
   <label className="block text-sm">添加型号<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="输入型号或厂商" className="mt-2 block w-full max-w-xl rounded-lg border border-[#30363d] bg-[#161b22] p-3" /></label>
   {!!matches.length&&<div className="flex flex-wrap gap-2">{matches.map(p=><button key={p.id} onClick={()=>{toggle(p.id);setSearch('');}} className="rounded border border-[#31556d] px-3 py-2 text-sm">{comparison?.selected.includes(p.id)?'✓ ':''}{p.part} · {p.vendorName}</button>)}</div>}
   {!!missing.length&&<p className="text-sm text-amber-300">{missing.length} 个已选型号未在当前发布目录中找到，未用其他厂商或相近型号替代。<button className="ml-2 underline" onClick={()=>comparison&&save({...comparison,selected:comparison.selected.filter(id=>!missing.includes(id))})}>移除失效选择</button></p>}
   {!!selected.length&&<div className="flex flex-wrap gap-2">{selected.map(p=><button key={p.id} onClick={()=>toggle(p.id)} className="rounded-full border border-[#31556d] px-3 py-2 text-sm">{p.part} · {p.vendorName} ×</button>)}</div>}
   {comparison?.query&&<section className="rounded-lg border border-[#31556d] bg-[#10212b] p-4 text-sm"><h2 className="font-semibold">本次需求</h2><p className="mt-2 whitespace-pre-wrap">{comparison.query}</p><p className="mt-2 text-[#8b949e]">以下为此浏览器保存的同版本搜索核验记录；未核验、待核和证据冲突不会被提升为满足。重新搜索后可在结果中更新。</p></section>}
   {!!selected.length?<div className="overflow-x-auto rounded-lg border border-[#30363d]"><table className="w-full border-collapse text-sm"><thead><tr><th className="min-w-40 p-3 text-left">参数／需求</th>{selected.map(p=><th key={p.id} className="min-w-64 p-3 text-left">{p.part}<span className="mt-1 block font-normal text-[#8b949e]">{p.vendorName}</span></th>)}</tr></thead><tbody>
    {!!requirements.length&&<tr><th colSpan={selected.length+1} className="bg-[#10212b] p-3 text-left">本次需求与已有核验依据</th></tr>}
    {requirements.map(r=><tr key={r.requirementId} className="border-t border-[#30363d]"><th className="p-3 text-left align-top font-normal">{r.source}</th>{selected.map(p=>{const check=comparison?.checks[p.id]?.find(c=>c.requirementId===r.requirementId);return <td key={p.id} className="p-3 align-top">{check?<><p className={check.status==='supported'?'text-green-400':check.status==='contradicted'?'text-red-300':'text-amber-300'}>{comparisonStatus[check.status]}</p><ParameterMatchLines rows={check.parameters || []}/>{check.online&&<div className="mt-2 text-[#a5e6f5]"><p>{check.online.text}</p><details><summary>联网原厂依据</summary>{check.online.citations.map((ref,index)=><blockquote key={index}><a className="underline" href={ref.url.split('#')[0]+'#page='+ref.page} target="_blank" rel="noreferrer">原厂资料 · 第 {ref.page} 页</a><p>{ref.quote}</p></blockquote>)}</details></div>}<p className="mt-2">{check.online&&'目录判断 · '}{check.reason}</p>{check.condition&&<p className="mt-1 text-[#8b949e]">工况：{check.condition}</p>}{!!check.evidence.length&&<details className="mt-2"><summary className="cursor-pointer text-[#79c0ff]">查看原文依据（{check.evidence.length}）</summary>{check.evidence.map((e,i)=><div key={e.factId+':'+i} className="mt-2 border-l border-[#31556d] pl-2"><p>{e.document} · 第 {e.page} 页</p><blockquote>{e.originalHeader}：{e.originalValue}</blockquote>{e.wikiFactPage&&<a className="text-[#79c0ff] underline" href={`/api/wiki-page?releaseId=${encodeURIComponent(comparison!.releaseId)}&path=${encodeURIComponent(e.wikiFactPage)}`} target="_blank" rel="noreferrer">查看来源</a>}</div>)}</details>}</>:<span className="text-amber-300">未保存该条件核验记录，不能据此认定满足。</span>}</td>;})}</tr>)}
    <tr><th colSpan={selected.length+1} className="bg-[#161b22] p-3 text-left">目录原始参数（保留原字段、单位及条件）</th></tr>
    {fields.map(field=><tr key={field} className="border-t border-[#30363d]"><th className="p-3 text-left align-top font-normal text-[#8b949e]">{field}</th>{selected.map(p=><td key={p.id} className="p-3 align-top whitespace-pre-wrap">{new Map(comparisonParams(p.product)).get(field)||'—'}</td>)}</tr>)}
   </tbody></table></div>:comparison&&<p className="py-12 text-center text-[#8b949e]">从搜索结果“加入对比”，或在此输入型号开始。手动添加的型号不会自动获得本次需求的核验结论。</p>}
  </div>
 </main>;
}

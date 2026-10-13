'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {User} from 'firebase/auth';
import {Copy,Images,Film,RefreshCw} from 'lucide-react';
import {AdminThumbnail,type CoverInfo} from './AdminThumbnail';

type ProductSummary={id:string;name:string;kind:'video'|'image'|'mixed'|'unknown';videoCount:number;imageCount:number;selectedNames:string[];cover?:CoverInfo;warning?:string};
let activeDiscovery=0;
const waitingDiscovery:Array<()=>void>=[];
async function scheduleDiscovery<T>(operation:()=>Promise<T>):Promise<T>{
  if(activeDiscovery>=2)await new Promise<void>(resolve=>waitingDiscovery.push(resolve));
  activeDiscovery++;
  try{return await operation();}
  finally{activeDiscovery--;waitingDiscovery.shift()?.();}
}
const kindLabel={video:'Bàn giao clip',image:'Bàn giao ảnh',mixed:'Ảnh + clip',unknown:'Chưa xác định'};
export function DeliveryAdminWorkspace({eventId,user,onCover}:{eventId:string;user:User;onCover?:(cover:CoverInfo|null)=>void}){
 const hostRef=useRef<HTMLDivElement>(null);
 const autoLoaded=useRef(false);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[rows,setRows]=useState<ProductSummary[]>([]),[message,setMessage]=useState('');
 const load=useCallback(async()=>{
   setBusy(true);setMessage('');
   try{
     const doFetch=async(force=false)=>fetch(`/api/delivery/${encodeURIComponent(eventId)}/admin-media`,{
       headers:{Authorization:`Bearer ${await user.getIdToken(force)}`},cache:'no-store'});
     const {res,data}=await scheduleDiscovery(async()=>{
       let res=await doFetch();if(res.status===401)res=await doFetch(true);
       return {res,data:await res.json()};
     });
     if(!res.ok)throw new Error(`${data.error||'Không thể kiểm tra danh sách sản phẩm'}${data.code?' ['+data.code+']':''}`);
     const products:ProductSummary[]=data.products||[];
     setRows(products);onCover?.(products.find(row=>row.cover)?.cover || null);
   }catch(error){setMessage(error instanceof Error?error.message:'Lỗi kết nối');}
   finally{setBusy(false);}
 },[eventId,user,onCover]);
 useEffect(()=>{
  const host=hostRef.current;if(!host)return;
  // Only inspect media when a card approaches the viewport. Avoid expensive
  // monthly full Drive scans and Vercel bandwidth spikes.
  const observer=new IntersectionObserver(items=>{
    if(items.some(item=>item.isIntersecting) && !autoLoaded.current){
      autoLoaded.current=true;observer.disconnect();void load();
    }
  },{rootMargin:'80px'});
  observer.observe(host);return()=>observer.disconnect();
 },[load]);
 const toggle=()=>{if(!open && !autoLoaded.current){autoLoaded.current=true;void load();}setOpen(v=>!v);};
 const copy=async(row:ProductSummary)=>{
   if(!row.selectedNames.length){setMessage(`Sản phẩm "${row.name}" chưa có ảnh khách đã chọn.`);return;}
   const names=row.selectedNames.join('\n');
   try{await navigator.clipboard.writeText(names);setMessage(`Đã copy ${row.selectedNames.length} tên ảnh của "${row.name}".`);}
   catch{setMessage('Trình duyệt không cho copy tự động. Hãy mở HTTPS và cấp quyền Clipboard.');}
 };
 return <div ref={hostRef} className="mt-2">
  <div className="mb-2 flex flex-wrap gap-1.5">{rows.length?rows.map(row=><span key={row.id} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-700">{row.name}: {kindLabel[row.kind]}</span>):<span className="text-xs text-slate-500">{busy?'Đang tự nhận diện ảnh/clip…':'Tự nhận diện từ Drive khi cuộn tới sản phẩm'}</span>}</div>
  <button type="button" className="secondary-button small" onClick={toggle} aria-expanded={open}><Images size={15}/>{open?'Ẩn phân loại ảnh/clip':'Kiểm tra ảnh / clip & ảnh đã chọn'}</button>
  {open&&<div className="mt-2 rounded-xl border bg-white p-3 space-y-3">
   <div className="flex justify-between gap-2"><strong className="text-xs">Phân loại theo file thực tế trên Drive</strong><button type="button" disabled={busy} onClick={()=>void load()} aria-label="Tải lại"><RefreshCw size={16}/></button></div>
   {busy&&<p className="text-xs text-slate-500">Đang đọc danh sách từ Google Drive…</p>}
   {rows.map(row=><div key={row.id} className="product-summary-row">
    <AdminThumbnail eventId={eventId} user={user} cover={row.cover} small/>
    <div className="product-summary-body">
    <div className="flex justify-between items-center gap-2"><strong className="min-w-0 break-words">{row.name}</strong><span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1">{row.kind==='video'?<Film size={13}/>:<Images size={13}/>} {kindLabel[row.kind]}</span></div>
    <p className="text-slate-500">{row.imageCount} ảnh · {row.videoCount} clip · {row.selectedNames.length} ảnh khách đã chọn</p>
    {row.warning&&<p className="text-amber-700">Không thể phân loại chính xác: {row.warning}</p>}
    <button type="button" disabled={busy||!row.selectedNames.length} className="secondary-button small" onClick={()=>void copy(row)}><Copy size={14}/>Copy tên ảnh đã chọn (Admin)</button>
    </div></div>)}
   {!rows.length&&!busy&&<p className="text-xs text-slate-500">Chưa có sản phẩm hoặc chưa có dữ liệu.</p>}
   {message&&<p role="status" className="text-xs text-slate-700 break-words">{message}</p>}
  </div>}
 </div>;
}

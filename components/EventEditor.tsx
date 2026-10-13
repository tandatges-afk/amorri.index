'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { CalendarClock, ExternalLink, Save, Trash2, X } from 'lucide-react';
import { DeliveryGrantManager } from './DeliveryGrantManager';
import type { Staff, StudioEvent } from '@/lib/domain/types';
import type { EditableChanges } from '@/lib/domain/event-management';

type Detail = Omit<StudioEvent,'products'> & {sourceLinks?:Record<string,string>;products:{id:string;name:string;url:string;mediaType:string}[];phone?:string;note?:string;isRuocDau?:boolean;startTrai?:string;startGai?:string;locTrai?:string;locGai?:string;phoneTrai?:string;phoneGai?:string};
type Props={id:string|null;staff:Staff[];user:User;onClose:()=>void;onChanged:(newDate?:string)=>void};
const money=(value:number)=>new Intl.NumberFormat('vi-VN').format(value);
const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const label='flex flex-col gap-1.5 text-xs font-semibold text-slate-600';
const initialChanges=(e:Detail):EditableChanges=>({
 name:e.name,date:e.date,start:e.start||'',end:e.end||'',eventType:e.eventType||'',location:e.location||'',phone:e.phone||'',note:e.note||'',status:e.status,
 ...(e.isRuocDau?{startTrai:e.startTrai||'',startGai:e.startGai||'',locTrai:e.locTrai||'',locGai:e.locGai||'',phoneTrai:e.phoneTrai||'',phoneGai:e.phoneGai||''}:{}),
 price:e.price||0,deposit:e.deposit||0,
 assignments:e.assignments.map(a=>({id:a.id,task:a.task||'',cost:a.cost||0,locType:a.locType||''}))
});
async function authorizedRequest(user:User,url:string,init:RequestInit={}){
 const ask=async(force=false)=>fetch(url,{...init,cache:'no-store',headers:{...init.headers,Authorization:`Bearer ${await user.getIdToken(force)}`}});
 let res=await ask();if(res.status===401)res=await ask(true);return res;
}
export function EventEditor({id,staff,user,onClose,onChanged}:Props){
 const [detail,setDetail]=useState<Detail|null>(null),[version,setVersion]=useState('');
 const [form,setForm]=useState<EditableChanges>({}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [diagnostic,setDiagnostic]=useState(''),[diagnosticBusy,setDiagnosticBusy]=useState(false);
 const [deleting,setDeleting]=useState(false),[confirmName,setConfirmName]=useState('');
 const [reloadKey,setReloadKey]=useState(0),[sourceDrafts,setSourceDrafts]=useState<Record<string,string>>({});
 const [productId,setProductId]=useState(''),[productName,setProductName]=useState(''),[productUrl,setProductUrl]=useState(''),[productType,setProductType]=useState('auto');
 useEffect(()=>{
   if(!id){setDetail(null);setVersion('');setError('');setConfirmName('');return;}
   const ctrl=new AbortController();setLoading(true);setError('');setDetail(null);setDeleting(false);setConfirmName('');setProductId('');setProductName('');setProductUrl('');setProductType('auto');
   void (async()=>{try{
     const res=await authorizedRequest(user,`/api/events/${encodeURIComponent(id)}`,{signal:ctrl.signal});
     const payload=await res.json();
     if(!res.ok)throw new Error(`${payload.error||'Không đọc được lịch'}${payload.code?` [${payload.code}]`:''}`);
     if(!payload.event)throw new Error('Bản ghi không hợp lệ');
     if(!ctrl.signal.aborted){setDetail(payload.event);setForm(initialChanges(payload.event));setSourceDrafts(payload.event.sourceLinks||{});setVersion(payload.version);}
   }catch(e){if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Không tải được lịch');}
    finally{if(!ctrl.signal.aborted)setLoading(false);}})();
   return()=>ctrl.abort();
 },[id,user,reloadKey]);
 useEffect(()=>{if(!id)return;const listener=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[id,onClose,busy]);
 if(!id)return null;
 // Capture the guarded ID in an immutable local so callback closures retain string type.
 const eventId: string = id;
 async function inspectError(){
   setDiagnosticBusy(true);setDiagnostic('');
   try{
     const query=new URLSearchParams({eventId,date:form.date||detail?.date||''});
     const response=await authorizedRequest(user,`/api/scheduling/diagnostics?${query.toString()}`);
     const info=await response.json();
     if(!response.ok)throw new Error(info.error||'Không lấy được trạng thái lịch');
     const booking=info.booking as {found?:boolean;legacyNumericKey?:boolean;httpStatus?:number}|undefined;
     const lock=info.schedule as {locked?:boolean;isExpired?:boolean;expiresInSeconds?:number}|undefined;
     setDiagnostic([
       booking?.found===true?'Lịch còn trên Firebase':booking?.found===false?'Không tìm thấy ID lịch trên Firebase':'Chưa xác minh lịch',
       booking?.legacyNumericKey?'Dữ liệu cũ dùng khóa số':'',
       lock?.locked?`Đang khóa ngày này (tối đa ${lock.expiresInSeconds??'?'} giây còn lại)`:
         lock?.isExpired?'Khóa cũ đã hết hạn':'Không có khóa ngày đang hoạt động',
     ].filter(Boolean).join(' · '));
   }catch(err){setDiagnostic(err instanceof Error?err.message:'Không kiểm tra được lịch');}
   finally{setDiagnosticBusy(false);}
 }
 const set=<K extends keyof EditableChanges>(key:K,value:EditableChanges[K])=>setForm(f=>({...f,[key]:value}));
 const assignments=form.assignments||[];
 const roster=[...staff.filter(s=>s.active!==false||assignments.some(a=>a.id===s.id)),...assignments.filter(a=>!staff.some(s=>s.id===a.id)).map(a=>({id:a.id,name:`Nhân sự cũ (${a.id})`,role:'Không còn trong danh sách'}))];
 function toggleStaff(staffId:string,checked:boolean){set('assignments',checked?[...assignments,{id:staffId,cost:0,task:'',locType:''}]:assignments.filter(a=>a.id!==staffId));}
 function editAssignment(staffId:string,key:'cost'|'task'|'locType',value:number|string){set('assignments',assignments.map(a=>a.id===staffId?{...a,[key]:value}:a));}
 async function save(e:FormEvent){
  e.preventDefault();if(!detail||busy)return;
  setBusy(true);setError('');
  try{
   // Submit ONLY edited fields. The old implementation submitted every field,
   // including old blank times and unchanged staff, falsely triggering
   // validation failures, unnecessary schedule locks and 409 conflicts.
   const original=initialChanges(detail);
   const changes:Record<string,unknown>={};
   for(const key of Object.keys(form) as (keyof EditableChanges)[]){
     if(JSON.stringify(form[key])!==JSON.stringify(original[key])){
       // TS indexing for a heterogeneous strongly typed object.
       changes[key]=form[key];
     }
   }
   if(detail.isRuocDau){delete changes.start;delete changes.location;delete changes.phone;}
   if(!Object.keys(changes).length){setError('Bạn chưa thay đổi thông tin nào để lưu.');return;}
   const response=await authorizedRequest(user,`/api/events/${encodeURIComponent(eventId)}`,{
    method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:version,changes})
   });
   const payload=await response.json();
   if(!response.ok)throw new Error(`${payload.error||'Không cập nhật được lịch'}${payload.code?` [${payload.code}]`:''}`);
   onChanged(form.date);onClose();
  }catch(e){setError(e instanceof Error?e.message:'Không lưu được lịch');}
  finally{setBusy(false);}
 }
 async function saveProduct(){
  if(!detail||busy)return;
  setBusy(true);setError('');
  try{
   if(productId&&detail.products.find(p=>p.id===productId)?.url!==productUrl&& !window.confirm('Đổi link Drive có thể thay đổi bộ ảnh/video mà khách đang xem. Tiếp tục?'))return;
   const res=await authorizedRequest(user,`/api/events/${encodeURIComponent(eventId)}/products`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:version,productId,name:productName,url:productUrl,mediaType:productType})
   });
   const body=await res.json();if(!res.ok)throw new Error(`${body.error||'Không lưu được sản phẩm'}${body.code?` [${body.code}]`:''}`);
   onChanged(form.date);onClose();
  }catch(e){setError(e instanceof Error?e.message:'Không lưu được sản phẩm');}
  finally{setBusy(false);}
 }
 async function saveSource(staffId:string){
   if(!detail||busy)return;
   setBusy(true);setError('');
   try{
     const response=await authorizedRequest(user,`/api/events/${encodeURIComponent(eventId)}/source`,{
       method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:version,staffId,url:sourceDrafts[staffId]||''})
     });
     const result=await response.json();
     if(!response.ok)throw new Error(`${result.error||'Không nộp được Source'}${result.code?` [${result.code}]`:''}`);
     setVersion(result.version);
     setDetail(previous=>previous?{...previous,sourceLinks:{...previous.sourceLinks,[staffId]:sourceDrafts[staffId]||''}}:previous);
   }catch(error){setError(error instanceof Error?error.message:'Không nộp được Source');}
   finally{setBusy(false);}
 }
 const chooseProduct=(product:{id:string;name:string;url:string;mediaType:string})=>{setProductId(product.id);setProductName(product.name);setProductUrl(product.url);setProductType(product.mediaType||'auto');};
 async function copyProductUrl(url:string){
   try{await navigator.clipboard.writeText(url);}
   catch{setError('Trình duyệt chặn thao tác copy link.');}
 }
 async function remove(){
   if(!detail||busy||confirmName.trim()!==detail.name)return;
   if(!window.confirm('Xóa lịch này khỏi lịch làm việc? Dữ liệu sẽ được lưu dự phòng trên Firebase.'))return;
   setBusy(true);setError('');
   try{
    const response=await authorizedRequest(user,`/api/events/${encodeURIComponent(eventId)}`,{
      method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:version,confirmName:confirmName.trim()})
    });
    const payload=await response.json();
    if(!response.ok)throw new Error(`${payload.error||'Không xóa được lịch'}${payload.code?` [${payload.code}]`:''}`);
    onChanged();onClose();
   }catch(e){setError(e instanceof Error?e.message:'Không xóa được lịch');}
   finally{setBusy(false);}
 }
 return <div className="fixed inset-0 z-[130] flex justify-end bg-slate-950/65" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <section role="dialog" aria-modal="true" aria-label="Chỉnh sửa lịch" className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl">
   <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7"><div className="flex items-center gap-3"><CalendarClock className="text-indigo-600" size={23}/><div><h2 className="text-lg font-extrabold text-slate-900">Quản lý lịch</h2><p className="text-xs text-slate-500">Firebase · kiểm tra phiên bản trước khi ghi</p></div></div><button type="button" onClick={onClose} disabled={busy} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Đóng"><X size={20}/></button></header>
   {loading?<p className="p-8 text-slate-500">Đang đọc chi tiết từ Firebase…</p>:!detail?<div className="p-7 text-red-700" role="alert">{error||'Không thể đọc lịch'}<button className="mt-4 block rounded-lg border px-3 py-2 text-sm" onClick={()=>setReloadKey(x=>x+1)}>Thử tải lại lịch</button></div>:<>
    <form id="edit-event-form" className="grid flex-1 grid-cols-1 content-start gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-7" onSubmit={save}>
      {detail.isRuocDau&&<div className="col-span-full grid gap-3 rounded-xl bg-amber-50 p-4 sm:grid-cols-2"><p className="col-span-full text-xs font-bold text-amber-800">Thông tin rước dâu hai nhà — chỉnh sửa trực tiếp tại đây</p>
       {(['startTrai','startGai'] as const).map((key,i)=><label key={key} className={label}>Giờ nhà {i===0?'trai':'gái'}<input type="time" required className={input} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>)}
       {(['locTrai','locGai'] as const).map((key,i)=><label key={key} className={label}>Địa điểm nhà {i===0?'trai':'gái'}<input required className={input} maxLength={240} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>)}
       {(['phoneTrai','phoneGai'] as const).map((key,i)=><label key={key} className={label}>SĐT nhà {i===0?'trai':'gái'}<input className={input} maxLength={50} value={form[key]||''} onChange={e=>set(key,e.target.value)}/></label>)}
      </div>}
      <label className={`${label} sm:col-span-2`}>Tên khách hàng / dự án<input className={input} required minLength={2} value={form.name||''} onChange={e=>set('name',e.target.value)}/></label>
      <label className={label}>Ngày thực hiện<input className={input} type="date" required value={form.date||''} onChange={e=>set('date',e.target.value)}/></label>
      <label className={label}>Trạng thái<select className={input} value={form.status||'pending'} onChange={e=>set('status',e.target.value as NonNullable<EditableChanges['status']>)}><option value="pending">Chờ xác nhận</option><option value="confirmed">Đã chốt</option><option value="done">Hoàn thành</option><option value="cancelled">Đã hủy</option></select></label>
      {!detail.isRuocDau&&<><label className={label}>Bắt đầu<input className={input} type="time" required value={form.start||''} onChange={e=>set('start',e.target.value)}/></label><label className={label}>Kết thúc<input className={input} type="time" required value={form.end||''} onChange={e=>set('end',e.target.value)}/></label></>}
      <label className={`${label} sm:col-span-2`}>Dịch vụ<input className={input} value={form.eventType||''} maxLength={80} onChange={e=>set('eventType',e.target.value)}/></label>
      {!detail.isRuocDau&&<><label className={`${label} sm:col-span-2`}>Địa điểm<input className={input} value={form.location||''} maxLength={240} onChange={e=>set('location',e.target.value)}/></label><label className={`${label} sm:col-span-2`}>Số điện thoại<input className={input} value={form.phone||''} maxLength={50} onChange={e=>set('phone',e.target.value)}/></label></>}
      <label className={label}>Giá trị hợp đồng (VND)<input className={input} type="number" min={0} step={1000} value={form.price??0} onChange={e=>set('price',Number(e.target.value))}/></label>
      <label className={label}>Tiền cọc (VND)<input className={input} type="number" min={0} step={1000} value={form.deposit??0} onChange={e=>set('deposit',Number(e.target.value))}/></label>
      <label className={`${label} sm:col-span-2`}>Ghi chú<textarea className={input} rows={2} maxLength={1000} value={form.note||''} onChange={e=>set('note',e.target.value)}/></label>
      <fieldset className="col-span-full rounded-xl border border-slate-200 p-4"><legend className="px-2 text-sm font-bold text-slate-800">Phân công nhân sự ({assignments.length})</legend>
        <div className="space-y-3">{roster.map(s=>{const a=assignments.find(a=>a.id===s.id);return <div key={s.id} className="rounded-lg bg-slate-50 p-3"><label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={!!a} onChange={e=>toggleStaff(s.id,e.target.checked)}/>{s.name} <span className="text-xs font-normal text-slate-400">{s.role}</span></label>{a&&<><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"><label className={label}>Công việc<input className={input} value={a.task} maxLength={120} onChange={e=>editAssignment(s.id,'task',e.target.value)}/></label><label className={label}>Chi phí (VND)<input className={input} type="number" min={0} step={1000} value={a.cost} onChange={e=>editAssignment(s.id,'cost',Number(e.target.value))}/></label><label className={label}>Nhà trai/gái<input className={input} value={a.locType} maxLength={80} onChange={e=>editAssignment(s.id,'locType',e.target.value)}/></label></div><div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-white p-2"><label className={label}>Link Source nhân sự (http/https)<input className={input} type="url" value={sourceDrafts[s.id]||''} onChange={e=>setSourceDrafts(v=>({...v,[s.id]:e.target.value}))} placeholder="Dán link thư mục Source của thợ" maxLength={1500}/></label><button className="mt-2 rounded-lg border bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 disabled:opacity-40" type="button" disabled={busy||sourceDrafts[s.id]===(detail.sourceLinks?.[s.id]||'')} onClick={()=>void saveSource(s.id)}>Lưu link Source</button></div></>}</div>})}</div>
      </fieldset>
      <fieldset className="col-span-full rounded-xl border border-indigo-200 p-4"><legend className="px-2 text-sm font-bold text-slate-800">Sản phẩm bàn giao / Google Drive</legend>
       <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
         <div><p className="text-sm font-bold text-slate-800">Quản lý link bàn giao</p><p className="text-xs text-slate-500">Copy lại link bàn giao sản phẩm ngay tại đây và mở nhanh từng link Drive đã lưu.</p></div>
         <DeliveryGrantManager eventId={eventId} user={user}/>
       </div>
       <div className="mb-3 space-y-2">{detail.products.map(prod=><div key={prod.id} className={`rounded-xl border p-3 text-xs ${productId===prod.id?'border-indigo-500 bg-indigo-50':'bg-slate-50'}`}>
         <div className="flex flex-wrap items-start justify-between gap-2">
           <div className="min-w-0"><strong className="block text-slate-900">{prod.name}</strong><a href={prod.url||'#'} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-indigo-700 underline underline-offset-2">Mở link Drive <ExternalLink size={12}/></a></div>
           <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border bg-white px-3 py-1.5 font-semibold text-slate-700" onClick={()=>chooseProduct(prod)}>Chỉnh sửa</button><button type="button" className="rounded-lg border bg-white px-3 py-1.5 font-semibold text-slate-700" onClick={()=>void copyProductUrl(prod.url)} disabled={!prod.url}>Copy link</button></div>
         </div>
       </div>)}{!detail.products.length&&<p className="text-xs text-slate-400">Chưa có sản phẩm.</p>}</div>
       <div className="grid gap-2 sm:grid-cols-2"><label className={label}>Tên sản phẩm<input className={input} maxLength={180} value={productName} onChange={e=>setProductName(e.target.value)} placeholder="VD: Album ảnh cưới"/></label><label className={label}>Loại<select className={input} value={productType} onChange={e=>setProductType(e.target.value)}><option value="auto">Tự nhận diện</option><option value="image">Hình ảnh</option><option value="video">Video</option></select></label><label className={`${label} sm:col-span-2`}>Link Drive (folder hoặc file)<input className={input} value={productUrl} onChange={e=>setProductUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." maxLength={1200}/></label></div>
       <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>void saveProduct()} disabled={busy||!productName.trim()||!productUrl.trim()} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{productId?'Cập nhật sản phẩm':'Thêm sản phẩm'}</button><button type="button" className="rounded-lg border px-3 py-2 text-xs" onClick={()=>{setProductId('');setProductName('');setProductUrl('');setProductType('auto');}}>Tạo mới</button></div>
      </fieldset>
      <div className="col-span-full rounded-xl bg-rose-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-rose-800">Xóa lịch (có lưu dự phòng)</h3><p className="mt-1 text-xs text-rose-700">Để hủy mà vẫn giữ lịch, chọn trạng thái “Đã hủy”. Chỉ xóa khi chắc chắn.</p></div><button type="button" className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-xs font-bold text-rose-700" onClick={()=>setDeleting(v=>!v)}><Trash2 size={15}/> {deleting?'Ẩn xác nhận xóa':'Hiển thị xác nhận xóa'}</button></div>
        {deleting&&<div className="mt-3"><label className={label}>Gõ chính xác tên lịch để xác nhận<input className={input} value={confirmName} onChange={e=>setConfirmName(e.target.value)} placeholder={detail.name}/></label><button disabled={busy||confirmName.trim()!==detail.name} type="button" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-xs font-bold text-rose-700 disabled:opacity-40" onClick={()=>void remove()}><Trash2 size={15}/> Xóa và lưu bản dự phòng</button></div>}
      </div>
      {error&&<div role="alert" className="col-span-full rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">
       <p>{error} {error.includes('thay đổi')&&'Đóng và mở lại chi tiết để tải phiên bản mới.'}</p>
       {/BOOKING_|SCHEDULE_/.test(error)&&<button type="button" disabled={diagnosticBusy} className="mt-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold" onClick={()=>void inspectError()}>{diagnosticBusy?'Đang kiểm tra…':'Kiểm tra trạng thái lịch / khóa ngày'}</button>}
       {diagnostic&&<p className="mt-2 font-medium">{diagnostic}</p>}
      </div>}
      <p className="col-span-full text-xs text-slate-400">Thông tin sản phẩm, file nguồn và ảnh yêu thích không bị thay thế bởi form này. Định dạng số tiền: VND — ví dụ {money(1_500_000)}.</p>
    </form>
    <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold">Đóng</button><button type="submit" form="edit-event-form" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white"><Save size={16}/>{busy?'Đang xử lý…':'Lưu thay đổi'}</button></footer>
   </>}
  </section>
 </div>;
}

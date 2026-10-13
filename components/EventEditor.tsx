'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { CalendarClock, Save, Trash2, X } from 'lucide-react';
import type { Staff, StudioEvent } from '@/lib/domain/types';
import type { EditableChanges } from '@/lib/domain/event-management';

type Detail = StudioEvent & {phone?:string;note?:string;isRuocDau?:boolean};
type Props={id:string|null;staff:Staff[];user:User;onClose:()=>void;onChanged:(newDate?:string)=>void};
const money=(value:number)=>new Intl.NumberFormat('vi-VN').format(value);
const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const label='flex flex-col gap-1.5 text-xs font-semibold text-slate-600';
const initialChanges=(e:Detail):EditableChanges=>({
 name:e.name,date:e.date,start:e.start||'',end:e.end||'',eventType:e.eventType||'',location:e.location||'',phone:e.phone||'',note:e.note||'',status:e.status,
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
 const [deleting,setDeleting]=useState(false),[confirmName,setConfirmName]=useState('');
 useEffect(()=>{
   if(!id){setDetail(null);setVersion('');setError('');setConfirmName('');return;}
   const ctrl=new AbortController();setLoading(true);setError('');setDetail(null);setDeleting(false);setConfirmName('');
   void (async()=>{try{
     const res=await authorizedRequest(user,`/api/events/${encodeURIComponent(id)}`,{signal:ctrl.signal});
     const payload=await res.json();
     if(!res.ok)throw new Error(`${payload.error||'Không đọc được lịch'}${payload.code?` [${payload.code}]`:''}`);
     if(!payload.event)throw new Error('Bản ghi không hợp lệ');
     if(!ctrl.signal.aborted){setDetail(payload.event);setForm(initialChanges(payload.event));setVersion(payload.version);}
   }catch(e){if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Không tải được lịch');}
    finally{if(!ctrl.signal.aborted)setLoading(false);}})();
   return()=>ctrl.abort();
 },[id,user]);
 useEffect(()=>{if(!id)return;const listener=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[id,onClose,busy]);
 if(!id)return null;
 // Capture the guarded ID in an immutable local so callback closures retain string type.
 const eventId: string = id;
 const set=<K extends keyof EditableChanges>(key:K,value:EditableChanges[K])=>setForm(f=>({...f,[key]:value}));
 const assignments=form.assignments||[];
 const roster=[...staff.filter(s=>s.active!==false||assignments.some(a=>a.id===s.id)),...assignments.filter(a=>!staff.some(s=>s.id===a.id)).map(a=>({id:a.id,name:`Nhân sự cũ (${a.id})`,role:'Không còn trong danh sách'}))];
 function toggleStaff(staffId:string,checked:boolean){set('assignments',checked?[...assignments,{id:staffId,cost:0,task:'',locType:''}]:assignments.filter(a=>a.id!==staffId));}
 function editAssignment(staffId:string,key:'cost'|'task'|'locType',value:number|string){set('assignments',assignments.map(a=>a.id===staffId?{...a,[key]:value}:a));}
 async function save(e:FormEvent){
  e.preventDefault();if(!detail||busy)return;
  setBusy(true);setError('');
  try{
   // Specialized wedding entries store two independent starts and locations; do not overwrite them.
   const changes={...form};
   if(detail.isRuocDau){delete changes.start;delete changes.location;delete changes.phone;}
   const response=await authorizedRequest(user,`/api/events/${encodeURIComponent(eventId)}`,{
    method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({expectedVersion:version,changes})
   });
   const payload=await response.json();
   if(!response.ok)throw new Error(`${payload.error||'Không cập nhật được lịch'}${payload.code?` [${payload.code}]`:''}`);
   onChanged(form.date);onClose();
  }catch(e){setError(e instanceof Error?e.message:'Không lưu được lịch');}
  finally{setBusy(false);}
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
   {loading?<p className="p-8 text-slate-500">Đang đọc chi tiết từ Firebase…</p>:!detail?<div className="p-7 text-red-700" role="alert">{error||'Không thể đọc lịch'}</div>:<>
    <form id="edit-event-form" className="grid flex-1 grid-cols-1 content-start gap-4 overflow-y-auto p-5 sm:grid-cols-2 sm:p-7" onSubmit={save}>
      {detail.isRuocDau&&<p className="col-span-full rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Lịch rước dâu hai nhà: giờ, địa điểm và số điện thoại đặc biệt được giữ nguyên. Điều chỉnh những mục đó trong workspace nâng cao.</p>}
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
        <div className="space-y-3">{roster.map(s=>{const a=assignments.find(a=>a.id===s.id);return <div key={s.id} className="rounded-lg bg-slate-50 p-3"><label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={!!a} onChange={e=>toggleStaff(s.id,e.target.checked)}/>{s.name} <span className="text-xs font-normal text-slate-400">{s.role}</span></label>{a&&<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"><label className={label}>Công việc<input className={input} value={a.task} maxLength={120} onChange={e=>editAssignment(s.id,'task',e.target.value)}/></label><label className={label}>Chi phí (VND)<input className={input} type="number" min={0} step={1000} value={a.cost} onChange={e=>editAssignment(s.id,'cost',Number(e.target.value))}/></label><label className={label}>Nhà trai/gái<input className={input} value={a.locType} maxLength={80} onChange={e=>editAssignment(s.id,'locType',e.target.value)}/></label></div>}</div>})}</div>
      </fieldset>
      <div className="col-span-full rounded-xl bg-rose-50 p-4"><h3 className="text-sm font-bold text-rose-800">Xóa lịch (có lưu dự phòng)</h3><p className="my-2 text-xs text-rose-700">Để hủy mà vẫn giữ lịch, chọn trạng thái “Đã hủy”. Chỉ xóa khi chắc chắn. Bản gốc được lưu vào vùng lưu trữ Admin riêng.</p><label className={label}>Gõ chính xác tên lịch để xác nhận<input className={input} value={confirmName} onChange={e=>setConfirmName(e.target.value)} placeholder={detail.name}/></label><button disabled={busy||confirmName.trim()!==detail.name} type="button" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-xs font-bold text-rose-700 disabled:opacity-40" onClick={()=>void remove()}><Trash2 size={15}/> Xóa và lưu bản dự phòng</button></div>
      {error&&<div role="alert" className="col-span-full rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error} {error.includes('thay đổi')&&'Đóng và mở lại chi tiết để tải phiên bản mới.'}</div>}
      <p className="col-span-full text-xs text-slate-400">Thông tin sản phẩm, file nguồn và ảnh yêu thích không bị thay thế bởi form này. Định dạng số tiền: VND — ví dụ {money(1_500_000)}.</p>
    </form>
    <footer className="flex justify-end gap-2 border-t border-slate-200 p-4"><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold">Đóng</button><button type="submit" form="edit-event-form" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white"><Save size={16}/>{busy?'Đang xử lý…':'Lưu thay đổi'}</button></footer>
   </>}
  </section>
 </div>;
}

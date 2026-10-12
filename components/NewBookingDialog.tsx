'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { X, CalendarPlus, CheckCircle2 } from 'lucide-react';
import type { User } from 'firebase/auth';
import { validateBooking, type BookingInput } from '@/lib/domain/booking';

type Props = {open:boolean; onClose:()=>void; onCreated:()=>void; user:User};
const today = () => new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10);
export function NewBookingDialog({open,onClose,onCreated,user}:Props){
 const [id,setId]=useState('');
 const [name,setName]=useState(''),[date,setDate]=useState(today),[start,setStart]=useState('08:00'),[end,setEnd]=useState('17:00');
 const [eventType,setEventType]=useState('Cưới'),[location,setLocation]=useState(''),[phone,setPhone]=useState(''),[note,setNote]=useState('');
 const [status,setStatus]=useState<BookingInput['status']>('pending'),[price,setPrice]=useState('0'),[deposit,setDeposit]=useState('0');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(open){setId(crypto.randomUUID());setError('');}},[open]);
 useEffect(()=>{if(!open)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open,onClose,busy]);
 if(!open)return null;
 async function submit(e:FormEvent){
   e.preventDefault();if(busy)return;
   const checked=validateBooking({id,name,date,start,end,eventType,location,phone,note,status,price:Number(price),deposit:Number(deposit)});
   if(!checked.ok){setError(checked.message);return;}
   setBusy(true);setError('');
   try{
     const post=async (forceRefresh=false)=>{
       const token=await user.getIdToken(forceRefresh);
       return fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(checked.value)});
     };
     let result=await post();
     // Safe retry: event.id is an idempotency key; the API never overwrites an existing event.
     if(result.status===401)result=await post(true);
     const payload=await result.json();
     if(!result.ok)throw new Error(`${payload.error||'Không thể tạo lịch'}${payload.code?` [${payload.code}]`:''}`);
     onCreated();onClose();
   }catch(err){setError(err instanceof Error?err.message:'Không thể tạo lịch');}
   finally{setBusy(false);}
 }
 const field='mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
 const lab='block text-xs font-bold text-slate-600';
 return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/65 p-3 sm:p-6" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <section role="dialog" aria-modal="true" aria-label="Tạo lịch quay chụp" className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
    <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-7"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><CalendarPlus size={20}/></span><div><h2 className="text-lg font-bold text-slate-900">Tạo lịch mới</h2><p className="text-xs text-slate-500">Lưu trực tiếp vào Firebase — chỉ tài khoản quản trị</p></div></div><button onClick={onClose} disabled={busy} aria-label="Đóng" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20}/></button></header>
    <form id="new-booking-form" onSubmit={submit} className="grid grid-cols-1 gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2 sm:px-7">
      <label className={`${lab} sm:col-span-2`}>Tên khách hàng / dự án *<input required minLength={2} maxLength={180} className={field} value={name} onChange={e=>setName(e.target.value)} placeholder="VD: Lễ cưới Minh & Hà"/></label>
      <label className={lab}>Ngày thực hiện *<input required type="date" className={field} value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label className={lab}>Dịch vụ<select className={field} value={eventType} onChange={e=>setEventType(e.target.value)}>{['Cưới','Prewedding','Tốt nghiệp','Concept','Sự kiện','Khác'].map(x=><option key={x}>{x}</option>)}</select></label>
      <label className={lab}>Bắt đầu *<input required type="time" className={field} value={start} onChange={e=>setStart(e.target.value)}/></label>
      <label className={lab}>Kết thúc *<input required type="time" className={field} value={end} onChange={e=>setEnd(e.target.value)}/></label>
      <label className={`${lab} sm:col-span-2`}>Địa điểm<input className={field} maxLength={240} value={location} onChange={e=>setLocation(e.target.value)} placeholder="Địa điểm làm việc"/></label>
      <label className={lab}>Số điện thoại<input type="tel" maxLength={50} className={field} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
      <label className={lab}>Trạng thái<select className={field} value={status} onChange={e=>setStatus(e.target.value as BookingInput['status'])}><option value="pending">Chờ xác nhận</option><option value="confirmed">Đã chốt</option><option value="done">Hoàn thành</option><option value="cancelled">Đã hủy</option></select></label>
      <label className={lab}>Giá trị hợp đồng (VND)<input type="number" min={0} step="1000" className={field} value={price} onChange={e=>setPrice(e.target.value)}/></label>
      <label className={lab}>Đã cọc (VND)<input type="number" min={0} step="1000" className={field} value={deposit} onChange={e=>setDeposit(e.target.value)}/></label>
      <label className={`${lab} sm:col-span-2`}>Ghi chú<textarea rows={2} maxLength={1000} className={field} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <p className="sm:col-span-2 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">Lịch được tạo chưa có phân công nhân sự hoặc sản phẩm. Sau khi tạo, bạn có thể bổ sung các trường nâng cao trong <a href="/studio" className="font-bold text-indigo-700 underline">workspace đầy đủ</a>.</p>
      {error&&<p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
    </form>
    <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-4 sm:px-7"><div className="flex items-center gap-2 text-xs text-slate-400"><CheckCircle2 size={15}/> Kiểm tra dữ liệu trước khi lưu</div><div className="flex gap-2"><button onClick={onClose} type="button" disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700">Hủy</button><button form="new-booking-form" disabled={busy} type="submit" className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50">{busy?'Đang lưu…':'Lưu lịch'}</button></div></footer>
  </section>
 </div>;
}

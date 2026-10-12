'use client';
import { useCallback,useEffect,useState } from 'react';
import { onAuthStateChanged,signInWithEmailAndPassword,signOut,type User } from 'firebase/auth';
import { browserAuth } from '@/lib/firebase/client';
import { authorizedFetch,decodeResult } from '@/lib/firebase/authorized-fetch';
import { CalendarDays,CalendarOff,RefreshCcw,LogOut } from 'lucide-react';
type Mine={id:string;name:string;role:string};
type Work={id:string;name:string;date:string;start:string;end:string;eventType:string;location:string;status:string;assignment:{task:string;locType:string}[]};
type Absence={id:string;date:string;reason:string};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function StaffPortal(){
 const [user,setUser]=useState<User|null>(null),[ready,setReady]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState('');
 const [loginError,setLoginError]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [mine,setMine]=useState<Mine|null>(null),[events,setEvents]=useState<Work[]>([]),[absences,setAbsences]=useState<Absence[]>([]);
 const [date,setDate]=useState(today),[reason,setReason]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>onAuthStateChanged(browserAuth(),u=>{setUser(u);setReady(true);setError('');}),[]);
 const load=useCallback(async()=>{
  if(!user){setMine(null);return;}
  const me=await decodeResult(await authorizedFetch(user,'/api/staff/me'));
  if(!me.staff){throw new Error('Tài khoản này chưa liên kết với nhân sự. Nếu là Admin, hãy chọn nhân sự trong Dashboard.');}
  setMine(me.staff);
  const [agenda,blackouts]=await Promise.all([
    authorizedFetch(user,'/api/staff/agenda').then(decodeResult),
    authorizedFetch(user,`/api/blackouts?month=${today().slice(0,7)}`).then(decodeResult)
  ]);
  setEvents(agenda.events);setAbsences(blackouts.blackouts);
 },[user]);
 useEffect(()=>{let active=true;void load().catch(e=>{if(active){setMine(null);setError(e.message);}});return()=>{active=false;};},[load,reload]);
 useEffect(()=>{if(!user)return;const timer=setInterval(()=>setReload(v=>v+1),60_000);return()=>clearInterval(timer);},[user]);
 async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setLoginError('');try{await signInWithEmailAndPassword(browserAuth(),email,password);}catch{setLoginError('Đăng nhập không thành công. Kiểm tra tài khoản Firebase Auth của thợ.');}finally{setBusy(false);}}
 async function action(req:()=>Promise<void>){setBusy(true);setError('');try{await req();setReload(x=>x+1);}catch(e){setError(e instanceof Error?e.message:'Không lưu được');}finally{setBusy(false);}}
 const create=()=>action(async()=>{await decodeResult(await authorizedFetch(user!,'/api/blackouts',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({staffId:mine!.id,date,reason})
 }));setReason('');});
 const remove=(b:Absence)=>{if(!window.confirm(`Hủy đăng ký nghỉ ngày ${b.date}?`))return;void action(async()=>{
  await decodeResult(await authorizedFetch(user!,`/api/blackouts/${encodeURIComponent(b.id)}`,{method:'DELETE'}));
 });};
 if(!ready)return <main className="grid min-h-screen place-items-center bg-slate-100">Đang kết nối Firebase…</main>;
 if(!user)return <main className="grid min-h-screen place-items-center bg-slate-100 p-4"><form onSubmit={login} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-xl"><div className="text-sm font-black tracking-[0.22em]">AMORRI STUDIO</div><h1 className="text-2xl font-bold">Cổng nhân sự</h1><p className="text-sm text-slate-600">Đăng nhập bằng tài khoản Firebase do Admin cấp, không dùng link `?staff=ID`.</p><label className="block text-xs font-semibold">Email<input required type="email" className="mt-1 w-full rounded-lg border p-3" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="block text-xs font-semibold">Mật khẩu<input required type="password" className="mt-1 w-full rounded-lg border p-3" value={password} onChange={e=>setPassword(e.target.value)}/></label>{loginError&&<p role="alert" className="text-sm text-rose-700">{loginError}</p>}<button disabled={busy} className="w-full rounded-xl bg-slate-900 p-3 font-bold text-white">Đăng nhập</button><a className="block text-center text-xs text-indigo-700" href="/">Quay lại trang Admin</a></form></main>;
 return <main className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-8"><div className="mx-auto max-w-5xl space-y-5">
  <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 p-5 text-white"><div><div className="text-xs tracking-[0.18em] text-slate-400">AMORRI STUDIO · STAFF</div><h1 className="text-xl font-bold">Lịch sắp tới của bạn</h1><p className="text-sm text-slate-300">{mine?`${mine.name} · ${mine.role}`:'Đang xác minh liên kết nhân sự…'}</p></div><div className="flex gap-2"><button className="rounded-lg bg-white/10 p-2" title="Đồng bộ" onClick={()=>setReload(x=>x+1)}><RefreshCcw size={18}/></button><button className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm" onClick={()=>void signOut(browserAuth())}><LogOut size={16}/> Đăng xuất</button></div></header>
  {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-900">{error}</div>}
  {mine&&<><section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><CalendarDays size={20}/> Lịch 90 ngày tới ({events.length})</h2>
   {events.length? <div className="space-y-3">{events.map(e=><article key={e.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><strong>{e.name}</strong><span className="text-sm font-semibold text-indigo-700">{e.date} · {e.start||'--:--'} – {e.end||'--:--'}</span></div><p className="mt-1 text-sm text-slate-600">{e.eventType} · {e.location||'Chưa có địa điểm'}</p><p className="mt-2 text-sm text-slate-700">{e.assignment.map(a=>[a.task,a.locType].filter(Boolean).join(' — ')).join(', ')||'Chưa ghi nhiệm vụ'}</p></article>)}</div> :<p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Bạn chưa được phân công lịch nào trong 90 ngày tới. Không thể mở chi tiết ở những ngày trống.</p>}
  </section><section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><CalendarOff size={20}/> Báo bận / nghỉ</h2><form onSubmit={e=>{e.preventDefault();void create();}} className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]"><label className="text-xs font-semibold">Ngày nghỉ<input type="date" min={today()} required value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5"/></label><label className="text-xs font-semibold">Lý do<input maxLength={400} value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 w-full rounded-lg border p-2.5" placeholder="Nghỉ phép, bận việc…"/></label><button disabled={busy} className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white">Gửi báo nghỉ</button></form><p className="mt-2 text-xs text-slate-500">Backend từ chối báo nghỉ vào ngày đã nhận lịch. Muốn đổi ngày nghỉ cần liên hệ Admin để điều chỉnh lịch.</p><div className="mt-4 grid gap-2">{absences.map(b=><div key={b.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm"><span><b>{b.date}</b> · {b.reason||'Nghỉ'}</span><button disabled={busy} className="text-rose-700 underline" onClick={()=>remove(b)}>Xóa</button></div>)}{!absences.length&&<p className="text-sm text-slate-400">Chưa có ngày nghỉ trong tháng này.</p>}</div></section></>}
  <p className="pb-4 text-center text-xs text-slate-500">Truy cập dữ liệu được xác minh bằng Firebase ID token trên backend · Đồng bộ mỗi 60 giây</p>
 </div></main>;
}

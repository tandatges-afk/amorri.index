'use client';
import {useCallback,useState} from 'react';
import type {User} from 'firebase/auth';
import {LockKeyhole} from 'lucide-react';
type Grant={id:string;scope:string;expiresAt:number;createdAt:number;revokedAt:number|null;shareUrl:string|null};
export function DeliveryGrantManager({eventId,user}:{eventId:string;user:User}){
  const [open,setOpen]=useState(false),[days,setDays]=useState(14),[scope,setScope]=useState<'review'|'view'>('review');
  const [grants,setGrants]=useState<Grant[]>([]),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[link,setLink]=useState('');
  const api=useCallback(async(method:'GET'|'POST'|'DELETE',route:string,body?:object)=>{
    const idToken=await user.getIdToken();
    const result=await fetch(route,{method,headers:{Authorization:`Bearer ${idToken}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const value=await result.json();if(!result.ok)throw new Error(value.error||`HTTP ${result.status}`);return value;
  },[user]);
  const load=useCallback(async()=>{const result=await api('GET',`/api/delivery/grants?eventId=${encodeURIComponent(eventId)}`);setGrants(result.grants);},[api,eventId]);
  const activate=async()=>{setOpen(x=>!x);if(!open){try{await load();}catch(err){setFeedback(err instanceof Error?err.message:'Không tải được danh sách link');}}};
  const generate=async()=>{setBusy(true);setFeedback('');
    try{const result=await api('POST','/api/delivery/grants',{eventId,days,scope});setLink(result.shareUrl);await load();
      try{await navigator.clipboard.writeText(result.shareUrl);setFeedback('Đã tạo link và sao chép vào clipboard.');}catch{setFeedback('Đã tạo link. Hãy sao chép đường dẫn bên dưới.');}
    }catch(err){setFeedback(err instanceof Error?err.message:'Không tạo được link');}finally{setBusy(false);}
  };
  const copyLink=async(value:string)=>{try{await navigator.clipboard.writeText(value);setFeedback('Đã copy link bàn giao.');}
    catch{setLink(value);setFeedback('Không thể copy tự động; hãy chọn và sao chép đường dẫn trong ô bên dưới.');}};
  const revoke=async(id:string)=>{if(!window.confirm('Thu hồi link này? Khách sẽ không thể truy cập qua link đã thu hồi.'))return;
    setBusy(true);try{await api('DELETE',`/api/delivery/grants/${id}?eventId=${encodeURIComponent(eventId)}`);await load();setFeedback('Đã thu hồi link.');}
    catch(err){setFeedback(err instanceof Error?err.message:'Không thu hồi được link');}finally{setBusy(false);}
  };
  return <div style={{marginTop:12}}>
    <button type="button" className="secondary-button small" onClick={activate}
      aria-expanded={open} aria-controls={`delivery-grants-${eventId}`}>
      {open ? 'Ẩn quản lý link' : <><LockKeyhole size={15} aria-hidden="true"/> Link an toàn</>}
    </button>
    {open&&<div id={`delivery-grants-${eventId}`} style={{display:'grid',gap:8,padding:12,background:'#f7f9f6',borderRadius:12,marginTop:8}}>
      <label>Hiệu lực (ngày) <input type="number" min={1} max={90} value={days} onChange={e=>setDays(Number(e.target.value))} style={{width:65,marginLeft:8}}/></label>
      <label>Quyền <select value={scope} onChange={e=>setScope(e.target.value as 'review'|'view')}><option value="review">Xem + góp ý/chọn ảnh</option><option value="view">Chỉ xem</option></select></label>
      <button type="button" className="primary-button small" disabled={busy} onClick={generate}>{busy?'Đang xử lý…':'Tạo link bảo mật'}</button>
      {link&&<div className="flex gap-2"><input className="min-w-0 flex-1" aria-label="Link bàn giao vừa tạo" value={link} readOnly onFocus={e=>e.currentTarget.select()}/><button type="button" onClick={()=>void copyLink(link)}>Copy</button></div>} {feedback&&<small role="status">{feedback}</small>}
      {grants.map(g=><div key={g.id} style={{borderTop:'1px solid #dce5d8',paddingTop:8,fontSize:12,display:'flex',gap:8,justifyContent:'space-between'}}><span>{g.scope==='review'?'Góp ý':'Chỉ xem'} · {new Date(g.expiresAt).toLocaleDateString('vi-VN')} · {g.revokedAt?'Đã thu hồi':Date.now()>g.expiresAt?'Hết hạn':'Có hiệu lực'}</span><span className="flex gap-2">{g.shareUrl && !g.revokedAt && g.expiresAt>Date.now() && <button type="button" onClick={()=>void copyLink(g.shareUrl!)}>Copy link</button>}{!g.shareUrl && !g.revokedAt && g.expiresAt>Date.now() && <span title="Link cũ chỉ lưu hash, không thể lấy lại token">Link cũ: cần phát hành mới một lần</span>}{!g.revokedAt&&<button type="button" disabled={busy} onClick={()=>revoke(g.id)}>Thu hồi</button>}</span></div>)}
    </div>}
  </div>;
}

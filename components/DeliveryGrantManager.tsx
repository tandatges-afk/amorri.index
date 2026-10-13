'use client';
import {useCallback,useState} from 'react';
import type {User} from 'firebase/auth';
import {Copy,LoaderCircle,LockKeyhole} from 'lucide-react';

/** One-click: reuse active share link, or create one once if none can be recovered. */
export function DeliveryGrantManager({eventId,user}:{eventId:string;user:User}){
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [manualLink,setManualLink]=useState('');
  const run=useCallback(async()=>{
    if(busy)return;
    setBusy(true);setFeedback('');setManualLink('');
    try{
      const fetchWithToken=async(url:string,method:'GET'|'POST',refresh=false)=>
        fetch(url,{method,cache:'no-store',headers:{Authorization:`Bearer ${await user.getIdToken(refresh)}`,...(method==='POST'?{'Content-Type':'application/json'}:{})},
          body:method==='POST'?JSON.stringify({eventId}):undefined});
      // Always use the server-side idempotent endpoint: consolidate old links
      // and reuse the one active link in an atomic Firebase transaction.
      let response=await fetchWithToken('/api/delivery/grants','POST');
      if(response.status===401)response=await fetchWithToken('/api/delivery/grants','POST',true);
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
      const url=String(body.shareUrl||'');
      if(!url){
        response=await fetchWithToken('/api/delivery/grants','POST');
        if(response.status===401)response=await fetchWithToken('/api/delivery/grants','POST',true);
        body=await response.json();
        if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
        url=String(body.shareUrl||'');
      }
      if(!url)throw new Error('Không tìm thấy link bàn giao');
      try {await navigator.clipboard.writeText(url);setFeedback('Đã sao chép link bàn giao.');}
      catch {setManualLink(url);setFeedback('Trình duyệt chặn copy. Hãy chọn và sao chép link dưới đây.');}
    }catch(error){setFeedback(error instanceof Error?error.message:'Không sao chép được link');}
    finally{setBusy(false);}
  },[eventId,user,busy]);
  return <div className="delivery-share-action">
    <button type="button" disabled={busy} className="secondary-button small" onClick={()=>void run()} aria-label="Copy link bàn giao an toàn">
      {busy?<LoaderCircle size={15} className="spin"/>:<Copy size={15}/>} {busy?'Đang lấy link…':'Copy link an toàn'}
    </button>
    {feedback&&<small role="status" className="delivery-share-feedback"><LockKeyhole size={12}/>{feedback}</small>}
    {manualLink&&<input aria-label="Link bàn giao để sao chép thủ công" value={manualLink} readOnly onFocus={e=>e.currentTarget.select()} className="delivery-copy-fallback"/>}
  </div>;
}

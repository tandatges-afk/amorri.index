'use client';
import {useCallback,useState} from 'react';
import type {User} from 'firebase/auth';
import {authorizedFetch,decodeResult} from '@/lib/firebase/authorized-fetch';
type Video={productId:string;productName:string;mediaId:string;name:string;streamUid:string};
export function VideoStreamManager({eventId,user}:{eventId:string;user:User}){
 const [open,setOpen]=useState(false),[videos,setVideos]=useState<Video[]>([]),[uids,setUids]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(''),[feedback,setFeedback]=useState('');
 const route=`/api/video-streams/${encodeURIComponent(eventId)}`;
 const key=(v:Video)=>`${v.productId}::${v.mediaId}`;
 const load=useCallback(async()=>{
   const value=await decodeResult(await authorizedFetch(user,route));
   const list=value.videos as Video[];setVideos(list);setUids(Object.fromEntries(list.map(v=>[key(v),v.streamUid])));
 },[user,route]);
 const toggle=async()=>{if(open){setOpen(false);return;}setOpen(true);setFeedback('');try{await load();}catch(e){setFeedback(e instanceof Error?e.message:'Không đọc được video');}};
 const save=async(v:Video,remove=false)=>{
  if(remove&&!window.confirm('Gỡ liên kết Stream? Khách sẽ dùng lại video Drive qua Vercel.'))return;
  setBusy(key(v));setFeedback('');
  try{
   await decodeResult(await authorizedFetch(user,route,{
    method:remove?'DELETE':'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({productId:v.productId,mediaId:v.mediaId,...(remove?{}:{streamUid:uids[key(v)]})})
   }));await load();setFeedback(remove?'Đã gỡ liên kết HLS.':'Đã liên kết video Stream riêng tư.');
  }catch(e){setFeedback(e instanceof Error?e.message:'Không lưu được Stream UID');}
  finally{setBusy('');}
 };
 return <div style={{marginTop:12}}>
   <button className="secondary-button small" onClick={()=>void toggle()}>{open?'Ẩn video 1080p':'🎞️ HLS / CDN 2.6'}</button>
   {open&&<div style={{display:'grid',gap:10,background:'#f4f7f5',borderRadius:12,padding:12,marginTop:8}}>
      <p style={{fontSize:12,margin:0}}>Video phải được tải lên Cloudflare Stream, có trạng thái Ready và bật <b>Require signed URLs</b>. Sao chép Video UID (32 ký tự) và ghép đúng clip Drive. Không thay đổi file gốc.</p>
      {videos.map(v=><div key={key(v)} style={{borderTop:'1px solid #d4dfd5',paddingTop:10,display:'grid',gap:5}}>
        <strong style={{fontSize:12}}>{v.productName}: {v.name}</strong>
        <input aria-label={`Stream UID của ${v.name}`} placeholder="Cloudflare Stream Video UID (32 hex)" value={uids[key(v)]||''}
          onChange={e=>setUids(old=>({...old,[key(v)]:e.target.value.trim()}))} style={{width:'100%',minWidth:0,border:'1px solid #d2dcd2',borderRadius:6,padding:8,fontSize:12}}/>
        <div style={{display:'flex',gap:8}}><button disabled={!!busy||!(uids[key(v)]||'').trim()} onClick={()=>void save(v)} className="primary-button small">{busy===key(v)?'Đang xử lý…':'Lưu liên kết'}</button>
          {v.streamUid&&<button disabled={!!busy} onClick={()=>void save(v,true)} className="secondary-button small">Gỡ Stream</button>}</div>
      </div>)}
      {!videos.length&&<p style={{fontSize:12}}>Không tìm thấy video Drive trong các sản phẩm của lịch này.</p>}
      {feedback&&<small role="status">{feedback}</small>}
   </div>}
 </div>;
}

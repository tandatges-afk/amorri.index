'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import type {DeliveryMedia,DeliveryPayload} from '@/lib/domain/delivery';
import './delivery.css';

type Comment={id:string;name:string;text:string;seconds:number;createdAt:number;resolved:boolean};
const time=(s:number)=>{const t=Math.floor(Math.max(0,s));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;};
type PlaybackMode='loading'|'hls'|'drive'|'iframe';
function VideoReview({eventId,productId,file,token}:{eventId:string;productId:string;file:DeliveryMedia;token:string}){
  const [src,setSrc]=useState(''),[mode,setMode]=useState<PlaybackMode>('loading');
  const [error,setError]=useState(''),[comments,setComments]=useState<Comment[]>([]);
  const [name,setName]=useState(''),[message,setMessage]=useState(''),[seconds,setSeconds]=useState(0),[sending,setSending]=useState(false);
  const [prefer1080,setPrefer1080]=useState(true);
  const [actualQuality,setActualQuality]=useState('');
  const mediaRef=useRef<HTMLVideoElement>(null);
  const lastPosition=useRef(0);
  const endpoint=`/api/delivery/${encodeURIComponent(eventId)}/reviews?productId=${encodeURIComponent(productId)}&mediaId=${encodeURIComponent(file.id)}`;
  const load=useCallback(async()=>{
    try{const r=await fetch(endpoint,{headers:{'x-amorri-delivery-token':token},cache:'no-store'});
      const v=await r.json();if(!r.ok)throw new Error(v.error||'Không tải được góp ý');setComments(v.comments||[]);
    }catch(err){setError(err instanceof Error?err.message:'Không tải được góp ý');}
  },[endpoint,token]);
  const issueDriveTicket=useCallback(async()=>{
    const r=await fetch('/api/drive-video',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id:file.id,clientGallery:eventId,productId,deliveryToken:token})});
    const b=await r.json();if(!r.ok)throw new Error(b.error||'Không phát được video Drive');
    return b.url as string;
  },[eventId,productId,file.id,token]);
  const useDrive=useCallback(async()=>{
    try{const url=await issueDriveTicket();setSrc(url);setMode('drive');setActualQuality('Nguồn Drive gốc');}
    catch(e){setMode('iframe');setError(e instanceof Error?e.message:'Không thể phát video');}
  },[issueDriveTicket]);
  useEffect(()=>{
    let active=true;let refresh:ReturnType<typeof setTimeout>|undefined;
    async function boot(){
      try{
        const r=await fetch(`/api/delivery/${encodeURIComponent(eventId)}/playback`,{
          method:'POST',headers:{'Content-Type':'application/json','x-amorri-delivery-token':token},
          body:JSON.stringify({productId,mediaId:file.id}),cache:'no-store'
        });
        const value=await r.json();if(!r.ok)throw new Error(value.error||'Không xác thực được video');
        if(!active)return;
        if(value.provider==='hls' && typeof value.manifestUrl==='string'){
          // Keep the same video element and resume after URL renewal.
          lastPosition.current=mediaRef.current?.currentTime||lastPosition.current;
          setSrc(value.manifestUrl);setMode('hls');setActualQuality('HLS / CDN');
          if(Number(value.expiresIn)>180){refresh=setTimeout(()=>{if(active)void boot();},(Number(value.expiresIn)-120)*1000);}
        }else{await useDrive();}
      }catch(err){if(active){setError(err instanceof Error?err.message:'Không phát được HLS');await useDrive();}}
    }
    void boot();void load();
    return()=>{active=false;if(refresh)clearTimeout(refresh);};
  },[eventId,productId,file.id,token,load,useDrive]);
  useEffect(()=>{
    if(mode!=='hls'||!src||!mediaRef.current)return;
    const video=mediaRef.current;
    const position=lastPosition.current;
    let active=true;let player:{destroy:()=>void}|undefined;
    const resume=()=>{if(position>1 && video.readyState>=1){
      try{video.currentTime=position;}catch{/* Browser may not permit seeking before metadata. */}
      lastPosition.current=0;
    }};
    video.addEventListener('loadedmetadata',resume);
    if(video.canPlayType('application/vnd.apple.mpegurl')){
      video.src=src;video.load();setActualQuality('HLS / chất lượng tự động trên Safari');
    }else{
      void import('hls.js').then(({default:Hls})=>{
        if(!active)return;
        if(!Hls.isSupported())throw new Error('Trình duyệt không hỗ trợ HLS');
        const hls=new Hls({enableWorker:true,maxBufferLength:30,backBufferLength:15});
        player=hls;
        hls.attachMedia(video);
        hls.on(Hls.Events.MEDIA_ATTACHED,()=>{if(active)hls.loadSource(src);});
        hls.on(Hls.Events.MANIFEST_PARSED,()=>{
          if(!active)return;
          const index=hls.levels.findIndex(l=>l.height===1080);
          // Prefer fixed Full-HD only when the rendition really exists.
          hls.currentLevel=prefer1080&&index>=0?index:-1;
          setActualQuality(prefer1080&&index>=0?'Full HD 1080p':'Tự động (nguồn không có 1080p hoặc Auto)');
          resume();
        });
        hls.on(Hls.Events.ERROR,(_event,data)=>{
          if(!active)return;
          if(data.fatal){setError('HLS gặp lỗi khi phát; đang dùng Google Drive dự phòng.');void useDrive();}
        });
      }).catch(()=>{if(active){setError('Không khởi tạo được HLS; đang thử Google Drive.');void useDrive();}});
    }
    return()=>{active=false;if(video.currentTime>0)lastPosition.current=video.currentTime;video.removeEventListener('loadedmetadata',resume);player?.destroy();if(video.getAttribute('src')===src)video.removeAttribute('src');};
  },[src,mode,prefer1080,useDrive]);
  const send=async(e:FormEvent)=>{e.preventDefault();setSending(true);setError('');
    try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','x-amorri-delivery-token':token},
      body:JSON.stringify({name,text:message,seconds:Math.floor(seconds)})});
      const value=await r.json();if(!r.ok)throw new Error(value.error||'Không thể gửi bình luận');setMessage('');await load();
    }catch(err){setError(err instanceof Error?err.message:'Không thể gửi');}finally{setSending(false);}
  };
  const native=mode==='hls'||mode==='drive';
  return <section className="delivery-video"><div className="delivery-video-main"><h4>{file.name}</h4>
    {native?<video ref={mediaRef} src={mode==='drive'?src:undefined} controls playsInline preload="metadata"
      onTimeUpdate={e=>{setSeconds(Math.floor(e.currentTarget.currentTime));}}
      onSeeked={e=>{setSeconds(Math.floor(e.currentTarget.currentTime));}}
      onError={()=>{if(mode==='hls'){setError('HLS không phát được; thử nguồn Drive dự phòng.');void useDrive();}else{setMode('iframe');setError('Trình duyệt không phát được MP4, hãy nhập mốc giây thủ công.');}}}/>
      :mode==='loading'?<div className="delivery-player-loading">Đang chuẩn bị video…</div>
      :<iframe src={file.previewUrl} loading="lazy" title={`Xem video ${file.name}`} allow="autoplay; fullscreen; picture-in-picture" referrerPolicy="no-referrer"/>}
    <div className="delivery-player-info"><span>{actualQuality||'Google Drive'}</span>
      {mode==='hls'&&<label><input type="checkbox" checked={prefer1080} onChange={e=>setPrefer1080(e.target.checked)}/> Ưu tiên 1080p (bỏ chọn để tự động)</label>}</div>
    <a href={file.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Mở file gốc trên Drive ↗</a></div>
    <aside className="delivery-review"><h4>Góp ý theo timeline</h4><p className="delivery-muted">Dừng hoặc tua video đến vị trí cần chỉnh sửa. Nếu đang dùng khung Drive dự phòng, nhập mốc giây thủ công.</p>
      <div className="delivery-comments">{comments.map(c=><div className="delivery-comment" key={c.id}>
        <button onClick={()=>{setSeconds(c.seconds);if(mediaRef.current && native)mediaRef.current.currentTime=c.seconds;}} type="button">▶ {time(c.seconds)}</button>
        <strong>{c.name}</strong><span>{c.resolved?'✓ Đã xử lý':'Cần xử lý'}</span><p>{c.text}</p></div>)}
        {!comments.length&&<p className="delivery-muted">Chưa có góp ý nào.</p>}
      </div>
      <form onSubmit={send} className="delivery-form"><label>Tên người góp ý<input required maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="Tên của bạn"/></label>
        <label>Mốc thời gian (giây)<input type="number" required min={0} max={172800} value={seconds} onChange={e=>setSeconds(Number(e.target.value))}/></label>
        <label>Nội dung<textarea required maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Mô tả đoạn cần chỉnh sửa..."/></label>
        <button type="submit" disabled={sending}>{sending?'Đang gửi…':'Gửi góp ý'}</button></form>
      {error&&<div className="delivery-alert">{error}</div>}
    </aside>
  </section>;
}
function PhotoProduct({eventId,productId,files,preselected,token}:{eventId:string;productId:string;files:DeliveryMedia[];preselected:string[];token:string}){
  const [checked,setChecked]=useState<string[]>(preselected),[filter,setFilter]=useState<'all'|'selected'>('all');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const images=files.filter(f=>!f.isVideo);
  const save=async()=>{setBusy(true);setNotice('');
    try{const r=await fetch(`/api/delivery/${encodeURIComponent(eventId)}/selections`,{method:'PUT',headers:{'Content-Type':'application/json','x-amorri-delivery-token':token},body:JSON.stringify({productId,fileIds:checked})});
      const value=await r.json();if(!r.ok)throw new Error(value.error||'Không lưu được ảnh');setNotice(`Đã đồng bộ ${value.selected} ảnh với Studio`);
    }catch(err){setNotice(err instanceof Error?err.message:'Không thể đồng bộ');}finally{setBusy(false);}
  };
  if(!images.length)return null;
  return <><div className="delivery-photo-toolbar"><strong>Ảnh đã chọn: {checked.length}/{images.length}</strong>
    <div><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Tất cả</button><button className={filter==='selected'?'active':''} onClick={()=>setFilter('selected')}>Đã chọn</button>
    <button className="delivery-primary" disabled={busy} onClick={save}>{busy?'Đang đồng bộ…':'Gửi lựa chọn'}</button></div></div>
    <div className="delivery-photos">{images.filter(i=>filter==='all'||checked.includes(i.id)).map(i=><button type="button" className={`delivery-photo ${checked.includes(i.id)?'is-selected':''}`} key={i.id} onClick={()=>setChecked(p=>p.includes(i.id)?p.filter(id=>id!==i.id):[...p,i.id])} aria-pressed={checked.includes(i.id)}>
      <img loading="lazy" alt={i.name} src={i.thumb}/><span>{checked.includes(i.id)?'✓ Đã chọn':'Chọn ảnh'}</span><small title={i.name}>{i.name}</small></button>)}</div>
    {notice&&<p role="status" className="delivery-alert">{notice}</p>}
  </>;
}
export function ClientDelivery({eventId}:{eventId:string}){
  const [token,setToken]=useState(''),[data,setData]=useState<DeliveryPayload|null>(null),[files,setFiles]=useState<Record<string,DeliveryMedia[]>>({});
  const [busy,setBusy]=useState(true),[error,setError]=useState(''),[mediaErrors,setMediaErrors]=useState<Record<string,string>>({});
  useEffect(()=>{
    const hash=new URLSearchParams(window.location.hash.slice(1)).get('token')||'';
    const value=hash||sessionStorage.getItem(`amorri_delivery:${eventId}`)||'';
    if(hash){sessionStorage.setItem(`amorri_delivery:${eventId}`,hash);window.history.replaceState(null,'',window.location.pathname);}
    setToken(value);
    if(!value){setError('Link bàn giao thiếu mã truy cập. Hãy mở lại đúng liên kết Studio đã gửi.');setBusy(false);}
  },[eventId]);
  useEffect(()=>{
    if(!token)return;let active=true;const headers={'x-amorri-delivery-token':token};
    (async()=>{try{
      const r=await fetch(`/api/delivery/${encodeURIComponent(eventId)}`,{headers,cache:'no-store'});
      const parsed=await r.json();if(!r.ok)throw new Error(parsed.error||'Không tải được bàn giao');
      if(!active)return;const doc=parsed.delivery as DeliveryPayload;setData(doc);
      const failureMap:Record<string,string>={};const results=await Promise.all(doc.products.map(async p=>{
        try{const response=await fetch(`/api/delivery/${encodeURIComponent(eventId)}/media?productId=${encodeURIComponent(p.id)}`,{headers,cache:'no-store'});
          const obj=await response.json();if(!response.ok)throw new Error(obj.error||'Lỗi Drive');
          return [p.id,obj.images as DeliveryMedia[]] as const;
        }catch(err){failureMap[p.id]=err instanceof Error?err.message:'Không thể tải media';return [p.id,[] as DeliveryMedia[]] as const;}
      }));if(active){setFiles(Object.fromEntries(results));setMediaErrors(failureMap);}
    }catch(err){if(active)setError(err instanceof Error?err.message:'Không thể tải sản phẩm');}
    finally{if(active)setBusy(false);}})();return()=>{active=false;};
  },[eventId,token]);
  return <div className="client-delivery"><header className="delivery-hero"><div className="delivery-brand">A<span>.</span> AMORRI <b>STUDIO</b></div><p>PRIVATE CLIENT DELIVERY / VNEXT 2.6</p>
    <h1>{data?.name||'Bàn giao hình ảnh & video'}</h1><div className="delivery-hero-sub">{data?.date||'Trải nghiệm riêng tư dành cho khách hàng'}</div></header>
    <main className="delivery-content">
      {busy&&<div className="delivery-message">Đang xác minh link và tải sản phẩm…</div>}
      {error&&<div role="alert" className="delivery-message delivery-error">{error}</div>}
      {data?.products.map(p=><section className="delivery-product" key={p.id}><div className="delivery-product-heading"><span>PRODUCT / {p.id}</span><h2>{p.name}</h2></div>
        {(files[p.id]||[]).filter(f=>f.isVideo).map(f=><VideoReview key={f.id} eventId={eventId} productId={p.id} file={f} token={token}/>)}
        <PhotoProduct key={`${p.id}:${(data.selections[p.id]||[]).join(',')}`} eventId={eventId} productId={p.id} files={files[p.id]||[]} token={token} preselected={data.selections[p.id]||[]}/>
        {mediaErrors[p.id]&&<p role="alert" className="delivery-alert">Không tải được media: {mediaErrors[p.id]}</p>}
        {!(files[p.id]||[]).length&&!mediaErrors[p.id]&&<p className="delivery-muted">Chưa có media Drive hiển thị. Hãy liên hệ Studio hoặc dùng bàn giao tương thích nếu đây là sản phẩm YouTube.</p>}
      </section>)}
    </main><footer className="delivery-footer">DESIGNED FOR YOUR MEMORIES · AMORRI STUDIO</footer>
  </div>;
}

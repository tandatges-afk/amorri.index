import {adminDatabase} from '@/lib/server/firebase-admin';
import {deliveryEvent,productById,payload,json,deliveryFailure} from '@/lib/server/delivery-http';
import {DeliveryError,deliveryToken,verifyDeliveryGrant} from '@/lib/server/delivery-access';
import {listDeliveryMedia} from '@/lib/server/delivery-media';
import {validId,reviewKey,validateReview} from '@/lib/domain/delivery';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function reviewRef(request:Request,eventId:string,needsReview:boolean){
  const {value}=await deliveryEvent(request,eventId,needsReview);
  const query=new URL(request.url).searchParams;
  const productId=query.get('productId')||'';const mediaId=query.get('mediaId')||'';
  const product=productById(value,productId);
  if(!validId(mediaId))throw new DeliveryError(400,'DELIVERY_BAD_MEDIA','Mã video không hợp lệ');
  const files=await listDeliveryMedia(product);
  if(!files.some(f=>f.isVideo && f.id===mediaId))throw new DeliveryError(403,'DELIVERY_MEDIA_DENIED','Video không thuộc sản phẩm');
  const productKey=reviewKey(`${productId}::${mediaId}`);
  return {ref:adminDatabase().ref(`videoReviews_v1/${reviewKey(eventId)}/${productKey}`),productId,mediaId};
}
export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{const {eventId}=await params;const {ref}=await reviewRef(request,eventId,false);
    const snap=await ref.limitToLast(300).once('value');
    const comments=Object.entries(snap.val()||{}).filter(([,v])=>v&&typeof v==='object')
      .map(([id,value])=>{const v=value as Record<string,unknown>;return {id,seconds:Number(v.seconds)||0,text:String(v.text||'').slice(0,2000),name:String(v.name||'').slice(0,60),resolved:!!v.resolved,createdAt:Number(v.createdAt)||0};})
      .sort((a,b)=>a.seconds-b.seconds||a.createdAt-b.createdAt);
    return json({comments});
  }catch(err){return deliveryFailure(err);}
}
export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{
    const {eventId}=await params;const {ref}=await reviewRef(request,eventId,true);
    const body=await payload(request,4_096);const parsed=validateReview(body);
    if(!parsed.ok)return json({error:parsed.error},422);
    // Transactional throttle per share grant. This is a basic abuse safeguard, not an anti-bot system.
    const token=deliveryToken(request);await verifyDeliveryGrant(eventId,token,true);
    const grantId=token.split('.')[0];
    const grant=adminDatabase().ref(`amorriDeliveryAccess_v1/${eventId}/${grantId}`);
    const time=Date.now();
    const rate=await grant.transaction((v:Record<string,unknown>|null)=>{
      if(!v||v.revokedAt||Number(v.expiresAt)<=time||v.scope!=='review')return;
      if(time-Number(v.lastSubmitAt||0)<3_000||Number(v.commentsCount||0)>=200)return;
      return {...v,lastSubmitAt:time,commentsCount:Number(v.commentsCount||0)+1};
    },undefined,false);
    if(!rate.committed)throw new DeliveryError(429,'DELIVERY_RATE_LIMIT','Bạn gửi quá nhanh hoặc link đã hết lượt bình luận');
    const record={...parsed.value,createdAt:time,resolved:false};
    const created=ref.push();await created.set(record);
    return json({success:true,id:created.key,comment:record},201);
  }catch(err){return deliveryFailure(err);}
}

import {requireAdmin,deliveryFailure,json,productById,payload} from '@/lib/server/delivery-http';
import {findBooking} from '@/lib/server/event-storage';
import {listDeliveryMedia} from '@/lib/server/delivery-media';
import {bindingRef,readStreamBinding,validatePrivateReadyVideo} from '@/lib/server/video-streaming';
import {parseStreamUid} from '@/lib/domain/streaming';
import {DeliveryError} from '@/lib/server/delivery-access';
import {pickProducts,validId} from '@/lib/domain/delivery';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{eventId:string}>};
async function adminEvent(request:Request,ctx:Context){
  const actor=await requireAdmin(request);
  const {eventId}=await ctx.params;
  if(!validId(eventId))throw new DeliveryError(400,'STREAM_BAD_ID','Mã lịch không hợp lệ');
  const event=(await findBooking(eventId)).value;
  return {actor,eventId,event};
}
export async function GET(request:Request,ctx:Context){
  try{
    const {eventId,event}=await adminEvent(request,ctx);
    const products=pickProducts(event.products);const videos:object[]=[];
    for(const p of products){const productId=String(p.id||'');if(!validId(productId))continue;
      const media=await listDeliveryMedia(p);
      const list=await Promise.all(media.filter(m=>m.isVideo).map(async m=>({productId,productName:String(p.name||'Sản phẩm'),mediaId:m.id,name:m.name,streamUid:(await readStreamBinding(eventId,productId,m.id))?.uid||''})));
      videos.push(...list);
    }
    return json({videos});
  }catch(err){return deliveryFailure(err);}
}
async function verifiedTarget(request:Request,ctx:Context){
  const {actor,eventId,event}=await adminEvent(request,ctx);
  const body=await payload(request,4096);
  const productId=body.productId,mediaId=body.mediaId;
  if(!validId(productId)||!validId(mediaId))throw new DeliveryError(400,'STREAM_BAD_ID','Thiếu mã sản phẩm hoặc video');
  const product=productById(event,productId);
  const media=await listDeliveryMedia(product,true);
  if(!media.some(m=>m.id===mediaId&&m.isVideo))throw new DeliveryError(404,'STREAM_MEDIA_NOT_FOUND','Video không nằm trong sản phẩm này trên Google Drive');
  return {actor,eventId,productId,mediaId,body};
}
export async function PUT(request:Request,ctx:Context){
  try{
    const {actor,eventId,productId,mediaId,body}=await verifiedTarget(request,ctx);
    const uid=parseStreamUid(body.streamUid);
    if(!uid)throw new DeliveryError(400,'STREAM_BAD_UID','Stream UID phải gồm 32 ký tự hexadecimal');
    await validatePrivateReadyVideo(uid);
    await bindingRef(eventId,productId,mediaId).set({uid,updatedAt:Date.now(),updatedBy:actor.uid});
    return json({success:true,streamUid:uid});
  }catch(err){return deliveryFailure(err);}
}
export async function DELETE(request:Request,ctx:Context){
  try{
    const {eventId,productId,mediaId}=await verifiedTarget(request,ctx);
    await bindingRef(eventId,productId,mediaId).remove();
    return json({success:true});
  }catch(err){return deliveryFailure(err);}
}

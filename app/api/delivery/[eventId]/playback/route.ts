import {deliveryFailure,json,productById,payload} from '@/lib/server/delivery-http';
import {DeliveryError,deliveryToken,verifyDeliveryGrant} from '@/lib/server/delivery-access';
import {findBooking} from '@/lib/server/event-storage';
import {listDeliveryMedia} from '@/lib/server/delivery-media';
import {readStreamBinding,signedHlsUrl} from '@/lib/server/video-streaming';
import {streamExpiry} from '@/lib/domain/streaming';
import {validId} from '@/lib/domain/delivery';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Issue HLS URLs only after verifying event-level capability AND file membership. */
export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{
    const {eventId}=await params;
    if(!validId(eventId))throw new DeliveryError(400,'STREAM_BAD_ID','Mã lịch không hợp lệ');
    const grant=await verifyDeliveryGrant(eventId,deliveryToken(request));
    const body=await payload(request,4096);
    if(!validId(body.productId)||!validId(body.mediaId))throw new DeliveryError(400,'STREAM_BAD_ID','Mã sản phẩm hoặc video không hợp lệ');
    const {value}=await findBooking(eventId);
    const product=productById(value,body.productId);
    const media=await listDeliveryMedia(product);
    if(!media.some(m=>m.id===body.mediaId&&m.isVideo))throw new DeliveryError(404,'STREAM_MEDIA_NOT_FOUND','Video không thuộc sản phẩm được chia sẻ');
    const binding=await readStreamBinding(eventId,body.productId,body.mediaId);
    if(!binding)return json({provider:'drive',message:'Chưa liên kết bản HLS; tiếp tục dùng Google Drive Range Proxy.'});
    const ttl=streamExpiry(grant.expiresAt,Date.now(),Number(process.env.AMORRI_STREAM_TOKEN_TTL_SECONDS||3600));
    if(ttl<30)throw new DeliveryError(410,'DELIVERY_EXPIRED','Liên kết sắp hết hạn; yêu cầu link mới để tiếp tục phát video');
    const signed=await signedHlsUrl(binding.uid,ttl);
    return json({provider:'hls',manifestUrl:signed.url,expiresIn:signed.expiresIn,quality:'1080p-when-available'});
  }catch(err){return deliveryFailure(err);}
}

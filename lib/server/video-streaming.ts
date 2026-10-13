import {adminDatabase} from './firebase-admin';
import {DeliveryError} from './delivery-access';
import {STREAM_ACCOUNT_ID,STREAM_CUSTOMER_CODE,parseStreamUid,streamManifestUrl} from '@/lib/domain/streaming';
import {validId} from '@/lib/domain/delivery';

const ROOT='amorriVideoStreams_v1';
export type StreamBinding={uid:string;updatedAt:number;updatedBy:string};
export function bindingRef(eventId:string,productId:string,mediaId:string){
  if(!validId(eventId)||!validId(productId)||!validId(mediaId))throw new DeliveryError(400,'STREAM_BAD_ID','Mã dữ liệu không hợp lệ');
  return adminDatabase().ref(`${ROOT}/${eventId}/${productId}/${mediaId}`);
}
export async function readStreamBinding(eventId:string,productId:string,mediaId:string):Promise<StreamBinding|null>{
  const value=(await bindingRef(eventId,productId,mediaId).once('value')).val();
  const uid=parseStreamUid(value?.uid);
  return uid?{uid,updatedAt:Number(value?.updatedAt)||0,updatedBy:String(value?.updatedBy||'')}:null;
}
function streamConfig(){
  const accountId=process.env.CF_STREAM_ACCOUNT_ID||'',apiToken=process.env.CF_STREAM_API_TOKEN||'',customerCode=process.env.CF_STREAM_CUSTOMER_CODE||'';
  if(!STREAM_ACCOUNT_ID.test(accountId)||apiToken.length<16||!STREAM_CUSTOMER_CODE.test(customerCode))
    throw new DeliveryError(503,'STREAM_CONFIG_MISSING','Chưa cấu hình đủ Cloudflare Stream cho bản preview 1080p');
  return {accountId,apiToken,customerCode};
}
async function streamApi(uid:string,suffix:string,method:'GET'|'POST',body?:object){
  const {accountId,apiToken}=streamConfig();
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12_000);
  try{
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}${suffix}`,{
      method,headers:{Authorization:`Bearer ${apiToken}`,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,cache:'no-store',signal:controller.signal
    });
    if(!response.ok)throw new DeliveryError(503,'STREAM_UPSTREAM_FAILED',`Cloudflare Stream từ chối yêu cầu (${response.status})`);
    const doc=await response.json() as {success?:boolean;result?:Record<string,unknown>};
    if(!doc.success||!doc.result)throw new DeliveryError(503,'STREAM_UPSTREAM_FAILED','Cloudflare Stream phản hồi không hợp lệ');
    return doc.result;
  }catch(err){if(err instanceof DeliveryError)throw err;
    throw new DeliveryError(503,'STREAM_TIMEOUT','Không thể kết nối Cloudflare Stream');
  }finally{clearTimeout(timer);}
}
/** Do not bind a public Stream asset: access must be mediated by expiring tokens. */
export async function validatePrivateReadyVideo(uid:string){
  const item=await streamApi(uid,'','GET');
  if(item.requireSignedURLs!==true)throw new DeliveryError(409,'STREAM_NOT_PRIVATE','Trong Cloudflare Stream hãy bật Require signed URLs cho video trước khi liên kết');
  if(item.readyToStream!==true)throw new DeliveryError(409,'STREAM_NOT_READY','Cloudflare Stream chưa xử lý xong video; hãy đợi trạng thái Ready');
}
export async function signedHlsUrl(uid:string,seconds:number){
  const {customerCode}=streamConfig();
  const exp=Math.floor(Date.now()/1000)+seconds;
  const data=await streamApi(uid,'/token','POST',{exp,downloadable:false});
  const url=streamManifestUrl(customerCode,data.token);
  if(!url)throw new DeliveryError(503,'STREAM_TOKEN_INVALID','Cloudflare Stream không trả về token hợp lệ');
  return {url,expiresIn:seconds};
}

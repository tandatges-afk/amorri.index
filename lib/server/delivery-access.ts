import {createHash,randomBytes,timingSafeEqual,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
import {adminDatabase} from './firebase-admin';
import {findBooking,BookingStoreError} from './event-storage';
import {SHARE_TOKEN, validGrantToken, validId, type DeliveryScope} from '@/lib/domain/delivery';

export class DeliveryError extends Error {constructor(public status:400|401|403|404|409|410|429|503, public code:string,message:string){super(message);}}
const root='amorriDeliveryAccess_v1';
const digest=(secret:string)=>createHash('sha256').update(secret).digest('hex');
const refFor=(eventId:string,grantId:string)=>adminDatabase().ref(`${root}/${eventId}/${grantId}`);

// Grant tokens are still verified using their SHA-256 hash. An authenticated
// Admin can retrieve a separate AES-GCM encrypted copy after refresh.
// Domain-separated key: never return it (or ciphertext) to client users.
function grantEncryptionKey(){
  const secret=process.env.AMORRI_DELIVERY_LINK_KEY || process.env.DRIVE_VIDEO_SIGNING_SECRET || '';
  if(secret.length<32)throw new DeliveryError(503,'DELIVERY_RECOPY_KEY_MISSING',
    'Cần DRIVE_VIDEO_SIGNING_SECRET tối thiểu 32 ký tự hoặc AMORRI_DELIVERY_LINK_KEY để lưu link có thể copy lại.');
  return createHash('sha256').update('amorri-delivery-recopy-v1\0').update(secret).digest();
}
function encryptToken(raw:string){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',grantEncryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
  return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
function decryptToken(encoded:string){
  try {
    const [nonce,tag,data]=encoded.split('.');
    if(!nonce||!tag||!data)return null;
    const decipher=createDecipheriv('aes-256-gcm',grantEncryptionKey(),Buffer.from(nonce,'base64url'));
    decipher.setAuthTag(Buffer.from(tag,'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');
  }catch{return null;}
}

export type GrantRecord={hash:string;expiresAt:number;createdAt:number;createdBy:string;scope:DeliveryScope;revokedAt?:number;revokedBy?:string;lastUsedAt?:number;encryptedToken?:string};

export async function issueDeliveryGrant(eventId:string,adminUid:string,days:number,scope:DeliveryScope='review'){
  if(!validId(eventId))throw new DeliveryError(400,'DELIVERY_BAD_ID','Mã lịch không hợp lệ');
  if(!Number.isInteger(days)||days<1||days>90)throw new DeliveryError(400,'DELIVERY_BAD_EXPIRY','Số ngày hiệu lực từ 1 đến 90');
  await findBooking(eventId);
  const grantId=randomBytes(12).toString('hex'),secret=randomBytes(32).toString('base64url');
  const expiresAt=Date.now()+days*86_400_000;
  const token=`${grantId}.${secret}`;
  const record:GrantRecord={hash:digest(secret),encryptedToken:encryptToken(token),scope,expiresAt,createdAt:Date.now(),createdBy:adminUid};
  await refFor(eventId,grantId).set(record);
  await deliveryAudit('DELIVERY_LINK_CREATED',eventId,grantId,adminUid).catch(err=>console.error('[delivery] audit unavailable',err));
  return {grantId,token,expiresAt,scope};
}
export async function verifyDeliveryGrant(eventId:string,token:unknown,needsReview=false):Promise<GrantRecord>{
  if(!validId(eventId)||!validGrantToken(token))throw new DeliveryError(401,'DELIVERY_TOKEN_INVALID','Liên kết bàn giao không hợp lệ');
  const match=SHARE_TOKEN.exec(token)!;
  const snap=await refFor(eventId,match[1]).once('value');
  const record=snap.val() as GrantRecord|null;
  // A token is only stored as a hash. The raw token never enters the database or server logs.
  if(!record || typeof record.hash!=='string'||!/^[0-9a-f]{64}$/.test(record.hash))throw new DeliveryError(401,'DELIVERY_TOKEN_INVALID','Liên kết bàn giao không hợp lệ');
  const a=Buffer.from(record.hash,'hex'),b=Buffer.from(digest(match[2]),'hex');
  if(!timingSafeEqual(a,b))throw new DeliveryError(401,'DELIVERY_TOKEN_INVALID','Liên kết bàn giao không hợp lệ');
  if(record.revokedAt)throw new DeliveryError(410,'DELIVERY_REVOKED','Liên kết đã bị thu hồi');
  if(!Number.isSafeInteger(record.expiresAt)||Date.now()>=record.expiresAt)throw new DeliveryError(410,'DELIVERY_EXPIRED','Liên kết đã hết hạn');
  if(needsReview && record.scope!=='review')throw new DeliveryError(403,'DELIVERY_READ_ONLY','Liên kết chỉ được xem');
  return record;
}
export async function listDeliveryGrants(eventId:string){
  const snap=await adminDatabase().ref(`${root}/${eventId}`).once('value');
  const records=snap.val()||{};
  return Object.entries(records).map(([id,value])=>{
    const v=value as Partial<GrantRecord>;
    const active=!v.revokedAt && typeof v.expiresAt==='number' && v.expiresAt>Date.now();
    const raw=active && typeof v.encryptedToken==='string'?decryptToken(v.encryptedToken):null;
    return {id,scope:v.scope,expiresAt:v.expiresAt,createdAt:v.createdAt,revokedAt:v.revokedAt||null,
      token:raw && validGrantToken(raw) && raw.startsWith(id+'.') ? raw : null};
  }).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
}
export async function revokeDeliveryGrant(eventId:string,grantId:string,adminUid:string){
  if(!validId(eventId)||!/^[a-f0-9]{24}$/.test(grantId))throw new DeliveryError(400,'DELIVERY_BAD_ID','Mã link không hợp lệ');
  const tx=await refFor(eventId,grantId).transaction((v:GrantRecord|null)=>v && !v.revokedAt?{...v,revokedAt:Date.now(),revokedBy:adminUid}:undefined,undefined,false);
  if(!tx.committed)throw new DeliveryError(404,'DELIVERY_NOT_FOUND','Link không tồn tại hoặc đã bị thu hồi');
  await deliveryAudit('DELIVERY_LINK_REVOKED',eventId,grantId,adminUid).catch(err=>console.error('[delivery] audit unavailable',err));
}
async function deliveryAudit(action:string,eventId:string,grantId:string,actorId:string){
  // Never write a raw delivery token to audit, logs or analytics.
  const id=randomUUID();
  await adminDatabase().ref(`studioPlanner_v1/auditLogs/${id}`).set({
    id,action,category:'delivery',severity:action.endsWith('REVOKED')?'warning':'info',
    actorId,actorRole:'admin',timestamp:Date.now(),targetType:'delivery-grant',targetId:grantId,
    eventId,message:action==='DELIVERY_LINK_CREATED'?'Tạo liên kết bàn giao riêng tư':'Thu hồi liên kết bàn giao riêng tư'
  });
}
export function deliveryToken(request:Request){return request.headers.get('x-amorri-delivery-token')||'';}
export function responseForDeliveryError(error:unknown){
  if(error instanceof DeliveryError)return {status:error.status,code:error.code,error:error.message};
  if(error instanceof BookingStoreError)return {status:error.status===400?400:error.status===409?409:404,code:'DELIVERY_BOOKING_ERROR',error:error.message};
  console.error('[delivery] error',error instanceof Error?error.message:'Unexpected error');
  return {status:503,code:'DELIVERY_UNAVAILABLE',error:'Dịch vụ bàn giao đang tạm thời gián đoạn'};
}

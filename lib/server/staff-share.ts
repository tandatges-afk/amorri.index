import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {adminDatabase} from './firebase-admin';
import {findStaff,ScheduleError} from './staff-scheduling';
import {eventIdValid} from '@/lib/domain/event-management';

const ROOT='amorriStaffShares_v1';
const TOKEN_RE=/^([a-f0-9]{24})\.([A-Za-z0-9_-]{40,100})$/;
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
export type StaffShareGrant={hash:string;createdAt:number;createdBy:string;expiresAt:number;revokedAt?:number;revokedBy?:string;};
const grantsRef=(staffId:string)=>adminDatabase().ref(`${ROOT}/${staffId}`);
export function validStaffShareToken(value:unknown):value is string{return typeof value==='string' && TOKEN_RE.test(value);}
export async function issueStaffShare(staffId:string,adminUid:string,days:number){
 if(!eventIdValid(staffId))throw new ScheduleError(400,'ID nhân sự không hợp lệ','STAFF_SHARE_ID');
 if(!Number.isSafeInteger(days)||days<1||days>90)throw new ScheduleError(400,'Thời hạn link phải từ 1 đến 90 ngày','STAFF_SHARE_DAYS');
 const staff=await findStaff(staffId);
 if(staff.data.active===false)throw new ScheduleError(409,'Nhân sự đã ngưng hoạt động','STAFF_INACTIVE');
 const id=randomBytes(12).toString('hex'),secret=randomBytes(32).toString('base64url');
 const expiresAt=Date.now()+days*86_400_000;
 await grantsRef(staffId).child(id).set({hash:hash(secret),createdAt:Date.now(),createdBy:adminUid,expiresAt});
 await audit('STAFF_LINK_CREATED',staffId,adminUid,id);
 return {grantId:id,token:`${id}.${secret}`,expiresAt};
}
export async function verifyStaffShare(staffId:string,token:unknown){
 if(!eventIdValid(staffId)||!validStaffShareToken(token))throw new ScheduleError(401,'Link nhân sự không hợp lệ','STAFF_LINK_INVALID');
 const parts=TOKEN_RE.exec(token)!;
 const grant=(await grantsRef(staffId).child(parts[1]).once('value')).val() as StaffShareGrant|null;
 if(!grant||typeof grant.hash!=='string'||!/^[a-f0-9]{64}$/.test(grant.hash))throw new ScheduleError(401,'Link nhân sự không hợp lệ','STAFF_LINK_INVALID');
 if(!timingSafeEqual(Buffer.from(grant.hash,'hex'),Buffer.from(hash(parts[2]),'hex')))throw new ScheduleError(401,'Link nhân sự không hợp lệ','STAFF_LINK_INVALID');
 if(grant.revokedAt)throw new ScheduleError(410,'Link nhân sự đã bị thu hồi','STAFF_LINK_REVOKED');
 if(!Number.isSafeInteger(grant.expiresAt)||Date.now()>=grant.expiresAt)throw new ScheduleError(410,'Link nhân sự đã hết hạn','STAFF_LINK_EXPIRED');
 const staff=await findStaff(staffId);
 if(staff.data.active===false)throw new ScheduleError(410,'Nhân sự đã ngưng hoạt động','STAFF_INACTIVE');
 return {staff,expiresAt:grant.expiresAt};
}
export async function listStaffShares(staffId:string){
 await findStaff(staffId);
 const raw=(await grantsRef(staffId).once('value')).val()||{};
 return Object.entries(raw).map(([id,value])=>{
  const record=value as StaffShareGrant;
  return {id,createdAt:record.createdAt,expiresAt:record.expiresAt,revokedAt:record.revokedAt||null};
 }).sort((a,b)=>b.createdAt-a.createdAt);
}
export async function revokeStaffShare(staffId:string,grantId:string,adminUid:string){
 if(!eventIdValid(staffId)||!/^[a-f0-9]{24}$/.test(grantId))throw new ScheduleError(400,'ID link không hợp lệ','STAFF_LINK_ID');
 const result=await grantsRef(staffId).child(grantId).transaction((old:StaffShareGrant|null)=>old&&!old.revokedAt?{...old,revokedAt:Date.now(),revokedBy:adminUid}:undefined,undefined,false);
 if(!result.committed)throw new ScheduleError(404,'Link không tồn tại hoặc đã bị thu hồi','STAFF_LINK_NOT_FOUND');
 await audit('STAFF_LINK_REVOKED',staffId,adminUid,grantId);
}
async function audit(action:string,staffId:string,adminUid:string,grantId:string){
 try {
 const id=randomUUID();await adminDatabase().ref(`studioPlanner_v1/auditLogs/${id}`).set({id,action,category:'staff',timestamp:Date.now(),actorId:adminUid,actorRole:'admin',targetType:'staff-share',targetId:grantId,staffId,message:action==='STAFF_LINK_CREATED'?'Tạo link lịch nhân sự':'Thu hồi link lịch nhân sự'});
 }catch(err){console.error('[staff-share] audit failed',err);}
}

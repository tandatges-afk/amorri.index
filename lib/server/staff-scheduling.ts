import { randomUUID } from 'node:crypto';
import { adminDatabase, authenticatedUser, isAdmin, publicAuthFailure, firebaseAdminApp } from './firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { recordValues, vietnamDate } from '@/lib/domain/scheduling';
import { eventIdValid } from '@/lib/domain/event-management';
import { NextResponse } from 'next/server';

export const json=(data:object,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store, max-age=0'}});
export class ScheduleError extends Error { constructor(public status:number, message:string, public code='SCHEDULE_ERROR'){super(message);} }
export function failure(err:unknown){
  if(err instanceof ScheduleError)return json({error:err.message,code:err.code},err.status);
  console.error('[staff-scheduling]',err);
  return json({error:'Lỗi kết nối Firebase. Kiểm tra Vercel Function Logs.',code:'SCHEDULE_DATABASE_ERROR'},503);
}
export async function identity(request:Request,adminOnly=false):Promise<DecodedIdToken|Response>{
  try {
    const token=await authenticatedUser(request);
    if(adminOnly&&!isAdmin(token))return json({error:'Cần quyền Admin'},403);
    return token;
  }catch(err){const failure=publicAuthFailure(err);return json({error:failure.error,code:failure.code},failure.status);}
}
export function staffRef(){return adminDatabase().ref('studioPlanner_v1/staff');}
export type LocatedStaff={key:string;data:Record<string,unknown>};
export async function findStaff(staffId:string):Promise<LocatedStaff>{
  if(!eventIdValid(staffId))throw new ScheduleError(400,'Mã nhân sự không hợp lệ');
  const snap=await staffRef().orderByChild('id').equalTo(staffId).limitToFirst(3).once('value');
  const arr:LocatedStaff[]=[];
  snap.forEach(s=>{const val=s.val();if(val && typeof val==='object' && String(val.id)===staffId)arr.push({key:String(s.key),data:val});return false;});
  if(!arr.length)throw new ScheduleError(404,'Không tìm thấy nhân sự');
  if(arr.length>1)throw new ScheduleError(409,'Nhân sự bị trùng ID trong dữ liệu cũ');
  return arr[0];
}
export async function staffByUid(uid:string):Promise<LocatedStaff|null>{
  const snap=await staffRef().orderByChild('authUid').equalTo(uid).limitToFirst(3).once('value');
  const arr:LocatedStaff[]=[];
  snap.forEach(s=>{const val=s.val();if(val && typeof val==='object' && val.authUid===uid && val.active!==false)arr.push({key:String(s.key),data:val});return false;});
  if(arr.length>1)throw new ScheduleError(409,'UID Firebase được liên kết với nhiều nhân sự. Liên hệ admin.','STAFF_UID_CONFLICT');
  return arr[0]??null;
}
export async function staffPermission(token:DecodedIdToken,staffId:string):Promise<LocatedStaff>{
  if(isAdmin(token))return findStaff(staffId);
  const own=await staffByUid(token.uid);
  if(!own||String(own.data.id)!==staffId)throw new ScheduleError(403,'Bạn không có quyền xem nhân sự này','STAFF_ACCESS_DENIED');
  return own;
}
export async function staffAudit(action:string,token:DecodedIdToken,staffId:string,message:string){
  try {
    const id=randomUUID();
    await adminDatabase().ref('studioPlanner_v1/auditLogs').child(id).set({
      id,action,actionLabel:action,category:'staff',severity:'info',actorId:token.uid,
      actorName:token.email||'Nhân sự',actorRole:isAdmin(token)?'admin':'staff',
      timestamp:Date.now(),targetType:'staff',targetId:staffId,message
    });
  }catch(e){console.error('[staff-scheduling] audit write failed',e);}
}
/** Small serializing lease for VNext scheduling writes, NOT for legacy writers.
 * Double-check availability after acquiring the lease. This cannot protect old /studio direct writes.
 */
export async function withScheduleLock<T>(action:()=>Promise<T>):Promise<T>{
  const lock=adminDatabase().ref('studioPlanner_v1/schedulingWriteLock_v2');
  const owner=randomUUID();let acquired=false;
  for(let attempt=0;attempt<15;attempt++){
    const result=await lock.transaction((current:{owner?:string;until?:number}|null)=>{
      if(current && typeof current.until==='number' && current.until>Date.now())return;
      return {owner,until:Date.now()+60_000};
    },undefined,false);
    if(result.committed){acquired=true;break;}
    await new Promise(resolve=>setTimeout(resolve,120+attempt*40));
  }
  if(!acquired)throw new ScheduleError(409,'Một thao tác xếp lịch khác đang chạy. Vui lòng thử lại.','SCHEDULE_BUSY');
  try{return await action();}
  finally {
    try{await lock.transaction((current:{owner?:string}|null)=>current?.owner===owner?null:undefined,undefined,false);}
    catch(err){console.error('[staff-scheduling] lock release failed',err);}
  }
}
export async function dailyEvents(date:string){
  const snap=await adminDatabase().ref('studioPlanner_v1/events').orderByChild('date').equalTo(date).limitToFirst(2001).once('value');
  const events=recordValues(snap.val());
  if(events.length>=2001)throw new ScheduleError(503,'Có quá nhiều lịch trong ngày; cần phân trang để kiểm tra an toàn.');
  return events;
}
export async function dailyBlackouts(date:string){
  // Legacy blackouts have no reliable date index; read the collection to preserve parity.
  return recordValues((await adminDatabase().ref('studioPlanner_v1/blackouts').once('value')).val()).filter(b=>b.date===date);
}
export function safeStaff(data:Record<string,unknown>){
  return {id:String(data.id??''),name:String(data.name??''),role:String(data.role??''),authUid:String(data.authUid??''),active:data.active!==false};
}
export async function accessibleStaff(token:DecodedIdToken){
  if(isAdmin(token))return null;
  const own=await staffByUid(token.uid);
  if(!own)throw new ScheduleError(403,'UID đăng nhập chưa liên kết với nhân sự đang hoạt động. Liên hệ Admin.','STAFF_NOT_LINKED');
  return own;
}
export async function boundDateRange(today=vietnamDate()){
  const [y,m,d]=today.split('-').map(Number);
  const end=new Date(Date.UTC(y,m-1,d+90)).toISOString().slice(0,10);
  return {today,end};
}
export async function jsonBody(req:Request,max=8192):Promise<unknown>{
  const size=Number(req.headers.get('content-length')||'0');
  if(size>max)throw new ScheduleError(413,'Dữ liệu quá lớn');
  const body=await req.text();
  if(body.length>max)throw new ScheduleError(413,'Dữ liệu quá lớn');
  try{return JSON.parse(body);}catch{throw new ScheduleError(400,'JSON không hợp lệ');}
}

/** Admin must link an existing Firebase Authentication identity, never a guessed UID. */
export async function verifyAuthUid(uid:string):Promise<void>{
  if(!uid)return;
  try{await getAuth(firebaseAdminApp()).getUser(uid);}
  catch(err){
    if((err as {code?:string})?.code==='auth/user-not-found')
      throw new ScheduleError(422,'Firebase Authentication chưa có tài khoản UID này','STAFF_AUTH_UID_NOT_FOUND');
    throw new ScheduleError(503,'Không kiểm tra được Firebase Authentication UID. Kiểm tra Admin SDK.','STAFF_AUTH_LOOKUP_FAILED');
  }
}

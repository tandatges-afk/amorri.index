import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { adminDatabase, authenticatedAdmin, publicAuthFailure } from '@/lib/server/firebase-admin';
import { findBooking, bookingVersion, BookingStoreError } from '@/lib/server/event-storage';
import { validateEventChanges, requireVersion } from '@/lib/domain/event-management';
import { normaliseEvents } from '@/lib/domain/studio';
import { scheduleConflict, recordValues } from '@/lib/domain/scheduling';
import { withScheduleLock, dailyEvents, dailyBlackouts, ScheduleError } from '@/lib/server/staff-scheduling';
import { encryptBookingArchive, ArchiveConfigurationError } from '@/lib/server/booking-archive';
import type { DecodedIdToken } from 'firebase-admin/auth';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0'};
const json=(payload:object,status=200)=>NextResponse.json(payload,{status,headers});
async function requireAdmin(request:Request):Promise<DecodedIdToken|Response>{
  try {const user=await authenticatedAdmin(request);return user||json({error:'Tài khoản không có quyền admin'},403);}
  catch(err){const failure=publicAuthFailure(err);return json({error:failure.error,code:failure.code},failure.status);}
}
function fail(err:unknown){
  if(err instanceof BookingStoreError)return json({error:err.message,code:err.status===503?'BOOKING_READ_FAILED':'BOOKING_LOOKUP_FAILED'},err.status);
  if(err instanceof ScheduleError)return json({error:err.message,code:err.code},err.status);
  if(err instanceof ArchiveConfigurationError)return json({error:err.message,code:'ARCHIVE_CONFIG_MISSING'},503);
  const rawCode=String((err as {code?:unknown})?.code||'');
  const detail=err instanceof Error?err.message:'';
  // Never echo raw backend exception to browser (it can contain internal paths).
  const errorCode=/permission.denied/i.test(rawCode+' '+detail)?'FIREBASE_PERMISSION_DENIED':
    /timeout|deadline|ETIMEDOUT/i.test(rawCode+' '+detail)?'FIREBASE_TIMEOUT':
    /network|ECONN|UNAVAILABLE/i.test(rawCode+' '+detail)?'FIREBASE_CONNECTION_FAILED':
    'BOOKING_WRITE_FAILED';
  console.error('[booking-manager]',{code:errorCode,backendCode:rawCode,details:detail,at:new Date().toISOString()});
  return json({error:'Không thể lưu lịch vào Firebase. Kiểm tra quyền service account, địa chỉ Database và Function Logs.',code:errorCode},503);
}
async function audit(action:string,user:DecodedIdToken,event:Record<string,unknown>,id:string,detail:string){
  try {const key=randomUUID();await adminDatabase().ref('studioPlanner_v1/auditLogs').child(key).set({
    id:key, action,actionLabel:action==='EVENT_DELETED'?'Xóa lịch':'Cập nhật lịch',category:'booking',severity:action==='EVENT_DELETED'?'danger':'info',
    actorId:user.uid, actorName:user.email||'Admin',actorRole:'admin',timestamp:Date.now(),
    targetType:'event', targetId:id,eventName:String(event.name||''),eventDate:String(event.date||''),message:detail,
  });}catch(err){console.error('[booking-manager] audit failed',err);}
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await requireAdmin(request);if(user instanceof Response)return user;
  try{const {id}=await params;const item=await findBooking(id);
    return json({event:{...normaliseEvents([item.value])[0],phone:item.value.phone||'',note:item.value.note||'',isRuocDau:item.value.isRuocDau===true,
    sourceLinks:Object.fromEntries(recordValues(item.value.assignments).filter(a=>a.id!=null).map(a=>[String(a.id),String(a.link||'')])),
    products:recordValues(item.value.products).map(p=>({id:String(p.id||''),name:String(p.name||''),url:String(p.url||''),mediaType:String(p.mediaType||'auto')})),
    startTrai:item.value.startTrai||'',startGai:item.value.startGai||'',locTrai:item.value.locTrai||'',locGai:item.value.locGai||'',phoneTrai:item.value.phoneTrai||'',phoneGai:item.value.phoneGai||''},version:item.version});
  }catch(err){return fail(err);}
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await requireAdmin(request);if(user instanceof Response)return user;
  if(Number(request.headers.get('content-length')||0)>20_480)return json({error:'Yêu cầu quá lớn'},413);
  let body:unknown;try{body=await request.json();}catch{return json({error:'JSON không hợp lệ'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Yêu cầu không hợp lệ'},400);
  const payload=body as Record<string,unknown>;
  if(!requireVersion(payload.expectedVersion))return json({error:'Thiếu mã phiên bản lịch. Hãy tải lại chi tiết trước khi sửa.'},400);
  try {
    const {id}=await params;
    const needsScheduleLock=Boolean(payload.changes && typeof payload.changes==='object' &&
      ['date','start','end','startTrai','startGai','status','assignments'].some(key=>Object.prototype.hasOwnProperty.call(payload.changes,key)));
    const action=async()=>{
    const located=await findBooking(id);
    const validated=validateEventChanges(payload.changes,located.value);
    if(!validated.ok)return json({error:validated.message,code:'BOOKING_VALIDATION'},422);
    if(located.version!==payload.expectedVersion)return json({error:'Lịch đã thay đổi ở một phiên khác. Hãy tải lại trước khi lưu.'},409);
    // Validate references against authoritative staff list, not the UI's cached roster.
    if(validated.value.assignments){
      const snap=await adminDatabase().ref('studioPlanner_v1/staff').once('value');
      const staff=Object.values(snap.val()||{}) as {id?:string;active?:boolean}[];
      const allowed=new Set(staff.filter(s=>s.active!==false).map(s=>String(s?.id||'')));
      const old=Array.isArray(located.value.assignments)?located.value.assignments:Object.values(located.value.assignments||{});
      for(const record of old as {id?:unknown}[])if(record?.id!=null)allowed.add(String(record.id));
      if(validated.value.assignments.some(s=>!allowed.has(s.id)))return json({error:'Có nhân sự không tồn tại trong Firebase.'},422);
    }
    // Server-side overlap checks must use the latest data while the VNext write lease is held.
    const proposed={...located.value,...validated.value};
    const assignedIds=recordValues(proposed.assignments).map(a=>String(a.id||'')).filter(Boolean);
    if(assignedIds.length && proposed.status!=='cancelled' && ['date','start','end','startTrai','startGai','assignments','status'].some(k=>Object.hasOwn(validated.value,k))){
      const date=String(proposed.date||'');
      const [dayEvents,dayBlackouts]=await Promise.all([dailyEvents(date),dailyBlackouts(date)]);
      const collision=scheduleConflict(proposed,assignedIds,dayEvents,dayBlackouts,id);
      if(collision)return json({error:collision.message,code:'SCHEDULE_CONFLICT',conflict:collision},409);
    }
    let conflict=false, vanished=false;
    const tx=await located.ref.transaction((current:Record<string,unknown>|null)=>{
      if(!current){vanished=true;return;}
      if(bookingVersion(current)!==payload.expectedVersion){conflict=true;return;}
      // Existing gallery, feedback, review and custom wedding fields are all preserved.
      return {...current,...validated.value,updatedAt:Date.now(),updatedBy:user.uid};
    },undefined,false);
    if(!tx.committed)return json({error:vanished?'Lịch đã bị xóa':'Lịch đã thay đổi, hãy tải lại trước khi lưu.',code:conflict?'BOOKING_CONFLICT':'BOOKING_NOT_FOUND'},409);
    await audit('EVENT_UPDATED',user,tx.snapshot.val(),id,`Cập nhật lịch ${String(located.value.name||'')} ngày ${String(located.value.date||'')}`);
    return json({success:true,id,version:bookingVersion(tx.snapshot.val()),event:normaliseEvents([tx.snapshot.val()])[0]});
    };
    // Lock the destination date. The optimistic version check inside action protects stale reads.
    const targetDate=String((payload.changes as Record<string,unknown> | undefined)?.date|| (await findBooking(id)).value.date || '');
    return needsScheduleLock ? await withScheduleLock(action,targetDate) : await action();
  }catch(err){return fail(err);}
}
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await requireAdmin(request);if(user instanceof Response)return user;
  let body:unknown;try{body=await request.json();}catch{return json({error:'JSON không hợp lệ'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Dữ liệu không hợp lệ'},400);
  const {expectedVersion,confirmName}=body as Record<string,unknown>;
  if(!requireVersion(expectedVersion)||typeof confirmName!=='string')return json({error:'Cần mã phiên bản và tên lịch xác nhận xóa.'},400);
  try {
    const {id}=await params;const item=await findBooking(id);
    if(String(item.value.name)!==confirmName.trim())return json({error:'Tên lịch xác nhận không trùng khớp'},422);
    if(item.version!==expectedVersion)return json({error:'Lịch đã thay đổi. Tải lại trước khi xóa.'},409);
    // Archive BEFORE removal. An archive error must never lead to destructive deletion.
    const archive=adminDatabase().ref('amorriStudioAdminArchive_v1/events').child(id);
    const opId=randomUUID();
    const encrypted=encryptBookingArchive(item.value);
    const backup=await archive.transaction(current=>current===null?({id,operationId:opId,originalKey:item.key,deletedAt:Date.now(),deletedBy:user.uid, ...encrypted}):undefined,undefined,false);
    if(!backup.committed)return json({error:'Đã có bản lưu lịch trong kho dự phòng; cần kiểm tra trước khi xóa lần nữa.'},409);
    const tx=await item.ref.transaction((current:Record<string,unknown>|null)=>{
      if(!current||bookingVersion(current)!==expectedVersion)return;
      return null;
    },undefined,false);
    if(!tx.committed){
      try { await archive.transaction(v=>v?.operationId===opId?null:undefined,undefined,false); }
      catch(err){console.error('[booking-manager] archive rollback failed',err);}
      return json({error:'Lịch đã thay đổi hoặc bị xóa trong khi thao tác. Tải lại trước khi thử.',code:'BOOKING_CONFLICT'},409);
    }
    await audit('EVENT_DELETED',user,item.value,id,`Đã xóa lịch ${String(item.value.name||'')} (đã lưu bản dự phòng cho admin)`);
    return json({success:true,archived:true});
  }catch(err){return fail(err);}
}

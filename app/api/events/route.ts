import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { authenticatedAdmin, adminDatabase } from '@/lib/server/firebase-admin';
import { validateBooking } from '@/lib/domain/booking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  let user;
  try {user = await authenticatedAdmin(request);}
  catch (err) {console.error('[events] auth failed', err);return NextResponse.json({error:'Không thể xác thực tài khoản'}, {status:401,headers});}
  if (!user) return NextResponse.json({error:'Chỉ admin được tạo lịch'}, {status:403,headers});
  const size = Number(request.headers.get('content-length') || '0');
  if (size>16_384) return NextResponse.json({error:'Dữ liệu quá lớn'}, {status:413,headers});
  let parsed: unknown;
  try {parsed = await request.json();}
  catch {return NextResponse.json({error:'JSON không hợp lệ'}, {status:400,headers});}
  const validated = validateBooking(parsed);
  if (!validated.ok) return NextResponse.json({error:validated.message}, {status:422,headers});
  const event = {
    ...validated.value,
    isRuocDau: false, startTrai:'', startGai:'', locTrai:'', locGai:'', phoneTrai:'', phoneGai:'',
    assignments:[], products:[], favoritePhotos:[], favoritePhotoItems:[]
  };
  try {
    const base = adminDatabase().ref('studioPlanner_v1');
    // The client-generated event ID is an idempotency key. Never overwrite an existing booking.
    const transaction = await base.child('events').child(event.id).transaction((existing:unknown)=> existing===null ? event : undefined, undefined, false);
    if (!transaction.committed) return NextResponse.json({error:'Mã lịch đã tồn tại. Tải lại dữ liệu trước khi tạo lịch mới.'}, {status:409,headers});
    // Audit is appended only after the booking is confirmed. Audit failure must not duplicate booking.
    try {
      const auditId = randomUUID();
      await base.child('auditLogs').child(auditId).set({
        id:auditId, action:'EVENT_CREATED',actionLabel:'Tạo lịch',category:'booking',severity:'success',
        actorId:user.uid,actorName:user.email||'Admin',actorRole:'admin', timestamp:Date.now(),
        eventName:event.name,eventDate:event.date,targetType:'event',targetId:event.id,
        message:`Đã tạo lịch ${event.name} ngày ${event.date}`
      });
    } catch (error) {console.error('[events] audit write failed', error);}
    return NextResponse.json({success:true,id:event.id},{status:201,headers});
  } catch (error) {
    console.error('[events] create failed', error);
    return NextResponse.json({error:'Không thể tạo lịch trên Firebase, hãy kiểm tra kết nối và cấu hình'},{status:503,headers});
  }
}

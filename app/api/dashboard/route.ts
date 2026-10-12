import { NextResponse } from 'next/server';
import { adminDatabase, authenticatedAdmin, publicAuthFailure } from '@/lib/server/firebase-admin';
import { normaliseAudit, normaliseEvents, normalisePayroll, normaliseStaff } from '@/lib/domain/studio';
import type { DashboardData } from '@/lib/domain/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const NO_CACHE = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Amorri-Auth-Version': 'staff-scheduling-20261013-r2' };
const yyyyMM = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request) {
  let permitted = null;
  try { permitted = await authenticatedAdmin(request); }
  catch (err) {
    const failure = publicAuthFailure(err);
    console.error('[dashboard] admin authentication failure', { code: failure.code });
    return NextResponse.json({ error: failure.error, code: failure.code, release: 'staff-scheduling-20261013-r2' }, {status:failure.status,headers:NO_CACHE});
  }
  if (!permitted) return NextResponse.json({error:'Chỉ tài khoản admin mới được truy cập dashboard.'}, {status:403,headers:NO_CACHE});
  const url = new URL(request.url);
  const vnParts = new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}).formatToParts(new Date());
  const fallbackMonth = `${vnParts.find(p=>p.type==='year')?.value}-${vnParts.find(p=>p.type==='month')?.value}`;
  const month = url.searchParams.get('month') || fallbackMonth;
  if (!yyyyMM.test(month)) return NextResponse.json({error:'Tháng không hợp lệ'}, {status:400,headers:NO_CACHE});
  try {
    const base = adminDatabase().ref('studioPlanner_v1');
    const [eventsSnap, staffSnap, payrollSnap, auditSnap] = await Promise.all([
      // Date indexed query when Firebase RTDB indexOn=["date"] is configured.
      base.child('events').orderByChild('date').startAt(month+'-01').endAt(month+'-31').limitToFirst(1001).once('value'),
      base.child('staff').once('value'),
      base.child('payroll').child(month).once('value'),
      base.child('auditLogs').limitToLast(20).once('value')
    ]);
    const events = normaliseEvents(eventsSnap.val());
    const payload: DashboardData = {
      month, events, staff: normaliseStaff(staffSnap.val()),
      payroll: normalisePayroll(payrollSnap.val()), audit: normaliseAudit(auditSnap.val()),
      eventLimitReached: events.length >= 1001, generatedAt: new Date().toISOString()
    };
    return NextResponse.json(payload,{headers:NO_CACHE});
  } catch(err) {
    console.error('[dashboard] database query error',err);
    return NextResponse.json({error:'Không thể đọc dữ liệu Firebase. Kiểm tra service account, database URL và index.'},{status:503,headers:NO_CACHE});
  }
}

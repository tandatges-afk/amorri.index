import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyBookingAbort} from '../lib/domain/booking-recovery.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const hash=v=>v.etag;
test('null is not treated as deletion until a separate read',()=>{
  assert.equal(classifyBookingAbort({etag:'old'},'old',hash),'BOOKING_RETRY');
  assert.equal(classifyBookingAbort({etag:'new'},'old',hash),'BOOKING_CONFLICT');
  assert.equal(classifyBookingAbort(null,'old',hash),'BOOKING_NOT_FOUND');
});
test('mutation prewarms RTDB transaction and diagnoses from awaited server snapshot',()=>{
  const src=read('app/api/events/[id]/route.ts');
  assert.match(src,/await located.ref.once\('value'\)/);
  assert.match(src,/const diagnosis=classifyBookingAbort\(fresh.val\(\)/);
  assert.match(src,/bookingVersion\(current\)!==payload.expectedVersion/);
  assert.match(src,/BOOKING_TRANSACTION_RETRY/);
  assert.doesNotMatch(src,/vanished=true/);
});
test('audit is performed AFTER per-date schedule lock returns',()=>{
 const src=read('app/api/events/[id]/route.ts');
 assert.match(src,/const response=needsScheduleLock \? await withScheduleLock\(action,targetDate\)/);
 assert.match(src,/if\(committedForAudit\)await audit/);
});
test('lease TTL and retry budget tolerate a crashed writer then release safely',()=>{
 const src=read('lib/server/staff-scheduling.ts');
 assert.match(src,/const leaseMs=12_000/);
 assert.match(src,/const deadline=Date.now\(\)\+15_000/);
 assert.match(src,/current\?\.owner===owner\?null:undefined/);
 assert.match(src,/setInterval\(\(\)=>\{void renew\(\);\},2_500\)/);
});
test('read-only admin diagnostics never return lock ownership secrets',()=>{
 const src=read('app/api/scheduling/diagnostics/route.ts');
 assert.match(src,/authenticatedAdmin\(request\)/);
 assert.match(src,/scheduleLockPath\(date\)/);
 assert.doesNotMatch(src,/owner:value\.owner/);
});

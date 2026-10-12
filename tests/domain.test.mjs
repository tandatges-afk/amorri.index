import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTimecode,formatTimecode,assignedOnDate,canEditBooking,canManageBlackout,normalizeKeyed} from '../assets/vnext/domain.js';
test('timeline comment mm:ss aligns with seconds',()=>{assert.equal(parseTimecode('01:23'),83);assert.equal(formatTimecode(83.9),'01:23');assert.equal(parseTimecode('01:02:10'),3730);});
test('invalid review time rejected',()=>{assert.equal(parseTimecode('1:68'),null);assert.equal(parseTimecode('hello'),null);});
test('staff upcoming bookings only their assignments',()=>{
  const date='2026-10-12';const list=[{date,status:'confirmed',assignments:[{id:'a'}]},{date,status:'cancelled',assignments:[{id:'a'}]},{date,status:'pending',assignments:[{id:'b'}]}];
  assert.equal(assignedOnDate(list,'a',date).length,1);
});
test('role gates in new TS domain',()=>{
  assert.equal(canEditBooking('staff'),false);assert.equal(canEditBooking('admin'),true);
  assert.equal(canManageBlackout('staff','staff-1',{id:'x',date:'2026-10-12',staffId:'staff-2'}),false);
});
test('keyed and array Firebase records normalized',()=>{assert.equal(normalizeKeyed({a:{id:'1'},b:{id:'2'}}).length,2);assert.equal(normalizeKeyed([{id:'a'}]).length,1);});

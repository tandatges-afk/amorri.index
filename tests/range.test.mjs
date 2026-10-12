import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRange} from '../api/_lib/range.js';
const mib=1024*1024;
test('default GET bounded to one chunk',()=>assert.deepEqual(resolveRange(null,30*mib,16*mib),{start:0,end:16*mib-1}));
test('explicit seek range returns exact start and bounded end',()=>assert.deepEqual(resolveRange('bytes=22000000-',30*mib,16*mib),{start:22000000,end:30*mib-1}));
test('explicit short range',()=>assert.deepEqual(resolveRange('bytes=2-5',100,16),{start:2,end:5}));
test('suffix supported',()=>assert.deepEqual(resolveRange('bytes=-6',100,16),{start:94,end:99}));
test('invalid ranges return null',()=>{
  for(const x of ['bytes=100-101','bytes=5-2','bytes=0-4,5-9','bytes=-0','bytes=abc-','bytes=-','bytes=0-999999999999999999999999'])assert.equal(resolveRange(x,100,16),null);
});
test('single-byte file',()=>assert.deepEqual(resolveRange('bytes=0-',1,16),{start:0,end:0}));

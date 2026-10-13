import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (p) => readFileSync(new URL('../'+p, import.meta.url),'utf8');
test('health endpoint carries deployment release marker', () => {
  assert.match(read('app/api/health/route.ts'), /release: 'visual-thumbnails-20261013-r2'/);
  assert.match(read('app/api/health/route.ts'), /no-store/);
});
test('dashboard errors include diagnostic code and release', () => {
  const route=read('app/api/dashboard/route.ts');
  assert.match(route, /code: failure.code, release: 'visual-thumbnails-20261013-r2'/);
  assert.match(route, /status:failure.status/);
});
test('client recognises old Beta2 401 message explicitly', () => {
  const client=read('components/Dashboard.tsx');
  assert.match(client, /API đang dùng bản Beta 2 cũ/);
  assert.match(client, /resp.status===401 && !value.code/);
});

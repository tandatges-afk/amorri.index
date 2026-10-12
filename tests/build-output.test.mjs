import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');
test('output directory includes page and compiled TypeScript', async () => {
  for (const f of ['index.html','assets/css/legacy.css','assets/css/stability.css','assets/js/main.js','assets/vnext/media-stability.js']) {
    assert.ok((await stat(join(out, f))).isFile(), `${f} must be present`);
  }
});
test('API source, tests and secrets stay out of static output', async () => {
  for (const f of ['api','tests','src','.env','.env.example','package.json']) {
    await assert.rejects(stat(join(out,f)), {code:'ENOENT'});
  }
});
test('Vercel config uses public build output', async () => {
  const c = JSON.parse(await readFile(join(root,'vercel.json'),'utf8'));
  assert.equal(c.outputDirectory,'public');
  assert.equal(c.buildCommand,'npm run build');
});

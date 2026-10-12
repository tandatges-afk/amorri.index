/**
 * Assemble static browser files into public/ for Vercel's Output Directory.
 * The api/ folder stays at the repository root so Vercel deploys Functions.
 * Never publish .env files, source TypeScript, tests, or API implementation.
 */
import { cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Optional static/ directory: logos, backgrounds and other media provided
// by the studio are served from the same paths in the site root.
const staticDir = join(root, 'static');
try {
  if ((await stat(staticDir)).isDirectory()) {
    for (const name of await readdir(staticDir)) {
      await cp(join(staticDir, name), join(output, name), { recursive: true, force: true });
    }
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await cp(join(root, 'index.html'), join(output, 'index.html'));
await cp(join(root, 'assets'), join(output, 'assets'), { recursive: true, force: true });

// Backwards-compatible root assets for projects that have not moved them
// to static/ yet; do not require unavailable user image files for build.
for (const filename of [
  'logo.png', 'BG.png', 'panda-directions.webp',
  'panda-reactions.webp', 'favicon.ico', 'robots.txt',
]) {
  try { await cp(join(root, filename), join(output, filename)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// Fail the build if required outputs are absent.
for (const filename of [
  'index.html',
  'assets/css/legacy.css',
  'assets/css/stability.css',
  'assets/js/main.js',
  'assets/vnext/media-stability.js',
]) {
  const location = join(output, filename);
  if (!(await stat(location)).isFile()) throw new Error(`Missing build output: ${filename}`);
}
console.log('[Amorri Build] public/ ready: static frontend only; api/ remains server-side.');

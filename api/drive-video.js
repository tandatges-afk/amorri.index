
// Amorri Studio - Google Drive timeline-ready video endpoint
// Requires: npm install firebase-admin google-auth-library
// Environment: DRIVE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID,
//              FIREBASE_DATABASE_URL, DRIVE_VIDEO_SIGNING_SECRET
// Per-customer folder authorization derives from studioPlanner_v1/events/{products.url}.
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';

const CHUNK_BYTES = 1024 * 1024; // 1 MiB, safely below Vercel's 4.5 MB response limit
const TOKEN_SECONDS = 60 * 60;
const ID_PATTERN = /^[\w-]{10,200}$/;
const DRIVE = 'https://www.googleapis.com/drive/v3/files/';
const TIMEOUT_MS = 10000;
function withTimeout(promise, label, ms=TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=> {timer=setTimeout(()=> reject(Object.assign(new Error(`${label} timed out after ${ms}ms`),{status:504,step:label})),ms);})
  ]).finally(()=>clearTimeout(timer));
}
async function googleFetch(url, options={}, step='google-fetch') {
  try {
    return await fetch(url, {...options, signal:AbortSignal.timeout(TIMEOUT_MS)});
  } catch(err) {
    if (err.name==='TimeoutError'||err.name==='AbortError') throw Object.assign(new Error(`${step} timed out`),{status:504,step});
    throw Object.assign(new Error(`${step}: network request failed`),{status:502,step});
  }
}

const auth = new GoogleAuth({
  credentials: JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON || '{}'),
  scopes: ['https://www.googleapis.com/auth/drive.readonly']
});

function requiredConfig() {
  const missing = ['DRIVE_SERVICE_ACCOUNT_JSON', 'FIREBASE_PROJECT_ID',
    'DRIVE_VIDEO_SIGNING_SECRET'].filter(k => !process.env[k]);
  if (missing.length) throw Object.assign(new Error(`Missing environment variables: ${missing.join(', ')}`), { status: 503 });
}
function signature(value) {
  return crypto.createHmac('sha256', process.env.DRIVE_VIDEO_SIGNING_SECRET).update(value).digest('base64url');
}
function mintTicket(fileId, uid, clientGallery, productId) {
  const body = Buffer.from(JSON.stringify({ id: fileId, uid, clientGallery, productId, exp: Math.floor(Date.now() / 1000) + TOKEN_SECONDS })).toString('base64url');
  return `${body}.${signature(body)}`;
}
function verifyTicket(ticket, requestedId) {
  if (typeof ticket !== 'string') return false;
  const [body, mac, extra] = ticket.split('.');
  if (!body || !mac || extra) return false;
  const expected = signature(body);
  const a = Buffer.from(mac); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return data.id === requestedId && typeof data.uid === 'string' && typeof data.clientGallery === 'string' && typeof data.productId === 'string' && data.exp > Date.now()/1000 ? data : false;
  } catch { return false; }
}
function getFirebase() {
  if (!admin.apps.length) {
    // Uses the same service-account credentials; give it Firebase Auth verification permission.
    const sa = JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({ credential: admin.credential.cert(sa), projectId: process.env.FIREBASE_PROJECT_ID, databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.europe-west1.firebasedatabase.app` });
  }
  return admin.auth();
}
async function getDriveHeaders() {
  const client = await withTimeout(auth.getClient(), 'google-auth-client');
  const result = await withTimeout(client.getAccessToken(), 'google-access-token');
  if (!result.token) throw Object.assign(new Error('Could not obtain Google access token'), { status: 502 });
  return { Authorization: `Bearer ${result.token}` };
}
async function getMetadata(id, headers) {
  const url = `${DRIVE}${encodeURIComponent(id)}?fields=id,name,mimeType,size,parents,capabilities(canDownload)&supportsAllDrives=true`;
  const r = await googleFetch(url, { headers }, 'drive-metadata');
  if (!r.ok) throw Object.assign(new Error(`Drive metadata request failed (${r.status})`), { status: r.status === 404 ? 404 : 502 });
  return r.json();
}
function driveIdFromUrl(input, folder=false) {
  const s=String(input||'');
  const m=folder ? s.match(/(?:folders\/|[?&]id=)([\w-]{10,200})/) : s.match(/(?:file\/d\/|[?&]id=)([\w-]{10,200})/);
  return m?.[1]||null;
}
async function authorizeGallery(clientGallery, productId, fileId, headers, metadata) {
  if (typeof clientGallery!=='string'||!clientGallery||clientGallery.length>160||typeof productId!=='string'||!productId||productId.length>160) return false;
  // The existing client URL is a bearer capability. Unpredictable IDs must remain private.
  // For stronger security, issue independently signed, expiring per-gallery links.
  getFirebase();
  console.info('drive-video stage: firebase-events-start');
  const snapshot=await withTimeout(admin.database().ref('studioPlanner_v1/events').once('value'), 'firebase-events', 12000);
  console.info('drive-video stage: firebase-events-done');
  const records=snapshot.val();
  const events=Array.isArray(records)?records:Object.values(records||{});
  const event=events.find(e=>e&&String(e.id)===clientGallery);
  if(!event)return false;
  const products=Array.isArray(event.products)?event.products:Object.values(event.products||{});
  const prod=products.find(e=>e&&String(e.id)===productId);
  if(!prod)return false;
  const url=String(prod.url||'');
  if(driveIdFromUrl(url)===fileId && /drive\.google\.com/i.test(url))return true;
  const folderId=driveIdFromUrl(url,true);
  if(!folderId||!/drive\.google\.com/i.test(url))return false;
  return await isDescendant(metadata,folderId,headers);
}
async function isDescendant(meta, rootId, headers){
  if(meta.id===rootId)return true;
  const seen=new Set();let layer=meta.parents||[];
  for(let depth=0;depth<15&&layer.length;depth++){
    if(layer.includes(rootId))return true;
    const next=[];
    for(const id of layer){if(seen.has(id))continue;seen.add(id);const parent=await getMetadata(id,headers);next.push(...(parent.parents||[]));}
    layer=next;
  }
  return false;
}

function sendError(res, status, message) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error: message });
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!['GET', 'POST'].includes(req.method)) return sendError(res, 405, 'Method Not Allowed');
  try {
    requiredConfig();
    // Vercel runtimes may expose JSON request bodies as parsed objects,
    // strings or Buffers. Normalize before validating any file ID.
    let payload = {};
    if (req.method === 'POST') {
      try {
        const raw = req.body;
        payload = Buffer.isBuffer(raw) ? JSON.parse(raw.toString('utf8'))
          : typeof raw === 'string' ? JSON.parse(raw)
          : raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      } catch {
        return sendError(res, 400, 'Invalid JSON request body');
      }
    }
    const incomingId = req.method === 'POST' ? payload.id : req.query.id;
    const id = typeof incomingId === 'string' ? incomingId.trim() : '';
    if (!ID_PATTERN.test(id)) {
      return sendError(res, 400, 'Invalid Drive file ID: request must include a Google Drive file ID in field "id"');
    }

    if (req.method === 'POST') {
      console.info('drive-video stage: access-token-start');
      const headers = await getDriveHeaders();
      console.info('drive-video stage: access-token-done');
      const meta = await getMetadata(id, headers);
      console.info('drive-video stage: metadata-done');
      if (!meta.mimeType?.startsWith('video/')) return sendError(res, 415, 'File is not a video');
      if (meta.capabilities?.canDownload === false) return sendError(res, 403, 'Downloading disabled in Google Drive');
      const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization || '');
      let uid = '';
      if (bearer) {
        try { uid = (await getFirebase().verifyIdToken(bearer[1], true)).uid; }
        catch { /* Fall back to validated client-gallery capability, never unrestricted access. */ }
      }
      const clientGallery = payload.clientGallery;
      const productId = payload.productId;
      const permitted = await authorizeGallery(clientGallery,productId,id,headers,meta);
      console.info('drive-video stage: gallery-authorization-done');
      // Login alone does not authorize access; gallery/product membership is mandatory.
      if (!permitted) return sendError(res, 403, 'Video does not belong to this client gallery/product');
      uid ||= 'gallery:'+clientGallery;
      const ticket = mintTicket(id, uid, clientGallery, productId);
      const url = `/api/drive-video?id=${encodeURIComponent(id)}&ticket=${encodeURIComponent(ticket)}`;
      return res.status(200).json({ success: true, url, expiresIn: TOKEN_SECONDS, mimeType: meta.mimeType });
    }

    const ticketData = verifyTicket(req.query.ticket, id);
    if (!ticketData) return sendError(res, 401, 'Missing or expired playback ticket');
    const headers = await getDriveHeaders();
    const meta = await getMetadata(id, headers);
    if (!meta.mimeType?.startsWith('video/')) return sendError(res, 415, 'Not a video');
    if (meta.capabilities?.canDownload === false) return sendError(res, 403, 'Downloading disabled');
    if (!await authorizeGallery(ticketData.clientGallery, ticketData.productId, id, headers, meta)) return sendError(res, 403, 'Video no longer belongs to this client gallery/product');
    const total = Number(meta.size);
    if (!Number.isSafeInteger(total) || total < 1) return sendError(res, 422, 'Invalid or unknown video size');
    let start = 0, end = Math.min(total - 1, CHUNK_BYTES - 1);
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return sendError(res, 416, 'Invalid Range');
      }
      if (!match[1]) { // suffix byte request
        const suffix = Number(match[2]);
        if (!Number.isSafeInteger(suffix) || suffix <= 0) return sendError(res, 416, 'Invalid suffix');
        start = Math.max(0, total - suffix);
      } else {
        start = Number(match[1]);
        if (!Number.isSafeInteger(start) || start >= total) {
          res.setHeader('Content-Range', `bytes */${total}`);
          return sendError(res, 416, 'Range out of bounds');
        }
      }
      end = Math.min(total - 1, start + CHUNK_BYTES - 1);
      if (match[1] && match[2]) end = Math.min(end, Number(match[2]));
      if (end < start) return sendError(res, 416, 'Invalid Range end');
    }
    const upstream = await googleFetch(`${DRIVE}${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
      headers: { ...headers, Range: `bytes=${start}-${end}` }
    }, 'drive-media');
    if (upstream.status !== 206 || !upstream.body) {
      const snippet = (await upstream.text()).slice(0, 300);
      console.error('Drive media download failed:', upstream.status, snippet);
      return sendError(res, 502, `Google Drive did not return partial media (HTTP ${upstream.status})`);
    }
    res.status(206);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', String(end - start + 1));
    res.setHeader('Content-Type', meta.mimeType);
    // Pipe small bounded ranges, not the entire file.
    await new Promise((resolve, reject) => {
      const stream = Readable.fromWeb(upstream.body);
      stream.on('error', reject);
      res.on('error', reject);
      res.on('finish', resolve);
      stream.pipe(res);
    });
  } catch (error) {
    console.error('drive-video:', {message:error.message,step:error.step||'unknown',status:error.status||500});
    if (!res.headersSent) return sendError(res, error.status || 500, error.status===504 ? error.message : error.status ? error.message : 'Drive API error; check Vercel function logs');
    res.destroy(error);
  }
}

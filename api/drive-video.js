/**
 * Amorri Studio - Google Drive video range proxy for /api/drive-video (Vercel Node.js).
 * Dependencies: firebase-admin, google-auth-library
 * Required env: DRIVE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID,
 *               FIREBASE_DATABASE_URL, DRIVE_VIDEO_SIGNING_SECRET
 * Optional env: DRIVE_VIDEO_TICKET_TTL_SECONDS (900..43200; default 21600),
 *               DRIVE_VIDEO_CHUNK_BYTES (1048576..16777216; default 8388608)
 *
 * POST { id, clientGallery, productId } -> signed playback URL.
 * GET  ?id=...&ticket=... with Range -> bounded 206 streaming response.
 * This endpoint is meant for Google Drive *blob video files*, not Google Vids.
 */
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import admin from 'firebase-admin';
import { GoogleAuth } from 'google-auth-library';

const API = 'https://www.googleapis.com/drive/v3/files/';
const FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const GALLERY_ID = /^[A-Za-z0-9_-]{1,160}$/;
const MEDIA_TIMEOUT_MS = 25000; // Until upstream response headers only.
const CHUNK_BYTES = clampInt(process.env.DRIVE_VIDEO_CHUNK_BYTES, 8 * 1024 * 1024, 1024 * 1024, 16 * 1024 * 1024);
const TICKET_SECONDS = clampInt(process.env.DRIVE_VIDEO_TICKET_TTL_SECONDS, 6 * 3600, 900, 12 * 3600);
function clampInt(raw, fallback, min, max) {
  const v = Number(raw);
  return Number.isInteger(v) && v >= min && v <= max ? v : fallback;
}
function fail(status, msg, step='request') { return Object.assign(new Error(msg), { status, step }); }
function required() {
  for (const key of ['DRIVE_SERVICE_ACCOUNT_JSON','FIREBASE_PROJECT_ID','FIREBASE_DATABASE_URL','DRIVE_VIDEO_SIGNING_SECRET']) {
    if (!process.env[key]) throw fail(503, `Missing configuration ${key}`, 'config');
  }
}
let driveAuth, databaseAuth;
function credentials() {
  try { return JSON.parse(process.env.DRIVE_SERVICE_ACCOUNT_JSON || '{}'); }
  catch { throw fail(503, 'DRIVE_SERVICE_ACCOUNT_JSON must be valid JSON', 'config'); }
}
function clients() {
  if (!driveAuth) {
    const cred=credentials();
    driveAuth = new GoogleAuth({ credentials:cred, scopes:['https://www.googleapis.com/auth/drive.readonly'] });
    databaseAuth = new GoogleAuth({ credentials:cred, scopes:[
      'https://www.googleapis.com/auth/firebase.database',
      'https://www.googleapis.com/auth/userinfo.email'
    ]});
  }
  return { driveAuth, databaseAuth };
}
async function accessToken(auth) {
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) throw fail(502, 'Google access token unavailable', 'google-auth');
  return token;
}
async function fetchHeaders(url, options, step, ms=MEDIA_TIMEOUT_MS) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ms);
  try { return await fetch(url,{...options, signal:controller.signal}); }
  catch (err) { throw fail(controller.signal.aborted?504:502, `${step}: ${controller.signal.aborted?'upstream timeout':'upstream request failed'}`,step); }
  finally {clearTimeout(timer);}
}
function hmac(value){return crypto.createHmac('sha256',process.env.DRIVE_VIDEO_SIGNING_SECRET).update(value).digest('base64url');}
function issueTicket(id, clientGallery, productId, meta) {
  const body=Buffer.from(JSON.stringify({id,clientGallery,productId,size:Number(meta.size),mime:meta.mimeType,exp:Math.floor(Date.now()/1000)+TICKET_SECONDS})).toString('base64url');
  return `${body}.${hmac(body)}`;
}
function checkTicket(ticket, requestedId) {
  if (typeof ticket!=='string' || ticket.length>4000) return null;
  const pieces=ticket.split('.'); if(pieces.length!==2) return null;
  const [body,signature]=pieces;
  if(!/^[A-Za-z0-9_-]+$/.test(body)||!/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  const expected=hmac(body), got=Buffer.from(signature), want=Buffer.from(expected);
  if(got.length!==want.length||!crypto.timingSafeEqual(got,want))return null;
  try {
    const data=JSON.parse(Buffer.from(body,'base64url').toString());
    return data.id===requestedId && GALLERY_ID.test(data.clientGallery) && GALLERY_ID.test(data.productId)
      && Number.isSafeInteger(data.size)&&data.size>0 && typeof data.mime==='string'&&data.mime.startsWith('video/')
      && Number.isSafeInteger(data.exp)&&data.exp>Math.floor(Date.now()/1000) ? data : null;
  } catch { return null; }
}
function driveIdFromUrl(input, folder=false) {
  try {
    const u=new URL(String(input));
    if (!['drive.google.com','www.drive.google.com'].includes(u.hostname))return null;
    let m=folder?u.pathname.match(/\/folders\/([\w-]{10,200})/):u.pathname.match(/\/file\/d\/([\w-]{10,200})/);
    if(m)return m[1];
    const id=u.searchParams.get('id');
    if(!folder && FILE_ID.test(id||'') && /\/uc$|\/open$/.test(u.pathname))return id;
    return null;
  }catch{return null;}
}
async function getDriveMetadata(id, token) {
  const url=`${API}${encodeURIComponent(id)}?fields=id,mimeType,size,parents,capabilities(canDownload)&supportsAllDrives=true`;
  const r=await fetchHeaders(url,{headers:{Authorization:`Bearer ${token}`}},'drive-metadata');
  if(!r.ok)throw fail(r.status===404?404:502,`Drive metadata HTTP ${r.status}`,'drive-metadata');
  return r.json();
}
function dbURL() {
  const url=String(process.env.FIREBASE_DATABASE_URL||'').replace(/\/+$/,'');
  if(!/^https:\/\/[a-z0-9.-]+\.(?:firebaseio\.com|firebasedatabase\.app)$/i.test(url))throw fail(503,'Invalid FIREBASE_DATABASE_URL','config');
  return url;
}
async function loadGalleryEvent(id) {
  // Event keys are saved as studioPlanner_v1/events/<eventId> in the HTML.
  // Fetch one event rather than every booking whenever one viewer starts playback.
  const token=await accessToken(clients().databaseAuth);
  const path=`${dbURL()}/studioPlanner_v1/events/${encodeURIComponent(id)}.json`;
  const r=await fetchHeaders(path,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}},'gallery-authorization');
  if(!r.ok)throw fail(502,`Firebase RTDB HTTP ${r.status}`,'gallery-authorization');
  return r.json();
}
async function descendantOf(meta,folderId,driveToken){
  let queue=[...(meta.parents||[])];const seen=new Set();
  for(let depth=0;depth<12&&queue.length;depth++){
    if(queue.includes(folderId))return true;
    const batch=queue.filter(id=>FILE_ID.test(id)&&!seen.has(id)).slice(0,30);
    batch.forEach(id=>seen.add(id));
    queue=(await Promise.all(batch.map(id=>getDriveMetadata(id,driveToken)))).flatMap(item=>item.parents||[]);
  }
  return false;
}
async function authorized(clientGallery,productId,id,driveToken,meta){
  if(!GALLERY_ID.test(clientGallery||'') || !GALLERY_ID.test(productId||''))return false;
  const event=await loadGalleryEvent(clientGallery);
  if(!event||String(event.id)!==clientGallery)return false;
  const products=Array.isArray(event.products)?event.products:Object.values(event.products||{});
  const prod=products.find(p=>p&&String(p.id)===productId);
  if(!prod)return false;
  const url=String(prod.url||'');
  if(driveIdFromUrl(url)===id)return true;
  const folderId=driveIdFromUrl(url,true);
  return !!folderId && await descendantOf(meta,folderId,driveToken);
}
export function resolveRange(range,total,chunkBytes=CHUNK_BYTES) {
  if (!Number.isSafeInteger(total)||total<=0) return null;
  if (range==null) return {start:0,end:Math.min(total-1,chunkBytes-1)};
  const match=/^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
  if(!match || (!match[1]&&!match[2]))return null;
  let start,end;
  if (!match[1]) {
    const suffix=Number(match[2]);
    if(!Number.isSafeInteger(suffix)||suffix<=0)return null;
    start=Math.max(0,total-Math.min(suffix,chunkBytes));
    end=total-1;
  } else {
    start=Number(match[1]);
    if(!Number.isSafeInteger(start)||start>=total)return null;
    const asked=match[2]?Number(match[2]):total-1;
    if(!Number.isSafeInteger(asked)||asked<start)return null;
    end=Math.min(total-1,asked,start+chunkBytes-1);
  }
  return {start,end};
}
function sendError(res,status,message){res.setHeader('Cache-Control','no-store');return res.status(status).json({error:message});}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(!['GET','POST'].includes(req.method))return sendError(res,405,'Method Not Allowed');
  try {
    required();
    let payload={};
    if(req.method==='POST'){
      const raw=req.body;
      try { payload=Buffer.isBuffer(raw)?JSON.parse(raw.toString()):typeof raw==='string'?JSON.parse(raw):(raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}); }
      catch{return sendError(res,400,'Invalid JSON body');}
    }
    const id=String(req.method==='POST'?payload.id:req.query?.id||'').trim();
    if(!FILE_ID.test(id))return sendError(res,400,'Invalid Google Drive file ID');
    if(req.method==='POST'){
      const token=await accessToken(clients().driveAuth);
      const meta=await getDriveMetadata(id,token);
      if(!meta.mimeType?.startsWith('video/'))return sendError(res,415,'Drive file must be video');
      if(meta.capabilities?.canDownload===false)return sendError(res,403,'Download not permitted');
      if(!Number.isSafeInteger(Number(meta.size))||Number(meta.size)<=0)return sendError(res,422,'Missing video size');
      if(!await authorized(String(payload.clientGallery||''),String(payload.productId||''),id,token,meta))return sendError(res,403,'Video does not belong to this client gallery/product');
      const ticket=issueTicket(id,String(payload.clientGallery),String(payload.productId),meta);
      return res.status(200).json({success:true,url:`/api/drive-video?id=${encodeURIComponent(id)}&ticket=${encodeURIComponent(ticket)}`,expiresIn:TICKET_SECONDS,mimeType:meta.mimeType});
    }
    const ticket=checkTicket(req.query?.ticket,id);
    if(!ticket)return sendError(res,401,'Playback ticket expired or invalid');
    const part=resolveRange(req.headers.range,ticket.size);
    if(!part){res.setHeader('Content-Range',`bytes */${ticket.size}`);return sendError(res,416,'Requested Range Not Satisfiable');}
    const token=await accessToken(clients().driveAuth);
    const range=`bytes=${part.start}-${part.end}`;
    const upstream=await fetchHeaders(`${API}${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,{
      headers:{Authorization:`Bearer ${token}`,Range:range}
    },'drive-media');
    if(upstream.status!==206||!upstream.body){
      try { await upstream.body?.cancel(); }catch{}
      return sendError(res,502,`Drive did not honor Range (HTTP ${upstream.status})`);
    }
    const upstreamRange=upstream.headers.get('content-range');
    const expectedRange=`bytes ${part.start}-${part.end}/${ticket.size}`;
    if(upstreamRange && upstreamRange!==expectedRange){
      try {await upstream.body.cancel();}catch{}
      return sendError(res,502,'Drive returned a mismatched Content-Range');
    }
    res.status(206);
    res.setHeader('Accept-Ranges','bytes');
    res.setHeader('Content-Range',expectedRange);
    res.setHeader('Content-Length',String(part.end-part.start+1));
    res.setHeader('Content-Type',ticket.mime);
    res.setHeader('Cache-Control','private, no-store');
    try {await pipeline(Readable.fromWeb(upstream.body),res);}catch(err){
      // Client seeks again before the previous Range finishes: cancellation is normal.
      if(!res.destroyed)res.destroy(err);
    }
  } catch(err) {
    console.error('[drive-video]',{step:err.step||'unknown',status:err.status||500,message:err.message});
    if(!res.headersSent)return sendError(res,err.status||500,err.status===503||err.status===504?err.message:'Drive video service error');
    if(!res.destroyed)res.destroy(err);
  }
}

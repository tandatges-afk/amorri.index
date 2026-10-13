/** Cloudflare Stream uses a 32-digit hexadecimal video UID, never a Drive file ID. */
export const STREAM_UID=/^[a-f0-9]{32}$/i;
export const STREAM_CUSTOMER_CODE=/^[a-zA-Z0-9-]{5,120}$/;
export const STREAM_ACCOUNT_ID=/^[a-f0-9]{32}$/i;
export function parseStreamUid(raw:unknown):string|null{
  const value=typeof raw==='string'?raw.trim():'';
  return STREAM_UID.test(value)?value.toLowerCase():null;
}
export function playbackDomain(code:unknown):string|null{
  return typeof code==='string' && STREAM_CUSTOMER_CODE.test(code)?`customer-${code}.cloudflarestream.com`:null;
}
export function streamManifestUrl(code:unknown,token:unknown):string|null{
  const domain=playbackDomain(code);
  if(!domain||typeof token!=='string'||token.length<32||token.length>4096||!/^[a-zA-Z0-9_.-]+$/.test(token))return null;
  return `https://${domain}/${encodeURIComponent(token)}/manifest/video.m3u8`;
}
export function streamExpiry(grantExpiryMs:number,nowMs:number,configuredSeconds=3600):number{
  const remaining=Math.floor((grantExpiryMs-nowMs)/1000);
  if(remaining<=0)return 0;
  const requested=Number.isFinite(configuredSeconds)?Math.max(300,Math.min(7200,Math.floor(configuredSeconds))):3600;
  return Math.min(requested,remaining);
}

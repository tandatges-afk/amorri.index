import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseStreamUid,streamManifestUrl,streamExpiry,playbackDomain} from '../lib/domain/streaming.ts';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('Cloudflare video identifiers must be 32 hexadecimal and are normalized',()=>{
 assert.equal(parseStreamUid(' F'.repeat(0)+'0123456789abcdef0123456789ABCDEF '),'0123456789abcdef0123456789abcdef');
 for(const x of ['../abc','x'.repeat(32),'0123456789abcdef','',null, '0123456789abcdef0123456789abcdef/other'])assert.equal(parseStreamUid(x),null);
});
test('HLS link constructs fixed customer hostname and URL only from validated token',()=>{
 assert.equal(playbackDomain('xx-12345'),'customer-xx-12345.cloudflarestream.com');
 assert.equal(playbackDomain('foo.evil.org'),null);
 assert.equal(streamManifestUrl('validcode123','a'.repeat(56)),`https://customer-validcode123.cloudflarestream.com/${'a'.repeat(56)}/manifest/video.m3u8`);
 assert.equal(streamManifestUrl('foo.evil.net','x'.repeat(56)),null);
 assert.equal(streamManifestUrl('validcode123','//evil.com'),null);
});
test('video token expiry never outlives share link or exceeds provider limit',()=>{
 const now=1_000_000;
 assert.equal(streamExpiry(now+5000,now,3600),5);
 assert.equal(streamExpiry(now-1000,now,3600),0);
 assert.equal(streamExpiry(now+10_000_000,now,99999),7200);
 assert.equal(streamExpiry(now+10_000_000,now,3600),3600);
});
test('signed HLS is issued only after grant, booking, Drive video membership and stored mapping',()=>{
 const file=read('app/api/delivery/[eventId]/playback/route.ts');
 assert.match(file,/verifyDeliveryGrant\(eventId,deliveryToken\(request\)\)/);
 assert.match(file,/findBooking\(eventId\)/);
 assert.match(file,/listDeliveryMedia\(product\)/);
 assert.match(file,/media\.some\(m=>m\.id===body\.mediaId&&m\.isVideo\)/);
 assert.match(file,/readStreamBinding\(eventId,body\.productId,body\.mediaId\)/);
 assert.match(file,/streamExpiry\(grant\.expiresAt/);
 assert.match(file,/signedHlsUrl\(binding\.uid,ttl\)/);
});
test('admin mapping validates Drive ownership and requireSignedURLs before persistence',()=>{
 const route=read('app/api/video-streams/[eventId]/route.ts');
 assert.match(route,/requireAdmin\(request\)/);
 assert.match(route,/listDeliveryMedia\(product,true\)/);
 assert.match(route,/validatePrivateReadyVideo\(uid\)/);
 assert.match(route,/await bindingRef\(eventId,productId,mediaId\)\.set/);
 const server=read('lib/server/video-streaming.ts');
 assert.match(server,/item\.requireSignedURLs!==true/);
 assert.match(server,/item\.readyToStream!==true/);
 assert.match(server,/Authorization:`Bearer \$\{apiToken\}`/);
 assert.match(server,/\{exp,downloadable:false\}/);
});
test('media player uses HLS in browsers with native support or hls.js, retains review timeline',()=>{
 const src=read('components/ClientDelivery.tsx');
 assert.match(src,/import\('hls.js'\)/);
 assert.match(src,/canPlayType\('application\/vnd\.apple\.mpegurl'\)/);
 assert.match(src,/l\.height===1080/);
 assert.match(src,/mediaRef\.current\.currentTime=c\.seconds/);
 assert.match(src,/issueDriveTicket/);
});
test('rules proposal blocks stream mapping for browser direct read/write',()=>{
 const src=read('scripts/prepare-rtdb-rules.mjs');
 assert.match(src,/amorriVideoStreams_v1/);
 assert.match(src,/streams\['\.read'\]=false/);
 assert.match(src,/streams\['\.write'\]=false/);
});

import { createHash } from 'node:crypto';
import { eventIdValid } from '@/lib/domain/event-management';
import { adminDatabase } from './firebase-admin';

export class BookingStoreError extends Error {
  constructor(public status:400|404|409|503, message:string){super(message);}
}
function stable(value:unknown):unknown {
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable((value as Record<string,unknown>)[k])]));
  return value;
}
export function bookingVersion(raw:unknown){return createHash('sha256').update(JSON.stringify(stable(raw))).digest('hex');}
// Use the installed SDK's ref() return type instead of a non-exported type.
type DatabaseReference = ReturnType<ReturnType<typeof adminDatabase>['ref']>;
export type LocatedBooking = {ref:DatabaseReference;value:Record<string,unknown>;key:string;version:string};
export async function findBooking(id:string):Promise<LocatedBooking>{
  if(!eventIdValid(id))throw new BookingStoreError(400,'Mã lịch không hợp lệ');
  const events=adminDatabase().ref('studioPlanner_v1/events');
  // Some old data are stored as arrays keyed by 0,1,... while record.id is unrelated.
  // Query record.id, NOT events/<id> blindly. Detect duplicate IDs instead of editing the wrong record.
  const snap=await events.orderByChild('id').equalTo(id).limitToFirst(3).once('value');
  const matches:{key:string;value:Record<string,unknown>}[]=[];
  snap.forEach(s=>{
    const value=s.val();
    if(value&&typeof value==='object'&&!Array.isArray(value)&&String(value.id)===id)
      matches.push({key:String(s.key),value});
    return false;
  });
  if(!matches.length)throw new BookingStoreError(404,'Không tìm thấy lịch trên Firebase');
  if(matches.length>1)throw new BookingStoreError(409,'Phát hiện lịch trùng ID trong dữ liệu cũ. Hãy xử lý bản ghi trùng trước khi chỉnh sửa.');
  const item=matches[0];
  return {ref:events.child(item.key),key:item.key,value:item.value,version:bookingVersion(item.value)};
}

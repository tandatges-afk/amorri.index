/** New TypeScript domain logic. Does not overwrite live RTDB records. */
export type BookingStatus='pending'|'confirmed'|'done'|'cancelled';
export interface Assignment { id:string; task?:string; cost?:number; }
export interface Booking {
  id:string;
  name:string;
  date:string; // local YYYY-MM-DD
  start?:string;
  end:string;
  status:BookingStatus;
  assignments:Assignment[];
}
export interface Blackout {id:string;staffId:string;date:string;reason?:string}
export type Role='admin'|'staff'|'guest';

/** Converts mm:ss or hh:mm:ss to seconds; suitable for frame-associated review timestamps. */
export function parseTimecode(text:string):number|null{
  if(!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(text.trim()))return null;
  const parts=text.trim().split(':').map(Number);
  if(parts.some((x,i)=>i>0&&(x<0||x>59)))return null;
  return parts.reduce((n,p)=>n*60+p,0);
}
export function formatTimecode(seconds:number):string{
  if(!Number.isFinite(seconds)||seconds<0)return '00:00';
  const t=Math.floor(seconds);
  const pad=(n:number)=>String(n).padStart(2,'0');
  const hours=Math.floor(t/3600),min=Math.floor((t%3600)/60),sec=t%60;
  return hours?`${pad(hours)}:${pad(min)}:${pad(sec)}`:`${pad(min)}:${pad(sec)}`;
}
export function assignedOnDate(items:Booking[],staffId:string,date:string):Booking[]{
  return items.filter(e=>e.date===date&&e.status!=='cancelled'&&e.assignments.some(a=>a.id===staffId));
}
export function canEditBooking(role:Role):boolean{return role==='admin';}
export function canManageBlackout(role:Role,actorStaffId:string,record:Blackout):boolean{
  return role==='admin'||(role==='staff'&&!!actorStaffId&&actorStaffId===record.staffId);
}
export function normalizeKeyed<T extends {id?:unknown}>(input:Record<string,T>|T[]|null|undefined):T[]{
  return (Array.isArray(input)?input:Object.values(input||{})).filter(x=>x&&typeof x==='object');
}

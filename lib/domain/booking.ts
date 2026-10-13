import type { EventStatus } from './types';

export type BookingInput = {
  id: string;
  name: string;
  date: string;
  start: string;
  end: string;
  eventType: string;
  location: string;
  phone?: string;
  note?: string;
  status: EventStatus;
  price: number;
  deposit: number;
};
export type BookingValidation = { ok: true; value: BookingInput } | { ok: false; message: string };
const validId = /^[a-zA-Z0-9_-]{12,100}$/;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
function validDate(value: string) {
  const match = datePattern.exec(value);
  if (!match) return false;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return y >= 2020 && y <= 2100 && utc.getUTCFullYear() === y && utc.getUTCMonth() === m - 1 && utc.getUTCDate() === d;
}
export function validateBooking(input: unknown): BookingValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok:false,message:'Dữ liệu lịch không hợp lệ'};
  const v = input as Record<string, unknown>;
  const string = (key:string,limit:number) => typeof v[key]==='string' ? (v[key] as string).trim().slice(0,limit) : '';
  const id=string('id',101), name=string('name',180), date=string('date',10), start=string('start',5), end=string('end',5);
  const eventType=string('eventType',80), location=string('location',240), phone=string('phone',50), note=string('note',1000), status=string('status',30);
  const price= v.price, deposit=v.deposit;
  if (!validId.test(id)) return {ok:false,message:'Mã lịch không hợp lệ'};
  if (!name || name.length < 2) return {ok:false,message:'Nhập tên dự án hoặc khách hàng (từ 2 ký tự)'};
  if (!validDate(date)) return {ok:false,message:'Ngày đặt lịch không hợp lệ'};
  if (!timePattern.test(start)||!timePattern.test(end)) return {ok:false,message:'Giờ bắt đầu và kết thúc phải có định dạng HH:mm'};
  if (!['pending','confirmed','done','cancelled'].includes(status)) return {ok:false,message:'Trạng thái không hợp lệ'};
  if (typeof price !=='number' || !Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000_000) return {ok:false,message:'Giá trị hợp đồng không hợp lệ'};
  if (typeof deposit !=='number' || !Number.isSafeInteger(deposit) || deposit < 0 || deposit > 1_000_000_000_000) return {ok:false,message:'Tiền cọc không hợp lệ'};
  if (deposit > price) return {ok:false,message:'Tiền cọc không được lớn hơn giá trị hợp đồng'};
  return {ok:true,value:{id,name,date,start,end,eventType:eventType||'Khác',location,phone,note,status:status as EventStatus,price,deposit}};
}

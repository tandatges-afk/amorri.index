import {randomUUID} from 'node:crypto';
import {identity,json,jsonBody,failure,ScheduleError} from '@/lib/server/staff-scheduling';
import {findBooking,bookingVersion} from '@/lib/server/event-storage';
import {parseDriveSource} from '@/lib/domain/delivery';
import {requireVersion,eventIdValid} from '@/lib/domain/event-management';
import {recordValues} from '@/lib/domain/scheduling';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await identity(request,true);if(user instanceof Response)return user;
 try{
  const {id}=await params;
  const body=await jsonBody(request,4096) as Record<string,unknown>;
  if(!body||!requireVersion(body.expectedVersion))throw new ScheduleError(400,'Thiếu mã phiên bản lịch','PRODUCT_VERSION');
  const name=typeof body.name==='string'?body.name.trim():'';
  const url=typeof body.url==='string'?body.url.trim():'';
  const mediaType=body.mediaType;
  const productId=typeof body.productId==='string'?body.productId:'';
  if(!name||name.length>180||!parseDriveSource(url)||url.length>1200||!['auto','video','image'].includes(String(mediaType)))
   throw new ScheduleError(422,'Tên, loại hoặc link Google Drive không hợp lệ','PRODUCT_INVALID');
  if(productId&&!eventIdValid(productId))throw new ScheduleError(400,'Mã sản phẩm không hợp lệ');
  const located=await findBooking(id);
  if(located.version!==body.expectedVersion)throw new ScheduleError(409,'Lịch đã thay đổi, mở lại chi tiết để cập nhật','PRODUCT_CONFLICT');
  const newId=productId||randomUUID();
  let issue='';
  const result=await located.ref.transaction(current=>{
   if(!current||String(current.id)!==id||bookingVersion(current)!==body.expectedVersion){issue='Lịch đã thay đổi';return;}
   const old=recordValues(current.products);
   if(old.length>=150&&!productId){issue='Đã đạt giới hạn sản phẩm';return;}
   if(productId&&!old.some(p=>String(p.id)===productId)){issue='Không tìm thấy sản phẩm';return;}
   const product={id:newId,name,url,mediaType};
   // Keep legacy metadata and product IDs, and leave photo selections/comments untouched.
   const products=productId?old.map(p=>String(p.id)===productId?{...p,...product}:p):[...old,product];
   return {...current,products,updatedAt:Date.now()};
  },undefined,false);
  if(!result.committed)throw new ScheduleError(409,issue||'Không lưu được sản phẩm','PRODUCT_CONFLICT');
  return json({success:true,productId:newId,version:bookingVersion(result.snapshot.val())});
 }catch(err){return failure(err);}
}

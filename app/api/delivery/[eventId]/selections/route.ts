import {deliveryEvent,productById,payload,json,deliveryFailure} from '@/lib/server/delivery-http';
import {DeliveryError} from '@/lib/server/delivery-access';
import {listDeliveryMedia,productSource} from '@/lib/server/delivery-media';
import {pickProducts,validateSelection} from '@/lib/domain/delivery';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function PUT(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{
    const {eventId}=await params;const located=await deliveryEvent(request,eventId,true);
    const body=await payload(request,24_576);const productId=String(body.productId||'');
    const product=productById(located.value,productId);
    const check=validateSelection(body);if(!check.ok)return json({error:check.error},422);
    const source=productSource(product);
    if(!source)return json({error:'Lựa chọn ảnh chỉ hỗ trợ sản phẩm Google Drive ở bản 2.5'},422);
    const fileList=await listDeliveryMedia(product,true);
    const allowed=new Map(fileList.filter(x=>!x.isVideo).map(x=>[x.id,x]));
    if(check.ids.some(id=>!allowed.has(id)))return json({error:'Có ảnh không thuộc thư mục sản phẩm hoặc không còn tồn tại',code:'SELECTION_INVALID_FILE'},422);
    const sourceKey=`${source.type}:${source.id}`;
    const selectedItems=check.ids.map(id=>{
      const photo=allowed.get(id)!;
      return {key:`${productId}::id:${id}`,fileId:id,name:photo.name,productId,
        productName:String(product.name||''),sourceKey,sourceUrl:String(product.url||''),savedAt:Date.now()};
    });
    const tx=await located.ref.transaction((current:Record<string,unknown>|null)=>{
      if(!current)return;
      const productNow=pickProducts(current.products).find(p=>String(p.id)===productId);
      if(!productNow||String(productNow.url||'')!==String(product.url||''))return; // admin replaced link while listing
      const old=pickProducts(current.favoritePhotoItems);
      const keep=old.filter(item=>String(item.productId||'')!==productId || !item.sourceKey || String(item.sourceKey)!==sourceKey);
      const merged=[...keep,...selectedItems];
      return {...current,favoritePhotoItems:merged,favoritePhotos:[...new Set(merged.map(i=>String(i.name||'')).filter(Boolean))]};
    },undefined,false);
    if(!tx.committed)throw new DeliveryError(409,'SELECTION_CONFLICT','Sản phẩm đã thay đổi. Vui lòng tải lại');
    return json({success:true,selected:check.ids.length});
  }catch(err){return deliveryFailure(err);}
}

import {GoogleAuth} from 'google-auth-library';
import {parseDriveSource,DRIVE_ID,type DeliveryMedia} from '@/lib/domain/delivery';
import {DeliveryError} from './delivery-access';

const DRIVE='https://www.googleapis.com/drive/v3/files';
const fields='id,name,mimeType,thumbnailLink,webViewLink,size,shortcutDetails,videoMediaMetadata';
const mediaCache=new Map<string,{expiry:number;items:DeliveryMedia[]}>();
function remember(key:string,items:DeliveryMedia[]){if(mediaCache.size>150)mediaCache.clear();mediaCache.set(key,{expiry:Date.now()+30_000,items});return items;}
let auth:GoogleAuth|undefined;
async function headers():Promise<Record<string,string>>{
  const raw=process.env.DRIVE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw new DeliveryError(503,'DRIVE_CONFIG_MISSING','Chưa có cấu hình Google Drive');
  if(!auth){
    try{auth=new GoogleAuth({credentials:JSON.parse(raw),scopes:['https://www.googleapis.com/auth/drive.readonly']});}
    catch{throw new DeliveryError(503,'DRIVE_CONFIG_INVALID','Cấu hình tài khoản Drive không hợp lệ');}
  }
  const token=(await (await auth.getClient()).getAccessToken()).token;
  if(!token)throw new DeliveryError(503,'DRIVE_AUTH_FAILED','Không thể kết nối Google Drive');
  return {Authorization:`Bearer ${token}`};
}
async function getJson(url:string,authHeaders:Record<string,string>):Promise<Record<string,unknown>>{
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15_000);
  try{
    const result=await fetch(url,{headers:authHeaders,signal:controller.signal,cache:'no-store'});
    if(!result.ok)throw new DeliveryError(result.status===404?404:503,'DRIVE_READ_FAILED','Không thể đọc file Drive được liên kết');
    return await result.json() as Record<string,unknown>;
  }catch(err){if(err instanceof DeliveryError)throw err;throw new DeliveryError(503,'DRIVE_TIMEOUT','Google Drive phản hồi quá chậm');}
  finally{clearTimeout(timer);}
}
function mediaFromDrive(file:Record<string,unknown>):DeliveryMedia|null{
  const id=String(file.id||'');if(!DRIVE_ID.test(id))return null;
  const mimeType=String(file.mimeType||''),name=String(file.name||'').slice(0,240);
  const isVideo=mimeType.startsWith('video/')||/\.(mp4|mov|m4v|webm|mkv)$/i.test(name);
  const isImage=mimeType.startsWith('image/')||/\.(png|jpe?g|webp|heic|avif)$/i.test(name);
  if(!isVideo&&!isImage)return null;
  return {id,name,mimeType,isVideo,thumb:`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1000`,
    previewUrl:`https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`,
    url:`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`};
}
export function productSource(product:Record<string,unknown>){return parseDriveSource(String(product.url||''));}
/** Re-list the actual linked Drive folder on each save so guests cannot submit arbitrary file IDs. */
export async function listDeliveryMedia(product:Record<string,unknown>,forceRefresh=false):Promise<DeliveryMedia[]>{
  const source=productSource(product);
  if(!source)return []; // Non-Drive media remains available in the compatible workspace.
  const cacheKey=`${source.type}:${source.id}`;const cached=mediaCache.get(cacheKey);
  if(!forceRefresh && cached && cached.expiry>Date.now())return cached.items;
  const hdr=await headers();
  if(source.type==='file'){
    const params=new URLSearchParams({fields,supportsAllDrives:'true'});
    const doc=await getJson(`${DRIVE}/${source.id}?${params}`,hdr);
    const item=mediaFromDrive(doc);return remember(cacheKey,item?[item]:[]);
  }
  const files:Record<string,unknown>[]=[];
  let pageToken='';
  for(let page=0;page<3;page++){
    const params=new URLSearchParams({q:`'${source.id}' in parents and trashed=false`,pageSize:'500',
      fields:`nextPageToken,files(${fields})`,orderBy:'name',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
    if(pageToken)params.set('pageToken',pageToken);
    const data=await getJson(`${DRIVE}?${params}`,hdr);
    if(Array.isArray(data.files))files.push(...data.files as Record<string,unknown>[]);
    pageToken=String(data.nextPageToken||'');
    if(!pageToken)break;
  }
  if(pageToken)throw new DeliveryError(503,'DRIVE_LIST_INCOMPLETE','Thư mục có quá nhiều file. Chưa thể xác nhận danh sách đầy đủ để chọn ảnh an toàn');
  // Shortcuts are resolved in bounded batches to avoid exhausting Vercel Functions.
  const resolved:Record<string,unknown>[]=[];
  for(let i=0;i<files.length;i+=6){
    const chunk=await Promise.all(files.slice(i,i+6).map(async f=>{
      const details=f.shortcutDetails as Record<string,unknown>|undefined;
      if(f.mimeType!=='application/vnd.google-apps.shortcut'||!DRIVE_ID.test(String(details?.targetId||'')))return f;
      try{
        const p=new URLSearchParams({fields,supportsAllDrives:'true'});
        const target=await getJson(`${DRIVE}/${details!.targetId}?${p}`,hdr);
        return {...target,name:String(f.name||target.name||'')};
      }catch{return {...f,id:details!.targetId,mimeType:String(details?.targetMimeType||'')};}
    }));resolved.push(...chunk);
  }
  return remember(cacheKey,resolved.map(mediaFromDrive).filter((v):v is DeliveryMedia=>Boolean(v)));
}

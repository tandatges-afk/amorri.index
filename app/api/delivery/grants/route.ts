import {issueDeliveryGrant,listDeliveryGrants} from '@/lib/server/delivery-access';
import {requireAdmin,payload,json,deliveryFailure} from '@/lib/server/delivery-http';
import {validId} from '@/lib/domain/delivery';
import {findBooking} from '@/lib/server/event-storage';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{await requireAdmin(request);const eventId=new URL(request.url).searchParams.get('eventId')||'';
    if(!validId(eventId))return json({error:'Mã lịch không hợp lệ'},400);
    await findBooking(eventId);return json({grants:await listDeliveryGrants(eventId)});
  }catch(err){return deliveryFailure(err);}
}
export async function POST(request:Request){
  try{const user=await requireAdmin(request);const body=await payload(request);
    const eventId=body.eventId,days=body.days,scope=body.scope;
    if(!validId(eventId))return json({error:'Mã lịch không hợp lệ'},400);
    if(scope!==undefined && scope!=='view'&&scope!=='review')return json({error:'Quyền chia sẻ không hợp lệ'},400);
    const grant=await issueDeliveryGrant(eventId,user.uid,days as number,scope==='view'?'view':'review');
    const url=new URL(request.url);
    const shareUrl=`${url.origin}/delivery/${encodeURIComponent(eventId)}#token=${encodeURIComponent(grant.token)}`;
    return json({success:true,shareUrl,grantId:grant.grantId,expiresAt:grant.expiresAt,scope:grant.scope});
  }catch(err){return deliveryFailure(err);}
}

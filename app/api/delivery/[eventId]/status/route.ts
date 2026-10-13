import {adminDatabase} from '@/lib/server/firebase-admin';
import {requireAdmin,json,deliveryFailure,payload} from '@/lib/server/delivery-http';
import {findBooking} from '@/lib/server/event-storage';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{
    await requireAdmin(request);
    const {eventId}=await params;
    await findBooking(eventId);
    const state=(await adminDatabase().ref(`studioPlanner_v1/deliveryState/${eventId}`).once('value')).val()||{};
    return json({completed:Boolean(state.completedAt),completedAt:state.completedAt||null,completedBy:state.completedBy||null});
  }catch(error){return deliveryFailure(error);}
}

export async function PATCH(request:Request,{params}:{params:Promise<{eventId:string}>}){
  try{
    const actor=await requireAdmin(request);
    const {eventId}=await params;
    await findBooking(eventId);
    const body=await payload(request,1024);
    const completed=body.completed===true;
    const ref=adminDatabase().ref(`studioPlanner_v1/deliveryState/${eventId}`);
    if(completed)await ref.set({completedAt:Date.now(),completedBy:actor.uid});
    else await ref.remove();
    return json({success:true,completed});
  }catch(error){return deliveryFailure(error);}
}

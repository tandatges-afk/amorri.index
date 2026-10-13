/**
 * Conditional Realtime Database REST write (ETag/If-Match).
 *
 * Firebase Admin SDK transaction callbacks can receive an initial local null
 * while the authoritative record still exists. Aborting on that transient null
 * prevents edits from ever committing. Instead, read a server ETag, compare the
 * expected booking version and PUT only if the server ETag is still current.
 *
 * This is a single-record atomic CAS; unrelated event children and all legacy
 * properties are preserved. 412 means a concurrent change, never an overwrite.
 */
import { firebaseAdminApp } from './firebase-admin';
import { bookingVersion } from './event-storage';
import { conditionalBookingWrite, BookingCasError } from '../domain/booking-cas';
export {BookingCasError} from '../domain/booking-cas';

function databaseUrl():string {
  const raw=String(process.env.FIREBASE_DATABASE_URL||'').replace(/\/+$/,'');
  if(!/^https:\/\/[a-z\d.-]+\.(?:firebaseio\.com|firebasedatabase\.app)$/i.test(raw))
    throw new BookingCasError(503,'BOOKING_CAS_CONFIG','Địa chỉ Firebase Realtime Database không hợp lệ.');
  return raw;
}
async function firebaseToken(){
  const credential=firebaseAdminApp().options.credential;
  if(!credential)throw new BookingCasError(503,'BOOKING_CAS_CONFIG','Firebase Admin chưa có thông tin xác thực.');
  const {access_token}=await credential.getAccessToken();
  if(!access_token)throw new BookingCasError(503,'BOOKING_CAS_CONFIG','Không lấy được token Firebase Admin.');
  return access_token;
}
export async function saveBookingConditional(input:{key:string;id:string;expectedVersion:string;changes:object;actorUid:string}){
  // Keys came from a verified Firebase snapshot, but still reject any paths.
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(input.key))throw new BookingCasError(503,'BOOKING_CAS_KEY','Khóa lịch Firebase không hợp lệ.');
  const url=`${databaseUrl()}/studioPlanner_v1/events/${encodeURIComponent(input.key)}.json`;
  const token=await firebaseToken();
  return conditionalBookingWrite({...input,url,token,versionOf:bookingVersion});
}

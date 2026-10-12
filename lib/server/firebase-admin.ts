import { cert, getApps, initializeApp, getApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

export function firebaseAdminApp() {
  if (getApps().length) return getApp();
  const raw = process.env.DRIVE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Missing DRIVE_SERVICE_ACCOUNT_JSON');
  const creds = JSON.parse(raw) as {project_id:string;client_email:string;private_key:string};
  if (!creds.project_id || !creds.private_key || !creds.client_email) throw new Error('Incomplete service account');
  return initializeApp({
    credential: cert({ projectId: creds.project_id, clientEmail: creds.client_email, privateKey: creds.private_key.replace(/\\n/g, '\n') }),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}
export function adminDatabase() { return getDatabase(firebaseAdminApp()); }
export async function authenticatedAdmin(request: Request): Promise<DecodedIdToken | null> {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  const token = await getAuth(firebaseAdminApp()).verifyIdToken(match[1], true);
  const allow = new Set((process.env.AMORRI_ADMIN_UIDS || '').split(',').map(x=>x.trim()).filter(Boolean));
  return token.admin === true || allow.has(token.uid) ? token : null;
}

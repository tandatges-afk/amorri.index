import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Encrypt full deleted booking snapshots at rest (independent of RTDB security rules). */
export class ArchiveConfigurationError extends Error {}
export function encryptBookingArchive(booking: Record<string,unknown>) {
  const value=(process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY||'').trim();
  if(!/^[a-fA-F0-9]{64}$/.test(value))throw new ArchiveConfigurationError(
    'Chưa cấu hình AMORRI_ARCHIVE_ENCRYPTION_KEY (64 ký tự hex). Tạm khóa tính năng xóa để bảo vệ dữ liệu khách hàng.'
  );
  const key=Buffer.from(value,'hex');
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const content=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(booking),'utf8')),cipher.final()]);
  return {algorithm:'aes-256-gcm',format:'json',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),payload:content.toString('base64')};
}

/** Offline recovery helper; never run inside a client component. */
export function decryptBookingArchive(encrypted: {algorithm:string; iv:string;tag:string;payload:string}):Record<string,unknown>{
  if(encrypted.algorithm!=='aes-256-gcm')throw new Error('Archive algorithm is not supported');
  const value=(process.env.AMORRI_ARCHIVE_ENCRYPTION_KEY||'').trim();
  if(!/^[a-fA-F0-9]{64}$/.test(value))throw new ArchiveConfigurationError('Thiếu hoặc sai AMORRI_ARCHIVE_ENCRYPTION_KEY');
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(value,'hex'),Buffer.from(encrypted.iv,'base64'));
  decipher.setAuthTag(Buffer.from(encrypted.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted.payload,'base64')),decipher.final()]).toString('utf8'));
}

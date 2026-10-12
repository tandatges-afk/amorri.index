import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Public, non-sensitive release marker: used only to distinguish an old deployment. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'Amorri Studio VNext 2.0',
    release: 'auth-verified-20261012-r1',
    authApi: 'diagnostic-codes-enabled',
    time: new Date().toISOString()
  }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}

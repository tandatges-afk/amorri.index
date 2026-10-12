import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET() {
  return NextResponse.json({ ok: true, app: 'Amorri Studio VNext 2.0', time: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } });
}

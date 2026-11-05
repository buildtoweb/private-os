import { NextResponse } from 'next/server';
import { getKoerperbefund } from '@/lib/health/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Körperbefund — recomputed each request from the raw imported WHOOP rows.
// Cheap (a few thousand rows aggregated in JS); the client caches it via SWR.
export async function GET() {
  try {
    const data = await getKoerperbefund();
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'failed' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { buildSummary } from '@/lib/finance/networth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await buildSummary();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

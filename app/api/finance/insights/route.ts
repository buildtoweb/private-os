import { NextResponse } from 'next/server';
import { buildSummary } from '@/lib/finance/networth';
import { getInsights } from '@/lib/finance/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const summary = await buildSummary();
    const { insights, enabled } = await getInsights(summary);
    return NextResponse.json({ ok: true, enabled, insights });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

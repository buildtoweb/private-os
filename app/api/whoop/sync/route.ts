import { NextRequest, NextResponse } from 'next/server';
import { syncRecent } from '@/lib/whoop';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days') || 180)));
    const r = await syncRecent(days);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'WHOOP sync failed' },
      { status: 500 },
    );
  }
}

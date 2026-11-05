import { NextRequest, NextResponse } from 'next/server';
import { getSavingsPlan, setSavingsPlan, deleteSavingsPlan } from '@/lib/finance/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const plan = await getSavingsPlan();
    return NextResponse.json({ ok: true, plan });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await setSavingsPlan(body);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await deleteSavingsPlan();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

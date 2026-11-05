import { NextRequest, NextResponse } from 'next/server';
import { getIncome, setIncome } from '@/lib/finance/store';
import { appToday } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month') || appToday().slice(0, 7);
    const income = await getIncome(month);
    return NextResponse.json({ ok: true, income });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { month, amountEur } = await req.json();
    const m = month || appToday().slice(0, 7);
    if (amountEur == null) return NextResponse.json({ ok: false, error: 'amount_required' }, { status: 400 });
    await setIncome(m, Number(amountEur), 'manual');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

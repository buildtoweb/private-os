import { NextRequest, NextResponse } from 'next/server';
import { fxRateOn } from '@/lib/finance/prices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CURRENCY = /^[A-Z]{3}$/;

// Rate used to preview a trade entered in another currency. The transactions
// endpoint looks the rate up again itself, so this is display-only.
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from') || '';
  const to = req.nextUrl.searchParams.get('to') || 'EUR';
  const date = req.nextUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  if (!CURRENCY.test(from) || !CURRENCY.test(to) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: 'invalid_currency_or_date' }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, from, to, date, rate: await fxRateOn(from, to, date) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'fx_unavailable' }, { status: 502 });
  }
}

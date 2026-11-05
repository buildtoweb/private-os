import { NextRequest, NextResponse } from 'next/server';
import { setVacationRange } from '@/lib/habitsStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Urlaubsmodus — flag a date range as "away, deliberately not tracked" (or clear
// it again). Vacation days stay out of the completion stats and don't break a
// streak, so a trip no longer looks like a wall of missed habits.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const start = String(body?.start || '');
    const end = String(body?.end || body?.start || '');
    if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) {
      return NextResponse.json({ ok: false, error: 'invalid_range' }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json({ ok: false, error: 'end_before_start' }, { status: 400 });
    }
    const on = body?.on !== false;
    const label = typeof body?.label === 'string' ? body.label : undefined;

    const { dates, removed } = await setVacationRange(start, end, on, label);
    return NextResponse.json({ ok: true, on, dates, removed });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.body?.message || e?.message || String(e) },
      { status: 500 },
    );
  }
}

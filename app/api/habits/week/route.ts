import { NextRequest, NextResponse } from 'next/server';
import { setWeeklyValuesAcrossWeek, WEEKLY_CHECKBOX_KEYS, type WeeklyValues } from '@/lib/habitsStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Write a weekly habit value (gym/sauna counter or the reflexion/lesen checkbox) onto
// every day of the ISO week containing `date`, so the data has no gaps.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.date) return NextResponse.json({ ok: false, error: 'date_required' }, { status: 400 });

    const values: WeeklyValues = {};
    if (typeof body.gymWeek === 'number') values.gymWeek = body.gymWeek;
    if (typeof body.saunaWeek === 'number') values.saunaWeek = body.saunaWeek;
    for (const k of WEEKLY_CHECKBOX_KEYS) if (typeof body[k] === 'boolean') values[k] = body[k];

    if (Object.keys(values).length === 0) {
      return NextResponse.json({ ok: false, error: 'no_values' }, { status: 400 });
    }

    const dates = await setWeeklyValuesAcrossWeek(body.date, values);
    return NextResponse.json({ ok: true, dates });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.body?.message || e?.message || String(e) },
      { status: 500 },
    );
  }
}

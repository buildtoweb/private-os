import { NextRequest, NextResponse } from 'next/server';
import { getHabitSettings, setHabitPause } from '@/lib/habitsStore';
import { HABIT_BY_KEY } from '@/lib/habits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONTH = /^\d{4}-\d{2}$/;

// Per-month habit pause — e.g. no sauna over the summer. A paused month counts
// neither for nor against the habit, and the Today page stops awarding or
// deducting XP for it.
export async function GET() {
  try {
    return NextResponse.json(await getHabitSettings());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const habit = String(body?.habit || '');
    const month = String(body?.month || '');
    if (!HABIT_BY_KEY[habit]) {
      return NextResponse.json({ ok: false, error: 'unknown_habit' }, { status: 400 });
    }
    if (!MONTH.test(month)) {
      return NextResponse.json({ ok: false, error: 'invalid_month' }, { status: 400 });
    }
    const settings = await setHabitPause(habit, month, body?.paused !== false);
    return NextResponse.json({ ok: true, ...settings });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.body?.message || e?.message || String(e) },
      { status: 500 },
    );
  }
}

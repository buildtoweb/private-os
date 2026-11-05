import { NextRequest, NextResponse } from 'next/server';
import { getHabitsForDate, upsertHabits } from '@/lib/habitsStore';
import { appToday } from '@/lib/date';

export const runtime = 'nodejs';

// GET: Shortcut PULLT Daten zurück, um sie in HealthKit zu schreiben
// (z.B. Gewicht, das du im Web eingegeben hast → Apple Health)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!process.env.HEALTH_SYNC_TOKEN || token !== process.env.HEALTH_SYNC_TOKEN) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const date = req.nextUrl.searchParams.get('date') || appToday();
  const day = await getHabitsForDate(date);
  return NextResponse.json({
    date,
    schritte: day?.schritte ?? null,
    gewicht: day?.gewicht ?? null,
    aktiveKalorien: day?.aktiveKalorien ?? null,
    notiz: day?.notiz ?? null,
  });
}

// POST: Apple Health iOS Shortcut → { token, date, schritte, gewicht, aktiveKalorien }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const expected = process.env.HEALTH_SYNC_TOKEN;
  if (!expected || body.token !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const date = body.date || appToday();
  await upsertHabits({
    date,
    habits: {},
    schritte: numOrUndef(body.schritte),
    gewicht: numOrUndef(body.gewicht),
    aktiveKalorien: numOrUndef(body.aktiveKalorien),
  });
  return NextResponse.json({ ok: true, date });
}

function numOrUndef(v: any) { const n = Number(v); return Number.isFinite(n) ? n : undefined; }

import { NextRequest, NextResponse } from 'next/server';
import { getHabitsForDate, getHabitsRange, upsertHabits } from '@/lib/habitsStore';
import type { HabitDay } from '@/lib/notion';
import { appToday } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function envCheck() {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SECRET_KEY');
  return missing;
}

function errPayload(e: any) {
  const code = e?.code || e?.status || 'unknown';
  const message = e?.body?.message || e?.message || String(e);
  return { ok: false, error: 'db_error', code, message };
}

export async function GET(req: NextRequest) {
  const missing = envCheck();
  if (missing.length) {
    return NextResponse.json({ ok: false, error: 'env_missing', missing }, { status: 500 });
  }
  try {
    const { searchParams } = req.nextUrl;
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const date = searchParams.get('date');
    if (start && end) {
      return NextResponse.json({ days: await getHabitsRange(start, end) });
    }
    if (date) {
      return NextResponse.json({ day: await getHabitsForDate(date) });
    }
    const today = appToday();
    return NextResponse.json({ day: await getHabitsForDate(today) });
  } catch (e: any) {
    return NextResponse.json(errPayload(e), { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const missing = envCheck();
  if (missing.length) {
    return NextResponse.json({ ok: false, error: 'env_missing', missing }, { status: 500 });
  }
  try {
    const body = (await req.json()) as HabitDay;
    if (!body?.date) return NextResponse.json({ ok: false, error: 'date_required' }, { status: 400 });
    body.habits = body.habits || {};
    await upsertHabits(body);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(errPayload(e), { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getDailyForDate, getRecentDaily, getTodayDaily } from '@/lib/whoop';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get('days') || 30);
  const date = req.nextUrl.searchParams.get('date');
  const today = req.nextUrl.searchParams.get('today');
  if (date) return NextResponse.json({ day: await getDailyForDate(date) });
  if (today) return NextResponse.json({ day: await getTodayDaily() });
  return NextResponse.json({ days: await getRecentDaily(days) });
}

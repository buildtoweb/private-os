import { NextRequest, NextResponse } from 'next/server';
import { db, XP_LOG, levelForXP, xpForNextLevel, type XPEntry } from '@/lib/db';
import { awardXP, getTotalXP } from '@/lib/xpStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getRecentXPEntries(days = 7): Promise<XPEntry[]> {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const snap = await db().collection(XP_LOG).orderBy('createdAt', 'desc').limit(100).get();
  return snap.docs
    .map(doc => doc.data() as XPEntry)
    .filter(entry => (entry.createdAt || 0) >= since)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function GET() {
  const totalXP = await getTotalXP();
  const level = levelForXP(totalXP);
  const nextLevelXP = xpForNextLevel(level);
  const currentLevelXP = level === 0 ? 0 : xpForNextLevel(level - 1);
  const recent = await getRecentXPEntries(7);
  const plusXP = recent.reduce((sum, entry) => sum + Math.max(0, entry.xpGained || 0), 0);
  const minusXP = recent.reduce((sum, entry) => sum + Math.min(0, entry.xpGained || 0), 0);

  return NextResponse.json({
    totalXP,
    level,
    nextLevelXP,
    progressXP: totalXP - currentLevelXP,
    neededXP: nextLevelXP - currentLevelXP,
    recent,
    summary7d: {
      plusXP,
      minusXP,
      netXP: plusXP + minusXP,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { habit: string; xpGained: number; date?: string; idempotencyKey?: string };
  if (body?.habit === 'monthly_reflection') return NextResponse.json({ ok: false, error: 'monthly_reflection_disabled' }, { status: 410 });
  if (!body?.habit || typeof body.xpGained !== 'number') {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
  }
  // The award itself lives in lib/xpStore.ts so the Agent Context API grants XP
  // through exactly the same path as the browser.
  const result = await awardXP(body);
  return NextResponse.json(
    result.duplicate
      ? { ok: true, duplicate: true, totalXP: result.totalXP, level: result.level, leveledUp: false, nextLevelXP: result.nextLevelXP }
      : {
          ok: true,
          totalXP: result.totalXP,
          level: result.level,
          leveledUp: result.leveledUp,
          leveledDown: result.leveledDown,
          prevLevel: result.prevLevel,
          nextLevelXP: result.nextLevelXP,
        },
  );
}

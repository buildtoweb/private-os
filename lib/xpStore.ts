// Server-side XP awarding.
//
// Extracted from app/api/xp/route.ts so both that route and the Agent Context
// API award XP through exactly the same path. Before this existed, XP was only
// ever granted by the browser calling POST /api/xp — a machine client writing a
// habit would silently skip it and let the level drift from reality.
import { createHash } from 'node:crypto';
import { db, XP_LOG, levelForXP, xpForNextLevel, type XPEntry } from './db';
import { appToday } from './date';
import { supa } from './supabase';

const MAX_ATTEMPTS = 8;
const UNIQUE_VIOLATION = '23505';

async function latestEntry(): Promise<{ id: string; totalXP: number }> {
  const { data, error } = await supa()
    .from(XP_LOG)
    .select('doc_id,data')
    .order('data->createdAt', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  return { id: row?.doc_id ?? '', totalXP: (row?.data as XPEntry | undefined)?.totalXP || 0 };
}

export async function getTotalXP(): Promise<number> {
  return (await latestEntry()).totalXP;
}

export type AwardResult = {
  ok: true;
  duplicate: boolean;
  totalXP: number;
  level: number;
  leveledUp: boolean;
  leveledDown: boolean;
  prevLevel: number;
  nextLevelXP: number;
  /** What this call actually added; 0 when the award was a duplicate. */
  xpGained: number;
};

/**
 * Append one XP entry.
 *
 * `idempotencyKey` defaults to `<date>:<habit>` — the same convention the client
 * helpers use — so re-checking a habit, or an agent retrying a request, can
 * never award the same XP twice.
 */
export async function awardXP(input: {
  habit: string;
  xpGained: number;
  date?: string;
  idempotencyKey?: string;
}): Promise<AwardResult> {
  if (input.habit === 'monthly_reflection') throw new Error('monthly_reflection_disabled');
  const date = input.date || appToday();
  const idempotencyKey = input.idempotencyKey || `${date}:${input.habit}`;

  // The running total lives on the newest entry, so two awards at once (the last
  // habit and the perfect day fire together) would both build on the same total
  // and one would vanish. Each entry's id is derived from its predecessor: the
  // second writer hits the primary key, re-reads the total and tries again.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await db().collection(XP_LOG)
      .where('idempotencyKey', '==', idempotencyKey)
      .limit(1)
      .get();
    const latest = await latestEntry();
    const prevLevel = levelForXP(latest.totalXP);
    if (!existing.empty) {
      return {
        ok: true, duplicate: true, totalXP: latest.totalXP, level: prevLevel,
        leveledUp: false, leveledDown: false, prevLevel,
        nextLevelXP: xpForNextLevel(prevLevel), xpGained: 0,
      };
    }

    const totalXP = Math.max(0, latest.totalXP + input.xpGained);
    const level = levelForXP(totalXP);
    const entry: XPEntry = {
      date,
      habit: input.habit,
      xpGained: input.xpGained,
      totalXP,
      level,
      createdAt: Date.now(),
      idempotencyKey,
    };
    const docId = createHash('sha256').update(`after:${latest.id}`).digest('hex').slice(0, 20);
    const { error } = await supa().from(XP_LOG).insert({ doc_id: docId, data: entry });
    if (error?.code === UNIQUE_VIOLATION) continue;
    if (error) throw error;

    return {
      ok: true, duplicate: false, totalXP, level,
      leveledUp: level > prevLevel, leveledDown: level < prevLevel,
      prevLevel, nextLevelXP: xpForNextLevel(level), xpGained: input.xpGained,
    };
  }
  throw new Error('xp_award_conflict');
}

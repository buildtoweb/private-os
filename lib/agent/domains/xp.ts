// XP / Level — the gamification layer on top of habits, goals and reflections.
import { db, XP_LOG, levelForXP, xpForNextLevel, type XPEntry } from '@/lib/db';
import { DAILY_HABITS, WEEKLY_HABITS } from '@/lib/habits';
import type { Warnings } from '../envelope';
import { compact, de, ratioPct, sentences } from '../format';

// XP is awarded for habits but also for reflections, perfect days and goals —
// those arrive as bare keys, so they get their own German labels here.
const EXTRA_LABELS: Record<string, string> = {
  perfect_day: 'Perfekter Tag',
  daily_reflection: 'Tages-Reflexion',
  weekly_reflection: 'Wochen-Reflexion',
  monthly_reflection: 'Monats-Reflexion',
  goal_completed: 'Ziel erreicht',
  goal_given_up: 'Ziel abgebrochen',
};

const LABELS = new Map<string, string>([
  ...[...DAILY_HABITS, ...WEEKLY_HABITS].map((h) => [h.key, h.label] as [string, string]),
  ...Object.entries(EXTRA_LABELS),
]);

/** Fall back to a readable form of the key rather than exposing snake_case. */
function sourceLabel(key: string): string {
  return LABELS.get(key) ?? key.replace(/_/g, ' ');
}

export async function buildXP(warn: Warnings, opts: { days?: number } = {}) {
  const days = opts.days ?? 7;
  const entries = await warn.guard<XPEntry[]>('xp.log', async () => {
    const snap = await db().collection(XP_LOG).orderBy('createdAt', 'desc').limit(200).get();
    return snap.docs.map((d) => d.data() as XPEntry);
  }, []);

  if (!entries.length) {
    return compact({ available: false, summary: 'Noch keine XP-Einträge vorhanden.' });
  }

  const totalXP = entries[0].totalXP || 0;
  const level = levelForXP(totalXP);
  const nextLevelXP = xpForNextLevel(level);
  const currentLevelXP = level === 0 ? 0 : xpForNextLevel(level - 1);

  const since = Date.now() - days * 86_400_000;
  const recent = entries.filter((e) => (e.createdAt || 0) >= since);
  const gained = recent.filter((e) => (e.xpGained || 0) > 0).reduce((n, e) => n + e.xpGained, 0);
  const lost = recent.filter((e) => (e.xpGained || 0) < 0).reduce((n, e) => n + e.xpGained, 0);

  return compact({
    available: true,
    level,
    total_xp: totalXP,
    xp_into_level: totalXP - currentLevelXP,
    xp_needed_for_level: nextLevelXP - currentLevelXP,
    xp_to_next_level: Math.max(0, nextLevelXP - totalXP),
    level_progress_pct: ratioPct(totalXP - currentLevelXP, nextLevelXP - currentLevelXP),
    period: {
      days,
      gained_xp: gained,
      lost_xp: lost,
      net_xp: gained + lost,
      events: recent.length,
    },
    recent_events: recent.slice(0, 20).map((e) => compact({
      date: e.date,
      source: sourceLabel(e.habit),
      xp: e.xpGained,
    })),
    summary: sentences(
      `Level ${level} mit ${de(totalXP, 0)} XP, noch ${de(Math.max(0, nextLevelXP - totalXP), 0)} XP bis Level ${level + 1} (${de(ratioPct(totalXP - currentLevelXP, nextLevelXP - currentLevelXP) ?? 0)} % geschafft).`,
      recent.length
        ? `In den letzten ${days} Tagen ${gained > 0 ? `+${de(gained, 0)}` : de(gained, 0)} XP verdient und ${de(lost, 0)} XP verloren, netto ${de(gained + lost, 0)} XP.`
        : `In den letzten ${days} Tagen keine XP-Bewegung.`,
    ),
  });
}

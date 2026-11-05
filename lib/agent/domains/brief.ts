// Daily brief — everything a morning briefing needs, in one response.
//
// Composed from the same domain builders the individual endpoints use, then
// trimmed: an agent writing a morning message needs today's numbers and the
// deltas, not the full 30-day position list. Every block is fetched in parallel
// and guarded on its own, so a dead WHOOP token costs the briefing its health
// block and nothing else.
import { appToday } from '@/lib/date';
import type { Warnings } from '../envelope';
import { type DateRange, shiftDays } from '../range';
import { compact, de, formatEur, germanDate, sentences } from '../format';
import { buildHealth } from './health';
import { buildHabits } from './habits';
import { buildGoals } from './goals';
import { buildSubscriptions } from './subscriptions';
import { buildFinance } from './finance';
import { buildPassage } from './passage';
import { buildXP } from './xp';
import { buildReflections } from './reflections';

/** Charges further out than this are not "this morning's business". */
const BRIEF_HORIZON_DAYS = 14;
/** Trailing window the briefing compares today against. */
const BRIEF_WINDOW_DAYS = 14;

export async function buildDailyBrief(
  range: DateRange,
  warn: Warnings,
  opts: { includeFinance?: boolean } = {},
) {
  // The domain builders expect a window, not a single day, so the briefing can
  // report "vs. der letzten zwei Wochen" instead of only today's raw values.
  const window: DateRange = {
    ...range,
    from: shiftDays(range.date, -(BRIEF_WINDOW_DAYS - 1)),
    to: range.date,
    days: BRIEF_WINDOW_DAYS,
  };
  const yesterday = shiftDays(range.date, -1);
  const journalRange: DateRange = { ...range, from: yesterday, to: range.date, days: 2 };

  const [health, habits, goals, subscriptions, finance, passage, xp, reflections] = await Promise.all([
    warn.guard('brief.health', () => buildHealth(window, warn, { includeBlood: false }), null),
    warn.guard('brief.habits', () => buildHabits(window, warn), null),
    warn.guard('brief.goals', () => buildGoals(range, warn), null),
    warn.guard('brief.subscriptions', () => buildSubscriptions(warn, { horizonDays: BRIEF_HORIZON_DAYS, anchorDate: range.date }), null),
    opts.includeFinance === false
      ? Promise.resolve(null)
      : warn.guard('brief.finance', () => buildFinance(warn, { activityLimit: 0 }), null),
    warn.guard('brief.passage', () => buildPassage(range, warn), null),
    warn.guard('brief.xp', () => buildXP(warn), null),
    warn.guard('brief.journal', () => buildReflections(journalRange, warn, { limit: 3 }), null),
  ]);

  const h = health as any;
  const hb = habits as any;
  const g = goals as any;
  const s = subscriptions as any;
  const f = finance as any;
  const p = passage as any;
  const x = xp as any;
  const r = reflections as any;

  const brief = compact({
    date: range.date,
    weekday: germanDate(range.date),
    is_today: range.date === appToday(),

    health: h ? compact({
      recovery_pct: h.snapshot?.recovery_pct,
      recovery_zone: h.snapshot?.recovery_zone,
      hrv_ms: h.snapshot?.hrv_ms,
      resting_hr_bpm: h.snapshot?.resting_hr_bpm,
      sleep_hours: h.snapshot?.sleep?.hours,
      sleep_performance_pct: h.snapshot?.sleep?.performance_pct,
      strain: h.snapshot?.strain,
      data_date: h.snapshot?.date,
      data_available: h.data_available,
      vs_yesterday: h.comparison?.vs_yesterday,
      vs_7day_average: h.comparison?.vs_7day_average,
      summary: h.summary,
    }) : undefined,

    habits: hb ? compact({
      done: hb.day?.habits_done,
      expected: hb.day?.habits_expected,
      done_pct: hb.day?.habits_done_pct,
      perfect_day: hb.day?.perfect_day,
      vacation: hb.day?.vacation,
      open: hb.day?.missing,
      mood: hb.day?.mood,
      active_streaks: (hb.daily || [])
        .filter((d: any) => (d.streak_days ?? 0) > 0)
        .sort((a: any, b: any) => b.streak_days - a.streak_days)
        .slice(0, 5)
        .map((d: any) => ({ habit: d.label, streak_days: d.streak_days })),
      weekly_open: (hb.weekly || [])
        .filter((w: any) => !w.current_week?.met)
        .map((w: any) => ({ habit: w.label, value: w.current_week?.value, target: w.target_per_week })),
      perfect_days_14d: hb.totals?.perfect_days,
      completion_pct_14d: hb.totals?.completion_pct,
      summary: hb.summary,
    }) : undefined,

    goals: g ? compact({
      month: g.month,
      open_count: g.counts?.open,
      completed_count: g.counts?.completed,
      pinned: (g.pinned || []).map((goal: any) => goal.title),
      open: (g.open || []).slice(0, 8).map((goal: any) => goal.title),
      summary: g.summary,
    }) : undefined,

    subscriptions: s ? compact({
      upcoming: s.upcoming,
      per_month_eur: s.totals?.per_month_eur,
      currency: s.currency,
      summary: s.summary,
    }) : undefined,

    finance: f ? compact({
      net_worth_eur: f.net_worth_eur,
      currency: f.currency,
      savings_rate_pct: f.cashflow?.savings_rate_pct,
      largest_allocation: f.allocation?.[0],
      best_position: f.top_movers?.winners?.[0],
      worst_position: f.top_movers?.losers?.[0],
      portfolio_database: f.data_sources?.database,
      summary: f.summary,
    }) : undefined,

    passage: p?.available ? compact({
      chapter: p.chapter,
      read_minutes: p.read_minutes,
      read: p.read,
      text_de: p.text_de,
    }) : undefined,

    xp: x?.available ? compact({
      level: x.level,
      total_xp: x.total_xp,
      xp_to_next_level: x.xp_to_next_level,
      level_progress_pct: x.level_progress_pct,
      net_xp_7d: x.period?.net_xp,
    }) : undefined,

    journal: r ? compact({
      yesterday: (r.daily_journal || []).find((d: any) => d.date === yesterday),
      today: (r.daily_journal || []).find((d: any) => d.date === range.date),
      latest_reflection: (r.entries || [])[0],
    }) : undefined,
  });

  return {
    ...brief,
    summary: sentences(
      `Briefing für ${germanDate(range.date)}.`,
      h?.snapshot
        ? `Körper: Recovery ${de(h.snapshot.recovery_pct, 0)} %${h.snapshot.recovery_zone ? ` (${h.snapshot.recovery_zone})` : ''}, Schlaf ${de(h.snapshot.sleep?.hours)} h, Ruhepuls ${de(h.snapshot.resting_hr_bpm, 0)} bpm.`
        : 'Körper: keine aktuellen WHOOP-Daten.',
      hb?.day
        ? `Gewohnheiten: ${hb.day.habits_done ?? 0} von ${hb.day.habits_expected ?? 0} erledigt${hb.day.missing?.length ? `, offen: ${hb.day.missing.join(', ')}` : ''}.`
        : '',
      g?.counts?.open ? `Ziele: ${g.counts.open} offen in ${g.month}.` : '',
      s?.upcoming?.length
        ? `Abbuchungen in den nächsten ${BRIEF_HORIZON_DAYS} Tagen: ${s.upcoming.map((u: any) => `${u.service} ${formatEur(u.amount_eur)} am ${u.due_date}`).join(', ')}.`
        : `Keine Abbuchung in den nächsten ${BRIEF_HORIZON_DAYS} Tagen.`,
      f?.net_worth_eur != null ? `Nettovermögen ${formatEur(f.net_worth_eur)}.` : '',
      p?.available ? `Tagespassage: ${p.chapter} (${p.read_minutes} Min.)${p.read ? ', bereits gelesen' : ''}.` : '',
    ),
  };
}

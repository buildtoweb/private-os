// Habits domain — daily/weekly habit tracking, mood, vacation mode, body metrics.
//
// Every number here comes out of the same pure helpers the dashboard UI uses
// (lib/habits.ts), so the API and the Habits page can never disagree about a
// streak or a weekly ratio.
import {
  DAILY_HABITS, WEEKLY_HABITS, CATEGORY_META, MOOD_FACES,
  computeStreak, computeBestStreak, dailyHabitsOn, isBestDay, isVacationDay,
  isoWeekKey, weeklyWeeks, weeklySummary, weeklyCounterField,
  type HabitDef, type WeeklyDayData,
} from '@/lib/habits';
import { getHabitsRange, getHabitSettings, isoDateRange } from '@/lib/habitsStore';
import type { HabitDay } from '@/lib/notion';
import { appToday } from '@/lib/date';
import type { Warnings } from '../envelope';
import { type DateRange, previousPeriod, shiftDays } from '../range';
import { average, compact, de, germanDate, plural, ratioPct, round, sentences } from '../format';

/** Streaks look back up to a year; load enough history that a long run isn't cut short. */
const STREAK_LOOKBACK_DAYS = 400;

export async function buildHabits(range: DateRange, warn: Warnings) {
  const historyFrom = shiftDays(range.to, -STREAK_LOOKBACK_DAYS);
  const [rows, settings] = await Promise.all([
    getHabitsRange(historyFrom < range.from ? historyFrom : range.from, range.to),
    warn.guard('habits.settings', () => getHabitSettings(), { pausedMonths: {} as Record<string, string[]> }),
  ]);

  const byDate = new Map(rows.map((r) => [r.date, r]));
  const dayList = isoDateRange(range.from, range.to);
  const inRange = dayList.map((d) => byDate.get(d)).filter((d): d is HabitDay => !!d);
  const today = appToday();
  const anchor = byDate.get(range.date) ?? null;

  const dayMap = new Map<string, WeeklyDayData>(
    rows.map((r) => [r.date, { habits: r.habits, vacation: r.vacation, gymWeek: r.gymWeek, saunaWeek: r.saunaWeek }]),
  );

  // ── Per-habit stats ────────────────────────────────────────
  const daily = DAILY_HABITS.map((h) => dailyHabitStats(h, range, dayList, byDate, rows, today));
  const weekly = WEEKLY_HABITS.map((h) => weeklyHabitStats(h, range, dayList, dayMap, settings.pausedMonths[h.key], today));

  // ── The anchor day itself ──────────────────────────────────
  const activeToday = dailyHabitsOn(range.date);
  const done = activeToday.filter((h) => !!anchor?.habits?.[h.key]);
  const missing = activeToday.filter((h) => !anchor?.habits?.[h.key]);
  const moodFace = anchor?.mood != null ? MOOD_FACES.find((f) => f.v === anchor.mood) : undefined;

  const day = compact({
    date: range.date,
    weekday: germanDate(range.date),
    iso_week: isoWeekKey(range.date),
    tracked: !!anchor,
    is_future: range.date > today,
    vacation: !!anchor?.vacation,
    vacation_label: anchor?.vacationLabel,
    perfect_day: !!anchor && isBestDay(anchor.habits, range.date),
    habits_done: done.length,
    habits_expected: activeToday.length,
    habits_done_pct: ratioPct(done.length, activeToday.length),
    completed: done.map((h) => h.label),
    missing: missing.map((h) => h.label),
    mood: moodFace ? { value: moodFace.v, label: moodFace.label } : undefined,
    steps: anchor?.schritte,
    weight_kg: anchor?.gewicht,
    active_calories_kcal: anchor?.aktiveKalorien,
    note: anchor?.notiz,
  });

  // ── Period totals + previous-period comparison ─────────────
  const totals = periodTotals(dayList, byDate, today);
  const prev = previousPeriod(range);
  const prevDays = isoDateRange(prev.from, prev.to);
  const prevTotals = periodTotals(prevDays, byDate, today);

  const strongest = [...daily].sort((a, b) => (b.streak_days ?? 0) - (a.streak_days ?? 0))[0];
  const weakest = [...daily]
    .filter((h) => h.completion_pct != null)
    .sort((a, b) => (a.completion_pct ?? 0) - (b.completion_pct ?? 0))[0];

  return compact({
    range: { from: range.from, to: range.to, days: range.days, anchor_date: range.date },
    day,
    daily,
    weekly,
    totals: {
      ...totals,
      previous_period: { from: prev.from, to: prev.to, ...prevTotals },
      completion_pct_delta:
        totals.completion_pct != null && prevTotals.completion_pct != null
          ? round(totals.completion_pct - prevTotals.completion_pct, 1)
          : undefined,
    },
    paused_months: Object.entries(settings.pausedMonths).map(([habit, months]) => ({
      habit: labelOf(habit), months,
    })),
    summary: sentences(
      anchor
        ? `Am ${range.date} sind ${done.length} von ${activeToday.length} Tages-Gewohnheiten erledigt${anchor.vacation ? ' (Urlaubsmodus)' : ''}.`
        : `Für den ${range.date} ist noch nichts eingetragen.`,
      missing.length && !anchor?.vacation ? `Offen: ${missing.map((h) => h.label).join(', ')}.` : '',
      strongest?.streak_days
        ? `Längste aktive Serie: ${strongest.label} mit ${plural(strongest.streak_days!, 'Tag', 'Tagen')}.`
        : '',
      `In den letzten ${range.days} Tagen ${plural(totals.perfect_days, 'perfekter Tag', 'perfekte Tage')} (${de(totals.perfect_day_pct ?? 0)} %), Erfüllungsquote ${de(totals.completion_pct ?? 0)} %.`,
      weakest && weakest.completion_pct != null && weakest.completion_pct < 60
        ? `Schwächste Gewohnheit: ${weakest.label} mit ${de(weakest.completion_pct)} %.`
        : '',
    ),
  });
}

// ─── helpers ───────────────────────────────────────────────────

function labelOf(key: string): string {
  return [...DAILY_HABITS, ...WEEKLY_HABITS].find((h) => h.key === key)?.label ?? key;
}

function dailyHabitStats(
  h: HabitDef,
  range: DateRange,
  dayList: string[],
  byDate: Map<string, HabitDay>,
  allRows: HabitDay[],
  today: string,
) {
  // A day only counts once the habit existed, isn't a vacation day, and has happened.
  const counted = dayList.filter(
    (d) => (!h.since || d >= h.since) && d <= today && !isVacationDay(byDate.get(d)),
  );
  const doneDays = counted.filter((d) => !!byDate.get(d)?.habits?.[h.key]);

  return compact({
    key: h.key,
    label: h.label,
    category: CATEGORY_META[h.category].label,
    description: h.description,
    frequency: 'daily' as const,
    tracked_since: h.since,
    done_on_date: !!byDate.get(range.date)?.habits?.[h.key],
    streak_days: computeStreak(h.key, allRows, range.date),
    best_streak_days: computeBestStreak(h.key, allRows),
    completed_days: doneDays.length,
    counted_days: counted.length,
    completion_pct: ratioPct(doneDays.length, counted.length),
  });
}

function weeklyHabitStats(
  h: HabitDef,
  range: DateRange,
  dayList: string[],
  dayMap: Map<string, WeeklyDayData>,
  pausedMonths: string[] | undefined,
  today: string,
) {
  const weeks = weeklyWeeks(h, dayList, dayMap, new Set(pausedMonths || []), today);
  const { met, counted } = weeklySummary(weeks);

  // The ISO week containing the anchor date, resolved on its own so a partial
  // range still reports the live week honestly.
  const anchorWeekKey = isoWeekKey(range.date);
  const anchorWeek = weeks.find((w) => w.key === anchorWeekKey);
  const field = weeklyCounterField(h);
  const liveValue = field
    ? Math.max(0, ...dayList.filter((d) => isoWeekKey(d) === anchorWeekKey).map((d) => Number(dayMap.get(d)?.[field]) || 0))
    : dayList.filter((d) => isoWeekKey(d) === anchorWeekKey).some((d) => !!dayMap.get(d)?.habits?.[h.key]) ? 1 : 0;

  return compact({
    key: h.key,
    label: h.label,
    category: CATEGORY_META[h.category].label,
    description: h.description,
    frequency: 'weekly' as const,
    target_per_week: h.target,
    current_week: {
      iso_week: anchorWeekKey,
      value: anchorWeek?.value ?? liveValue,
      target: h.target,
      met: (anchorWeek?.value ?? liveValue) >= h.target,
    },
    weeks_met: met,
    weeks_counted: counted,
    completion_pct: ratioPct(met, counted),
    paused_months: pausedMonths,
  });
}

function periodTotals(dayList: string[], byDate: Map<string, HabitDay>, today: string) {
  const past = dayList.filter((d) => d <= today);
  const tracked = past.filter((d) => byDate.has(d));
  const vacation = past.filter((d) => isVacationDay(byDate.get(d)));
  const counted = past.filter((d) => !isVacationDay(byDate.get(d)));
  const perfect = counted.filter((d) => {
    const row = byDate.get(d);
    return !!row && isBestDay(row.habits, d);
  });

  // Erfüllungsquote = erledigte Habit-Slots / mögliche Habit-Slots, Urlaub ausgenommen.
  let possible = 0;
  let done = 0;
  for (const d of counted) {
    const active = dailyHabitsOn(d);
    possible += active.length;
    done += active.filter((h) => !!byDate.get(d)?.habits?.[h.key]).length;
  }

  return compact({
    days: past.length,
    tracked_days: tracked.length,
    vacation_days: vacation.length,
    perfect_days: perfect.length,
    perfect_day_pct: ratioPct(perfect.length, counted.length),
    completed_slots: done,
    possible_slots: possible,
    completion_pct: ratioPct(done, possible),
    average_mood: average(tracked.map((d) => byDate.get(d)?.mood)),
    average_steps: average(tracked.map((d) => byDate.get(d)?.schritte), 0),
    latest_weight_kg: [...tracked].reverse().map((d) => byDate.get(d)?.gewicht).find((v) => v != null),
  });
}

// Habit write actions.
//
// This is the piece the dashboard never had on the server: "abhaken" is not just
// an upsert. Checking a daily habit also recomputes `bestDay` and awards XP that
// scales with the current streak, plus a perfect-day bonus; un-checking deducts
// the mirrored penalty. Until now that lived only in components/HabitsModal.tsx
// and components/HabitCard.tsx, so any non-browser write let the level drift.
//
// The XP rules and idempotency keys below are ported from those components
// verbatim — same keys means the browser and the agent can act on the same day
// without ever double-awarding.
import {
  DAILY_HABITS, WEEKLY_HABITS, HABIT_BY_KEY,
  computeStreak, dailyHabitsOn, isBestDay,
  type HabitDef,
} from '@/lib/habits';
import {
  getHabitsForDate, getHabitsRange, upsertHabits, setWeeklyValuesAcrossWeek, isoWeekDates,
} from '@/lib/habitsStore';
import type { HabitDay } from '@/lib/notion';
import {
  dailyHabitXP, dailyHabitPenalty, perfectDayXP, perfectDayPenalty,
  dailyReflectionXP, dailyReflectionPenalty, habitXP, habitPenalty,
} from '@/lib/xp';
import { awardXP } from '@/lib/xpStore';
import { AgentError } from '../envelope';
import { shiftDays } from '../range';
import { compact, ratioPct } from '../format';

/** Enough history for computeStreak to resolve a long run. */
const STREAK_LOOKBACK_DAYS = 400;

export type XPChange = { source: string; xp: number; duplicate: boolean };

/** Award and report it in a shape the agent can read back. */
async function grant(source: string, xp: number, date: string, key: string, out: XPChange[]) {
  const res = await awardXP({ habit: source, xpGained: xp, date, idempotencyKey: key });
  // A duplicate means the browser already awarded this exact thing — worth
  // reporting so the agent doesn't announce XP the user never gained.
  out.push({ source, xp: res.duplicate ? 0 : xp, duplicate: res.duplicate });
}

function requireDailyHabit(key: string): HabitDef {
  const habit = DAILY_HABITS.find((h) => h.key === key);
  if (!habit) {
    throw new AgentError(
      'unknown_habit',
      `"${key}" ist keine Tages-Gewohnheit. Erlaubt: ${DAILY_HABITS.map((h) => h.key).join(', ')}.`,
      400,
    );
  }
  return habit;
}

function requireWeeklyHabit(key: string): HabitDef {
  const habit = WEEKLY_HABITS.find((h) => h.key === key);
  if (!habit) {
    throw new AgentError(
      'unknown_habit',
      `"${key}" ist keine Wochen-Gewohnheit. Erlaubt: ${WEEKLY_HABITS.map((h) => h.key).join(', ')}.`,
      400,
    );
  }
  return habit;
}

/** The day as the read endpoints describe it, so a write answers in the same language. */
function describeDay(day: HabitDay, dateISO: string) {
  const active = dailyHabitsOn(dateISO);
  const done = active.filter((h) => !!day.habits?.[h.key]);
  return compact({
    date: dateISO,
    vacation: !!day.vacation,
    perfect_day: isBestDay(day.habits, dateISO),
    habits_done: done.length,
    habits_expected: active.length,
    habits_done_pct: ratioPct(done.length, active.length),
    completed: done.map((h) => h.label),
    missing: active.filter((h) => !day.habits?.[h.key]).map((h) => h.label),
    mood: day.mood,
    note: day.notiz,
  });
}

// ─── Daily habit ───────────────────────────────────────────────

/**
 * Set one daily habit's state for one day.
 *
 * Takes an explicit `done` rather than toggling, so a retried request is
 * idempotent — an LLM client that loses a response and resends must not flip
 * the checkbox back.
 */
export async function setDailyHabit(input: { date: string; habitKey: string; done: boolean }) {
  const habit = requireDailyHabit(input.habitKey);
  const { date, done } = input;

  if (habit.since && date < habit.since) {
    throw new AgentError(
      'habit_not_tracked_yet',
      `"${habit.label}" wird erst ab ${habit.since} getrackt.`,
      400,
    );
  }

  const current = await getHabitsForDate(date);
  if (current?.vacation) {
    throw new AgentError(
      'vacation_day',
      `Der ${date} ist als Urlaubstag markiert und wird nicht getrackt.`,
      409,
    );
  }

  const wasChecked = !!current?.habits?.[habit.key];
  const wasBestDay = isBestDay(current?.habits, date);

  if (wasChecked === done) {
    // Nothing to change. Say so explicitly instead of writing a no-op row.
    return {
      changed: false,
      habit: habit.label,
      done,
      day: describeDay(current ?? { date, habits: {} }, date),
      xp: [] as XPChange[],
    };
  }

  const habits = { ...(current?.habits || {}), [habit.key]: done } as Record<string, boolean | undefined>;
  habits.bestDay = isBestDay(habits, date);
  const next: HabitDay = { ...(current ?? { date, habits: {} }), date, habits };
  await upsertHabits(next);

  // Streak is recomputed from the stored history *including* the new state —
  // same basis HabitsModal uses, so the XP amount matches what the UI grants.
  const history = await getHabitsRange(shiftDays(date, -STREAK_LOOKBACK_DAYS), date);
  const merged = [...history.filter((d) => d.date !== date), next];
  const streak = computeStreak(habit.key, merged, date);

  const xp: XPChange[] = [];
  if (done) {
    await grant(habit.key, dailyHabitXP(streak), date, `${date}:${habit.key}`, xp);
    if (habits.bestDay) await grant('perfect_day', perfectDayXP(), date, `${date}:perfect_day`, xp);
  } else {
    await grant(`${habit.key}_missed`, dailyHabitPenalty(streak), date, `${date}:${habit.key}:penalty`, xp);
    if (wasBestDay && !habits.bestDay) {
      await grant('perfect_day_missed', perfectDayPenalty(), date, `${date}:perfect_day:penalty`, xp);
    }
  }

  return {
    changed: true,
    habit: habit.label,
    done,
    streak_days: done ? streak : undefined,
    day: describeDay(next, date),
    xp,
  };
}

// ─── Weekly habit ──────────────────────────────────────────────

/**
 * Set a weekly habit for the ISO week containing `date`.
 *
 * Counters (gym/sauna) take `value`, the reflexion/lesen checkboxes take `done`. The
 * value is written onto every day of the week — see setWeeklyValuesAcrossWeek —
 * so the data has no gaps whichever day is read.
 */
export async function setWeeklyHabit(input: {
  date: string;
  habitKey: string;
  value?: number;
  done?: boolean;
}) {
  const habit = requireWeeklyHabit(input.habitKey);
  const isCounter = habit.notionType === 'counter';

  if (isCounter && input.value == null) {
    throw new AgentError('invalid_param', `"${habit.label}" ist ein Zähler — "value" ist erforderlich.`, 400);
  }
  if (!isCounter && input.done == null) {
    throw new AgentError('invalid_param', `"${habit.label}" ist eine Checkbox — "done" ist erforderlich.`, 400);
  }

  const weekDates = isoWeekDates(input.date);
  const before = await getHabitsRange(weekDates[0], weekDates[6]);
  const field = habit.notionField === 'Gym_Week' ? 'gymWeek' : habit.notionField === 'Sauna_Week' ? 'saunaWeek' : null;

  const previous = field
    ? Math.max(0, ...before.map((d) => Number((d as any)[field]) || 0))
    : before.some((d) => !!d.habits?.[habit.key]) ? 1 : 0;
  const nextValue = isCounter ? input.value! : input.done ? 1 : 0;

  await setWeeklyValuesAcrossWeek(input.date, isCounter
    ? (field === 'gymWeek' ? { gymWeek: nextValue } : { saunaWeek: nextValue })
    : { [habit.key]: !!input.done });

  // XP fires on crossing the weekly target, not on every increment — the same
  // rule HabitCard applies via its `filled` transition.
  const xp: XPChange[] = [];
  const hitBefore = previous >= habit.target;
  const hitNow = nextValue >= habit.target;
  const kind = isCounter ? 'counter' : 'checkbox';
  const keySuffix = isCounter ? 'target' : 'weekly';
  const xpDate = input.date;

  if (!hitBefore && hitNow) {
    await grant(habit.key, habitXP('weekly', 0, kind), xpDate, `${xpDate}:${habit.key}:${keySuffix}`, xp);
  }
  if (hitBefore && !hitNow) {
    await grant(`${habit.key}_missed`, habitPenalty('weekly', 0, kind), xpDate, `${xpDate}:${habit.key}:${keySuffix}:penalty`, xp);
  }

  return {
    changed: previous !== nextValue,
    habit: habit.label,
    iso_week_dates: [weekDates[0], weekDates[6]],
    previous_value: previous,
    value: nextValue,
    target: habit.target,
    met: hitNow,
    xp,
  };
}

// ─── Mood, note and the daily journal ──────────────────────────

const JOURNAL_FIELDS = ['dankbar', 'intention', 'gutGemacht', 'besserMorgen'] as const;

/**
 * Write mood, a free-text note and the four daily-journal fields.
 *
 * Mirrors app/page.tsx: filling any journal field auto-checks the "journaling"
 * habit (and can therefore complete a perfect day), and the first content of the
 * day earns the daily-reflection XP.
 */
export async function setDayFields(input: {
  date: string;
  mood?: number;
  note?: string;
  grateful_for?: string;
  intention?: string;
  done_well?: string;
  better_tomorrow?: string;
}) {
  const { date } = input;
  const current = await getHabitsForDate(date);

  const patch: HabitDay = { date, habits: current?.habits || {} };
  if (input.mood != null) patch.mood = input.mood;
  if (input.note != null) patch.notiz = input.note;
  if (input.grateful_for != null) patch.dankbar = input.grateful_for;
  if (input.intention != null) patch.intention = input.intention;
  if (input.done_well != null) patch.gutGemacht = input.done_well;
  if (input.better_tomorrow != null) patch.besserMorgen = input.better_tomorrow;

  const wroteJournal = [input.grateful_for, input.intention, input.done_well, input.better_tomorrow]
    .some((v) => typeof v === 'string' && v.trim() !== '');

  const xp: XPChange[] = [];
  const wasBestDay = isBestDay(current?.habits, date);
  let autoChecked = false;

  // Writing a reflection counts as journaling — same rule as the Today page.
  if (wroteJournal && !current?.habits?.journaling && !current?.vacation) {
    const habits = { ...(current?.habits || {}), journaling: true } as Record<string, boolean | undefined>;
    habits.bestDay = isBestDay(habits, date);
    patch.habits = habits;
    autoChecked = true;
  }

  await upsertHabits(patch);
  const after = (await getHabitsForDate(date)) ?? patch;

  if (autoChecked) {
    const history = await getHabitsRange(shiftDays(date, -STREAK_LOOKBACK_DAYS), date);
    const streak = computeStreak('journaling', [...history.filter((d) => d.date !== date), after], date);
    await grant('journaling', dailyHabitXP(streak), date, `${date}:journaling`, xp);
    if (!wasBestDay && isBestDay(after.habits, date)) {
      await grant('perfect_day', perfectDayXP(), date, `${date}:perfect_day`, xp);
    }
  }

  // Daily-reflection XP on the transition from "nothing written" to "something".
  const hadContent = JOURNAL_FIELDS.some((f) => {
    const v = current?.[f];
    return typeof v === 'string' && v.trim() !== '';
  });
  const hasContent = JOURNAL_FIELDS.some((f) => {
    const v = after[f];
    return typeof v === 'string' && v.trim() !== '';
  });
  if (!hadContent && hasContent) {
    await grant('daily_reflection', dailyReflectionXP(), date, `${date}:daily_reflection`, xp);
  }
  if (hadContent && !hasContent) {
    await grant('daily_reflection_missed', dailyReflectionPenalty(), date, `${date}:daily_reflection:penalty`, xp);
  }

  return {
    changed: true,
    journaling_auto_checked: autoChecked,
    day: describeDay(after, date),
    journal: compact({
      grateful_for: after.dankbar,
      intention: after.intention,
      done_well: after.gutGemacht,
      better_tomorrow: after.besserMorgen,
    }),
    xp,
  };
}

export const DAILY_HABIT_KEYS = DAILY_HABITS.map((h) => h.key);
export const WEEKLY_HABIT_KEYS = WEEKLY_HABITS.map((h) => h.key);
export { HABIT_BY_KEY };

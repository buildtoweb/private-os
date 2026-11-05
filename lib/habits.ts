import { appToday } from "./date";

export type Frequency = "daily" | "weekly";
export type HabitCategory = "geist" | "körper" | "disziplin";

export const CATEGORY_META: Record<
  HabitCategory,
  { label: string; color: string; bg: string }
> = {
  // One accent per category, drawn from the four Tactile accents. The tint is
  // used only behind the habit's icon — the row surface itself stays neutral,
  // so eight habits in a column read as one list, not eight coloured cards.
  geist: { label: "Geist", color: "#9aacc4", bg: "rgba(125,147,176,0.10)" },
  körper: { label: "Körper", color: "#9dc4a8", bg: "rgba(123,168,136,0.10)" },
  disziplin: {
    label: "Disziplin",
    color: "#e8a33d",
    bg: "rgba(232,163,61,0.10)",
  },
};

export type HabitDef = {
  key: string;
  label: string;
  iconKey: string;
  color: string;
  bg: string;
  description?: string;
  frequency: Frequency;
  category: HabitCategory;
  target: number;
  notionType: "checkbox" | "counter";
  notionField: string;
  /**
   * ISO date this habit started being tracked. Days before it don't count the
   * habit at all — otherwise adding a habit would retroactively turn every past
   * perfect day into an imperfect one and dent old completion rates.
   */
  since?: string;
};

const c = (cat: HabitCategory) =>
  ({
    color: CATEGORY_META[cat].color,
    bg: CATEGORY_META[cat].bg,
    category: cat,
  }) as const;

export const DAILY_HABITS: HabitDef[] = [
  {
    key: "journaling",
    label: "Journaling",
    iconKey: "journaling",
    ...c("geist"),
    description: "Tägliche Gedanken festhalten",
    frequency: "daily",
    target: 1,
    notionType: "checkbox",
    notionField: "journaling",
  },
  {
    key: "meditation",
    label: "Meditation",
    iconKey: "meditation",
    ...c("geist"),
    description: "10 Minuten",
    frequency: "daily",
    target: 1,
    notionType: "checkbox",
    notionField: "meditation",
  },
  {
    key: "englisch",
    label: "Englisch lernen",
    iconKey: "englisch",
    ...c("geist"),
    description: "Duolingo-Lektion",
    frequency: "daily",
    target: 1,
    notionType: "checkbox",
    notionField: "englisch",
    since: "2026-08-25",
  },
  {
    key: "kreatin",
    label: "Kreatin",
    iconKey: "kreatin",
    ...c("körper"),
    description: "5g pro Tag",
    frequency: "daily",
    target: 1,
    notionType: "checkbox",
    notionField: "kreatin",
  },
  {
    key: "vitamine",
    label: "Vitamine",
    iconKey: "vitamine",
    ...c("körper"),
    description: "Täglich einnehmen",
    frequency: "daily",
    target: 1,
    notionType: "checkbox",
    notionField: "vitamine",
  },
  {
    key: "skincare",
    label: "Skincare",
    iconKey: "skincare",
    ...c("körper"),
    description: "Morgens + abends",
    frequency: "daily",
    target: 1,
    notionType: "checkbox",
    notionField: "skincare",
  },
  {
    key: "noPhone",
    label: "Kein Handy am Morgen",
    iconKey: "noPhone",
    ...c("disziplin"),
    description: "Selbstkontrolle",
    frequency: "daily",
    target: 1,
    notionType: "checkbox",
    notionField: "noPhone",
  },
  {
    key: "noSugar",
    label: "Kein Zucker",
    iconKey: "noSugar",
    ...c("disziplin"),
    description: "Selbstkontrolle",
    frequency: "daily",
    target: 1,
    notionType: "checkbox",
    notionField: "noSugar",
  },
];

export const WEEKLY_HABITS: HabitDef[] = [
  {
    key: "reflexion",
    label: "Reflexion",
    iconKey: "reflexion",
    ...c("geist"),
    description: "1x pro Woche",
    frequency: "weekly",
    target: 1,
    notionType: "checkbox",
    notionField: "reflexion",
  },
  {
    key: "lesen",
    label: "Lesen",
    iconKey: "lesen",
    ...c("geist"),
    description: "1x pro Woche",
    frequency: "weekly",
    target: 1,
    notionType: "checkbox",
    notionField: "lesen",
  },
  {
    key: "gym",
    label: "Gym / Sport",
    iconKey: "gym",
    ...c("körper"),
    description: "3x pro Woche",
    frequency: "weekly",
    target: 3,
    notionType: "counter",
    notionField: "Gym_Week",
  },
  {
    key: "sauna",
    label: "Infrarot Sauna",
    iconKey: "sauna",
    ...c("körper"),
    description: "1x pro Woche",
    frequency: "weekly",
    target: 1,
    notionType: "counter",
    notionField: "Sauna_Week",
  },
];

export const ALL_HABITS = [...DAILY_HABITS, ...WEEKLY_HABITS];
export const HABIT_BY_KEY: Record<string, HabitDef> = Object.fromEntries(
  ALL_HABITS.map((h) => [h.key, h]),
);

/**
 * The daily habits that were being tracked on a given date. Without a date it
 * returns all of them, which is what "right now" always wants.
 */
export function dailyHabitsOn(dateISO?: string): HabitDef[] {
  if (!dateISO) return DAILY_HABITS;
  return DAILY_HABITS.filter((h) => !h.since || dateISO >= h.since);
}

export function isBestDay(
  habits: Record<string, boolean | undefined> = {},
  dateISO?: string,
): boolean {
  return dailyHabitsOn(dateISO).every((h) => !!habits[h.key]);
}

export const MOOD_FACES = [
  { v: 1, emoji: "😞", label: "schlecht", color: "#c97b5a" },
  { v: 2, emoji: "😣", label: "sehr mies", color: "#c97b5a" },
  { v: 3, emoji: "😕", label: "mies", color: "#c97b5a" },
  { v: 4, emoji: "😐", label: "mau", color: "#c97b5a" },
  { v: 5, emoji: "🙂", label: "okay", color: "#e8a33d" },
  { v: 6, emoji: "😊", label: "gut", color: "#e8a33d" },
  { v: 7, emoji: "😃", label: "sehr gut", color: "#7ba888" },
  { v: 8, emoji: "😄", label: "großartig", color: "#7ba888" },
  { v: 9, emoji: "🤩", label: "fantastisch", color: "#7ba888" },
  { v: 10, emoji: "🥳", label: "best day", color: "#9dc4a8" },
];

// Rows fed into the streak/stat helpers. `vacation` days are neutral: they never
// count as done, but they never break a streak either — see isVacationDay.
export type HabitDayRow = {
  date: string;
  habits?: Record<string, boolean | undefined>;
  vacation?: boolean;
};

/** Urlaubsmodus — the day was deliberately not tracked, so it must not count as missed. */
export function isVacationDay(day?: { vacation?: boolean } | null): boolean {
  return !!day?.vacation;
}

export function computeStreak(
  habitKey: string,
  days: HabitDayRow[],
  referenceDate?: string,
): number {
  if (!days?.length) return 0;
  const sorted = [...days].sort((a, b) => b.date.localeCompare(a.date));
  const map = new Map(sorted.map((d) => [d.date, !!d.habits?.[habitKey]]));
  const onVacation = new Set(sorted.filter(isVacationDay).map((d) => d.date));
  const today = appToday();
  const ref = new Date(referenceDate || today);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(ref);
    d.setUTCDate(ref.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    // Today is still open: not done yet means the run continues from yesterday.
    if (i === 0 && iso === today && !map.get(iso)) continue;
    // Vacation days are skipped entirely — the streak bridges across them
    // instead of resetting to zero on a day that was never meant to be tracked.
    if (onVacation.has(iso) && !map.get(iso)) continue;
    if (map.get(iso)) streak++;
    else break;
  }
  return streak;
}

export function computeBestStreak(habitKey: string, days: HabitDayRow[]): number {
  if (!days?.length) return 0;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let best = 0,
    cur = 0,
    prev: Date | null = null;
  for (const d of sorted) {
    const date = new Date(d.date);
    const checked = !!d.habits?.[habitKey];
    // Vacation days neither extend nor break the run: carry `cur` over and move
    // `prev` along so the day after the trip still chains onto the day before it.
    if (!checked && isVacationDay(d)) {
      if (prev) prev = date;
      continue;
    }
    if (!checked) {
      cur = 0;
      prev = null;
      continue;
    }
    if (prev && date.getTime() - prev.getTime() === 86400_000) cur++;
    else cur = 1;
    best = Math.max(best, cur);
    prev = date;
  }
  return best;
}

// ─── Weekly habits ────────────────────────────────────────────
// Weekly values (gym/sauna counters, the reflexion/lesen checkboxes) are week-level
// facts stored redundantly on every day of the ISO week — see
// setWeeklyValuesAcrossWeek. Counting raw day rows over a longer range
// therefore multiplies each week by up to 7 and compares it against a per-week
// target, which is how "Reflexion 9 / 1" happened. Everything below aggregates
// per ISO week first, so a month reads as "4 / 5 Wochen".

/** The day field a weekly counter habit is stored in, or null for checkbox habits. */
export function weeklyCounterField(habit: HabitDef): "gymWeek" | "saunaWeek" | null {
  if (habit.notionField === "Gym_Week") return "gymWeek";
  if (habit.notionField === "Sauna_Week") return "saunaWeek";
  return null;
}

/** ISO-8601 week key, e.g. "2026-W33". The ISO year can differ from the calendar year. */
export function isoWeekKey(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  // The Thursday of a week determines both its ISO year and its week number.
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7) + 3);
  const isoYear = dt.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  firstThursday.setUTCDate(
    firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3,
  );
  const week = 1 + Math.round((dt.getTime() - firstThursday.getTime()) / (7 * 86400_000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** The Thursday of the ISO week containing `dateISO`, as YYYY-MM-DD. */
export function thursdayOfWeek(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7) + 3);
  return dt.toISOString().slice(0, 10);
}

export type WeeklyDayData = {
  habits?: Record<string, boolean | undefined>;
  vacation?: boolean;
  gymWeek?: number;
  saunaWeek?: number;
};

export type WeeklyWeek = {
  key: string;
  /** Dates of this ISO week that fall inside the visible range (1–7 of them). */
  dates: string[];
  value: number;
  target: number;
  met: boolean;
  /** Not counted either way — the whole week was vacation, or the habit was paused. */
  skipped: boolean;
};

/**
 * Split a date range into ISO weeks and resolve one value per week for a weekly habit.
 *
 * Weeks fully covered by vacation, or falling in a month the habit is paused for,
 * come back as `skipped` so they drag neither the numerator nor the denominator.
 */
export function weeklyWeeks(
  habit: HabitDef,
  dayList: string[],
  dayMap: Map<string, WeeklyDayData>,
  pausedMonths?: Set<string>,
  todayISO?: string,
): WeeklyWeek[] {
  const field = weeklyCounterField(habit);
  const buckets = new Map<string, string[]>();
  for (const date of dayList) {
    const key = isoWeekKey(date);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(date);
    else buckets.set(key, [date]);
  }

  // A week belongs to whichever period contains its Thursday — the same rule ISO
  // uses to assign a week to a year. Without it, the weeks straddling the first
  // and last of a month would be counted once in each month.
  const first = dayList[0];
  const last = dayList[dayList.length - 1];
  const owned = ([, dates]: [string, string[]]) => {
    const thursday = thursdayOfWeek(dates[0]);
    return thursday >= first && thursday <= last;
  };

  return [...buckets].filter(owned).map(([key, dates]) => {
    const value = field
      ? Math.max(0, ...dates.map((d) => Number(dayMap.get(d)?.[field]) || 0))
      : dates.some((d) => !!dayMap.get(d)?.habits?.[habit.key])
        ? 1
        : 0;
    const allVacation = dates.every((d) => isVacationDay(dayMap.get(d)));
    // A week straddling two months only counts as paused if every day of it
    // sits in a paused month — in month view that is always the case.
    const allPaused =
      !!pausedMonths?.size && dates.every((d) => pausedMonths.has(d.slice(0, 7)));
    // A week that hasn't started yet can't be "missed". Without this, the second
    // half of the current month drags the ratio down before it has happened.
    const future = !!todayISO && dates[0] > todayISO;
    return {
      key,
      dates,
      value,
      target: habit.target,
      met: value >= habit.target,
      skipped: allVacation || allPaused || future,
    };
  });
}

/** Weeks that actually counted, and how many of them hit the target. */
export function weeklySummary(weeks: WeeklyWeek[]): { met: number; counted: number } {
  const counted = weeks.filter((w) => !w.skipped);
  return { met: counted.filter((w) => w.met).length, counted: counted.length };
}

export const FRIENDLY_DATE = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

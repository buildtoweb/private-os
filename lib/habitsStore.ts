// Habit day storage — self-hosted Supabase (`private.habits`, doc_id = date,
// data jsonb). Server-only: pulls in lib/db.ts (node:crypto), so it must never
// be imported by a client component. Client-safe habit metadata (HABIT_KEYS,
// labels, the HabitDay type) lives in lib/notion.ts.
//
// Migrated off Notion 2026-07-09; Notion "Habits" DB is kept as a backup only.
import { db } from './db';
import type { HabitDay } from './notion';

const HABITS = 'habits';

function snapToDay(id: string, d: Record<string, any> | undefined): HabitDay {
  const data = d || {};
  return {
    id,
    date: data.date || id,
    mood: data.mood,
    habits: data.habits || {},
    gymWeek: data.gymWeek,
    saunaWeek: data.saunaWeek,
    schritte: data.schritte,
    gewicht: data.gewicht,
    aktiveKalorien: data.aktiveKalorien,
    notiz: data.notiz,
    vacation: data.vacation,
    vacationLabel: data.vacationLabel,
    dankbar: data.dankbar,
    intention: data.intention,
    gutGemacht: data.gutGemacht,
    besserMorgen: data.besserMorgen,
  };
}

// ─── Habit settings (paused months) ───────────────────────────
// Stored as a single document in the same table under a non-date id. Every day
// query filters on `data->>date`, which is NULL here, so this row is invisible
// to getHabitsRange and needs no separate table (the self-hosted Supabase takes
// DDL only through the Studio endpoint, which the app has no credentials for).
const SETTINGS_DOC = '_settings';

/** month keys ("2026-08") a habit is paused for, keyed by habit key. */
export type HabitSettings = { pausedMonths: Record<string, string[]> };

export async function getHabitSettings(): Promise<HabitSettings> {
  const snap = await db().collection(HABITS).doc(SETTINGS_DOC).get();
  const raw = snap.exists ? snap.data()! : {};
  const pausedMonths: Record<string, string[]> = {};
  for (const [habit, months] of Object.entries(raw.pausedMonths || {})) {
    if (Array.isArray(months)) pausedMonths[habit] = months.filter((m) => typeof m === 'string');
  }
  return { pausedMonths };
}

/** Pause or resume one habit for one calendar month ("2026-08"). */
export async function setHabitPause(
  habitKey: string,
  month: string,
  paused: boolean,
): Promise<HabitSettings> {
  const current = await getHabitSettings();
  const months = new Set(current.pausedMonths[habitKey] || []);
  if (paused) months.add(month);
  else months.delete(month);

  const pausedMonths = { ...current.pausedMonths };
  if (months.size) pausedMonths[habitKey] = [...months].sort();
  else delete pausedMonths[habitKey];

  const ref = db().collection(HABITS).doc(SETTINGS_DOC);
  // Drop the document entirely once nothing is paused, so an empty settings row
  // doesn't linger in a table that is otherwise one-row-per-day.
  if (Object.keys(pausedMonths).length === 0) await ref.delete();
  else await ref.set({ pausedMonths });
  return { pausedMonths };
}

export async function getHabitsRange(startISO: string, endISO: string): Promise<HabitDay[]> {
  const snap = await db()
    .collection(HABITS)
    .where('date', '>=', startISO)
    .where('date', '<=', endISO)
    .orderBy('date', 'asc')
    .get();
  return snap.docs.map((s) => snapToDay(s.id, s.data()));
}

export async function getHabitsForDate(dateISO: string): Promise<HabitDay | null> {
  const snap = await db().collection(HABITS).doc(dateISO).get();
  return snap.exists ? snapToDay(snap.id, snap.data()) : null;
}

// Field-level merge: only the fields present on `day` are written; everything
// else (including untouched habit checkboxes) is preserved. Mirrors the old
// Notion upsert semantics so partial writes (e.g. health-sync, weekly counters)
// never clobber a day's other data.
export async function upsertHabits(day: HabitDay) {
  const ref = db().collection(HABITS).doc(day.date);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data()! : {};

  const habits: Record<string, boolean> = { ...(existing.habits || {}) };
  if (day.habits) {
    for (const [k, v] of Object.entries(day.habits)) {
      if (v != null) habits[k] = !!v;
    }
  }

  const data: Record<string, any> = { ...existing, date: day.date, habits };
  const numFields = ['mood', 'gymWeek', 'saunaWeek', 'schritte', 'gewicht', 'aktiveKalorien'] as const;
  const textFields = ['notiz', 'dankbar', 'intention', 'gutGemacht', 'besserMorgen', 'vacationLabel'] as const;
  for (const f of numFields) if (day[f] != null) data[f] = day[f];
  for (const f of textFields) if (day[f] != null) data[f] = day[f];
  if (day.vacation != null) data.vacation = day.vacation;

  await ref.set(data);
  return { id: day.date };
}

// The 7 ISO-week dates (Monday … Sunday) containing the given date.
export function isoWeekDates(anchorISO: string): string[] {
  const [y, m, d] = anchorISO.split('-').map(Number);
  const base = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const dow = (base.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday);
    dt.setUTCDate(monday.getUTCDate() + i);
    return dt.toISOString().slice(0, 10);
  });
}

// The weekly habits stored as a checkbox in `habits` rather than a counter column.
export const WEEKLY_CHECKBOX_KEYS = ['reflexion', 'lesen'] as const;
export type WeeklyValues = {
  gymWeek?: number;
  saunaWeek?: number;
} & Partial<Record<(typeof WEEKLY_CHECKBOX_KEYS)[number], boolean>>;

// Weekly habits are week-level facts. Persist the value onto EVERY day of the
// ISO week so the data has no gaps — external readers can read any day of the
// week and see the weekly count / status unambiguously. Only the provided
// fields are written; other per-day fields are preserved.
export async function setWeeklyValuesAcrossWeek(
  anchorISO: string,
  values: WeeklyValues,
): Promise<string[]> {
  const dates = isoWeekDates(anchorISO);
  await Promise.all(
    dates.map((date) =>
      upsertHabits({
        date,
        habits: Object.fromEntries(
          WEEKLY_CHECKBOX_KEYS.filter((k) => values[k] != null).map((k) => [k, values[k]]),
        ),
        ...(values.gymWeek != null ? { gymWeek: values.gymWeek } : {}),
        ...(values.saunaWeek != null ? { saunaWeek: values.saunaWeek } : {}),
      }),
    ),
  );
  return dates;
}

// ─── Urlaubsmodus ──────────────────────────────────────────────
// A vacation day is a day that was deliberately not tracked. It is stored
// explicitly (`vacation: true`) rather than left absent, so readers can tell
// "on holiday" apart from "forgot to track" — the latter counts as missed.

/** Every ISO date from start to end, inclusive. Order is ascending. */
export function isoDateRange(startISO: string, endISO: string): string[] {
  const [ys, ms, ds] = startISO.split('-').map(Number);
  const cur = new Date(Date.UTC(ys, (ms || 1) - 1, ds || 1));
  const out: string[] = [];
  // Bounded so a swapped/garbage range can never spin forever.
  for (let i = 0; i < 366 && cur.toISOString().slice(0, 10) <= endISO; i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// A row that carries nothing but its own date/empty habits is noise — it only
// exists as a side effect of an earlier write (e.g. a weekly counter spread
// across the ISO week). Used to decide whether clearing vacation should delete
// the row outright instead of leaving an empty husk behind.
function isEmptyDay(data: Record<string, any>): boolean {
  const habitsOn = Object.values(data.habits || {}).some((v) => !!v);
  if (habitsOn) return false;
  const meaningful = [
    'mood', 'gymWeek', 'saunaWeek', 'schritte', 'gewicht', 'aktiveKalorien',
    'notiz', 'dankbar', 'intention', 'gutGemacht', 'besserMorgen',
  ];
  return !meaningful.some((f) => data[f] != null && data[f] !== '' && data[f] !== 0);
}

/**
 * Mark (or unmark) every day in [startISO, endISO] as vacation.
 *
 * Setting it never touches a day's other data. Clearing it removes the flag and
 * — if nothing else is left on the row — deletes the row, so toggling vacation
 * on and off leaves the table exactly as it was.
 */
export async function setVacationRange(
  startISO: string,
  endISO: string,
  on: boolean,
  label?: string,
): Promise<{ dates: string[]; removed: string[] }> {
  const dates = isoDateRange(startISO, endISO);
  const removed: string[] = [];

  for (const date of dates) {
    const ref = db().collection(HABITS).doc(date);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data()! : {};

    if (on) {
      const data: Record<string, any> = {
        ...existing,
        date,
        habits: existing.habits || {},
        vacation: true,
      };
      if (label != null) {
        if (label.trim()) data.vacationLabel = label.trim();
        else delete data.vacationLabel;
      }
      await ref.set(data);
      continue;
    }

    if (!snap.exists) continue; // nothing to clear — don't create a row
    const data = { ...existing };
    delete data.vacation;
    delete data.vacationLabel;
    if (isEmptyDay(data)) {
      await ref.delete();
      removed.push(date);
    } else {
      await ref.set(data);
    }
  }

  return { dates, removed };
}

// Increment a numeric counter on a habits row (gym/sauna weekly count).
export async function bumpCounter(dateISO: string, field: 'Gym_Week' | 'Sauna_Week', delta: number) {
  const existing = await getHabitsForDate(dateISO);
  const key = field === 'Gym_Week' ? 'gymWeek' : 'saunaWeek';
  const cur = (existing as any)?.[key] || 0;
  const next = Math.max(0, cur + delta);
  const day: HabitDay = { date: dateISO, habits: existing?.habits || {} };
  if (field === 'Gym_Week') day.gymWeek = next;
  else day.saunaWeek = next;
  await upsertHabits(day);
  return next;
}

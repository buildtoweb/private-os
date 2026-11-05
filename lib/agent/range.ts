// Date-parameter handling. Every endpoint speaks the same two dialects:
//
//   ?date=YYYY-MM-DD          → a single day
//   ?from=YYYY-MM-DD&to=...   → an inclusive range
//
// All dates are calendar days in Europe/Vienna (lib/date.ts is the single source
// of truth for "today"), so an agent asking at 00:30 Vienna time gets the day the
// user would call today, not the UTC one.
import { appToday } from '@/lib/date';
import { AgentError } from './envelope';

/** Hard ceiling on a range, matched to isoDateRange()'s own 366-day bound. */
export const MAX_RANGE_DAYS = 366;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDate(value: string, param: string): string {
  if (!ISO_DATE.test(value)) {
    throw new AgentError('invalid_date', `"${param}" muss das Format YYYY-MM-DD haben.`, 400);
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new AgentError('invalid_date', `"${param}" ist kein gültiges Datum: ${value}`, 400);
  }
  return value;
}

/** Shift an ISO date by whole days. Anchored at noon UTC so DST can't move the day. */
export function shiftDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysInclusive(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T12:00:00Z`).getTime();
  const b = new Date(`${toISO}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export type DateRange = {
  /** The day the answer is "about" — the anchor for streaks, snapshots, comparisons. */
  date: string;
  from: string;
  to: string;
  days: number;
  /** True when the caller pinned the anchor with ?date=, rather than defaulting to today. */
  explicitDate: boolean;
  /** True when the anchor is the actual current day in Europe/Vienna. */
  isToday: boolean;
};

/**
 * Resolve ?date / ?from / ?to into a range.
 *
 *   date only   → that single day
 *   from + to   → that range, anchored on `to`
 *   from only   → from … today
 *   to only     → the `defaultDays` window ending on `to`
 *   nothing     → the `defaultDays` window ending today
 */
export function resolveRange(params: URLSearchParams, defaultDays = 30): DateRange {
  const today = appToday();
  const rawDate = params.get('date');
  const rawFrom = params.get('from');
  const rawTo = params.get('to');

  if (rawDate && (rawFrom || rawTo)) {
    throw new AgentError('conflicting_params', '"date" kann nicht zusammen mit "from"/"to" verwendet werden.', 400);
  }

  let date: string;
  let from: string;
  let to: string;

  if (rawDate) {
    date = parseDate(rawDate, 'date');
    from = date;
    to = date;
  } else if (rawFrom || rawTo) {
    to = rawTo ? parseDate(rawTo, 'to') : today;
    from = rawFrom ? parseDate(rawFrom, 'from') : shiftDays(to, -(defaultDays - 1));
    date = to;
  } else {
    date = today;
    to = today;
    from = shiftDays(today, -(defaultDays - 1));
  }

  if (from > to) {
    throw new AgentError('invalid_range', '"from" liegt nach "to".', 400);
  }
  const days = daysInclusive(from, to);
  if (days > MAX_RANGE_DAYS) {
    throw new AgentError('range_too_large', `Der Zeitraum umfasst ${days} Tage, erlaubt sind maximal ${MAX_RANGE_DAYS}.`, 400);
  }

  return { date, from, to, days, explicitDate: !!rawDate, isToday: date === today };
}

/** The equally long window immediately before a range — the basis for every "vs. Vorperiode". */
export function previousPeriod(range: DateRange): { from: string; to: string; days: number } {
  const to = shiftDays(range.from, -1);
  const from = shiftDays(to, -(range.days - 1));
  return { from, to, days: range.days };
}

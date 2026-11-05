// Payment-schedule math — pure, no I/O, so it can be reasoned about and tested
// on its own.
//
// The central idea: Notion's "Verlängerung" is treated as an *anchor*, not as
// "the next payment". Rows go stale the moment a renewal passes (Whoop still
// says 2025-04-02), so instead of asking the user to keep dates current we roll
// the anchor forward by the interval until it lands on or after today. A yearly
// subscription anchored in 2025 therefore still produces a correct 2027 due
// date without anyone touching Notion.

import {
  INTERVAL_MONTHS,
  type Interval,
  type Subscription,
  type UpcomingPayment,
  type FixedCostTotals,
} from './types';

const DAY_MS = 86_400_000;

export function parseIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today at UTC midnight — the dashboard is single-timezone (Europe/Vienna) and
 *  all dates involved are whole days, so UTC-normalising avoids DST drift. */
export function startOfToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Add whole months, clamping the day to the target month's length so a
 *  31st-of-the-month anchor doesn't skip February. */
function addMonths(base: Date, months: number): Date {
  const total = base.getUTCMonth() + months;
  const year = base.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(base.getUTCDate(), lastDay)));
}

/**
 * The next charge on or after `today`, rolled forward from `anchor`.
 * Returns null when there is no anchor date to roll from.
 */
export function nextDueDate(
  anchor: string | null,
  interval: Interval,
  today: Date = startOfToday(),
): string | null {
  const start = parseIsoDate(anchor);
  if (!start) return null;

  const step = INTERVAL_MONTHS[interval] ?? 12;
  // Jump straight to the neighbourhood of today instead of stepping one
  // interval at a time from a possibly years-old anchor…
  const monthsApart =
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (today.getUTCMonth() - start.getUTCMonth());
  let k = Math.max(0, Math.floor(monthsApart / step));
  let due = addMonths(start, k * step);
  // …then correct the day-of-month boundary. Bounded: at most a couple of steps.
  let guard = 0;
  while (due.getTime() < today.getTime() && guard++ < 64) {
    k += 1;
    due = addMonths(start, k * step);
  }
  return toIsoDate(due);
}

export function daysBetween(from: Date, toIso: string): number {
  const to = parseIsoDate(toIso);
  if (!to) return Number.POSITIVE_INFINITY;
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** Active subscriptions with a resolvable schedule, soonest charge first. */
export function buildUpcoming(
  subs: Subscription[],
  today: Date = startOfToday(),
): UpcomingPayment[] {
  const out: UpcomingPayment[] = [];
  for (const s of subs) {
    if (s.status === 'Inaktiv') continue;
    const dueDate = nextDueDate(s.anchor, s.interval, today);
    if (!dueDate) continue;
    out.push({ ...s, dueDate, daysUntil: daysBetween(today, dueDate) });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount);
}

/**
 * Payments that should be pushed to Telegram right now: charged within the next
 * `leadDays` days (today included) and at or above `minAmount`.
 *
 * The threshold is on the *charge*, not on the yearly total — the point is the
 * money that actually leaves the account in one go, so a €320 car payment
 * qualifies while €7.49 of YouTube Premium never does.
 */
export function selectDuePayments(
  upcoming: UpcomingPayment[],
  opts: { leadDays: number; minAmount: number },
): UpcomingPayment[] {
  return upcoming.filter(
    (p) => p.daysUntil >= 0 && p.daysUntil <= opts.leadDays && p.amount >= opts.minAmount,
  );
}

export function computeTotals(subs: Subscription[]): FixedCostTotals {
  const active = subs.filter((s) => s.status !== 'Inaktiv');
  const sumWhere = (i: Interval) =>
    active.filter((s) => s.interval === i).reduce((n, s) => n + s.amount, 0);

  const perYearEur = active.reduce((n, s) => n + s.yearlyEur, 0);

  const catMap = new Map<string, { perYearEur: number; count: number }>();
  for (const s of active) {
    const cur = catMap.get(s.category) || { perYearEur: 0, count: 0 };
    cur.perYearEur += s.yearlyEur;
    cur.count += 1;
    catMap.set(s.category, cur);
  }

  return {
    perYearEur,
    perMonthEur: perYearEur / 12,
    monthlyEur: sumWhere('Monatlich'),
    quarterlyEur: sumWhere('Quartalsweise'),
    yearlyEur: sumWhere('Jährlich'),
    byCategory: [...catMap.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.perYearEur - a.perYearEur),
  };
}

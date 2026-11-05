import { appToday } from './date';

// How old (in days, relative to "today" in the app timezone) a WHOOP daily row
// may be and still count as the *current* snapshot. WHOOP recovery for the
// current cycle is normally written to today's date, but it can briefly lag a
// day (e.g. before this morning's sleep is scored), so a small buffer is fine.
// Anything older means sync has stalled — and a stale value must never be shown
// as if it were today's.
export const MAX_CURRENT_STALE_DAYS = 2;

/** Earliest date (inclusive, `YYYY-MM-DD`) that still counts as "current". */
export function currentDailyCutoffISO(maxStaleDays = MAX_CURRENT_STALE_DAYS): string {
  // Anchor at noon UTC so day arithmetic never lands on a DST seam.
  const d = new Date(`${appToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - maxStaleDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Merge the most recent daily rows into a single "current" snapshot.
 *
 * Rows older than the staleness cutoff are dropped before merging, so a value
 * is never carried forward indefinitely. When the WHOOP pipeline stalls (e.g. a
 * dead OAuth token), this returns `null` instead of presenting week-old recovery
 * as today's — showing no data is correct, showing wrong data is not.
 *
 * `days` is expected in ascending date order (oldest → newest).
 */
export function mergeCurrentDaily<T extends { date: string }>(
  days: T[],
  maxStaleDays = MAX_CURRENT_STALE_DAYS,
): T | null {
  if (!days.length) return null;
  const cutoff = currentDailyCutoffISO(maxStaleDays);
  const fresh = days.filter(d => d.date >= cutoff);
  if (!fresh.length) return null;
  // Today's row often holds only strain, while recovery/sleep may be the prior
  // day's — merging the newest few (all still within the freshness window)
  // surfaces the latest value per field without reaching back into stale data.
  const recent = fresh.slice(-3);
  return recent.reduce((merged, day) => ({ ...merged, ...day }), { ...recent[recent.length - 1] });
}

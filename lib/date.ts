// Single source of truth for "today" across client and server.
//
// `new Date().toISOString().slice(0, 10)` returns the UTC date, which on the
// server (Vercel runs in UTC) and around midnight on the client disagrees with
// the user's actual calendar day. Everything here is anchored to the app's
// timezone so a habit toggled at 00:30 Vienna time lands on the right day.
export const APP_TIMEZONE = 'Europe/Vienna';

/**
 * The day turns over at 01:00, not at midnight: a habit checked or a to-do done
 * at 00:40 before bed still belongs to the evening it was part of.
 */
export const DAY_START_HOUR = 1;

/** Current app day as YYYY-MM-DD in the app timezone (works identically on client and server). */
export function appToday(timeZone: string = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() - DAY_START_HOUR * 60 * 60 * 1000));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

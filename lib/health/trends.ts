import type { WhoopDaily } from '../db';
import type { DayPoint } from './analysis';

export type TrendMonth = {
  month: string;
  hrv: number | null;
  rhf: number | null;
  rec: number | null;
  days: number;
};

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const mean = (values: number[]) => values.length
  ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10
  : null;

// Imported daily rows stop at the export date. Only append newer live rows, so
// overlapping syncs cannot count a day twice or rewrite the historical report.
export function buildCombinedTrend(imported: DayPoint[], live: WhoopDaily[], importThrough: string) {
  const byDate = new Map<string, DayPoint>(imported.map(day => [day.d, day]));
  for (const day of live) {
    if (day.date <= importThrough || ![day.hrv, day.rhr, day.recovery].some(isNumber)) continue;
    byDate.set(day.date, {
      d: day.date,
      hrv: isNumber(day.hrv) ? day.hrv : null,
      rhf: isNumber(day.rhr) ? day.rhr : null,
      rec: isNumber(day.recovery) ? day.recovery : null,
    });
  }
  const ordered = [...byDate.values()].sort((a, b) => a.d.localeCompare(b.d));
  const grouped = new Map<string, DayPoint[]>();
  for (const day of ordered) {
    const month = day.d.slice(0, 7);
    grouped.set(month, [...(grouped.get(month) ?? []), day]);
  }
  const monthly: TrendMonth[] = [...grouped.entries()].map(([month, days]) => ({
    month,
    hrv: mean(days.map(day => day.hrv).filter(isNumber)),
    rhf: mean(days.map(day => day.rhf).filter(isNumber)),
    rec: mean(days.map(day => day.rec).filter(isNumber)),
    days: days.length,
  }));
  const liveDays = ordered.filter(day => day.d > importThrough).length;
  return { monthly, through: ordered.at(-1)?.d ?? importThrough, liveDays };
}

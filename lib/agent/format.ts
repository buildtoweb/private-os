// Value shaping for the Agent Context API.
//
// House rules, applied everywhere:
//   - numbers are numbers, never strings
//   - a field named *_pct carries a human percentage (12.3 means 12.3 %), even
//     where the dashboard stores a 0..1 fraction internally
//   - amounts are named *_eur and sit next to a `currency` field
//   - fields with nothing to say are dropped rather than sent as null
import { AGENT_SOURCE } from './envelope';

export const CURRENCY = 'EUR';

export function round(n: number | null | undefined, digits = 1): number | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** 0..1 fraction → percentage. `0.4237` → `42.4`. */
export function fractionToPct(fraction: number | null | undefined, digits = 1): number | undefined {
  if (fraction == null || !Number.isFinite(fraction)) return undefined;
  return round(fraction * 100, digits);
}

/** part / whole as a percentage. Returns undefined rather than dividing by zero. */
export function ratioPct(part: number, whole: number, digits = 1): number | undefined {
  if (!whole) return undefined;
  return round((part / whole) * 100, digits);
}

export function average(values: (number | null | undefined)[], digits = 1): number | undefined {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!nums.length) return undefined;
  return round(nums.reduce((a, b) => a + b, 0) / nums.length, digits);
}

export function sum(values: (number | null | undefined)[], digits = 2): number {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  return round(nums.reduce((a, b) => a + b, 0), digits) ?? 0;
}

export type Direction = 'up' | 'down' | 'stable';

/** A comparison the agent doesn't have to compute: current, previous, delta, direction. */
export type Comparison = {
  current?: number;
  previous?: number;
  delta?: number;
  delta_pct?: number;
  direction?: Direction;
};

export function compare(
  current: number | null | undefined,
  previous: number | null | undefined,
  digits = 1,
  /** Below this absolute delta the change counts as "stable" rather than noise. */
  stableBelow = 0,
): Comparison | undefined {
  const cur = current != null && Number.isFinite(current) ? current : undefined;
  const prev = previous != null && Number.isFinite(previous) ? previous : undefined;
  if (cur == null && prev == null) return undefined;
  if (cur == null || prev == null) return compact({ current: round(cur, digits), previous: round(prev, digits) });
  const delta = cur - prev;
  return compact({
    current: round(cur, digits),
    previous: round(prev, digits),
    delta: round(delta, digits),
    delta_pct: prev !== 0 ? round((delta / Math.abs(prev)) * 100, 1) : undefined,
    direction: (Math.abs(delta) <= stableBelow ? 'stable' : delta > 0 ? 'up' : 'down') as Direction,
  });
}

/** A number as German prose: decimal comma, thousands dot. For `summary` text only —
 *  the data fields themselves always stay raw JSON numbers. */
export function de(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '–';
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(n);
}

/** "1 perfekter Tag" / "3 perfekte Tage" — German needs the count and the form together. */
export function plural(count: number, one: string, many: string): string {
  return `${de(count, 0)} ${count === 1 ? one : many}`;
}

/** German weekday + long date, e.g. "Donnerstag, 27. August 2026". */
export function germanDate(dateISO: string): string {
  return new Date(`${dateISO}T12:00:00Z`).toLocaleDateString('de-DE', {
    timeZone: 'UTC',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function formatEur(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '–';
  return new Intl.NumberFormat('de-AT', {
    style: 'currency', currency: CURRENCY, maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Drop empty values recursively: undefined, null, empty strings, empty arrays
 * and empty objects. `false` and `0` are real answers and always survive.
 */
export function compact<T>(value: T): T {
  return strip(value) as T;
}

function strip(value: any): any {
  if (Array.isArray(value)) {
    const out = value.map(strip).filter((v) => v !== undefined);
    return out;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = strip(v);
      if (cleaned === undefined || cleaned === null) continue;
      if (typeof cleaned === 'string' && cleaned.trim() === '') continue;
      if (Array.isArray(cleaned) && cleaned.length === 0) continue;
      if (
        cleaned && typeof cleaned === 'object' &&
        !Array.isArray(cleaned) && Object.keys(cleaned).length === 0
      ) continue;
      out[k] = cleaned;
    }
    return out;
  }
  return value;
}

/** Join sentence fragments into the one-paragraph German `summary` each domain carries. */
export function sentences(...parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).join(' ');
}

export const SOURCE_NAME = AGENT_SOURCE;

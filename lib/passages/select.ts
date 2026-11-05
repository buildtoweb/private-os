// Which passage a given day gets.
//
// Requirements this satisfies:
//   - stable: the same date always yields the same passage, on every device and
//     across reloads, with no stored state
//   - gap-free: the whole corpus is consumed before anything repeats
//   - non-degenerate: the order is not simply "passage 1, passage 2, …", so
//     consecutive days aren't consecutive pages of the book
//
// A per-year seeded shuffle gives all three. Adding passages later changes the
// ordering of future days but never breaks a past day's lookup, because nothing
// is persisted — the date alone determines the answer.
import type { Passage } from './types';

/** xorshift32 — deterministic, no dependency, good enough to shuffle a few hundred items. */
function rng(seed: number): () => number {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 0xffffffff) / 0xffffffff;
  };
}

function shuffledIndices(count: number, seed: number): number[] {
  const out = Array.from({ length: count }, (_, i) => i);
  const rand = rng(seed);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function dayOfYear(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  const start = Date.UTC(y, 0, 1);
  const day = Date.UTC(y, (m || 1) - 1, d || 1);
  return Math.floor((day - start) / 86400000);
}

export function selectPassage(passages: Passage[], dateISO: string): Passage | null {
  if (!passages.length) return null;
  const year = Number(dateISO.slice(0, 4));
  const order = shuffledIndices(passages.length, year);
  return passages[order[dayOfYear(dateISO) % passages.length]];
}

/** ~200 wpm, floored at one minute — the card promises a minute of reading. */
export function readMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

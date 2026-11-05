// Passage source registry.
//
// SERVER-ONLY BY CONVENTION. The corpus is ~500 KB once the real book is
// imported (both languages), so it must never reach the browser — it is read in
// app/api/passage/route.ts and only the selected passage crosses the wire.
//
// Adding the second book is one JSON file plus one line in SOURCES.
import corpus from './sample.json';
import type { PassageCorpus } from './types';

const thinkAndGrowRich = corpus as unknown as PassageCorpus & { seed?: boolean };

export const SOURCES: (PassageCorpus & { seed?: boolean })[] = [
  thinkAndGrowRich,
  // hossUndHopf — see the copyright note in the plan before importing a
  // contemporary book: full-text chunking is only appropriate for the
  // public-domain 1937 Hill text.
];

export function primarySource() {
  return SOURCES[0];
}

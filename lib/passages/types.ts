// Client-safe types for the daily passage. No db/supabase imports.

export type Passage = {
  id: string;
  chapter: number;
  chapterTitle: string;
  en: string;
  de: string;
  words: number;
};

export type PassageSource = {
  id: string;
  title: string;
  author: string;
  year: number;
  license: string;
  /** Where the text was sourced from, so the build stays reproducible. */
  origin?: string;
};

export type PassageCorpus = {
  source: PassageSource;
  passages: Passage[];
};

/** What GET /api/passage returns. */
export type DailyPassage = {
  passage: Passage;
  source: PassageSource;
  readMinutes: number;
  log: PassageLog | null;
  /** True while the corpus is still the seed — i.e. the book hasn't been imported. */
  seed: boolean;
};

/** One row of private.passage_log. doc_id === date. */
export type PassageLog = {
  date: string;
  passageId: string;
  sourceId: string;
  read: boolean;
  favorite: boolean;
  readAt: string | null;
};

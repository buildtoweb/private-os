// Reflexionen — the Notion journal (Tag / Woche / Monat) plus the four
// daily reflection fields that live on the habits rows.
import { getReflectEntriesPage, type ReflectEntry, type ReflectType } from '@/lib/notion';
import { getHabitsRange } from '@/lib/habitsStore';
import type { Warnings } from '../envelope';
import type { DateRange } from '../range';
import { compact, sentences } from '../format';

/** Notion pages are fetched with their full body text; keep the page count sane. */
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export async function buildReflections(
  range: DateRange,
  warn: Warnings,
  opts: { limit?: number; type?: ReflectType; includeText?: boolean } = {},
) {
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT));

  const [page, days] = await Promise.all([
    warn.guard('reflections.notion', () => getReflectEntriesPage({
      pageSize: limit, type: opts.type, from: range.from, to: range.to,
    }), { entries: [] as ReflectEntry[], hasMore: false, nextCursor: undefined as string | undefined }),
    warn.guard('reflections.daily', () => getHabitsRange(range.from, range.to), [] as Awaited<ReturnType<typeof getHabitsRange>>),
  ]);

  const daily = days
    .filter((d) => d.dankbar || d.intention || d.gutGemacht || d.besserMorgen || d.notiz)
    .map((d) => compact({
      date: d.date,
      grateful_for: d.dankbar,
      intention: d.intention,
      done_well: d.gutGemacht,
      better_tomorrow: d.besserMorgen,
      note: d.notiz,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const entries = page.entries.map((e) => compact({
    date: e.date,
    title: e.title,
    type: e.type,
    period: e.period,
    text: opts.includeText === false ? undefined : e.text,
  }));

  const latestDaily = daily[0];

  return compact({
    range: { from: range.from, to: range.to, days: range.days },
    entries,
    has_more: page.hasMore,
    daily_journal: daily,
    counts: {
      entries: entries.length,
      daily_journal_days: daily.length,
    },
    summary: sentences(
      entries.length
        ? `${entries.length} Reflexions-Einträge im Zeitraum, zuletzt "${entries[0].title}" vom ${entries[0].date}.`
        : 'Keine Reflexions-Einträge im Zeitraum.',
      latestDaily
        ? `Letztes Tages-Journal vom ${latestDaily.date}${latestDaily.intention ? `, Intention: „${truncate(latestDaily.intention, 120)}"` : ''}.`
        : 'Kein Tages-Journal im Zeitraum.',
    ),
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

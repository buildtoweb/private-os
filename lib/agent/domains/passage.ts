// Tagespassage — the deterministic daily reading plus whether it was read today.
import { primarySource } from '@/lib/passages';
import { selectPassage, readMinutes } from '@/lib/passages/select';
import { getPassageLog } from '@/lib/passagesStore';
import type { PassageLog } from '@/lib/passages/types';
import type { Warnings } from '../envelope';
import type { DateRange } from '../range';
import { compact, sentences } from '../format';

export async function buildPassage(range: DateRange, warn: Warnings) {
  const corpus = primarySource();
  const passage = selectPassage(corpus.passages, range.date);
  if (!passage) {
    warn.add('passage.corpus', 'Der Passagen-Korpus ist leer.');
    return compact({ date: range.date, available: false, summary: 'Keine Tagespassage verfügbar.' });
  }

  const log = await warn.guard<PassageLog | null>('passage.log', () => getPassageLog(range.date), null);

  return compact({
    date: range.date,
    available: true,
    book: { title: corpus.source.title, author: corpus.source.author, year: corpus.source.year },
    chapter: passage.chapterTitle,
    chapter_number: passage.chapter,
    text_de: passage.de,
    text_en: passage.en,
    words: passage.words,
    read_minutes: readMinutes(passage.words),
    read: !!log?.read,
    favorite: !!log?.favorite,
    read_at: log?.readAt ?? undefined,
    summary: sentences(
      `Tagespassage für ${range.date} aus "${corpus.source.title}", Kapitel ${passage.chapter}: ${passage.chapterTitle} (${readMinutes(passage.words)} Min. Lesezeit).`,
      log?.read ? 'Bereits gelesen.' : 'Noch nicht gelesen.',
    ),
  });
}

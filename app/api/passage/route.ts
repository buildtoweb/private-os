import { NextRequest, NextResponse } from 'next/server';
import { appToday } from '@/lib/date';
import { primarySource } from '@/lib/passages';
import { selectPassage, readMinutes } from '@/lib/passages/select';
import { getPassageLog, upsertPassageLog } from '@/lib/passagesStore';
import { envGuard, fail, badRequest } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The corpus is read here, on the server, and only the selected passage is sent
// to the client. Importing it into a client component would ship ~500 KB of book
// text to the browser on every page load.

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || appToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest('invalid_date');

    const corpus = primarySource();
    const passage = selectPassage(corpus.passages, date);
    if (!passage) return NextResponse.json({ ok: false, error: 'corpus_empty' }, { status: 503 });

    // The log is a nice-to-have; a missing table must not hide the passage.
    const log = envGuard() ? null : await getPassageLog(date).catch(() => null);

    return NextResponse.json({
      ok: true,
      passage,
      source: corpus.source,
      readMinutes: readMinutes(passage.words),
      log,
      seed: !!corpus.seed,
    });
  } catch (e: any) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const guard = envGuard();
  if (guard) return guard;
  try {
    const { date, read, favorite } = await req.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return badRequest('invalid_date');

    const corpus = primarySource();
    const passage = selectPassage(corpus.passages, date);
    if (!passage) return badRequest('corpus_empty');

    const log = await upsertPassageLog(date, {
      passageId: passage.id,
      sourceId: corpus.source.id,
      ...(typeof read === 'boolean' ? { read } : {}),
      ...(typeof favorite === 'boolean' ? { favorite } : {}),
    });
    return NextResponse.json({ ok: true, log });
  } catch (e: any) {
    return fail(e);
  }
}

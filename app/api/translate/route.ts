import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['en', 'de']);

// Both helpers live in lib/translate.ts so scripts/build-passages.mjs can reuse
// them at build time instead of duplicating this endpoint's logic.
import { googleTranslate, myMemoryTranslate } from '@/lib/translate';

export async function POST(req: NextRequest) {
  try {
    const { text, source, target } = await req.json();
    const q = typeof text === 'string' ? text.trim() : '';
    const src = typeof source === 'string' ? source : 'en';
    const dst = typeof target === 'string' ? target : 'de';

    if (!q) return NextResponse.json({ error: 'text_required' }, { status: 400 });
    if (!ALLOWED.has(src) || !ALLOWED.has(dst)) return NextResponse.json({ error: 'language_not_supported' }, { status: 400 });
    if (src === dst) return NextResponse.json({ translatedText: q });

    const translatedText =
      (await googleTranslate(q.slice(0, 2000), src, dst).catch(() => null)) ||
      (await myMemoryTranslate(q, src, dst).catch(() => null));

    if (!translatedText) {
      return NextResponse.json({ error: 'translation_unavailable' }, { status: 502 });
    }

    return NextResponse.json({ translatedText });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'translation_failed' }, { status: 500 });
  }
}

// Machine translation, extracted from app/api/translate/route.ts so the passage
// build script can reuse it instead of duplicating the endpoint logic.
//
// Google's public translate endpoint (no API key). Real machine translation, far
// more accurate than MyMemory — which returns crowd-sourced "translation memory"
// matches that are often unrelated for short phrases.

export async function googleTranslate(q: string, src: string, dst: string): Promise<string | null> {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', src);
  url.searchParams.set('tl', dst);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', q);
  const res = await fetch(url, { cache: 'no-store', headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const segments = json?.[0];
  if (!Array.isArray(segments)) return null;
  const text = segments.map((s: any) => (Array.isArray(s) ? s[0] || '' : '')).join('').trim();
  return text || null;
}

/** Fallback only — used when Google is unreachable, not for its quality. */
export async function myMemoryTranslate(q: string, src: string, dst: string): Promise<string | null> {
  const url = new URL('https://api.mymemory.translated.net/get');
  url.searchParams.set('q', q.slice(0, 900));
  url.searchParams.set('langpair', `${src}|${dst}`);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const text = json?.responseData?.translatedText;
  return typeof text === 'string' && text.trim() ? text : null;
}

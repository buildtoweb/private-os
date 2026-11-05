'use client';
// One excerpt per day from the passage corpus — around forty seconds of real
// reading, not a one-line quote.
//
// This is the only place in the dashboard meant for sustained reading, so it
// deliberately breaks the surrounding UI's type rules: serif body, a comfortable
// measure, generous leading. components/GoalCard.tsx already sets that precedent.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCachedFetch, bustCache } from '@/lib/fetchCache';
import type { DailyPassage as Payload } from '@/lib/passages/types';
import { PassageText } from './PassageText';
import { IconCheck, IconBookmark } from './icons';

const SERIF = 'ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const LANG_KEY = 'passage:lang';

export function DailyPassage({ date }: { date: string }) {
  const { data, loading } = useCachedFetch<Payload & { ok: boolean }>(
    `/api/passage?date=${date}`,
    10 * 60_000,
  );
  const [lang, setLang] = useState<'de' | 'en'>('de');
  const [log, setLog] = useState<{ read: boolean; favorite: boolean } | null>(null);
  // Folded by default so the passage doesn't take over the page; it opens on
  // demand and folds again once marked as read. Resets per day.
  const [expanded, setExpanded] = useState(false);
  // A failed save used to roll the button back with no explanation, which looks
  // exactly like a dead button. Say what went wrong instead.
  const [saveError, setSaveError] = useState<{ text: string; detail?: string } | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(LANG_KEY) : null;
    if (stored === 'en' || stored === 'de') setLang(stored);
  }, []);

  useEffect(() => {
    setLog(data?.log ? { read: data.log.read, favorite: data.log.favorite } : null);
    setExpanded(false);
    setSaveError(null);
  }, [data, date]);

  function pickLang(next: 'de' | 'en') {
    setLang(next);
    try { window.localStorage.setItem(LANG_KEY, next); } catch { /* private mode */ }
  }

  async function patch(body: { read?: boolean; favorite?: boolean }) {
    setLog({ read: log?.read ?? false, favorite: log?.favorite ?? false, ...body });
    if (body.read === true) setExpanded(false);   // collapse immediately
    setSaveError(null);
    try {
      const res = await fetch('/api/passage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, ...body }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        // Keep the raw message next to the hint. The hint is a guess made from
        // the error code, and a guess that hides the evidence behind it is worse
        // than no guess at all when it turns out to be the wrong one.
        const detail = [j?.code, j?.message].filter(Boolean).join(': ');
        throw Object.assign(
          new Error(j?.hint || j?.message || `HTTP ${res.status}`),
          { detail: j?.hint ? detail : undefined },
        );
      }
      bustCache('/api/passage');
    } catch (e: any) {
      setLog(data?.log ? { read: data.log.read, favorite: data.log.favorite } : null);
      setExpanded(false);
      setSaveError({ text: e?.message || 'Speichern fehlgeschlagen.', detail: e?.detail });
    }
  }

  if (loading && !data) {
    return (
      <div className="card">
        <div className="label mb-3">Lesetagebuch</div>
        <div className="shimmer h-3 w-full" />
        <div className="shimmer mt-2 h-3 w-[92%]" />
        <div className="shimmer mt-2 h-3 w-[78%]" />
      </div>
    );
  }
  if (!data?.ok || !data.passage) return null;

  const { passage, source, readMinutes } = data;
  const text = lang === 'de' ? passage.de : passage.en;
  const isRead = !!log?.read;
  const open = expanded;

  return (
    <div className="card fade-in">
      {/* Label and toggle share the top row; the chapter line sits below it.
          All on one row clipped the toggle on a phone as soon as a chapter title
          ran long ("The Mystery Of Sex Transmutation"). */}
      <div className="flex items-center justify-between gap-3">
        <div className="label">Lesetagebuch</div>
        {open && (
          <div className="seg shrink-0">
            {(['de', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => pickLang(l)}
                className={lang === l ? 'on' : undefined}
                style={{ padding: '5px 12px', fontSize: 11.5, minHeight: 28 }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-1.5 text-[10px] font-medium tracking-[0.12em] text-muted">
        Kap. {passage.chapter} · {passage.chapterTitle} · {readMinutes} Min
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="h-3" />
            {/* No clamp and no "weiterlesen": a passage is ~100-160 words by
                construction, so it fits on a phone. The point is to read it. */}
            <PassageText
              text={text}
              className="text-white/90"
              style={{ fontFamily: SERIF, fontSize: 16.5, lineHeight: 1.62, maxWidth: '62ch' }}
            />
            <hr className="mt-4 border-white/[0.06]" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`flex flex-wrap items-center gap-2 ${open ? 'mt-4' : 'mt-3'}`}>
        <button
          type="button"
          className={isRead ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}
          onClick={() => void patch({ read: !isRead })}
        >
          <IconCheck size={13} />
          {isRead ? 'Gelesen' : 'Als gelesen markieren'}
        </button>

        <button type="button" className="btn-ghost btn-sm" onClick={() => setExpanded(!open)}>
          {open ? 'Zuklappen' : isRead ? 'Nochmal lesen' : 'Lesen'}
        </button>

        <button
          type="button"
          className="btn-ghost btn-sm"
          aria-pressed={!!log?.favorite}
          onClick={() => void patch({ favorite: !log?.favorite })}
        >
          <IconBookmark size={13} className={log?.favorite ? 'text-yellow' : undefined} />
          {log?.favorite ? 'Gemerkt' : 'Merken'}
        </button>

        <span className="ml-auto text-[10px] text-muted">
          {source.title} · {source.year}
        </span>
      </div>

      {saveError && (
        <div className="mt-3 text-[11px] leading-relaxed">
          <p className="text-red">Nicht gespeichert: {saveError.text}</p>
          {saveError.detail && <p className="mt-1 break-words text-muted">{saveError.detail}</p>}
        </div>
      )}

      {data.seed && (
        // Honest about the state rather than quietly showing two passages forever.
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Nur Beispieltexte. Wie du eigene Texte einträgst, steht in SETUP.md.
        </p>
      )}
    </div>
  );
}

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedTabs } from '@/components/AnimatedTabs';
import { awardXP } from '@/components/XPBar';
import { weeklyReflectionXP } from '@/lib/xp';
import { bustCache, fetchCached } from '@/lib/fetchCache';
import { ReflectionExport } from '@/components/ReflectionExport';
import { GoalsPanel } from '@/components/GoalsPanel';

type Entry = { id: string; date: string; title: string; text: string; type?: 'Woche' | 'Monat' | 'Tag'; period?: string };
type Tab = 'week' | 'goals';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export default function ReflexionPage() {
  const [tab, setTab] = useState<Tab>('week');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [showExport, setShowExport] = useState(false);
  // Jump to a past period instead of paging through everything. '' = alle.
  const [period, setPeriod] = useState('');

  // Deep-link support: /reflexion?tab=goals lands directly on the Ziele switch.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'goals' || t === 'week') setTab(t as Tab);
  }, []);

  useEffect(() => { if (tab !== 'goals') reload(true, false); }, [tab, period]); // eslint-disable-line react-hooks/exhaustive-deps
  async function reload(reset = true, fresh = false) {
    if (tab === 'goals') return;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: '10',
        type: 'Woche',
      });
      // Filtering happens in the Notion query, not on the client — the list is
      // paginated, so a past month would otherwise need repeated "Mehr laden".
      if (period) {
        params.set('from', `${period}-01`);
        params.set('to', lastDayOfMonth(period));
      }
      if (!reset && nextCursor) params.set('cursor', nextCursor);
      const url = `/api/reflect?${params.toString()}`;
      if (fresh) bustCache('/api/reflect');
      const j = await fetchCached<any>(url, 60_000);
      setEnabled(j.enabled !== false);
      if (j.enabled === false) setError(j?.hint || j?.error || 'Reflexion laden fehlgeschlagen');
      else setError(null);
      setEntries(prev => reset ? (j.entries || []) : [...prev, ...(j.entries || [])]);
      setNextCursor(j.nextCursor);
      setHasMore(!!j.hasMore);
    } catch (e: any) {
      setError(e?.message || 'Reflexion laden fehlgeschlagen');
      if (reset) setEntries([]);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  }

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="h1">Reflexion</h1>
          <p className="text-secondary text-sm mt-1">Wöchentliche Notizen & Ziele</p>
        </div>
        <div className="control-row">
          {/* Keep export on desktop so the tabs have room on a phone. */}
          {tab !== 'goals' && (
            <button className="btn-ghost text-sm hidden md:inline-flex" onClick={() => setShowExport(true)}>
              Exportieren
            </button>
          )}
          <AnimatedTabs<Tab>
            tabs={[
              { value: 'week', label: 'Wöchentlich' },
              { value: 'goals', label: 'Ziele' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>

      {tab !== 'goals' && (
        <ReflectionExport
          open={showExport}
          onClose={() => setShowExport(false)}
          type="Woche"
          typeLabel="Woche"
        />
      )}

      {tab !== 'goals' && error && (
        <div className="notice notice--error mt-4">
          <p className="text-red text-sm">{enabled ? error : 'Reflect-DB ist noch nicht korrekt verbunden.'}</p>
          {!enabled && <p className="text-secondary text-xs mt-2">{error}</p>}
        </div>
      )}

      {tab === 'goals' ? (
        <GoalsPanel />
      ) : (
        <WeekTab entries={entries.filter(isWeekEntry)} loading={loading} loadingMore={loadingMore} hasMore={hasMore} reload={reload} filtered={!!period} />
      )}
      {tab !== 'goals' && <PeriodPicker period={period} onChange={setPeriod} count={entries.length} loading={loading} />}
    </main>
  );
}

/** Last day of a "YYYY-MM" month, as YYYY-MM-DD. */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

/** Shift a "YYYY-MM" month by `by` months. */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Jump straight to a past month rather than paging through the whole archive.
function PeriodPicker({ period, onChange, count, loading }: {
  period: string;
  onChange: (v: string) => void;
  count: number;
  loading: boolean;
}) {
  const active = !!period;
  return (
    <details className="mt-8 text-xs text-secondary" open={active}>
      <summary className="cursor-pointer w-fit rounded-full px-3 py-2 bg-elevated hover:text-primary">{active ? `Filter: ${monthName(period)}` : 'Zeitraum filtern'}</summary>
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-card bg-card p-3">

      {active && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => onChange(shiftMonth(period, -1))}
          aria-label="Vorheriger Monat"
        >
          ‹
        </button>
      )}

      <input
        type="month"
        className="input"
        style={{ width: 'auto', minWidth: 145 }}
        value={period}
        max={currentMonth()}
        onChange={e => onChange(e.target.value)}
        aria-label="Monat auswählen"
      />

      {active && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={period >= currentMonth()}
          onClick={() => onChange(shiftMonth(period, 1))}
          aria-label="Nächster Monat"
        >
          ›
        </button>
      )}

      {active ? (
        <>
          <button type="button" className="btn-ghost btn-sm" onClick={() => onChange('')}>
            Alle anzeigen
          </button>
          <span className="ml-auto text-xs text-secondary">
            {loading ? 'Lädt …' : `${monthName(period)} — ${count} ${count === 1 ? 'Eintrag' : 'Einträge'}`}
          </span>
        </>
      ) : (
        <span className="ml-auto text-xs text-secondary">Alle Einträge, neueste zuerst</span>
      )}
      </div>
    </details>
  );
}

async function safeJson(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

function WeekTab({
  entries,
  loading,
  loadingMore,
  hasMore,
  reload,
  filtered,
}: {
  entries: Entry[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  reload: (reset?: boolean, fresh?: boolean) => void;
  /** A period filter is active, so "empty" means "none in this month". */
  filtered?: boolean;
}) {
  const [draftTitle, setDraftTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string; text: string } | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(() => weekInputValue(new Date()));
  const selectedWeekEnd = useMemo(() => toISODate(sundayOfISOWeek(selectedWeek)), [selectedWeek]);

  // Insert translated text at the caret in the draft textarea (not appended at
  // the end). The textarea keeps its last selection even after the Translate
  // button steals focus, so selectionStart points at where the user was typing.
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  useEffect(() => {
    if (pendingCaret.current == null) return;
    const ta = draftRef.current;
    if (ta) {
      const pos = Math.min(pendingCaret.current, ta.value.length);
      ta.focus();
      ta.setSelectionRange(pos, pos);
    }
    pendingCaret.current = null;
  }, [draft]);

  function insertIntoDraft(text: string) {
    const ta = draftRef.current;
    const start = ta?.selectionStart ?? draft.length;
    const end = ta?.selectionEnd ?? draft.length;
    pendingCaret.current = start + text.length;
    setDraft(draft.slice(0, start) + text + draft.slice(end));
  }

  const grouped = useMemo(() => {
    const g = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = e.date ? e.date.slice(0, 7) : 'unbekannt';
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(e);
    }
    return Array.from(g.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  async function save() {
    const title = draftTitle.trim();
    if (!title || !draft.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/reflect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, text: draft, date: selectedWeekEnd, type: 'Woche' }),
      });
      if (!res.ok) throw new Error('weekly_reflection_save_failed');
      await markWeeklyReflectionHabit(selectedWeekEnd);
      await awardXP('weekly_reflection', weeklyReflectionXP(), selectedWeekEnd, `${selectedWeek}:weekly_reflection`);
      setDraftTitle('');
      setDraft('');
      reload(true, true);
    } finally { setSaving(false); }
}

async function markWeeklyReflectionHabit(date: string) {
  // Mark the weekly reflexion habit on EVERY day of the week (no gaps in Notion).
  const res = await fetch('/api/habits/week', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, reflexion: true }),
  });
  if (!res.ok) throw new Error('weekly_reflection_habit_save_failed');
}

async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      await fetch('/api/reflect', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(editing),
      });
      setEditing(null);
      reload(true, true);
    } finally { setSaving(false); }
  }

  return (
    <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        {/* Composer */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <span className="label">Neue Reflexion</span>
            <WeekPicker value={selectedWeek} onChange={setSelectedWeek} />
          </div>
          <div className="mb-3 text-xs text-secondary">
            Wird für Sonntag, {formatDate(selectedWeekEnd)} gespeichert.
          </div>
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Titel deiner Wochenreflexion"
            className="input text-sm mb-3"
          />
          <textarea
            ref={draftRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Wie war deine Woche? Was beschäftigt dich gerade?"
            rows={6}
            className="input resize-none leading-relaxed"
          />
          <div className="flex justify-end mt-3">
            <button onClick={save} disabled={saving || !draftTitle.trim() || !draft.trim()} className="btn btn-primary disabled:opacity-50">
              {saving ? 'Speichern…' : 'In Notion speichern'}
            </button>
          </div>
        </div>

        {/* Entries */}
        {loading && <div className="card h-40 animate-pulse" />}
        {!loading && entries.length === 0 && (
          <div className="card text-center py-12 text-secondary text-sm">{filtered ? 'Keine Wochenreflexion in diesem Zeitraum.' : 'Noch keine Reflexionen.'}</div>
        )}
        {grouped.map(([month, items]) => {
          const [y, m] = month.split('-');
          const label = month === 'unbekannt' ? 'Ohne Datum' : `${MONTHS[Number(m) - 1]} ${y}`;
          return (
            <section key={month}>
              <h3 className="label mb-2">{label}</h3>
              <ul className="space-y-3">
                {items.map(e => {
                  const isOpen = open === e.id;
                  const isEditing = editing?.id === e.id;
                  return (
                    <li key={e.id} className="card">
                      {isEditing ? (
                        <div onClick={(ev) => ev.stopPropagation()}>
                          <input
                            value={editing.title}
                            onChange={(ev) => setEditing({ ...editing, title: ev.target.value })}
                            className="input text-sm mb-2"
                          />
                          <textarea
                            value={editing.text} rows={6}
                            onChange={(ev) => setEditing({ ...editing, text: ev.target.value })}
                            className="input resize-none leading-relaxed"
                          />
                          <div className="flex justify-end gap-2 mt-3">
                            <button onClick={() => setEditing(null)} className="btn-ghost">Abbrechen</button>
                            <button onClick={saveEdit} disabled={saving} className="btn btn-primary">Speichern</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOpen(isOpen ? null : e.id)}
                          className="block w-full text-left"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="flex-1">
                              <span className="font-semibold">{e.title || '(ohne Titel)'}</span>
                            </span>
                            <span className="text-secondary text-xs shrink-0">{formatDate(e.date)}</span>
                          </div>
                          {!isOpen && e.text && <p className="text-secondary text-sm mt-2 line-clamp-2">{markdownPreview(e.text)}</p>}
                          {isOpen && (
                            <div className="mt-3">
                              <MarkdownText text={e.text} />
                              <div className="flex justify-end mt-3">
                                <span
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setEditing({ id: e.id, title: e.title, text: e.text });
                                  }}
                                  className="btn-ghost text-xs"
                                >
                                  Bearbeiten
                                </span>
                              </div>
                            </div>
                          )}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {!loading && hasMore && (
          <div className="flex justify-center">
            <button onClick={() => reload(false)} disabled={loadingMore} className="btn-ghost disabled:opacity-50">
              {loadingMore ? 'Lade…' : 'Mehr Einträge laden'}
            </button>
          </div>
        )}
      </div>

      <aside>
        <div className="space-y-3">
          <ReflectOverview entries={entries} />
          <TranslateCard onInsert={insertIntoDraft} />
        </div>
      </aside>
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);
  if (!blocks.length) return null;
  return (
    <div className="space-y-3 text-sm leading-relaxed text-primary/90">
      {blocks.map((block, index) => {
        if (block.type === 'h1') return <h2 key={index} className="text-lg font-semibold text-primary">{block.text}</h2>;
        if (block.type === 'h2') return <h3 key={index} className="text-base font-semibold text-primary">{block.text}</h3>;
        if (block.type === 'h3') return <h4 key={index} className="text-sm font-semibold text-primary">{block.text}</h4>;
        if (block.type === 'ul') {
          return (
            <ul key={index} className="list-disc pl-5 space-y-1">
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={index} className="list-decimal pl-5 space-y-1">
              {block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}
            </ol>
          );
        }
        if (block.type === 'p') return <p key={index} className="whitespace-pre-wrap">{block.text}</p>;
        return null;
      })}
    </div>
  );
}

function ReflectOverview({ entries }: { entries: Entry[] }) {
  const now = new Date();
  const currentWeekDone = entries.some(e => sameWeek(e.date));
  const weekDue = endOfWeek(now);
  return (
    <div className="card">
      <div className="label mb-3">Übersicht</div>
      <div className="space-y-3">
        <Row k="Aktuelle Woche" v={`KW ${weekNumber(now)}`} />
        <Row k="Fällig" v={formatDate(toISODate(weekDue))} />
        <StatusNote tone={currentWeekDone ? 'done' : 'open'} text={currentWeekDone ? 'Diese Woche ist reflektiert.' : dueTextForWeek(weekDue)} />
      </div>
    </div>
  );
}

function StatusNote({ tone, text }: { tone: 'done' | 'open' | 'soon'; text: string }) {
  const styles = {
    done: {
      borderColor: '#7ba88844',
      background: 'rgba(34, 197, 94, 0.08)',
      color: '#7ba888',
    },
    open: {
      borderColor: '#e8a33d55',
      background: 'rgba(245, 200, 66, 0.08)',
      color: '#e8a33d',
    },
    soon: {
      borderColor: '#7d93b055',
      background: 'rgba(74, 158, 255, 0.08)',
      color: '#7d93b0',
    },
  }[tone];
  return (
    <div
      className="rounded-card border px-3 py-2 text-xs"
      style={styles}
    >
      {text}
    </div>
  );
}

const LANG_LABELS: Record<'en' | 'de', string> = { en: 'Englisch', de: 'Deutsch' };

function TranslateCard({ onInsert }: { onInsert?: (text: string) => void } = {}) {
  const [source, setSource] = useState<'en' | 'de'>('de');
  const [target, setTarget] = useState<'en' | 'de'>('en');
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = text.trim();
    if (!q) {
      setResult('');
      setError('');
      setLoading(false);
      return;
    }
    if (source === target) {
      setResult(text);
      setError('');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, source, target }),
          signal: controller.signal,
        });
        const json = await safeJson(res);
        if (!res.ok) throw new Error(json?.error || 'Übersetzung fehlgeschlagen');
        setResult(json.translatedText || '');
      } catch (e: any) {
        if (e?.name !== 'AbortError') setError(e?.message || 'Übersetzung fehlgeschlagen');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, source, target]);

  function swapLanguages() {
    setSource(target);
    setTarget(source);
    setText(result || text);
    setResult('');
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="label">Übersetzen</div>
        <button type="button" onClick={swapLanguages} className="btn-ghost text-xs px-2 py-1">Tauschen</button>
      </div>
      <div className="flex items-center gap-2 mb-3 text-sm text-secondary">
        <span>{LANG_LABELS[source]}</span>
        <span className="text-xs">→</span>
        <span>{LANG_LABELS[target]}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Wort oder Satz..."
        className="input resize-none leading-relaxed"
      />
      {loading && <p className="text-secondary text-xs mt-2">Übersetze…</p>}
      {result && (
        <div className="mt-3 rounded-card border border-border bg-base p-3 text-sm leading-relaxed">
          {result}
          {onInsert && (
            <div className="flex justify-end mt-3">
              <button
                type="button"
                onClick={() => onInsert(result)}
                className="btn btn-primary text-xs px-3 py-1"
              >
                In Reflexion einfügen
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-red text-xs mt-2">{error}</p>}
    </div>
  );
}

type MarkdownBlock =
  | { type: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: Extract<MarkdownBlock, { type: 'ul' | 'ol' }> | null = null;

  const flushParagraph = () => {
    const content = paragraph.join('\n').trim();
    if (content) blocks.push({ type: 'p', text: content });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) blocks.push(list);
    list = null;
  };

  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    const bullet = /^[-*]\s+(.+)$/.exec(line.trim());
    const numbered = /^\d+\.\s+(.+)$/.exec(line.trim());

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: `h${heading[1].length}` as 'h1' | 'h2' | 'h3', text: heading[2].trim() });
      continue;
    }
    if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((bullet?.[1] || numbered?.[1] || '').trim());
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

function markdownPreview(text: string) {
  return (text || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^#{1,3}\s+/, '').replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean)
    .join(' ');
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-secondary">{k}</span>
      <span className="font-semibold">{v}</span>
    </div>
  );
}
function formatDate(d: string) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y}`;
}
function WeekPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selSunday = useMemo(() => sundayOfISOWeek(value), [value]);
  const selMonday = useMemo(() => addDays(selSunday, -6), [selSunday]);
  const [view, setView] = useState(() => ({ y: selMonday.getFullYear(), m: selMonday.getMonth() }));

  // Keep the visible month in sync when the selection jumps (e.g. "Diese Woche").
  useEffect(() => {
    setView({ y: selMonday.getFullYear(), m: selMonday.getMonth() });
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const weeks = useMemo(() => buildMonthWeeks(view.y, view.m), [view]);
  const todayWeek = weekInputValue(new Date());
  const dayShort = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="chip bg-transparent text-secondary outline-none hover:border-brand/50 focus:border-brand/50 flex items-center gap-2"
      >
        <span>KW {value.slice(6)} · {dayShort(selMonday)}–{dayShort(selSunday)}</span>
        <span className="text-[10px]" aria-hidden>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[280px] rounded-card border border-border bg-elevated p-3 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => shiftMonth(-1)} className="btn-ghost px-2 py-1 text-sm" aria-label="Vorheriger Monat">←</button>
            <span className="text-sm font-semibold">{MONTHS[view.m]} {view.y}</span>
            <button type="button" onClick={() => shiftMonth(1)} className="btn-ghost px-2 py-1 text-sm" aria-label="Nächster Monat">→</button>
          </div>
          <div className="grid grid-cols-[2.2rem_repeat(7,1fr)] gap-y-1 text-center text-[11px] text-secondary mb-1">
            <span className="font-medium">KW</span>
            {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="space-y-1">
            {weeks.map((w) => {
              const isSelected = w.week === value;
              return (
                <button
                  key={w.week}
                  type="button"
                  onClick={() => { onChange(w.week); setOpen(false); }}
                  className={`grid w-full grid-cols-[2.2rem_repeat(7,1fr)] items-center rounded-[12px] py-1 text-center text-xs transition-colors ${
                    isSelected ? 'bg-brand text-white' : 'hover:bg-white/[0.05]'
                  }`}
                >
                  <span className={isSelected ? 'font-semibold' : 'text-secondary'}>{w.week.slice(6)}</span>
                  {w.days.map((d) => {
                    const inMonth = d.getMonth() === view.m;
                    return (
                      <span key={d.toISOString()} className={isSelected ? '' : inMonth ? '' : 'text-secondary/40'}>
                        {d.getDate()}
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={() => { onChange(todayWeek); setOpen(false); }}
              className="btn-ghost text-xs"
            >
              Diese Woche
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function buildMonthWeeks(y: number, m: number) {
  const first = new Date(y, m, 1);
  const dow = (first.getDay() + 6) % 7; // Monday = 0
  let cur = addDays(first, -dow);
  const lastDay = new Date(y, m + 1, 0);
  const weeks: { week: string; days: Date[] }[] = [];
  while (cur <= lastDay) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(cur, i));
    weeks.push({ week: weekInputValue(cur), days });
    cur = addDays(cur, 7);
  }
  return weeks;
}

function weekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function weekKey(d: Date) {
  return `${d.getFullYear()}-W${String(weekNumber(d)).padStart(2, '0')}`;
}
function weekInputValue(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
function sundayOfISOWeek(value: string) {
  const match = /^(\d{4})-W(\d{2})$/.exec(value);
  const isoYear = match ? Number(match[1]) : new Date().getFullYear();
  const week = match ? Number(match[2]) : weekNumber(new Date());
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Dow = (jan4.getDay() + 6) % 7;
  const monday = new Date(isoYear, 0, 4 - jan4Dow + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}
function sameWeek(iso: string) {
  if (!iso) return false;
  return weekNumber(new Date(iso)) === weekNumber(new Date()) && new Date(iso).getFullYear() === new Date().getFullYear();
}
function endOfWeek(d: Date) {
  const end = new Date(d);
  const dow = (end.getDay() + 6) % 7;
  end.setDate(end.getDate() - dow + 6);
  return end;
}
function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dueTextForWeek(due: Date) {
  const today = startOfDay(new Date());
  const dueDay = startOfDay(due);
  const daysLeft = Math.ceil((dueDay.getTime() - today.getTime()) / 86400000);
  if (daysLeft <= 0) return 'Diese Woche noch keine Reflexion. Heute ist sie fällig.';
  if (daysLeft === 1) return 'Diese Woche noch keine Reflexion. Morgen ist sie fällig.';
  return `Diese Woche noch keine Reflexion. Fällig am Sonntag, ${formatDate(toISODate(due))}.`;
}
function isWeekEntry(e: Entry) {
  return e.type === 'Woche';
}

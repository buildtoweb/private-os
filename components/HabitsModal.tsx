'use client';
import { createPortal } from 'react-dom';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  CATEGORY_META, DAILY_HABITS, WEEKLY_HABITS, computeBestStreak, dailyHabitsOn, isBestDay, isVacationDay,
  weeklySummary, weeklyWeeks, type HabitCategory, type WeeklyWeek,
} from '@/lib/habits';
import { appToday } from '@/lib/date';
import { HabitIcon } from '@/components/HabitIcon';
import { dailyHabitPenalty, dailyHabitXP, perfectDayPenalty, perfectDayXP } from '@/lib/xp';
import type { HabitDay } from '@/lib/notion';
import { AnimatedTabs } from '@/components/AnimatedTabs';
import { awardXP } from '@/components/XPBar';
import { fetchCached, bustCache } from '@/lib/fetchCache';
import { IconClose, IconPause, IconPlay, IconVacation } from '@/components/icons';

type Mode = 'week' | 'month' | 'year';
type View = 'tracker' | 'analyse';

// Full-screen habit workspace, opened from the Today page. Holds the full
// week/month/year tracker grid and an analysis view. Logic mirrors the former
// /habits page so editing here stays in sync with Today (shared Notion + cache).
export function HabitsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  // Portal to <body> so the modal escapes the layout's `relative z-10` wrapper and
  // sits above the fixed sidebar (z-40) instead of being painted under it.
  return createPortal((
    <div
      className="safe-modal-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 md:p-6 fade-in"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-7xl my-auto"
        // Near-opaque surface so a full-screen modal isolates its content cleanly
        // (the translucent glass card alone would let the page text bleed through).
        style={{ background: 'rgba(20,14,15,0.985)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Habits"
        onClick={(e) => e.stopPropagation()}
      >
        <HabitsModalContent onClose={onClose} />
      </div>
    </div>
  ), document.body);
}

function HabitsModalContent({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<View>('tracker');
  const [mode, setMode] = useState<Mode>('week');
  const [ref, setRef] = useState<Date>(() => new Date(`${appToday()}T12:00:00`));
  const [days, setDays] = useState<HabitDay[]>([]);
  const [history, setHistory] = useState<HabitDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showVacation, setShowVacation] = useState(false);
  const [pausedMonths, setPausedMonths] = useState<Record<string, string[]>>({});
  // Bumped after a vacation write so both the visible range and the 365-day
  // history refetch — the cache is keyed by URL, which doesn't change here.
  const [reloadKey, setReloadKey] = useState(0);

  const start = useMemo(() => startOfRange(mode, ref), [mode, ref]);
  const end = useMemo(() => endOfRange(mode, ref), [mode, ref]);
  const dayList = useMemo(() => isoDays(start, end), [start, end]);
  const todayISO = appToday();

  useEffect(() => {
    setLoading(true);
    const startISO = toISO(start);
    const endISO = toISO(end);
    fetchCached<{ days: HabitDay[] }>(`/api/habits?start=${startISO}&end=${endISO}`)
      .then(j => { setErr(null); setDays(j.days || []); })
      .catch(e => { setErr(e?.message || 'Netzwerkfehler'); setDays([]); })
      .finally(() => setLoading(false));
  }, [start, end, reloadKey]);

  useEffect(() => {
    const histStart = new Date(); histStart.setDate(histStart.getDate() - 365);
    fetchCached<{ days: HabitDay[] }>(
      `/api/habits?start=${toISO(histStart)}&end=${todayISO}`,
      5 * 60_000,
    ).then(j => setHistory(j.days || [])).catch(() => {});
  }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCached<{ pausedMonths: Record<string, string[]> }>('/api/habits/pause', 5 * 60_000)
      .then(j => setPausedMonths(j.pausedMonths || {}))
      .catch(() => {});
  }, [reloadKey]);

  const dayMap = useMemo(() => new Map(days.map(d => [d.date, d])), [days]);
  const histRows = useMemo(
    () => history.map(d => ({ date: d.date, habits: d.habits as any, vacation: d.vacation })),
    [history],
  );
  // The month a pause toggle would act on. In Woche/Monat that is unambiguous;
  // Jahr spans twelve, so the toggle is replaced by a read-only summary there.
  const anchorMonth = toISO(ref).slice(0, 7);

  async function togglePause(habitKey: string, month: string, paused: boolean) {
    setBusy(`pause-${habitKey}`);
    // Optimistic — the tracker re-renders immediately, the refetch confirms.
    setPausedMonths(prev => {
      const months = new Set(prev[habitKey] || []);
      if (paused) months.add(month); else months.delete(month);
      const next = { ...prev };
      if (months.size) next[habitKey] = [...months].sort();
      else delete next[habitKey];
      return next;
    });
    try {
      const r = await fetch('/api/habits/pause', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ habit: habitKey, month, paused }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j?.error || `Pause speichern fehlgeschlagen (${r.status})`);
      } else {
        setErr(null);
      }
      bustCache('/api/habits/pause');
      setReloadKey(k => k + 1);
    } catch (e: any) {
      setErr(e?.message || 'Netzwerkfehler beim Speichern');
    } finally {
      setBusy(null);
    }
  }
  // Days in the visible range that are flagged as vacation — excluded from every
  // completion stat so a trip doesn't read as a wall of missed habits.
  const vacationDays = useMemo(
    () => new Set(dayList.filter(d => isVacationDay(dayMap.get(d)))),
    [dayList, dayMap],
  );
  const trackedDays = useMemo(() => dayList.filter(d => !vacationDays.has(d)), [dayList, vacationDays]);

  async function saveVacation(startISO: string, endISO: string, on: boolean, label?: string) {
    setBusy('vacation');
    try {
      const r = await fetch('/api/habits/vacation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start: startISO, end: endISO, on, label }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j?.error || `Urlaub speichern fehlgeschlagen (${r.status})`);
        return;
      }
      setErr(null);
      bustCache('/api/habits');
      setReloadKey(k => k + 1);
      setShowVacation(false);
    } catch (e: any) {
      setErr(e?.message || 'Netzwerkfehler beim Speichern');
    } finally {
      setBusy(null);
    }
  }

  async function toggle(habitKey: string, dateISO: string) {
    setBusy(`${habitKey}-${dateISO}`);
    const cur = dayMap.get(dateISO) || { date: dateISO, habits: {} };
    const wasChecked = !!cur.habits?.[habitKey as any];
    const wasBestDay = isBestDay(cur.habits, dateISO);
    const habits = { ...(cur.habits || {}), [habitKey]: !wasChecked } as Record<string, boolean | undefined>;
    habits.bestDay = isBestDay(habits, dateISO);
    const next: HabitDay = { ...cur, habits };
    setDays(arr => {
      const idx = arr.findIndex(d => d.date === dateISO);
      if (idx >= 0) { const copy = [...arr]; copy[idx] = next; return copy; }
      return [...arr, next].sort((a, b) => a.date.localeCompare(b.date));
    });
    try {
      const r = await fetch('/api/habits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j?.message || j?.error || `Speichern fehlgeschlagen (${r.status})`);
      } else {
        bustCache('/api/habits');
        if (!wasChecked && DAILY_HABITS.some(h => h.key === habitKey)) {
          awardXP(habitKey, dailyHabitXP(streakForDate(habitKey, dateISO, [...history, next])), dateISO, `${dateISO}:${habitKey}`);
          if (habits.bestDay) awardXP('perfect_day', perfectDayXP(), dateISO, `${dateISO}:perfect_day`);
        }
        if (wasChecked && DAILY_HABITS.some(h => h.key === habitKey)) {
          awardXP(`${habitKey}_missed`, dailyHabitPenalty(streakForDate(habitKey, dateISO, [...history, cur])), dateISO, `${dateISO}:${habitKey}:penalty`);
          if (wasBestDay && !habits.bestDay) awardXP('perfect_day_missed', perfectDayPenalty(), dateISO, `${dateISO}:perfect_day:penalty`);
        }
        setErr(null);
      }
    } catch (e: any) {
      setErr(e?.message || 'Netzwerkfehler beim Speichern');
    } finally { setBusy(null); }
  }

  // stats — vacation days are left out of both sides of the ratio
  const totalDone = useMemo(
    () => days.reduce((s, d) => s + (isVacationDay(d) ? 0 : dailyHabitsOn(d.date).filter(h => d.habits?.[h.key as any]).length), 0),
    [days],
  );
  const possibleDone =
    days.filter(d => !isVacationDay(d)).reduce((s, d) => s + dailyHabitsOn(d.date).length, 0) || 1;
  const metPct = Math.round((totalDone / possibleDone) * 100);
  const bestDays = useMemo(() => {
    let count = 0, latest = '';
    for (const d of days) {
      if (!isVacationDay(d) && isBestDay(d.habits, d.date)) { count++; if (!latest || d.date > latest) latest = d.date; }
    }
    return { count, latest };
  }, [days]);
  const bestStreak = useMemo(() => Math.max(0, ...DAILY_HABITS.map(h => computeBestStreak(h.key, histRows))), [histRows]);

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="h2">Habits</h2>
          <p className="text-secondary text-sm mt-0.5">{fmtRange(mode, start, end)}</p>
        </div>
        <div className="flex items-center gap-2">
          <AnimatedTabs<View>
            tabs={[{ value: 'tracker', label: 'Tracker' }, { value: 'analyse', label: 'Analyse' }]}
            value={view}
            onChange={setView}
            size="sm"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/[0.08] text-secondary transition hover:bg-white/[0.07] hover:text-white"
          >
            <IconClose size={18} />
          </button>
        </div>
      </div>

      {/* Range navigator (both views share the same period) */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-4">
        <button
          type="button"
          className="btn-ghost mr-auto flex items-center gap-1.5"
          onClick={() => setShowVacation(v => !v)}
          aria-expanded={showVacation}
        >
          <IconVacation size={14} />
          Urlaub
        </button>
        <RangeTabs value={mode} onChange={(v) => { setMode(v); setRef(new Date(`${appToday()}T12:00:00`)); }} />
        <button className="btn-ghost" onClick={() => setRef(shift(ref, mode, -1))} aria-label="zurück">‹</button>
        <button className="btn-ghost" onClick={() => setRef(new Date(`${appToday()}T12:00:00`))}>Heute</button>
        <button className="btn-ghost" onClick={() => setRef(shift(ref, mode, 1))} aria-label="vor">›</button>
      </div>

      {showVacation && (
        <VacationPanel
          todayISO={todayISO}
          vacationDays={vacationDays}
          busy={busy === 'vacation'}
          onSave={saveVacation}
          onClose={() => setShowVacation(false)}
        />
      )}

      {err && (
        <div className="notice notice--error mb-4">
          <div className="flex items-start gap-3">
            <span className="text-red text-sm font-semibold">Notion-Fehler</span>
            <p className="text-secondary text-xs flex-1 break-words">{err}</p>
          </div>
        </div>
      )}

      {view === 'tracker' ? (
        <TrackerGrid
          mode={mode}
          dayList={dayList}
          dayMap={dayMap}
          days={days}
          todayISO={todayISO}
          vacationDays={vacationDays}
          pausedMonths={pausedMonths}
          anchorMonth={anchorMonth}
          busy={busy}
          loading={loading}
          onToggle={toggle}
          onTogglePause={togglePause}
        />
      ) : (
        <AnalyseView
          mode={mode}
          dayList={dayList}
          dayMap={dayMap}
          days={days}
          todayISO={todayISO}
          trackedDays={trackedDays}
          vacationDays={vacationDays}
          pausedMonths={pausedMonths}
          metPct={metPct}
          totalDone={totalDone}
          bestDays={bestDays}
          bestStreak={bestStreak}
        />
      )}
    </>
  );
}

function TrackerGrid({ mode, dayList, dayMap, days, todayISO, vacationDays, pausedMonths, anchorMonth, busy, loading, onToggle, onTogglePause }: {
  mode: Mode;
  dayList: string[];
  dayMap: Map<string, HabitDay>;
  days: HabitDay[];
  todayISO: string;
  vacationDays: Set<string>;
  pausedMonths: Record<string, string[]>;
  anchorMonth: string;
  busy: string | null;
  loading: boolean;
  onToggle: (habitKey: string, dateISO: string) => void;
  onTogglePause: (habitKey: string, month: string, paused: boolean) => void;
}) {
  const vacationRanges = useMemo(() => groupRanges([...vacationDays].sort()), [vacationDays]);
  return (
    <>
      {vacationRanges.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[16px] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
          <IconVacation size={14} className="shrink-0 text-white/40" />
          <span className="label">Urlaub</span>
          <span className="text-xs text-secondary">
            {vacationRanges.map(r => rangeLabel(r, dayMap)).join(' · ')}
          </span>
          <span className="ml-auto text-[11px] text-white/30">
            {vacationDays.size} {vacationDays.size === 1 ? 'Tag' : 'Tage'} nicht gewertet
          </span>
        </div>
      )}

      {/* Mobile compact view */}
      <div className="md:hidden">
        <CompactHabitOverview mode={mode} dayList={dayList} dayMap={dayMap} days={days} todayISO={todayISO} vacationDays={vacationDays} pausedMonths={pausedMonths} anchorMonth={anchorMonth} busy={busy} onToggle={onToggle} onTogglePause={onTogglePause} />
      </div>

      {/* Desktop grid */}
      <div className="hidden overflow-x-auto md:block">
        {loading ? <div className="h-72 animate-pulse" /> : (
          <table className="w-full border-separate border-spacing-y-0.5 min-w-[560px]">
            <thead>
              <tr>
                <th className="text-left pb-3 pr-4" style={{ width: 200, minWidth: 200 }}>
                  <span className="label">Habit</span>
                </th>
                {dayList.map(d => (
                  <th key={d} className="text-center pb-3 px-1" style={{ width: 36 }}>
                    <div className="text-[11px] text-secondary leading-none">
                      {new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'narrow' })}
                    </div>
                    {vacationDays.has(d) ? (
                      <div className="mt-0.5 grid place-items-center" title="Urlaub">
                        <IconVacation size={11} className="text-white/35" />
                      </div>
                    ) : (
                      <div className="text-[10px] text-secondary/50 mt-0.5">{d.slice(8)}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['geist', 'körper', 'disziplin'] as HabitCategory[]).map(cat => {
                const dailyInCat = DAILY_HABITS.filter(h => h.category === cat);
                const weeklyInCat = WEEKLY_HABITS.filter(h => h.category === cat);
                if (!dailyInCat.length && !weeklyInCat.length) return null;
                const meta = CATEGORY_META[cat];
                return (
                  <Fragment key={cat}>
                    <tr>
                      <td colSpan={dayList.length + 1} className="pt-4 pb-1.5 pl-1">
                        <span className="label" style={{ color: meta.color }}>{meta.label}</span>
                      </td>
                    </tr>
                    {dailyInCat.map(h => (
                      <tr key={h.key}>
                        <td className="py-0.5 pr-3" style={{ width: 200 }}>
                          <div className="flex items-center gap-2.5 pl-1">
                            <HabitIcon iconKey={h.iconKey} size={14} color={meta.color} className="shrink-0 opacity-70" />
                            <span className="text-sm text-secondary truncate">{h.label}</span>
                          </div>
                        </td>
                        {dayList.map(d => {
                          const checked = !!dayMap.get(d)?.habits?.[h.key as any];
                          const isToday = d === todayISO;
                          const future = d > todayISO;
                          const onVacation = vacationDays.has(d);
                          // The habit didn't exist yet on this day — leave the cell
                          // empty rather than showing a box that can never be ticked.
                          if (h.since && d < h.since) {
                            return <td key={d} className="px-0.5 py-0.5" aria-hidden />;
                          }
                          // Vacation days are read-only: nothing was tracked and
                          // nothing counts. Clear the flag first to log a habit.
                          if (onVacation && !checked) {
                            return (
                              <td key={d} className="text-center px-0.5 py-0.5">
                                <div
                                  className="mx-auto grid h-7 w-7 place-items-center rounded-lg"
                                  style={{ background: VACATION_CELL_BG, border: '1.5px solid rgba(255,255,255,0.05)' }}
                                  title={`Urlaub — ${d}`}
                                  aria-label={`${h.label} ${d} Urlaub`}
                                >
                                  <span className="h-2.5 w-px rotate-45 bg-white/20" aria-hidden />
                                </div>
                              </td>
                            );
                          }
                          return (
                            <td key={d} className="text-center px-0.5 py-0.5">
                              <button
                                onClick={() => !future && onToggle(h.key, d)}
                                disabled={future || busy === `${h.key}-${d}`}
                                aria-label={`${h.label} ${d} ${checked ? 'erledigt' : 'offen'}`}
                                className="w-7 h-7 rounded-lg transition-all disabled:opacity-20"
                                style={{
                                  background: checked ? `${meta.color}cc` : 'rgba(255,255,255,0.04)',
                                  border: isToday
                                    ? `1.5px solid ${checked ? meta.color : 'rgba(255,255,255,0.2)'}`
                                    : '1.5px solid transparent',
                                }}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {weeklyInCat.map(h => {
                      const weeks = weeklyWeeks(h, dayList, dayMap, pausedSet(pausedMonths[h.key]), todayISO);
                      const monthsPaused = pausedMonths[h.key] || [];
                      const fullyPaused = weeks.length > 0 && weeks.every(w => w.skipped);
                      return (
                        <tr key={h.key}>
                          <td className="py-1.5 pr-3" style={{ width: 200 }}>
                            <div className="flex items-center gap-2.5 pl-1" style={{ opacity: fullyPaused ? 0.45 : 1 }}>
                              <HabitIcon iconKey={h.iconKey} size={14} color={meta.color} className="shrink-0 opacity-70" />
                              <span className="text-sm text-secondary truncate">{h.label}</span>
                            </div>
                          </td>
                          <td colSpan={dayList.length} className="px-1 py-1.5">
                            <div className="flex items-center gap-2">
                              <div className="min-w-0 flex-1" style={{ opacity: fullyPaused ? 0.45 : 1 }}>
                                <WeeklyProgress weeks={weeks} color={meta.color} />
                              </div>
                              <PauseControl
                                habitKey={h.key}
                                mode={mode}
                                anchorMonth={anchorMonth}
                                pausedMonths={monthsPaused}
                                busy={busy === `pause-${h.key}`}
                                onToggle={(month, paused) => onTogglePause(h.key, month, paused)}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function AnalyseView({ mode, dayList, dayMap, days, todayISO, trackedDays, vacationDays, pausedMonths, metPct, totalDone, bestDays, bestStreak }: {
  mode: Mode;
  dayList: string[];
  dayMap: Map<string, HabitDay>;
  days: HabitDay[];
  todayISO: string;
  trackedDays: string[];
  vacationDays: Set<string>;
  pausedMonths: Record<string, string[]>;
  metPct: number;
  totalDone: number;
  bestDays: { count: number; latest: string };
  bestStreak: number;
}) {
  const trackedUpToToday = trackedDays.filter(d => d <= todayISO).length;
  // Nothing in this period was meant to be tracked (e.g. a week fully on
  // vacation) — a percentage would read as a failure rather than an absence.
  const nothingToTrack = trackedUpToToday === 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <BigStat
          label="Erfüllt"
          value={nothingToTrack ? '—' : `${metPct}%`}
          sub={vacationDays.size ? `ohne ${vacationDays.size} Urlaubstag${vacationDays.size === 1 ? '' : 'e'}` : undefined}
          tone={nothingToTrack ? undefined : metPct >= 70 ? 'green' : metPct >= 40 ? 'yellow' : 'red'}
        />
        <BigStat label="Beste Tage" value={`${bestDays.count}`} sub={bestDays.latest ? new Date(bestDays.latest).toLocaleDateString('de-DE') : ''} />
        <BigStat label="Erledigt" value={`${totalDone}`} />
        <BigStat label="Längste Serie" value={`${bestStreak}d`} />
      </div>

      <div>
        <div className="label mb-3">Pro Habit in diesem Zeitraum</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
          {(['geist', 'körper', 'disziplin'] as HabitCategory[]).map(cat => {
            const dailyInCat = DAILY_HABITS.filter(h => h.category === cat);
            const weeklyInCat = WEEKLY_HABITS.filter(h => h.category === cat);
            if (!dailyInCat.length && !weeklyInCat.length) return null;
            const meta = CATEGORY_META[cat];
            return (
              <section key={cat} className="space-y-2">
                <div className="label" style={{ color: meta.color }}>{meta.label}</div>
                {dailyInCat.map(h => {
                  const count = dayList.filter(d => !!dayMap.get(d)?.habits?.[h.key as any]).length;
                  // A habit added mid-range is only measured against the days it
                  // existed for, so it doesn't start life looking like a failure.
                  const eligible = trackedDays.filter(d => d <= todayISO && (!h.since || d >= h.since)).length;
                  // Daily habits on an all-vacation period have no target to hit.
                  const dashed = eligible === 0;
                  const target = Math.max(1, eligible);
                  const pct = dashed ? 0 : Math.min(100, (count / target) * 100);
                  return (
                    <div key={h.key} className="rounded-[16px] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <HabitIcon iconKey={h.iconKey} size={15} color={meta.color} className="shrink-0 opacity-80" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/70">{h.label}</span>
                        <span className="text-[11px] font-semibold tabular-nums text-white/45">{dashed ? '—' : `${count}/${target}`}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--success)' : meta.color }} />
                      </div>
                    </div>
                  );
                })}
                {weeklyInCat.map(h => {
                  const weeks = weeklyWeeks(h, dayList, dayMap, pausedSet(pausedMonths[h.key]), todayISO);
                  const fullyPaused = weeks.length > 0 && weeks.every(w => w.skipped);
                  return (
                    <div
                      key={h.key}
                      className="rounded-[16px] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5"
                      style={{ opacity: fullyPaused ? 0.5 : 1 }}
                    >
                      <div className="flex items-center gap-2.5">
                        <HabitIcon iconKey={h.iconKey} size={15} color={meta.color} className="shrink-0 opacity-80" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/70">{h.label}</span>
                        {fullyPaused && <span className="text-[10px] text-secondary/50 shrink-0">Pausiert</span>}
                      </div>
                      <div className="mt-2">
                        <WeeklyProgress weeks={weeks} color={meta.color} />
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CompactHabitOverview({ mode, dayList, dayMap, days, todayISO, vacationDays, pausedMonths, anchorMonth, busy, onToggle, onTogglePause }: {
  mode: Mode;
  dayList: string[];
  dayMap: Map<string, HabitDay>;
  days: HabitDay[];
  todayISO: string;
  vacationDays: Set<string>;
  pausedMonths: Record<string, string[]>;
  anchorMonth: string;
  busy: string | null;
  onToggle: (habitKey: string, dateISO: string) => void;
  onTogglePause: (habitKey: string, month: string, paused: boolean) => void;
}) {
  if (mode !== 'week') {
    return (
      <div className="space-y-5">
        {(['geist', 'körper', 'disziplin'] as HabitCategory[]).map(cat => {
          const dailyInCat = DAILY_HABITS.filter(h => h.category === cat);
          const weeklyInCat = WEEKLY_HABITS.filter(h => h.category === cat);
          if (!dailyInCat.length && !weeklyInCat.length) return null;
          const meta = CATEGORY_META[cat];
          return (
            <section key={cat} className="space-y-2">
              <div className="label" style={{ color: meta.color }}>{meta.label}</div>
              {dailyInCat.map(h => {
                const count = dayList.filter(d => !!dayMap.get(d)?.habits?.[h.key as any]).length;
                const eligible = dayList.filter(d => d <= todayISO && !vacationDays.has(d) && (!h.since || d >= h.since)).length;
                const dashed = eligible === 0;
                const target = Math.max(1, eligible);
                const pct = dashed ? 0 : Math.min(100, (count / target) * 100);
                return (
                  <div key={h.key} className="rounded-[16px] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <HabitIcon iconKey={h.iconKey} size={15} color={meta.color} className="shrink-0 opacity-80" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-white/70">{h.label}</span>
                      <span className="text-[11px] font-semibold tabular-nums text-white/45">{dashed ? '—' : `${count}/${target}`}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--success)' : meta.color }} />
                    </div>
                  </div>
                );
              })}
              {weeklyInCat.map(h => (
                <WeeklyHabitCard
                  key={h.key}
                  habit={h}
                  weeks={weeklyWeeks(h, dayList, dayMap, pausedSet(pausedMonths[h.key]), todayISO)}
                  color={meta.color}
                  mode={mode}
                  anchorMonth={anchorMonth}
                  pausedMonths={pausedMonths[h.key] || []}
                  busy={busy === `pause-${h.key}`}
                  onTogglePause={(month, paused) => onTogglePause(h.key, month, paused)}
                />
              ))}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-[minmax(104px,1fr)_repeat(7,24px)] items-end gap-x-1.5 border-b border-white/[0.06] pb-3">
        <span className="label">Habit</span>
        {dayList.map(d => (
          <div key={d} className="text-center">
            <div className="text-[10px] font-semibold leading-none text-white/45">
              {new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'narrow' })}
            </div>
            {vacationDays.has(d) ? (
              <div className="mt-1 grid place-items-center" title="Urlaub">
                <IconVacation size={10} className="text-white/35" />
              </div>
            ) : (
              <div className="mt-1 text-[10px] leading-none text-white/30">{d.slice(8)}</div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-5">
        {(['geist', 'körper', 'disziplin'] as HabitCategory[]).map(cat => {
          const dailyInCat = DAILY_HABITS.filter(h => h.category === cat);
          const weeklyInCat = WEEKLY_HABITS.filter(h => h.category === cat);
          if (!dailyInCat.length && !weeklyInCat.length) return null;
          const meta = CATEGORY_META[cat];
          return (
            <section key={cat} className="space-y-2.5">
              <div className="label" style={{ color: meta.color }}>{meta.label}</div>
              {dailyInCat.map(h => (
                <div key={h.key} className="grid grid-cols-[minmax(104px,1fr)_repeat(7,24px)] items-center gap-x-1.5">
                  <div className="flex min-w-0 items-center gap-2 pr-1">
                    <HabitIcon iconKey={h.iconKey} size={15} color={meta.color} className="shrink-0 opacity-80" />
                    <span className="min-w-0 truncate text-[13px] font-medium text-white/62">{h.label}</span>
                  </div>
                  {dayList.map(d => {
                    const checked = !!dayMap.get(d)?.habits?.[h.key as any];
                    const isToday = d === todayISO;
                    const future = d > todayISO;
                    if (h.since && d < h.since) {
                      return <div key={d} className="h-6 w-6" aria-hidden />;
                    }
                    if (vacationDays.has(d) && !checked) {
                      return (
                        <div
                          key={d}
                          className="grid h-6 w-6 place-items-center rounded-[8px]"
                          style={{ background: VACATION_CELL_BG, border: '1.5px solid rgba(255,255,255,0.05)' }}
                          title={`Urlaub — ${d}`}
                          aria-label={`${h.label} ${d} Urlaub`}
                        >
                          <span className="h-2 w-px rotate-45 bg-white/20" aria-hidden />
                        </div>
                      );
                    }
                    return (
                      <button
                        key={d}
                        onClick={() => !future && onToggle(h.key, d)}
                        disabled={future || busy === `${h.key}-${d}`}
                        aria-label={`${h.label} ${d} ${checked ? 'erledigt' : 'offen'}`}
                        className="h-6 w-6 rounded-[8px] transition-all disabled:opacity-20"
                        style={{
                          background: checked ? `${meta.color}cc` : 'rgba(255,255,255,0.045)',
                          border: isToday
                            ? `1.5px solid ${checked ? meta.color : 'rgba(255,255,255,0.22)'}`
                            : '1.5px solid rgba(255,255,255,0.03)',
                        }}
                      />
                    );
                  })}
                </div>
              ))}
              {weeklyInCat.map(h => (
                <WeeklyHabitCard
                  key={h.key}
                  habit={h}
                  weeks={weeklyWeeks(h, dayList, dayMap, pausedSet(pausedMonths[h.key]), todayISO)}
                  color={meta.color}
                  mode={mode}
                  anchorMonth={anchorMonth}
                  pausedMonths={pausedMonths[h.key] || []}
                  busy={busy === `pause-${h.key}`}
                  onTogglePause={(month, paused) => onTogglePause(h.key, month, paused)}
                />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// Neutral, deliberately colourless fill — a vacation day is not a status
// (done/missed), it is an absence of tracking.
const VACATION_CELL_BG = 'rgba(255,255,255,0.015)';

const MONTH_NAME = (month: string) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString('de-DE', { month: 'long' });

/**
 * Weekly habit progress. Over a single week this is the familiar value/target
 * bar; over a month or year it becomes one segment per ISO week, because a
 * per-week target cannot be summed across weeks — that is what produced
 * "Reflexion 9 / 1".
 */
function WeeklyProgress({ weeks, color }: { weeks: WeeklyWeek[]; color: string }) {
  const { met, counted } = weeklySummary(weeks);

  if (weeks.length === 1) {
    const w = weeks[0];
    const pct = w.skipped ? 0 : Math.min(100, (w.value / w.target) * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-base shadow-well overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--success)' : color }}
          />
        </div>
        <span className="text-[10px] text-secondary/60 shrink-0 tabular-nums">
          {w.skipped ? '—' : `${w.value} / ${w.target}`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-0.5">
        {weeks.map(w => {
          const pct = w.skipped ? 0 : Math.min(100, (w.value / w.target) * 100);
          return (
            <div
              key={w.key}
              className="h-1.5 flex-1 rounded-full bg-base shadow-well overflow-hidden"
              style={{ opacity: w.skipped ? 0.35 : 1 }}
              title={`${w.key.replace(/^\d+-W/, 'KW ')} — ${w.skipped ? 'nicht gewertet' : `${w.value} / ${w.target}`}`}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: w.met ? 'var(--success)' : color }}
              />
            </div>
          );
        })}
      </div>
      <span className="text-[10px] text-secondary/60 shrink-0 tabular-nums">
        {counted === 0 ? '—' : `${met} / ${counted} Wochen`}
      </span>
    </div>
  );
}

/** Undefined-safe Set for the paused-months lookup passed into weeklyWeeks. */
function pausedSet(months?: string[]): Set<string> | undefined {
  return months?.length ? new Set(months) : undefined;
}

// Compact (mobile / non-week) card for a weekly habit.
function WeeklyHabitCard({ habit, weeks, color, mode, anchorMonth, pausedMonths, busy, onTogglePause }: {
  habit: (typeof WEEKLY_HABITS)[number];
  weeks: WeeklyWeek[];
  color: string;
  mode: Mode;
  anchorMonth: string;
  pausedMonths: string[];
  busy: boolean;
  onTogglePause: (month: string, paused: boolean) => void;
}) {
  const fullyPaused = weeks.length > 0 && weeks.every(w => w.skipped);
  return (
    <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
      <div className="flex items-center gap-2.5" style={{ opacity: fullyPaused ? 0.5 : 1 }}>
        <HabitIcon iconKey={habit.iconKey} size={15} color={color} className="shrink-0 opacity-80" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/62">{habit.label}</span>
        {fullyPaused && <span className="text-[10px] text-secondary/50 shrink-0">Pausiert</span>}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1" style={{ opacity: fullyPaused ? 0.5 : 1 }}>
          <WeeklyProgress weeks={weeks} color={color} />
        </div>
        <PauseControl
          habitKey={habit.key}
          mode={mode}
          anchorMonth={anchorMonth}
          pausedMonths={pausedMonths}
          busy={busy}
          onToggle={onTogglePause}
        />
      </div>
    </div>
  );
}

// Per-month pause: a habit that is simply out of season (sauna in summer)
// should not read as failed every week, nor bleed XP on the Today page.
function PauseControl({ habitKey, mode, anchorMonth, pausedMonths, busy, onToggle }: {
  habitKey: string;
  mode: Mode;
  anchorMonth: string;
  pausedMonths: string[];
  busy: boolean;
  onToggle: (month: string, paused: boolean) => void;
}) {
  if (mode === 'year') {
    // A year spans twelve months, so "the" month to toggle is ambiguous here.
    return pausedMonths.length ? (
      <span className="text-[10px] text-secondary/50 shrink-0" title={pausedMonths.join(', ')}>
        {pausedMonths.length} Mon. pausiert
      </span>
    ) : null;
  }

  const paused = pausedMonths.includes(anchorMonth);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onToggle(anchorMonth, !paused)}
      title={paused ? `Pause im ${MONTH_NAME(anchorMonth)} aufheben` : `Im ${MONTH_NAME(anchorMonth)} pausieren`}
      aria-pressed={paused}
      className="shrink-0 grid h-6 w-6 place-items-center rounded-full text-secondary transition hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
    >
      {paused ? <IconPlay size={12} /> : <IconPause size={12} />}
    </button>
  );
}

// Urlaubsmodus — mark a date range as "away, deliberately not tracked", or clear
// it again. Kept inline in the tracker so it's one click away when a trip starts.
function VacationPanel({ todayISO, vacationDays, busy, onSave, onClose }: {
  todayISO: string;
  vacationDays: Set<string>;
  busy: boolean;
  onSave: (start: string, end: string, on: boolean, label?: string) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(todayISO);
  const [to, setTo] = useState(todayISO);
  const [label, setLabel] = useState('');
  const invalid = !from || !to || to < from;

  return (
    <div className="card-pad-sm mb-4">
      <div className="flex items-center gap-2">
        <IconVacation size={15} className="text-white/45" />
        <span className="label">Urlaubsmodus</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="ml-auto grid h-7 w-7 place-items-center rounded-full text-secondary transition hover:bg-white/[0.07] hover:text-white"
        >
          <IconClose size={14} />
        </button>
      </div>
      <p className="mt-1.5 text-xs text-secondary">
        Tage in diesem Zeitraum gelten als bewusst nicht getrackt — sie zählen nicht als verpasst
        und unterbrechen keine Serie.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-secondary" htmlFor="vac-from">Von</label>
          <input id="vac-from" type="date" className="input" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-secondary" htmlFor="vac-to">Bis</label>
          <input id="vac-to" type="date" className="input" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-secondary" htmlFor="vac-label">Bezeichnung (optional)</label>
          <input id="vac-label" type="text" className="input" placeholder="z. B. Amerika" value={label} onChange={e => setLabel(e.target.value)} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary btn-sm" disabled={invalid || busy} onClick={() => onSave(from, to, true, label)}>
          {busy ? 'Speichern …' : 'Als Urlaub markieren'}
        </button>
        <button type="button" className="btn-ghost btn-sm" disabled={invalid || busy} onClick={() => onSave(from, to, false)}>
          Urlaub entfernen
        </button>
        {vacationDays.size > 0 && (
          <span className="ml-auto text-[11px] text-white/30">
            {vacationDays.size} Urlaubstag{vacationDays.size === 1 ? '' : 'e'} im gewählten Zeitraum
          </span>
        )}
      </div>
    </div>
  );
}

const TONE_COLORS = { green: 'var(--success)', yellow: 'var(--warning)', red: 'var(--error)' } as const;

function BigStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: keyof typeof TONE_COLORS }) {
  return (
    <div className="rounded-[18px] border border-white/[0.06] bg-white/[0.025] px-3 py-4 text-center">
      <div className="text-3xl md:text-4xl font-semibold" style={{ color: tone ? TONE_COLORS[tone] : 'var(--fg)' }}>
        {value}
      </div>
      <div className="label mt-2">{label}</div>
      {sub && <div className="text-secondary text-[11px] mt-1">{sub}</div>}
    </div>
  );
}

function RangeTabs({ value, onChange }: { value: Mode; onChange: (v: Mode) => void }) {
  return (
    <AnimatedTabs<Mode>
      tabs={[
        { value: 'week', label: 'Woche' },
        { value: 'month', label: 'Monat' },
        { value: 'year', label: 'Jahr' },
      ]}
      value={value}
      onChange={onChange}
      size="sm"
    />
  );
}

// ── helpers (ported from the former /habits page) ────────────────────────────
function startOfRange(mode: Mode, ref: Date): Date {
  const d = new Date(ref);
  if (mode === 'week') { const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d; }
  if (mode === 'month') { d.setDate(1); return d; }
  d.setMonth(0, 1); return d;
}
function endOfRange(mode: Mode, ref: Date): Date {
  const d = new Date(ref);
  if (mode === 'week') { const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow + 6); return d; }
  if (mode === 'month') { d.setMonth(d.getMonth() + 1, 0); return d; }
  d.setMonth(11, 31); return d;
}
// startOfRange/endOfRange work in local time, so the ISO string must come from
// the local date parts. `toISOString()` would convert to UTC and — for any local
// clock time inside the UTC offset, i.e. 00:00–02:00 in Vienna — shift the whole
// range one day back, so the grid showed Sun–Sat while the header said Mon–Sun.
function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function isoDays(start: Date, end: Date): string[] {
  const out: string[] = [];
  const endISO = toISO(end);
  const d = new Date(start);
  for (let iso = toISO(d); iso <= endISO; iso = toISO(d)) {
    out.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return out;
}
// Collapse a sorted ISO date list into consecutive [start, end] runs, so a
// 13-day trip reads as one range instead of 13 separate chips.
function groupRanges(sorted: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && nextDay(last[1]) === d) last[1] = d;
    else out.push([d, d]);
  }
  return out;
}
function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
function rangeLabel([from, to]: [string, string], dayMap: Map<string, HabitDay>): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
  const fmt = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', opts);
  const span = from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  const name = dayMap.get(from)?.vacationLabel || dayMap.get(to)?.vacationLabel;
  return name ? `${span} (${name})` : span;
}

function fmtRange(mode: Mode, start: Date, end: Date) {
  if (mode === 'year') return `${start.getFullYear()}`;
  if (mode === 'month') return start.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
  return `${start.toLocaleDateString('de-DE', opts)} – ${end.toLocaleDateString('de-DE', opts)}`;
}
function streakForDate(habitKey: string, dateISO: string, days: HabitDay[]) {
  const map = new Map(days.map(d => [d.date, !!d.habits?.[habitKey as any]]));
  const ref = new Date(dateISO);
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(ref);
    d.setUTCDate(ref.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    if (map.get(iso)) streak++; else break;
  }
  return streak;
}
function shift(d: Date, mode: Mode, by: number): Date {
  const c = new Date(d);
  if (mode === 'week') c.setDate(c.getDate() + by * 7);
  if (mode === 'month') c.setMonth(c.getMonth() + by);
  if (mode === 'year') c.setFullYear(c.getFullYear() + by);
  return c;
}

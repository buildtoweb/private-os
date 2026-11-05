'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { HabitCard } from '@/components/HabitCard';
import { WhoopHero } from '@/components/WhoopHero';
import { PinnedGoals } from '@/components/PinnedGoals';
import { DailyReflection } from '@/components/DailyReflection';
import { MorningRoutine } from '@/components/MorningRoutine';
import { DailyPassage } from '@/components/DailyPassage';
import { AlertBanner } from '@/components/finance/PriceAlerts';
import { appToday } from '@/lib/date';
import { DAILY_HABITS, WEEKLY_HABITS, computeStreak, dailyHabitsOn, isBestDay, isVacationDay } from '@/lib/habits';
import { perfectDayPenalty, perfectDayXP } from '@/lib/xp';
import type { HabitDay } from '@/lib/notion';
import { awardXP } from '@/components/XPBar';
import { bustCache, fetchCached, peekCache } from '@/lib/fetchCache';
import { IconWarning, IconChevronLeft, IconChevronRight, IconRefresh, IconVacation } from '@/components/icons';

const HabitsModal = dynamic(() => import('@/components/HabitsModal').then((mod) => mod.HabitsModal));

type WhoopDay = {
  date?: string;
  bodyWeightKg?: number;
  recovery?: number;
  strain?: number;
  sleepHours?: number;
  sleepPerformance?: number;
  hrv?: number;
  rhr?: number;
};

const TODAY_ISO = () => appToday();

// Daily-reflection fields — writing any of these auto-checks the "journaling" habit.
const REFLECTION_FIELDS: (keyof HabitDay)[] = ['dankbar', 'intention', 'gutGemacht', 'besserMorgen'];

type WeeklyValues = { gymWeek?: number; saunaWeek?: number; reflexion?: boolean; lesen?: boolean };

function startOfWeekISO(d = new Date()) {
  const dt = new Date(d);
  const dow = (dt.getDay() + 6) % 7; // Mon = 0
  dt.setDate(dt.getDate() - dow);
  return formatISODate(dt);
}

// The 7 ISO-week dates (Mon … Sun) containing the given date.
function weekDatesOf(dateISO: string): string[] {
  const start = startOfWeekISO(parseISODate(dateISO));
  return Array.from({ length: 7 }, (_, i) => dateAddDays(start, i));
}

export default function TodayPage() {
  const today = TODAY_ISO();
  const [selectedDate, setSelectedDate] = useState(today);
  const selectedDay = useMemo(() => parseISODate(selectedDate), [selectedDate]);
  const weekStart = useMemo(() => startOfWeekISO(selectedDay), [selectedDay]);

  const habitsUrl = `/api/habits?date=${selectedDate}`;
  const rangeUrl = useMemo(() => {
    const start = new Date(); start.setDate(start.getDate() - 90);
    return `/api/habits?start=${formatISODate(start)}&end=${today}`;
  }, [today]);
  // For "today" use the merged endpoint (latest available recovery/sleep, like the
  // Health/WHOOP pages); today's exact-date doc only has strain until WHOOP syncs.
  const whoopUrl = selectedDate === today
    ? '/api/whoop/daily?today=1'
    : `/api/whoop/daily?date=${selectedDate}`;

  const [day, setDay] = useState<HabitDay>(
    () => peekCache<{ day: HabitDay | null }>(habitsUrl)?.day || { date: selectedDate, habits: {} },
  );
  const [recent, setRecent] = useState<HabitDay[]>(
    () => peekCache<{ days: HabitDay[] }>(rangeUrl)?.days || [],
  );
  const [whoop, setWhoop] = useState<WhoopDay | null>(
    () => peekCache<{ day: WhoopDay | null }>(whoopUrl)?.day || null,
  );
  const [loading, setLoading] = useState(() => peekCache(habitsUrl) === undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showHabits, setShowHabits] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Paint cached data instantly (no empty flash when navigating back to Today).
    const cachedDay = peekCache<{ day: HabitDay | null }>(habitsUrl);
    const cachedRange = peekCache<{ days: HabitDay[] }>(rangeUrl);
    const cachedWhoop = peekCache<{ day: WhoopDay | null }>(whoopUrl);
    if (cachedDay) setDay(cachedDay.day || { date: selectedDate, habits: {} });
    if (cachedRange) setRecent(cachedRange.days || []);
    if (cachedWhoop) setWhoop(cachedWhoop.day || null);
    setLoading(!cachedDay);

    (async () => {
      const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
        try { return await p; }
        catch (e: any) {
          setSyncError(prev => prev || (e?.message || 'Netzwerkfehler beim Laden'));
          return fallback;
        }
      };
      const [todayRes, rangeRes, whoopRes] = await Promise.all([
        safe<{ day: HabitDay | null }>(fetchCached(habitsUrl, 30_000), { day: null }),
        safe<{ days: HabitDay[] }>(fetchCached(rangeUrl, 30_000), { days: [] }),
        safe<{ day: WhoopDay | null }>(fetchCached(whoopUrl, 5 * 60_000), { day: null }),
      ]);
      if (cancelled) return;
      setDay(todayRes.day || { date: selectedDate, habits: {} });
      setRecent(rangeRes.days || []);
      setWhoop(whoopRes.day || null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedDate, habitsUrl, rangeUrl, whoopUrl]);

  const streaks = useMemo(() => {
    const rows = recent.map(d => ({ date: d.date, habits: d.habits as any, vacation: d.vacation }));
    const map: Record<string, number> = {};
    for (const h of DAILY_HABITS) map[h.key] = computeStreak(h.key, rows, selectedDate);
    return map;
  }, [recent, selectedDate]);

  const onVacation = isVacationDay(day);

  // Habits paused for the selected month (e.g. no sauna in summer) stay visible
  // but inert — no controls, no XP in either direction.
  const [pausedMonths, setPausedMonths] = useState<Record<string, string[]>>({});
  useEffect(() => {
    fetchCached<{ pausedMonths: Record<string, string[]> }>('/api/habits/pause', 5 * 60_000)
      .then(j => setPausedMonths(j.pausedMonths || {}))
      .catch(() => {});
  }, []);
  const isPaused = (habitKey: string) => !!pausedMonths[habitKey]?.includes(selectedDate.slice(0, 7));

  function upsertRecent(next: HabitDay) {
    setRecent(arr => {
      const idx = arr.findIndex(d => d.date === next.date);
      if (idx >= 0) {
        const copy = [...arr];
        copy[idx] = next;
        return copy;
      }
      return [...arr, next].sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  // weekly counts are stored on daily rows; use the highest value in the week.
  const weekData = useMemo(() => {
    const rows = new Map<string, HabitDay>();
    for (const d of recent) {
      if (d.date >= weekStart && d.date <= selectedDate) rows.set(d.date, d);
    }
    if (day?.date && day.date >= weekStart && day.date <= selectedDate) rows.set(day.date, day);
    const weekRows = [...rows.values()];
    return {
      gym: Math.max(0, ...weekRows.map(d => d.gymWeek ?? 0)),
      sauna: Math.max(0, ...weekRows.map(d => d.saunaWeek ?? 0)),
      reflexion: weekRows.some(d => !!d.habits?.reflexion),
      lesen: weekRows.some(d => !!d.habits?.lesen),
    };
  }, [recent, weekStart, selectedDate, day]);

  async function persist(next: HabitDay) {
    try {
      const r = await fetch('/api/habits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        setSyncError(`Speichern fehlgeschlagen (${r.status}). ${txt.slice(0, 200)}`);
      } else {
        bustCache('/api/habits');
        setSyncError(null);
      }
    } catch (e: any) {
      setSyncError(`Speichern fehlgeschlagen: ${e?.message || 'Netzwerkfehler'}`);
    }
  }

  async function patchHabit(habitKey: string, value: boolean) {
    setBusy(habitKey);
    const base = day || { date: selectedDate, habits: {} };
    const wasBestDay = isBestDay(base.habits, selectedDate);
    const habits = { ...(base.habits || {}), [habitKey]: value } as Record<string, boolean | undefined>;
    habits.bestDay = isBestDay(habits, selectedDate);
    const next: HabitDay = { ...base, date: base.date || selectedDate, habits };
    setDay(next);
    upsertRecent(next);
    if (value && habits.bestDay) {
      awardXP('perfect_day', perfectDayXP(), selectedDate, `${selectedDate}:perfect_day`);
    }
    if (!value && wasBestDay && !habits.bestDay) {
      awardXP('perfect_day_missed', perfectDayPenalty(), selectedDate, `${selectedDate}:perfect_day:penalty`);
    }
    try { await persist(next); } finally { setBusy(null); }
  }

  async function patchPartial(partial: Partial<HabitDay>) {
    const base = day || { date: selectedDate, habits: {} };
    const next: HabitDay = { ...base, date: base.date || selectedDate, ...partial };

    // Automation: writing anything in the daily reflection auto-checks the "journaling" habit.
    const wroteReflection = REFLECTION_FIELDS.some(
      (f) => typeof (partial as any)[f] === 'string' && (partial as any)[f].trim() !== ''
    );
    let awardPerfect = false;
    if (wroteReflection && !base.habits?.journaling) {
      const wasBestDay = isBestDay(base.habits, selectedDate);
      const habits = { ...(base.habits || {}), journaling: true } as Record<string, boolean | undefined>;
      habits.bestDay = isBestDay(habits, selectedDate);
      next.habits = habits;
      awardPerfect = !wasBestDay && !!habits.bestDay;
    }

    setDay(next);
    upsertRecent(next);
    if (awardPerfect) awardXP('perfect_day', perfectDayXP(), selectedDate, `${selectedDate}:perfect_day`);
    await persist(next);
  }

  // Weekly habits are week-level facts — apply the value to every day of the
  // ISO week locally, then persist it to all 7 days so the data has no gaps.
  function applyWeekly(d: HabitDay, v: WeeklyValues): HabitDay {
    return {
      ...d,
      ...(v.gymWeek != null ? { gymWeek: v.gymWeek } : {}),
      ...(v.saunaWeek != null ? { saunaWeek: v.saunaWeek } : {}),
      ...(v.reflexion != null || v.lesen != null
        ? { habits: {
            ...(d.habits || {}),
            ...(v.reflexion != null ? { reflexion: v.reflexion } : {}),
            ...(v.lesen != null ? { lesen: v.lesen } : {}),
          } }
        : {}),
    };
  }

  function setWeeklyLocal(v: WeeklyValues) {
    const dates = new Set(weekDatesOf(selectedDate));
    setDay(prev => (dates.has(prev.date) ? applyWeekly(prev, v) : prev));
    setRecent(arr => {
      const map = new Map(arr.map(x => [x.date, x] as const));
      for (const date of dates) map.set(date, applyWeekly(map.get(date) || { date, habits: {} }, v));
      return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    });
  }

  async function persistWeekly(v: WeeklyValues) {
    try {
      const r = await fetch('/api/habits/week', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, ...v }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        setSyncError(`Speichern fehlgeschlagen (${r.status}). ${txt.slice(0, 200)}`);
      } else {
        bustCache('/api/habits');
        setSyncError(null);
      }
    } catch (e: any) {
      setSyncError(`Speichern fehlgeschlagen: ${e?.message || 'Netzwerkfehler'}`);
    }
  }

  async function bumpCounter(field: 'Gym_Week' | 'Sauna_Week', delta: number) {
    setBusy(field);
    const cur = field === 'Gym_Week' ? weekData.gym : weekData.sauna;
    const next = Math.max(0, cur + delta);
    const value: WeeklyValues = field === 'Gym_Week' ? { gymWeek: next } : { saunaWeek: next };
    setWeeklyLocal(value);
    try { await persistWeekly(value); } finally { setBusy(null); }
  }

  async function toggleWeeklyCheckbox(key: 'reflexion' | 'lesen', value: boolean) {
    setBusy(key);
    setWeeklyLocal({ [key]: value });
    try { await persistWeekly({ [key]: value }); } finally { setBusy(null); }
  }

  // Urlaubsmodus for the selected day. Ranges are set from the tracker; here it's
  // a single-day switch so the current day can be flagged (or un-flagged) directly.
  async function setVacation(on: boolean) {
    setBusy('vacation');
    const next: HabitDay = { ...(day || { date: selectedDate, habits: {} }), date: selectedDate };
    if (on) next.vacation = true;
    else { delete next.vacation; delete next.vacationLabel; }
    setDay(next);
    upsertRecent(next);
    try {
      const r = await fetch('/api/habits/vacation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ start: selectedDate, end: selectedDate, on }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        setSyncError(`Urlaub speichern fehlgeschlagen (${r.status}). ${txt.slice(0, 200)}`);
      } else {
        bustCache('/api/habits');
        setSyncError(null);
      }
    } catch (e: any) {
      setSyncError(`Urlaub speichern fehlgeschlagen: ${e?.message || 'Netzwerkfehler'}`);
    } finally {
      setBusy(null);
    }
  }

  // A habit added later shouldn't appear on days that predate it — that would
  // show a permanently unchecked box on every day in the archive.
  const habitsToday = dailyHabitsOn(selectedDate);
  const dailyDoneCount = habitsToday.filter(h => day?.habits?.[h.key as any]).length;
  const dailyPct = Math.round((dailyDoneCount / Math.max(1, habitsToday.length)) * 100);

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-8 pb-12">
      <Header
        dailyPct={dailyPct}
        dailyDone={dailyDoneCount}
        totalDaily={habitsToday.length}
        selectedDate={selectedDate}
        today={today}
        loading={loading}
        onVacation={onVacation}
        onPreviousDay={() => setSelectedDate(dateAddDays(selectedDate, -1))}
        onNextDay={() => setSelectedDate(dateAddDays(selectedDate, 1))}
        onToday={() => setSelectedDate(today)}
      />

      <AlertBanner compact className="mt-6 !mb-0" />

      {syncError && (
        <div className="notice notice--error mt-6">
          <div className="flex items-start gap-3">
            <IconWarning size={20} className="text-red shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red">Sync-Fehler</div>
              <p className="text-secondary text-xs mt-1 break-words">{syncError}</p>
              <p className="text-secondary text-xs mt-2">
                Häufige Ursachen: <code>NOTION_TOKEN</code> fehlt, Habits-DB nicht mit der Integration geteilt,
                Property-Namen weichen vom Schema ab. Siehe <code>ANLEITUNG.md</code>.
              </p>
              <button onClick={() => setSyncError(null)} className="btn-ghost mt-2 text-xs">Schließen</button>
            </div>
          </div>
        </div>
      )}

      {onVacation && (
        <div className="card mt-6 flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-elevated shadow-[var(--lip)]">
            <IconVacation size={18} className="text-white/45" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-primary">
              Urlaub{day?.vacationLabel ? ` — ${day.vacationLabel}` : ''}
            </div>
            <p className="text-secondary text-xs mt-0.5">
              Dieser Tag ist als bewusst nicht getrackt markiert. Er zählt nicht als verpasst und
              unterbricht keine Serie.
            </p>
          </div>
          <button type="button" className="btn-ghost btn-sm" disabled={busy === 'vacation'} onClick={() => setVacation(false)}>
            {busy === 'vacation' ? 'Speichern …' : 'Urlaub entfernen'}
          </button>
        </div>
      )}

      {/* Pinned goals live on the desktop dashboard only — hidden on the mobile start page. */}
      <PinnedGoals />

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Left column: Habits */}
        <section className="lg:col-span-2 space-y-5">
          <MorningRoutine />
          <DailyPassage date={selectedDate} />
          <WhoopHero day={whoop} />

          <div>
            <SectionHeader
              title="Tägliche Habits"
              right={
                <div className="flex items-center gap-2">
                  <span className="chip">{onVacation ? 'Urlaub' : `${dailyDoneCount}/${habitsToday.length}`}</span>
                  {/* Urlaub is set from the tracker (Habits → Urlaub), not from here —
                      it's a rare action and didn't earn a permanent slot in the header. */}
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setShowHabits(true)}>
                    Tracker
                  </button>
                </div>
              }
            />
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              {habitsToday.map(h => (
                <HabitCard
                  key={h.key}
                  habit={h}
                  done={!!day?.habits?.[h.key as any]}
                  streak={streaks[h.key]}
                  busy={busy === h.key}
                  date={selectedDate}
                  onToggle={() => patchHabit(h.key, !day?.habits?.[h.key as any])}
                />
              ))}
            </div>
          </div>

          <div>
            <SectionHeader title="Diese Woche" right={<span className="chip">KW {weekNumber(selectedDay)}</span>} />
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <HabitCard
                habit={WEEKLY_HABITS.find(h => h.key === 'gym')!}
                done={weekData.gym >= 3}
                count={weekData.gym}
                date={selectedDate}
                paused={isPaused('gym')}
                onIncrement={(d) => bumpCounter('Gym_Week', d)}
              />
              <HabitCard
                habit={WEEKLY_HABITS.find(h => h.key === 'sauna')!}
                done={weekData.sauna >= 1}
                count={weekData.sauna}
                date={selectedDate}
                paused={isPaused('sauna')}
                onIncrement={(d) => bumpCounter('Sauna_Week', d)}
              />
              <HabitCard
                habit={WEEKLY_HABITS.find(h => h.key === 'reflexion')!}
                done={weekData.reflexion}
                date={selectedDate}
                paused={isPaused('reflexion')}
                onToggle={() => toggleWeeklyCheckbox('reflexion', !weekData.reflexion)}
              />
              <HabitCard
                habit={WEEKLY_HABITS.find(h => h.key === 'lesen')!}
                done={weekData.lesen}
                date={selectedDate}
                paused={isPaused('lesen')}
                onToggle={() => toggleWeeklyCheckbox('lesen', !weekData.lesen)}
              />
            </div>
          </div>
        </section>

        {/* Right column: Reflexion */}
        <aside className="space-y-5 self-start">
          <DailyReflection
            initial={{
              dankbar: day?.dankbar,
              intention: day?.intention,
              gutGemacht: day?.gutGemacht,
              besserMorgen: day?.besserMorgen,
            }}
            date={selectedDate}
            onSave={(patch) => patchPartial(patch as any)}
          />

        </aside>
      </div>

      {showHabits && <HabitsModal open onClose={() => setShowHabits(false)} />}
    </main>
  );
}

function Header({
  dailyPct,
  dailyDone,
  totalDaily,
  selectedDate,
  today,
  loading,
  onVacation,
  onPreviousDay,
  onNextDay,
  onToday,
}: {
  dailyPct: number;
  dailyDone: number;
  totalDaily: number;
  selectedDate: string;
  today: string;
  loading: boolean;
  onVacation: boolean;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
}) {
  const selectedDay = parseISODate(selectedDate);
  const isToday = selectedDate === today;
  // On a vacation day the ring is meaningless — 0% would read as "failed".
  // Same reasoning at 0% on a normal day: at 8am nothing is ticked yet and that
  // is not a failure, so the floor is neutral rather than clay. Amber carries
  // "in progress", sage is reserved for actually finishing the day.
  const pctColor = onVacation || dailyPct === 0
    ? 'var(--fg-3)'
    : dailyPct === 100 ? 'var(--sage)' : 'var(--amber)';
  return (
    <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 fade-in">
      <div>
        <div className="label">
          {selectedDay.toLocaleDateString('de-DE', { weekday: 'long' })} ·{' '}
          {selectedDay.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
        <h1 className="h1 mt-2">{isToday ? greeting() : 'Tagesrückblick'}</h1>
        <p className="text-[14px] mt-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {onVacation
            ? 'Urlaub — an diesem Tag wurde bewusst nicht getrackt'
            : isToday
              ? (dailyDone === totalDaily ? 'Alle Habits erledigt — perfekt!' : `${dailyDone} von ${totalDaily} Habits heute erledigt`)
              : `${dailyDone} von ${totalDaily} Habits an diesem Tag erledigt`}
        </p>
      </div>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap md:justify-end">
        {/* Date navigator — full-width bar on mobile, compact on desktop */}
        <div className="glass flex h-14 w-full items-center gap-0.5 p-1.5 sm:w-auto" style={{ borderRadius: 18 }}>
          <button type="button" onClick={onPreviousDay} className="btn-ghost grid h-11 w-11 shrink-0 place-items-center rounded-full p-0" aria-label="Vorheriger Tag"><IconChevronLeft size={18} /></button>
          <div className="min-w-0 flex-1 px-1 text-center sm:flex-none sm:min-w-[112px]">
            <div className="text-[10px] font-semibold text-white/40">
              {dayLabel(selectedDate, today)}
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-white tabular-nums">
              {shortDateLabel(selectedDate)}
            </div>
          </div>
          <button type="button" onClick={onNextDay} disabled={selectedDate >= today || loading} className="btn-ghost grid h-11 w-11 shrink-0 place-items-center rounded-full p-0 disabled:opacity-30" aria-label="Nächster Tag"><IconChevronRight size={18} /></button>
          {!isToday && (
            <>
              <span className="mx-0.5 h-6 w-px shrink-0 bg-white/[0.08]" aria-hidden />
              <button type="button" onClick={onToday} disabled={loading} className="btn-ghost grid h-11 w-11 shrink-0 place-items-center rounded-full p-0 disabled:opacity-40" aria-label="Zurück zu heute" title="Zurück zu heute"><IconRefresh size={16} /></button>
            </>
          )}
        </div>

        {/* Daily progress — full-width bar on mobile, compact on desktop */}
        <div className="glass flex h-14 w-full items-center gap-3 px-4 sm:w-auto" style={{ borderRadius: 18 }}>
          {onVacation ? <IconVacation size={22} className="shrink-0 text-white/35" /> : <ProgressRing pct={dailyPct} color={pctColor} />}
          <span className="text-[10px] font-semibold text-white/40">
            {onVacation ? 'Urlaub' : 'Tagesfortschritt'}
          </span>
          <span className="ml-auto text-[17px] font-bold mono tabular-nums sm:ml-1" style={{ color: pctColor }}>
            {onVacation ? '—' : `${dailyPct}%`}
          </span>
        </div>
      </div>
    </header>
  );
}

function ProgressRing({ pct, color, size = 34 }: { pct: number; color: string; size?: number }) {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 14) return 'Mittagszeit';
  if (h < 18) return 'Schönen Nachmittag';
  if (h < 22) return 'Schönen Abend';
  return 'Späte Stunde';
}

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="h2">{title}</h2>
      {right}
    </div>
  );
}

function weekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function parseISODate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateAddDays(value: string, delta: number) {
  const date = parseISODate(value);
  date.setDate(date.getDate() + delta);
  return formatISODate(date);
}

function dayLabel(selectedDate: string, today: string) {
  if (selectedDate === today) return 'Heute';
  if (selectedDate === dateAddDays(today, -1)) return 'gestern';
  if (selectedDate === dateAddDays(today, 1)) return 'morgen';
  return parseISODate(selectedDate).toLocaleDateString('de-DE', { weekday: 'short' });
}

function shortDateLabel(value: string) {
  return parseISODate(value).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

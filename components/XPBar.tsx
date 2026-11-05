'use client';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './icons';

// Progress accent — sage, the one Tactile accent that means "forward".
const BRAND_GRADIENT = 'linear-gradient(90deg, #7ba888 0%, #9dc4a8 100%)';

type XPState = {
  totalXP: number;
  level: number;
  progressXP: number;
  neededXP: number;
  recent?: XPEntry[];
  summary7d?: {
    plusXP: number;
    minusXP: number;
    netXP: number;
  };
};

type XPEntry = {
  date: string;
  habit: string;
  xpGained: number;
  totalXP: number;
  level: number;
  createdAt: number;
};

export function XPBar({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<XPState | null>(null);
  const [levelUp, setLevelUp] = useState<{ from: number; to: number } | null>(null);
  const [levelDown, setLevelDown] = useState<{ from: number; to: number } | null>(null);
  const [perfectDay, setPerfectDay] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const prevLevelRef = useRef<number | null>(null);
  const reduced = useReducedMotion();

  async function refresh() {
    try {
      const r = await fetch('/api/xp', { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json() as XPState;
      const prev = prevLevelRef.current;
      if (prev != null && data.level > prev) {
        triggerLevelUp(prev, data.level, reduced);
        setLevelUp({ from: prev, to: data.level });
        setTimeout(() => setLevelUp(null), 2600);
      }
      if (prev != null && data.level < prev) {
        setLevelDown({ from: prev, to: data.level });
        setTimeout(() => setLevelDown(null), 1800);
      }
      prevLevelRef.current = data.level;
      setState(data);
    } catch {}
  }

  useEffect(() => {
    refresh();
    function onXPChanged() { refresh(); }
    function onPerfectDay() {
      triggerPerfectDay(reduced);
      setPerfectDay(true);
      setTimeout(() => setPerfectDay(false), 2600);
    }
    window.addEventListener('xp:changed', onXPChanged);
    window.addEventListener('perfectday:achieved', onPerfectDay);
    return () => {
      window.removeEventListener('xp:changed', onXPChanged);
      window.removeEventListener('perfectday:achieved', onPerfectDay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dashboardOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDashboardOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dashboardOpen]);

  if (!state) return null;
  const pct = state.neededXP > 0 ? (state.progressXP / state.neededXP) * 100 : 0;

  if (compact) {
    return (
      <>
        <div className="group flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDashboardOpen(true)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[12px] border text-[10px] font-bold tabular-nums transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand/45"
            aria-label="Level Dashboard öffnen"
            style={{
              borderColor: 'rgba(123,168,136,0.45)',
              background: 'linear-gradient(145deg, rgba(123,168,136,0.30), rgba(157,196,168,0.12))',
              color: '#9dc4a8',
            }}
          >
            {state.level}
          </button>
          <div className="min-w-[112px] flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[10px] font-semibold text-white/45">Level</span>
              <span className="text-[10px] font-semibold text-white/70 tabular-nums">{state.progressXP}/{state.neededXP}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full"
                style={{ background: BRAND_GRADIENT }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, pct)}%` }}
                transition={{ duration: reduced ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        </div>
        <LevelDashboardOverlay state={state} open={dashboardOpen} onClose={() => setDashboardOpen(false)} />
        <LevelUpOverlay levelUp={levelUp} />
        <LevelDownOverlay levelDown={levelDown} />
        <PerfectDayOverlay show={perfectDay} />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setDashboardOpen(true)}
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#7ba888]/45"
          aria-label="Level Dashboard öffnen"
          style={{
            background: BRAND_GRADIENT,
            color: '#fff',
            minWidth: 48,
            textAlign: 'center',
          }}
        >
          LVL {state.level}
        </button>
        <div className="flex-1 min-w-[80px]">
          <div className="h-2 rounded-full overflow-hidden bg-base shadow-well">
            <motion.div
              className="h-full rounded-full"
              style={{ background: BRAND_GRADIENT }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, pct)}%` }}
              transition={{ duration: reduced ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          {!compact && (
            <div className="text-[10px] text-secondary mt-1 tabular-nums">
              {state.progressXP} / {state.neededXP} XP
            </div>
          )}
        </div>
      </div>

      <LevelDashboardOverlay state={state} open={dashboardOpen} onClose={() => setDashboardOpen(false)} />
      <LevelUpOverlay levelUp={levelUp} />
      <LevelDownOverlay levelDown={levelDown} />
      <PerfectDayOverlay show={perfectDay} />
    </>
  );
}

function LevelDashboardOverlay({ state, open, onClose }: { state: XPState; open: boolean; onClose: () => void }) {
  const recent = state.recent || [];
  const summary = state.summary7d || summarizeXP(recent);
  const days = lastSevenDays().map(date => {
    const entries = recent.filter(entry => entry.date === date);
    const plus = entries.reduce((sum, entry) => sum + Math.max(0, entry.xpGained || 0), 0);
    const minus = entries.reduce((sum, entry) => sum + Math.min(0, entry.xpGained || 0), 0);
    return { date, plus, minus, net: plus + minus };
  });
  const latest = recent.slice(0, 8);

  return (
    <OverlayPortal>
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[10001] bg-black/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onMouseDown={onClose}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Level Dashboard"
              className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] w-[min(calc(100vw-32px),380px)] overflow-hidden rounded-card bg-elevated shadow-sheet-lg p-4"
              initial={{ y: 16, scale: 0.96, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 10, scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold text-white/40">Level Dashboard</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums text-white">LVL {state.level}</span>
                    <span className="text-xs font-semibold tabular-nums text-white/45">{state.totalXP} XP total</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="grid h-8 w-8 place-items-center rounded-full bg-elevated shadow-[var(--lip)] text-white/45 transition hover:bg-white/[0.08] hover:text-white"
                  aria-label="Level Dashboard schließen"
                >
                  <IconClose size={15} />
                </button>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] font-semibold tabular-nums text-white/55">
                  <span>{state.progressXP} / {state.neededXP} XP</span>
                  <span>{Math.round((state.progressXP / Math.max(1, state.neededXP)) * 100)}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.06]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (state.progressXP / Math.max(1, state.neededXP)) * 100)}%`,
                      background: BRAND_GRADIENT,
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <XPMetric label="Plus 7d" value={`+${summary.plusXP}`} color="#9dc4a8" />
                <XPMetric label="Minus 7d" value={`${summary.minusXP}`} color="#dda893" />
                <XPMetric label="Netto" value={formatSigned(summary.netXP)} color={summary.netXP >= 0 ? '#9dc4a8' : '#dda893'} />
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-white/40">Letzte 7 Tage</span>
                  <span className="text-[10px] font-semibold text-white/35">{recent.length} Events</span>
                </div>
                <div className="space-y-1.5">
                  {days.map(day => (
                    <div key={day.date} className="grid grid-cols-[44px_1fr_50px] items-center gap-2 text-[11px]">
                      <span className="font-semibold text-white/45">{shortDay(day.date)}</span>
                      <div className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
                        <div style={{ width: `${barWidth(day.plus, days)}%`, background: '#7ba888' }} />
                        <div style={{ width: `${barWidth(Math.abs(day.minus), days)}%`, background: '#c97b5a' }} />
                      </div>
                      <span className={`text-right font-semibold tabular-nums ${day.net >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                        {formatSigned(day.net)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-[10px] font-semibold text-white/40">Letzte Punkte</div>
                {latest.length ? (
                  <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                    {latest.map((entry, index) => (
                      <div key={`${entry.createdAt}-${entry.habit}-${index}`} className="flex items-center justify-between gap-3 rounded-[12px] border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-white/80">{xpLabel(entry.habit)}</div>
                          <div className="text-[10px] text-white/35">{formatEntryTime(entry)}</div>
                        </div>
                        <span className={`shrink-0 text-xs font-bold tabular-nums ${entry.xpGained >= 0 ? 'text-emerald-200' : 'text-red-200'}`}>
                          {formatSigned(entry.xpGained)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.03] px-3 py-4 text-center text-xs text-white/40">
                    Keine XP-Events in den letzten sieben Tagen.
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
}

function XPMetric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-[14px] border border-white/[0.06] bg-white/[0.035] px-3 py-2">
      <div className="text-[9px] font-semibold text-white/35">{label}</div>
      <div className="mt-1 text-sm font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function summarizeXP(entries: XPEntry[]) {
  const plusXP = entries.reduce((sum, entry) => sum + Math.max(0, entry.xpGained || 0), 0);
  const minusXP = entries.reduce((sum, entry) => sum + Math.min(0, entry.xpGained || 0), 0);
  return { plusXP, minusXP, netXP: plusXP + minusXP };
}

function lastSevenDays() {
  const days: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    days.push(localISODate(date));
  }
  return days;
}

function localISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function shortDay(dateISO: string) {
  return new Date(`${dateISO}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short' });
}

function barWidth(value: number, days: { plus: number; minus: number }[]) {
  const max = Math.max(1, ...days.map(day => Math.max(day.plus, Math.abs(day.minus))));
  return Math.min(100, (value / max) * 50);
}

function xpLabel(habit: string) {
  const labels: Record<string, string> = {
    journaling: 'Journaling',
    journaling_missed: 'Journaling verpasst',
    meditation: 'Meditation',
    meditation_missed: 'Meditation verpasst',
    lesen: 'Lesen',
    lesen_missed: 'Lesen / Podcast verpasst',
    kreatin: 'Kreatin',
    kreatin_missed: 'Kreatin verpasst',
    vitamine: 'Vitamine',
    vitamine_missed: 'Vitamine verpasst',
    kalorien: 'Kalorien tracken',
    kalorien_missed: 'Kalorien tracken verpasst',
    skincare: 'Skincare',
    skincare_missed: 'Skincare verpasst',
    noPhone: 'Kein Handy am Morgen',
    noPhone_missed: 'Kein Handy am Morgen verpasst',
    noSugar: 'Kein Zucker',
    noSugar_missed: 'Kein Zucker verpasst',
    reflexion: 'Wochenreflexion',
    reflexion_missed: 'Wochenreflexion verpasst',
    gym: 'Gym / Sport',
    gym_missed: 'Gym / Sport verpasst',
    sauna: 'Infrarot Sauna',
    sauna_missed: 'Infrarot Sauna verpasst',
    perfect_day: 'Perfect Day',
    perfect_day_missed: 'Perfect Day verloren',
    daily_reflection: 'Tägliche Reflexion',
    daily_reflection_missed: 'Tägliche Reflexion entfernt',
    weekly_reflection: 'Wochenreflexion',
    goal_completed: 'Ziel erledigt',
    goal_uncompleted: 'Ziel zurückgesetzt',
    goal_given_up: 'Ziel aufgegeben',
    all_done_bonus: 'Alle Habits erledigt',
    all_done_bonus_missed: 'Alle Habits Bonus verloren',
  };
  return labels[habit] || habit.replace(/_/g, ' ');
}

function formatEntryTime(entry: XPEntry) {
  const date = entry.createdAt ? new Date(entry.createdAt) : new Date(`${entry.date}T12:00:00`);
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' · ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function LevelUpOverlay({ levelUp }: { levelUp: { from: number; to: number } | null }) {
  return (
    <OverlayPortal>
      <AnimatePresence>
        {levelUp && (
          <motion.div
            className="fixed inset-0 z-[10000] grid place-items-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="absolute inset-0"
              initial={{ background: 'rgba(255,255,255,0)' }}
              animate={{ background: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0)'] }}
              transition={{ duration: 0.3, times: [0, 0.4, 1] }}
            />
            <motion.div
              className="text-center relative"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.4, 1], opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div className="text-xs text-secondary mb-2">Level Up!</div>
              <div
                className="text-7xl font-bold tabular-nums"
                style={{
                  background: BRAND_GRADIENT,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                LVL {levelUp.to}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
}

function PerfectDayOverlay({ show }: { show: boolean }) {
  return (
    <OverlayPortal>
      <AnimatePresence>
        {show && (
          <motion.div
            className="fixed inset-0 z-[10000] grid place-items-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="absolute inset-0"
              initial={{ background: 'rgba(255,255,255,0)' }}
              animate={{ background: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0)'] }}
              transition={{ duration: 0.3, times: [0, 0.4, 1] }}
            />
            <motion.div
              className="text-center relative"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: [0.5, 1.4, 1], opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
            >
              <div className="text-xs text-secondary mb-2">Perfect Day!</div>
              <div
                className="text-6xl font-bold"
                style={{
                  background: BRAND_GRADIENT,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Alle Habits
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
}

function LevelDownOverlay({ levelDown }: { levelDown: { from: number; to: number } | null }) {
  return (
    <OverlayPortal>
      <AnimatePresence>
        {levelDown && (
          <motion.div
            className="fixed inset-0 z-[10000] grid place-items-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="absolute inset-0"
              initial={{ background: 'rgba(201,123,90,0)' }}
              animate={{ background: ['rgba(201,123,90,0)', 'rgba(201,123,90,0.22)', 'rgba(10,10,10,0.55)'] }}
              transition={{ duration: 0.45, times: [0, 0.35, 1] }}
            />
            <motion.div
              className="relative text-center"
              initial={{ y: -28, scale: 1.2, opacity: 0 }}
              animate={{ y: [-28, 16, 0], scale: [1.2, 0.92, 1], opacity: 1 }}
              exit={{ y: 24, scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-2 text-xs" style={{ color: '#dda893' }}>Level Down</div>
              <div className="text-7xl font-bold tabular-nums" style={{ color: '#c97b5a', textShadow: '0 0 28px rgba(201,123,90,0.45)' }}>
                LVL {levelDown.to}
              </div>
              <div className="mt-2 text-xs font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {levelDown.from} -&gt; {levelDown.to}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
}

function OverlayPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

async function triggerLevelUp(_from: number, _to: number, reduced: boolean | null) {
  if (reduced) return;
  const { tsParticles } = await import('@tsparticles/engine');
  const { loadConfettiPreset } = await import('@tsparticles/preset-confetti');
  await loadConfettiPreset(tsParticles);
  const id = `levelup-${Date.now()}`;
  await tsParticles.load({
    id,
    options: {
      preset: 'confetti',
      fullScreen: { enable: true, zIndex: 9999 },
      particles: {
        color: { value: ['#7ba888', '#9dc4a8', '#ffffff'] },
        number: { value: 0 },
      },
      emitters: [
        { position: { x: 15, y: 50 }, rate: { quantity: 60, delay: 0.1 }, life: { duration: 0.5, count: 1 } },
        { position: { x: 85, y: 50 }, rate: { quantity: 60, delay: 0.1 }, life: { duration: 0.5, count: 1 } },
      ],
    },
  });
  setTimeout(() => tsParticles.dom().find(c => String(c.id) === id)?.destroy(), 3000);
}

async function triggerPerfectDay(reduced: boolean | null) {
  if (reduced) return;
  const { tsParticles } = await import('@tsparticles/engine');
  const { loadConfettiPreset } = await import('@tsparticles/preset-confetti');
  await loadConfettiPreset(tsParticles);
  const id = `perfectday-${Date.now()}`;
  await tsParticles.load({
    id,
    options: {
      preset: 'confetti',
      fullScreen: { enable: true, zIndex: 9999 },
      particles: {
        color: { value: ['#7ba888', '#9dc4a8', '#ffffff'] },
        number: { value: 0 },
      },
      emitters: [
        { position: { x: 50, y: 50 }, rate: { quantity: 90, delay: 0.1 }, life: { duration: 0.6, count: 1 } },
        { position: { x: 15, y: 50 }, rate: { quantity: 60, delay: 0.1 }, life: { duration: 0.5, count: 1 } },
        { position: { x: 85, y: 50 }, rate: { quantity: 60, delay: 0.1 }, life: { duration: 0.5, count: 1 } },
      ],
    },
  });
  setTimeout(() => tsParticles.dom().find(c => String(c.id) === id)?.destroy(), 3000);
}

/** Helper: call XP API + emit refresh event. Use from any component after a habit/reflection action. */
export async function awardXP(habit: string, xpGained: number, date?: string, idempotencyKey?: string) {
  try {
    const r = await fetch('/api/xp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ habit, xpGained, date, idempotencyKey }),
    });
    if (r.ok) {
      window.dispatchEvent(new CustomEvent('xp:changed'));
      // A perfect day (all daily habits checked) earns its own celebration,
      // mirroring the level-up overlay. Fire once at the awarding transition.
      if (habit === 'perfect_day') window.dispatchEvent(new CustomEvent('perfectday:achieved'));
    }
    return r.ok ? (await r.json()) : null;
  } catch {
    return null;
  }
}

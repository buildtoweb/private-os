'use client';
import { motion, useReducedMotion } from 'motion/react';
import { useRef } from 'react';
import { appToday } from '@/lib/date';
import { HabitDef } from '@/lib/habits';
import { habitPenalty, habitXP } from '@/lib/xp';
import { awardXP } from './XPBar';
import { HabitIcon } from './HabitIcon';

type Props = {
  habit: HabitDef;
  done: boolean;
  count?: number;
  streak?: number;
  busy?: boolean;
  onToggle?: () => void;
  onIncrement?: (delta: number) => void;
  variant?: 'wide' | 'compact';
  date?: string;
  /** Habit is paused for this month — inert, and worth no XP either way. */
  paused?: boolean;
};

export function HabitCard({ habit, done, count, streak, busy, onToggle, onIncrement, variant = 'wide', date, paused }: Props) {
  const isCounter = habit.notionType === 'counter';
  const cur = count ?? 0;
  const target = habit.target;
  const filled = isCounter ? Math.min(1, cur / target) : (done ? 1 : 0);
  const checkboxRef = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();

  // XP belongs to the click, not to the value: data arriving from the server (or
  // browsing to another week) changes `filled` too and must not award anything.
  function handleStep(delta: number) {
    if (!onIncrement) return;
    const next = Math.max(0, cur + delta);
    const xpDate = date || todayISO();
    onIncrement(delta);
    if (paused) return;
    if (cur < target && next >= target) {
      awardXP(habit.key, habitXP(habit.frequency, 0, 'counter'), xpDate, `${xpDate}:${habit.key}:target`);
    }
    if (cur >= target && next < target) {
      awardXP(`${habit.key}_missed`, habitPenalty(habit.frequency, 0, 'counter'), xpDate, `${xpDate}:${habit.key}:target:penalty`);
    }
  }

  async function handleToggle() {
    if (!onToggle) return;
    const wasDone = done;
    const xpDate = date || todayISO();
    onToggle();
    if (!wasDone && habit.frequency === 'daily') {
      awardXP(habit.key, habitXP(habit.frequency, (streak ?? 0) + 1), xpDate, `${xpDate}:${habit.key}`);
    }
    if (wasDone && habit.frequency === 'daily') {
      awardXP(`${habit.key}_missed`, habitPenalty(habit.frequency, streak ?? 0), xpDate, `${xpDate}:${habit.key}:penalty`);
    }
    if (!paused && !wasDone && habit.frequency === 'weekly') {
      awardXP(habit.key, habitXP(habit.frequency), xpDate, `${xpDate}:${habit.key}:weekly`);
    }
    if (!paused && wasDone && habit.frequency === 'weekly') {
      awardXP(`${habit.key}_missed`, habitPenalty(habit.frequency), xpDate, `${xpDate}:${habit.key}:weekly:penalty`);
    }
    if (!wasDone && !reduced) {
      const el = checkboxRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const origin = {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + rect.height / 2) / window.innerHeight,
        };
        const { default: confetti } = await import('canvas-confetti');
        confetti({
          particleCount: 12,
          spread: 30,
          startVelocity: 22,
          gravity: 1.2,
          ticks: 80,
          scalar: 0.7,
          origin,
          colors: [habit.color, lighten(habit.color)],
          disableForReducedMotion: true,
        });
      }
    }
  }

  return (
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      className="relative overflow-hidden rounded-tile"
      style={{
        // Tactile: a pressable slab that lifts when complete. Depth is shadow
        // and a lit top edge, never a border or a coloured left rule.
        background: filled === 1 && !paused ? 'var(--raised)' : 'var(--surface-2)',
        boxShadow: filled === 1 && !paused
          ? 'var(--shadow-2), inset 0 1px 0 rgba(255,255,255,0.09)'
          : 'var(--shadow-1), var(--lip)',
        opacity: paused ? 0.55 : 1,
        transition: 'background 300ms var(--ease), box-shadow 400ms var(--ease), opacity 200ms var(--ease)',
      }}
    >
      {isCounter && !paused && (
        <motion.div
          className="absolute inset-y-0 left-0"
          initial={false}
          animate={{ width: `${Math.min(100, filled * 100)}%` }}
          transition={{ type: 'spring', stiffness: 220, damping: 30 }}
          style={{ background: habit.bg, opacity: 0.6 }}
        />
      )}

      <div className={`relative flex items-center gap-4 p-4 ${variant === 'compact' ? '' : 'md:p-5'}`}>
        <div
          className="shrink-0 grid place-items-center rounded-well text-2xl"
          style={{
            width: 46, height: 46,
            // The icon well is the only place a habit's category colour shows.
            background: filled > 0 ? habit.bg : 'var(--bg-2)',
            boxShadow: 'var(--well)',
            transition: 'background 300ms var(--ease)',
          }}
          aria-hidden
        >
          <HabitIcon iconKey={habit.iconKey} size={20} color={filled > 0 ? habit.color : 'rgba(255,255,255,0.25)'} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-primary">{habit.label}</span>
            {isCounter && !paused && (
              <span className="text-xs text-secondary"><span className="font-semibold" style={{ color: filled === 1 ? habit.color : '#f5f2f0' }}>{cur}</span> / {target}</span>
            )}
          </div>
          {paused ? (
            <div className="text-secondary text-xs mt-0.5 truncate">Diesen Monat pausiert</div>
          ) : habit.description ? (
            <div className="text-secondary text-xs mt-0.5 truncate">{habit.description}</div>
          ) : null}
        </div>

        {streak != null && streak > 0 && (
          <div className="flex min-w-9 items-center justify-center gap-1 rounded-full border border-orange/25 bg-orange/10 px-2 py-1 text-xs font-semibold text-orange shrink-0" title={`${streak} Tage Streak`}>
            🔥 {streak}
          </div>
        )}

        {paused ? (
          // Inert while paused — the tracker is where it gets resumed.
          <span className="shrink-0 text-[11px] font-medium text-secondary">Pausiert</span>
        ) : isCounter ? (
          <div className="flex items-center gap-1 shrink-0">
            <IconBtn ariaLabel="weniger" onClick={() => handleStep(-1)} disabled={busy || cur === 0} color={habit.color}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>
            </IconBtn>
            <IconBtn ariaLabel="mehr" onClick={() => handleStep(1)} disabled={busy} color={habit.color}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </IconBtn>
          </div>
        ) : (
          <motion.button
            ref={checkboxRef}
            onClick={handleToggle}
            disabled={busy}
            aria-pressed={done}
            aria-label={`${habit.label} ${done ? 'erledigt' : 'offen'}`}
            className="shrink-0 w-10 h-10 rounded-full grid place-items-center disabled:opacity-50"
            style={{
              // Empty: a recessed well with a faint rim so it still reads as a
              // target on a dark tile. Done: a lit sage disc that sits proud.
              background: done ? 'var(--sage)' : 'var(--bg-2)',
              boxShadow: done
                ? '0 2px 8px rgba(123,168,136,0.36), inset 0 1px 0 rgba(255,255,255,0.24)'
                : 'inset 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)',
              transition: 'background 220ms var(--spring), box-shadow 220ms var(--spring)',
            }}
            whileTap={reduced ? undefined : { scale: 0.9 }}
          >
            {done && (
              // Plain SVG (not a motion component): the check must be visible whenever
              // the habit is done, independent of any JS animation completing. The
              // entrance pop is a CSS animation whose resting state is fully visible,
              // so a hidden tab or frequent re-renders can never leave it blank.
              <svg
                className="check-pop"
                width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="#16211a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M5 12l4 4 10-10" />
              </svg>
            )}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

function todayISO() {
  return appToday();
}

function IconBtn({ children, onClick, disabled, color, ariaLabel }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; color: string; ariaLabel: string }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      className="w-10 h-10 rounded-full grid place-items-center transition disabled:opacity-30 active:scale-95"
      style={{ background: 'var(--bg-2)', boxShadow: 'var(--well)', color }}
    >{children}</button>
  );
}

function lighten(hex: string): string {
  const c = hex.replace('#', '');
  const r = Math.min(255, parseInt(c.slice(0, 2), 16) + 40);
  const g = Math.min(255, parseInt(c.slice(2, 4), 16) + 40);
  const b = Math.min(255, parseInt(c.slice(4, 6), 16) + 40);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

'use client';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { HABIT_KEYS, HABIT_LABEL, HabitKey } from '@/lib/notion';
import { xpPenalty } from '@/lib/xp';
import { awardXP } from './XPBar';

type Props = {
  date: string;
  initial: Partial<Record<HabitKey, boolean>>;
  onSave: (key: HabitKey, value: boolean) => Promise<void> | void;
};

export function HabitChecklist({ date, initial, onSave }: Props) {
  const [state, setState] = useState<Partial<Record<HabitKey, boolean>>>(initial);
  const [pending, setPending] = useState<HabitKey | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const wasAllDoneRef = useRef(false);
  const allDoneAwardedRef = useRef(false);

  async function toggle(k: HabitKey) {
    const next = !state[k];
    setState(s => ({ ...s, [k]: next }));
    setPending(k);
    try {
      await onSave(k, next);
      if (next) awardXP(String(k), 10, date);
      else awardXP(`${String(k)}_missed`, xpPenalty(10), date, `${date}:${String(k)}:penalty`);
    } finally { setPending(null); }
  }

  const done = HABIT_KEYS.filter(k => state[k]).length;
  const allDone = done === HABIT_KEYS.length && HABIT_KEYS.length > 0;

  useEffect(() => {
    if (allDone && !wasAllDoneRef.current) {
      wasAllDoneRef.current = true;
      const timer = setTimeout(async () => {
        awardXP('all_done_bonus', 50, date);
        allDoneAwardedRef.current = true;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        if (!reduce) {
          const { default: confetti } = await import('canvas-confetti');
          const opts = { particleCount: 80, spread: 70, gravity: 1.0, ticks: 200, scalar: 1.0, colors: ['#7ba888', '#c97b5a', '#8b8299', '#e8a33d'], disableForReducedMotion: true };
          confetti({ ...opts, origin: { x: 0, y: 0.6 }, angle: 60 });
          confetti({ ...opts, origin: { x: 1, y: 0.6 }, angle: 120 });
        }
        setShowAllDone(true);
        setTimeout(() => setShowAllDone(false), 3500);
      }, 2000);
      return () => clearTimeout(timer);
    }
    if (!allDone && wasAllDoneRef.current) {
      wasAllDoneRef.current = false;
      if (allDoneAwardedRef.current) {
        allDoneAwardedRef.current = false;
        awardXP('all_done_bonus_missed', xpPenalty(50), date, `${date}:all_done_bonus:penalty`);
      }
    }
  }, [allDone, date]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <span className="label">Habits heute</span>
        <span className="text-secondary text-xs"><span className="text-primary font-semibold">{done}</span> / {HABIT_KEYS.length}</span>
      </div>
      <ul className="grid grid-cols-1 gap-2">
        {HABIT_KEYS.map((k) => {
          const on = !!state[k];
          const isPending = pending === k;
          return (
            <li key={k}>
              <button
                type="button"
                onClick={() => toggle(k)}
                disabled={isPending}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-card border transition min-h-[48px]
                  ${on ? 'bg-green/10 border-green/30' : 'bg-base border-border hover:border-secondary'}`}
                aria-pressed={on}
              >
                <span
                  className={`grid place-items-center w-6 h-6 rounded-md border-2 transition shrink-0
                    ${on ? 'bg-green border-green' : 'border-secondary'}`}
                >
                  {on && (
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#191719" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l4 4 10-10" />
                    </svg>
                  )}
                </span>
                <span className={`text-sm ${on ? 'text-primary' : 'text-secondary'}`}>{HABIT_LABEL[k]}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {showAllDone && (
          <motion.div
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2 rounded-full text-sm font-semibold shadow-lg pointer-events-none"
            style={{ background: '#7ba888', color: '#191719' }}
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          >
            💪 Perfekter Tag!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

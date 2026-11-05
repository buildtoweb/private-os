'use client';
import { motion, useReducedMotion } from 'motion/react';
import { MOOD_FACES } from '@/lib/habits';

export function MoodPicker({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  const sel = value ? MOOD_FACES.find(m => m.v === value) : undefined;
  const reduced = useReducedMotion();
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label">Mood heute</div>
          {sel && (
            <motion.div
              key={sel.v}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-1 text-sm font-semibold"
              style={{ color: sel.color }}
            >
              {sel.emoji} {sel.label}
            </motion.div>
          )}
          {!sel && <div className="mt-1 text-secondary text-sm">Wähle deine Stimmung</div>}
        </div>
        {sel && (
          <motion.div
            key={`v-${sel.v}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className="text-3xl font-semibold"
            style={{ color: sel.color }}
          >
            {sel.v}
          </motion.div>
        )}
      </div>
      <motion.div
        className="grid grid-cols-10 gap-1.5"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: reduced ? 0 : 0.03 } },
        }}
      >
        {MOOD_FACES.map(m => {
          const active = value === m.v;
          const dim = sel != null && !active;
          return (
            <motion.button
              key={m.v}
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: { opacity: 1, y: 0 },
              }}
              whileHover={reduced ? undefined : { scale: 1.3, y: -4 }}
              whileTap={{ scale: 0.95 }}
              animate={{
                scale: active ? 1.25 : 1,
                opacity: dim ? 0.45 : 1,
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 18 }}
              onClick={() => onChange(m.v)}
              aria-label={`Mood ${m.v} - ${m.label}`}
              aria-pressed={active}
              className="aspect-square grid place-items-center text-xl rounded-lg border"
              style={{
                background: active ? m.color + '33' : '#191719',
                borderColor: active ? m.color : '#2a272b',
                boxShadow: active ? `0 0 16px ${m.color}55` : 'none',
              }}
            >
              <span className="leading-none">{m.emoji}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}

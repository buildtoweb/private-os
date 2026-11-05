'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Ring } from './Ring';

type Props = {
  recovery?: number; // 0..100
  hrv?: number;
  rhr?: number;
  sleepHours?: number;
  sleepPerformance?: number;
  size?: number;
};

function colorForScore(score?: number): string {
  if (score == null) return '#2a272b';
  if (score > 66) return '#7ba888';
  if (score >= 33) return '#e8a33d';
  return '#c97b5a';
}

export function RecoveryRing({ recovery, hrv, rhr, sleepHours, sleepPerformance, size = 160 }: Props) {
  const [open, setOpen] = useState(false);
  const score = recovery;
  const color = colorForScore(score);
  const v = (score ?? 0) / 100;

  return (
    <>
      <Ring
        value={v}
        size={size}
        stroke={12}
        color={color}
        sublabel="Erholung"
        pulse={score != null}
        numericValue={score}
        numericSuffix="%"
        onClick={() => setOpen(true)}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            className="safe-modal-overlay fixed inset-0 z-[9000] grid place-items-center p-4 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="card max-w-md w-full"
              role="dialog"
              aria-modal="true"
              aria-label="Recovery Details"
              initial={{ scale: 0.92, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-semibold">RECOVERY DETAILS</div>
                <button onClick={() => setOpen(false)} className="text-secondary hover:text-primary text-xl leading-none" aria-label="Schließen">×</button>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Stat label="Recovery" value={score != null ? `${Math.round(score)}%` : '–'} color={color} />
                <Stat label="HRV" value={hrv != null ? `${Math.round(hrv)} ms` : '–'} color="#8b8299" />
                <Stat label="RHR" value={rhr != null ? `${Math.round(rhr)} bpm` : '–'} color="#c97b5a" />
                <Stat label="Schlaf" value={sleepHours != null ? `${sleepHours.toFixed(1)} h` : '–'} color="#7d93b0" />
                {sleepPerformance != null && (
                  <Stat label="Schlaf-Performance" value={`${Math.round(sleepPerformance)}%`} color="#7d93b0" />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-card border border-border bg-base p-3">
      <div className="label">{label}</div>
      <div className="text-lg font-semibold mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

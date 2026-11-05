'use client';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

type Props = {
  value: number; // 0..1
  size?: number;
  stroke?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
  /** When true, ring pulses based on the value (recovery-style behavior). */
  pulse?: boolean;
  /** When set, label content animates as a counting number 0 -> numericValue on mount/value-change. */
  numericValue?: number;
  /** Suffix appended to the animated counter (e.g. '%'). */
  numericSuffix?: string;
  onClick?: () => void;
};

export function Ring({
  value,
  size = 120,
  stroke = 10,
  color = '#7ba888',
  trackColor = '#2a272b',
  label,
  sublabel,
  pulse = false,
  numericValue,
  numericSuffix = '',
  onClick,
}: Props) {
  const v = Math.max(0, Math.min(1, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const reduced = useReducedMotion();
  const counterRef = useRef<HTMLDivElement>(null);
  const [bouncing, setBouncing] = useState(false);
  const offset = c * (1 - v);

  const pulseConfig = (() => {
    if (!pulse) return null;
    const score = v * 100;
    if (score > 66) return { duration: 3, scale: [1, 1.025, 1] as number[] };
    if (score > 33) return { duration: 2, scale: [1, 1.035, 1] as number[] };
    return { duration: 1.5, scale: [1, 1.05, 1] as number[] };
  })();

  useEffect(() => {
    if (numericValue == null || !counterRef.current) return;
    if (reduced) {
      counterRef.current.textContent = `${Math.round(numericValue)}${numericSuffix}`;
      return;
    }
    let cancelled = false;
    (async () => {
      const { default: gsap } = await import('gsap');
      if (cancelled) return;
      const obj = { v: 0 };
      gsap.to(obj, {
        v: numericValue,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: () => {
          if (counterRef.current) counterRef.current.textContent = `${Math.round(obj.v)}${numericSuffix}`;
        },
      });
    })();
    return () => { cancelled = true; };
  }, [numericValue, numericSuffix, reduced]);

  function handleClick() {
    if (!onClick) return;
    if (!reduced) {
      setBouncing(true);
      setTimeout(() => setBouncing(false), 220);
    }
    onClick();
  }

  return (
    <motion.div
      className={`relative grid place-items-center ${onClick ? 'cursor-pointer' : ''}`}
      style={{ width: size, height: size }}
      animate={
        bouncing
          ? { scale: [1, 1.1, 1] }
          : pulseConfig && !reduced
            ? { scale: pulseConfig.scale }
            : { scale: 1 }
      }
      transition={
        bouncing
          ? { duration: 0.22, ease: 'easeOut' }
          : pulseConfig && !reduced
            ? { duration: pulseConfig.duration, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0 }
      }
      onClick={handleClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        {/* Plain circle drawn directly at the target offset so the coloured arc is
            always visible. A CSS transition (not a JS animation that can stall or
            restart on re-render) smoothly animates when the value changes. */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: reduced ? undefined : 'stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center pointer-events-none">
        <div>
          {numericValue != null ? (
            <div ref={counterRef} className="text-2xl font-semibold leading-none tabular-nums">0{numericSuffix}</div>
          ) : (
            label && <div className="text-2xl font-semibold leading-none">{label}</div>
          )}
          {sublabel && <div className="text-secondary text-[10px] mt-1">{sublabel}</div>}
        </div>
      </div>
    </motion.div>
  );
}

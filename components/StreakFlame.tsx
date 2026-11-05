'use client';
import { useEffect, useId, useRef, useState } from 'react';

const MILESTONES = [7, 14, 30, 50, 100, 365];

type Tier = { scale: number; pulse: boolean; aura: boolean; label: string };
function getTier(days: number): Tier {
  if (days >= 100) return { scale: 1.8, pulse: true, aura: true, label: 'inferno' };
  if (days >= 30) return { scale: 1.6, pulse: true, aura: false, label: 'epic' };
  if (days >= 14) return { scale: 1.3, pulse: false, aura: false, label: 'large' };
  if (days >= 7) return { scale: 1.0, pulse: false, aura: false, label: 'medium' };
  return { scale: 0.7, pulse: false, aura: false, label: 'small' };
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function StreakFlame({ streakDays, habitName }: { streakDays: number; habitName: string }) {
  const tier = getTier(streakDays);
  const [particlesReady, setParticlesReady] = useState(false);
  const containerId = `flame-${useId().replace(/:/g, '')}`;
  const reduced = prefersReducedMotion();

  // Lazy-load tsParticles only when component mounts and motion is allowed
  useEffect(() => {
    if (reduced) return;
    let cancelled = false;
    (async () => {
      const [{ tsParticles }, { loadFirePreset }] = await Promise.all([
        import('@tsparticles/engine'),
        import('@tsparticles/preset-fire'),
      ]);
      await loadFirePreset(tsParticles);
      if (cancelled) return;
      await tsParticles.load({
        id: containerId,
        options: {
          preset: 'fire',
          background: { color: 'transparent' },
          fullScreen: { enable: false },
          fpsLimit: 45,
          particles: {
            number: { value: streakDays >= 30 ? 80 : streakDays >= 7 ? 50 : 30 },
            color: { value: ['#c97b5a', '#e8a33d', '#ffb347'] },
            move: { speed: { min: 1, max: 3 } },
            size: { value: { min: 1, max: 4 } },
          },
        },
      });
      setParticlesReady(true);
    })();
    return () => {
      cancelled = true;
      // cleanup: destroy container if exists
      import('@tsparticles/engine').then(({ tsParticles }) => {
        tsParticles.dom().find(c => String(c.id) === containerId)?.destroy();
      });
    };
  }, [containerId, streakDays, reduced]);

  return (
    <div className="relative inline-flex items-center gap-4">
      {/* Flame visual */}
      <div
        className="relative grid place-items-center"
        style={{
          width: 80,
          height: 96,
          transform: `scale(${tier.scale})`,
          transformOrigin: 'bottom center',
          transition: 'transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {tier.aura && (
          <div
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(255,122,69,0.35) 0%, transparent 70%)',
              filter: 'blur(12px)',
              animation: reduced ? undefined : 'flame-aura 2.4s ease-in-out infinite',
            }}
          />
        )}
        {/* Particles container */}
        <div
          id={containerId}
          className="absolute inset-0"
          style={{ animation: tier.pulse && !reduced ? 'flame-pulse 1.6s ease-in-out infinite' : undefined }}
        />
        {/* Fallback emoji if particles not ready or reduced motion */}
        {(!particlesReady || reduced) && (
          <span className="text-5xl select-none" aria-hidden>🔥</span>
        )}
      </div>

      {/* Streak count */}
      <div className="flex flex-col leading-none">
        <span
          className="font-semibold tabular-nums"
          style={{ fontSize: 48, color: streakDays >= 30 ? '#c97b5a' : 'var(--fg)' }}
        >
          {streakDays}
        </span>
        <span className="text-xs text-secondary mt-1">
          {habitName} · {streakDays === 1 ? 'Tag' : 'Tage'}
        </span>
      </div>

      <style jsx>{`
        @keyframes flame-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.85; transform: scale(1.06); }
        }
        @keyframes flame-aura {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>

      <StreakMilestoneOverlay streakDays={streakDays} reduced={reduced} />
    </div>
  );
}

/* ─── Milestone overlay (GSAP + confetti) ────────────────────────── */

function StreakMilestoneOverlay({ streakDays, reduced }: { streakDays: number; reduced: boolean }) {
  const [show, setShow] = useState(false);
  const numberRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const lastTriggeredRef = useRef<number | null>(null);

  useEffect(() => {
    if (!MILESTONES.includes(streakDays)) return;
    if (lastTriggeredRef.current === streakDays) return;
    lastTriggeredRef.current = streakDays;
    if (reduced) {
      // Reduced motion: brief opacity-only flash
      setShow(true);
      const t = setTimeout(() => setShow(false), 1500);
      return () => clearTimeout(t);
    }
    setShow(true);

    let cleanup: (() => void) | undefined;
    (async () => {
      const [{ default: gsap }, { tsParticles }, { loadConfettiPreset }] = await Promise.all([
        import('gsap'),
        import('@tsparticles/engine'),
        import('@tsparticles/preset-confetti'),
      ]);
      await loadConfettiPreset(tsParticles);

      // Counter animation
      if (numberRef.current) {
        const counter = { v: 0 };
        gsap.to(counter, {
          v: streakDays,
          duration: 1.2,
          ease: 'power2.out',
          onUpdate: () => {
            if (numberRef.current) numberRef.current.textContent = String(Math.round(counter.v));
          },
        });
      }

      // Confetti burst
      const confettiId = `milestone-confetti-${Date.now()}`;
      await tsParticles.load({
        id: confettiId,
        options: {
          preset: 'confetti',
          fullScreen: { enable: true, zIndex: 9999 },
          particles: {
            color: { value: ['#7ba888', '#c97b5a', '#8b8299', '#e8a33d'] },
            number: { value: 0 },
          },
          emitters: [
            { position: { x: 25, y: 50 }, rate: { quantity: 50, delay: 0.1 }, life: { duration: 0.4, count: 1 } },
            { position: { x: 75, y: 50 }, rate: { quantity: 50, delay: 0.1 }, life: { duration: 0.4, count: 1 } },
          ],
        },
      });

      // Auto-dismiss after 2s + cleanup particles after 3s
      const hideT = setTimeout(() => setShow(false), 2000);
      const cleanupT = setTimeout(() => {
        tsParticles.dom().find(c => String(c.id) === confettiId)?.destroy();
      }, 3000);
      cleanup = () => { clearTimeout(hideT); clearTimeout(cleanupT); };
    })();

    return () => cleanup?.();
  }, [streakDays, reduced]);

  if (!show) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 grid place-items-center pointer-events-none z-[10000]"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 100%)',
        animation: 'milestone-fade 2000ms ease-out forwards',
      }}
    >
      <div className="text-center">
        <div className="text-6xl mb-2">🔥</div>
        <div
          ref={numberRef}
          className="font-semibold tabular-nums"
          style={{ fontSize: 120, color: '#7ba888', lineHeight: 1 }}
        >
          0
        </div>
        <div className="mt-2 text-2xl font-medium" style={{ color: '#7ba888' }}>
          Tage Streak!
        </div>
      </div>
      <style jsx>{`
        @keyframes milestone-fade {
          0% { opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

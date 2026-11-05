'use client';
import { createContext, useContext, useState } from 'react';

// Privacy mode for monetary amounts. Default = hidden on every load, so
// switching to the Finance tab never instantly reveals balances. Revealing is
// session-only (state, not persisted) and resets on reload/navigation.
const PrivacyCtx = createContext<{ hidden: boolean; toggle: () => void }>({ hidden: true, toggle: () => {} });

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(true);
  return <PrivacyCtx.Provider value={{ hidden, toggle: () => setHidden((h) => !h) }}>{children}</PrivacyCtx.Provider>;
}

export function usePrivacy() { return useContext(PrivacyCtx); }

// Wraps a monetary value; blurs it when privacy mode is on. `strong` uses a
// heavier blur for large display numbers (a 7px blur barely affects 48px text).
export function Money({ children, className = '', strong = false }: { children: React.ReactNode; className?: string; strong?: boolean }) {
  const { hidden } = usePrivacy();
  return (
    <span
      className={`${className} ${hidden ? `select-none ${strong ? 'blur-[16px]' : 'blur-[7px]'}` : ''} transition-[filter] duration-200`}
      aria-hidden={hidden}
    >
      {children}
    </span>
  );
}

export function PrivacyToggle() {
  const { hidden, toggle } = usePrivacy();
  return (
    <button
      onClick={toggle}
      className="grid h-9 w-9 place-items-center rounded-[14px] bg-elevated shadow-[var(--lip)] text-white/60 transition hover:bg-white/[0.08] hover:text-white"
      aria-label={hidden ? 'Beträge anzeigen' : 'Beträge verbergen'}
      title={hidden ? 'Beträge anzeigen' : 'Beträge verbergen'}
    >
      {hidden ? <EyeOff /> : <Eye />}
    </button>
  );
}

const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
function Eye() { return (<svg {...svg}><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>); }
function EyeOff() { return (<svg {...svg}><path d="M10.7 5.1A11 11 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-2.2 3.1M6.6 6.6A13 13 0 0 0 2 12s3 7 10 7a11 11 0 0 0 4.3-.9" /><path d="m2 2 20 20" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>); }

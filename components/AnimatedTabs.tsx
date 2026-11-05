'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type TabItem<V extends string = string> = {
  value: V;
  label: string;
  className?: string;
  'data-drop'?: string;
  'data-date'?: string;
};

type Props<V extends string> = {
  tabs: TabItem<V>[];
  value: V;
  onChange: (v: V) => void;
  size?: 'md' | 'sm';
  className?: string;
};

// Sliding-indicator tabs — the JS-measured twin of the `.seg` control in
// globals.css, used where the indicator has to animate between widths.
// Container is a recessed well; the active pill is a raised surface that
// springs between positions. Keep the two in visual sync.
export function AnimatedTabs<V extends string>({ tabs, value, onChange, size = 'md', className }: Props<V>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const activeIndex = Math.max(0, tabs.findIndex(tab => tab.value === value));

  // Derive the measured button from the same controlled value that renders the
  // active label. This avoids an effect-order race where the content changes
  // first but the sliding pill still measures the previously selected tab.
  const recalc = useCallback(() => {
    const wrap = wrapRef.current;
    const el = btnRefs.current[activeIndex];
    if (!wrap || !el) return;
    const wrapRect = wrap.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    setPill({ left: elRect.left - wrapRect.left, width: elRect.width });
  }, [activeIndex]);

  useLayoutEffect(() => {
    recalc();
  }, [recalc, tabs.length]);

  useEffect(() => {
    const onResize = () => recalc();
    window.addEventListener('resize', onResize);
    // Re-measure after first paint and once webfonts settle — label widths can
    // shift, which otherwise leaves the pill mispositioned (e.g. on deep-links
    // that select a tab in a post-mount effect).
    const raf = requestAnimationFrame(recalc);
    (document as any).fonts?.ready?.then(() => recalc()).catch(() => {});
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  }, [recalc]);

  const padY = size === 'sm' ? '4px' : '5px';
  const padX = size === 'sm' ? '5px' : '6px';
  const btnPad = size === 'sm' ? '6px 12px' : '8px 16px';
  const fontSize = size === 'sm' ? 13 : 14;

  return (
    <div
      ref={wrapRef}
      role="tablist"
      className={['relative inline-flex', className].filter(Boolean).join(' ')}
      style={{
        padding: `${padY} ${padX}`,
        borderRadius: 999,
        background: 'var(--bg-2)',
        border: 'none',
        boxShadow: 'var(--well)',
      }}
    >
      {pill && (
        <span
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            top: padY,
            bottom: padY,
            left: pill.left,
            width: pill.width,
            borderRadius: 999,
            // Raised surface, not the accent: sage is reserved for progress and
            // positive state, and a segmented control is neither.
            background: 'var(--raised)',
            boxShadow: 'var(--shadow-1), inset 0 1px 0 rgba(255,255,255,0.08)',
            transition: 'left 0.25s var(--spring), width 0.25s var(--spring)',
          }}
        />
      )}
      {tabs.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={el => { btnRefs.current[i] = el; }}
            role="tab"
            type="button"
            aria-selected={active}
            data-drop={t['data-drop']}
            data-date={t['data-date']}
            onClick={() => onChange(t.value)}
            className={['relative font-medium whitespace-nowrap transition-colors', t.className].filter(Boolean).join(' ')}
            style={{
              zIndex: 1,
              padding: btnPad,
              fontSize,
              borderRadius: 999,
              background: 'transparent',
              border: 'none',
              fontWeight: 600,
              color: active ? 'var(--fg)' : 'var(--fg-2)',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

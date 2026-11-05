import type { Config } from 'tailwindcss';

// Colours here mirror the CSS custom properties in app/globals.css (Direction C
// · Tactile). Literals rather than var() references, because Tailwind needs real
// values to generate opacity variants like `text-secondary/70`. When a token
// changes, change it in BOTH places — globals.css is the source of truth.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces — opaque, layered. Nothing here is see-through.
        base:        '#141315',
        card:        '#211f22',
        elevated:    '#2a272b',
        raised:      '#322e33',
        border:      'rgba(255,255,255,0.055)',
        // Ink
        primary:     '#f5f2f0',
        secondary:   'rgba(245,242,240,0.60)',
        muted:       'rgba(245,242,240,0.34)',
        // Accent — sage is the one functional accent (progress, positive, active)
        brand:       '#7ba888',
        'brand-dark':'#6b9878',
        'brand-pink':'#9dc4a8',
        // Semantic — the four-accent duotone, no rainbow
        green:       '#7ba888',
        yellow:      '#e8a33d',
        red:         '#c97b5a',
        blue:        '#7d93b0',
        orange:      '#c97b5a',
        purple:      '#7d93b0',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '22px',
        pill: '999px',
        tile: '18px',
        well: '16px',
      },
      boxShadow: {
        // `glass` keeps its name so old call sites resolve; it is an opaque
        // sheet shadow now, not a frosted panel.
        glass: '0 1px 2px rgba(0,0,0,0.42), 0 2px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.055)',
        sheet: '0 1px 2px rgba(0,0,0,0.42), 0 2px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.055)',
        'sheet-lg': '0 2px 4px rgba(0,0,0,0.38), 0 12px 32px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.055)',
        well: 'inset 0 1px 3px rgba(0,0,0,0.50)',
        brand: '0 2px 10px rgba(123,168,136,0.30)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
      },
    },
  },
  plugins: [],
};
export default config;

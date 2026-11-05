// Shared stroke icon set (Lucide-style) so the UI never uses emoji as chrome.
// One consistent visual language: 1.8 stroke, round caps, currentColor.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
}

export function IconWarning(p: IconProps) {
  return (<svg {...base(p)}><path d="M10.3 3.8 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>);
}
export function IconPin(p: IconProps) {
  return (<svg {...base(p)}><path d="M12 17v5" /><path d="M9 10.8V4h6v6.8c0 .5.2 1 .6 1.4l1.9 2A1 1 0 0 1 16.8 16H7.2a1 1 0 0 1-.7-1.8l1.9-2c.4-.4.6-.9.6-1.4Z" /></svg>);
}
export function IconCheck(p: IconProps) {
  return (<svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>);
}
export function IconClose(p: IconProps) {
  return (<svg {...base(p)}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>);
}
export function IconChevronLeft(p: IconProps) {
  return (<svg {...base(p)}><path d="m15 18-6-6 6-6" /></svg>);
}
export function IconChevronRight(p: IconProps) {
  return (<svg {...base(p)}><path d="m9 18 6-6-6-6" /></svg>);
}
export function IconChevronDown(p: IconProps) {
  return (<svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>);
}
export function IconRefresh(p: IconProps) {
  return (<svg {...base(p)}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>);
}
export function IconPlus(p: IconProps) {
  return (<svg {...base(p)}><path d="M12 5v14" /><path d="M5 12h14" /></svg>);
}
export function IconMinus(p: IconProps) {
  return (<svg {...base(p)}><path d="M5 12h14" /></svg>);
}
// Per-month habit pause (e.g. no sauna in summer) and its counterpart.
export function IconPause(p: IconProps) {
  return (<svg {...base(p)}><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>);
}
export function IconPlay(p: IconProps) {
  return (<svg {...base(p)}><path d="M6 3.7v16.6a1 1 0 0 0 1.5.87l13.2-8.3a1 1 0 0 0 0-1.74L7.5 2.83A1 1 0 0 0 6 3.7Z" /></svg>);
}
// Urlaubsmodus marker — a rolling suitcase, used wherever a day is flagged as
// "away, deliberately not tracked".
export function IconVacation(p: IconProps) {
  return (<svg {...base(p)}><path d="M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2" /><path d="M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14" /><path d="M10 20h4" /><circle cx="8" cy="20" r="2" /><circle cx="16" cy="20" r="2" /></svg>);
}

// --- Activity glyphs (WHOOP sports map to one of these categories) ---
export function IconActivity(p: IconProps) {
  return (<svg {...base(p)}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>);
}
export function IconRun(p: IconProps) {
  return (<svg {...base(p)}><circle cx="13" cy="4" r="1.6" /><path d="m9 21 1.5-5L8 13l-2 2" /><path d="m7 9 3-2 3 2 2 2" /><path d="m13 16 2 1 1 4" /></svg>);
}
export function IconBike(p: IconProps) {
  return (<svg {...base(p)}><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M6 18 12 8h3l1 3 2 7" /><circle cx="15" cy="5" r="1.4" /></svg>);
}
export function IconDumbbell(p: IconProps) {
  return (<svg {...base(p)}><path d="M6.5 6.5 17.5 17.5" /><path d="m3 8 1.5-1.5a2 2 0 0 1 3 0L9 8 8 9l-4-1Z" transform="translate(-1 -1)" /><path d="M2.5 9.5 4 8m12 8 1.5-1.5" /><path d="M4 10 2 8m18 6-2-2" /><path d="m6.5 6.5-2 2m13 9-2 2" /></svg>);
}
export function IconBall(p: IconProps) {
  return (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0 0 18M3 12a9 9 0 0 1 18 0" /></svg>);
}
export function IconWater(p: IconProps) {
  return (<svg {...base(p)}><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z" /></svg>);
}
export function IconMind(p: IconProps) {
  return (<svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M6 21a6 6 0 0 1 12 0" /></svg>);
}

// --- Health metric glyphs ---
export function IconMoon(p: IconProps) {
  return (<svg {...base(p)}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>);
}
export function IconBolt(p: IconProps) {
  return (<svg {...base(p)}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>);
}
export function IconHeart(p: IconProps) {
  return (<svg {...base(p)}><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" /></svg>);
}
export function IconBattery(p: IconProps) {
  return (<svg {...base(p)}><rect x="2" y="8" width="16" height="9" rx="2" /><path d="M21 11v3" /></svg>);
}

// --- Status / trend glyphs ---
export function IconTrendUp(p: IconProps) {
  return (<svg {...base(p)}><path d="m4 16 5-5 4 4 7-7" /><path d="M16 8h5v5" /></svg>);
}
export function IconTrendDown(p: IconProps) {
  return (<svg {...base(p)}><path d="m4 8 5 5 4-4 7 7" /><path d="M16 16h5v-5" /></svg>);
}

export function IconBookmark(p: IconProps) {
  return (<svg {...base(p)}><path d="M19 21l-7-4.5L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" /></svg>);
}
// ——— Planner ———
export function IconClock(p: IconProps) {
  return (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
}
export function IconSunrise(p: IconProps) {
  return (<svg {...base(p)}><path d="M12 2v4" /><path d="m4.9 8.9 1.4 1.4" /><path d="m17.7 10.3 1.4-1.4" /><path d="M2 16h2" /><path d="M20 16h2" /><path d="M17 16a5 5 0 0 0-10 0" /><path d="M3 20h18" /></svg>);
}
export function IconSun(p: IconProps) {
  return (<svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.9 4.9 1.4 1.4" /><path d="m17.7 17.7 1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.3 17.7-1.4 1.4" /><path d="m19.1 4.9-1.4 1.4" /></svg>);
}
export function IconBell(p: IconProps) {
  return (<svg {...base(p)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>);
}
export function IconBellOff(p: IconProps) {
  return (<svg {...base(p)}><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5" /><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /><path d="m2 2 20 20" /></svg>);
}
export function IconRepeat(p: IconProps) {
  return (<svg {...base(p)}><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>);
}
export function IconCalendar(p: IconProps) {
  return (<svg {...base(p)}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>);
}
export function IconTrash(p: IconProps) {
  return (<svg {...base(p)}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>);
}
export function IconSparkle(p: IconProps) {
  return (<svg {...base(p)}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" /><path d="M19 17v4" /><path d="M17 19h4" /></svg>);
}
export function IconPriority({ level, ...p }: IconProps & { level: 'high' | 'medium' | 'low' | 'none' }) {
  const b = base(p);
  if (level === 'high') return (<svg {...b} fill="currentColor" stroke="none"><path d="M12 5.5 20 18.5H4Z" /></svg>);
  if (level === 'low') return (<svg {...b} fill="currentColor" stroke="none"><path d="M12 18.5 4 5.5h16Z" /></svg>);
  if (level === 'medium') return (<svg {...b} fill="currentColor" stroke="none"><circle cx="12" cy="12" r="6" /></svg>);
  return (<svg {...b}><circle cx="12" cy="12" r="6" /></svg>);
}

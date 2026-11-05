'use client';
import type { SVGProps, JSX } from 'react';
import { useEffect, useState } from 'react';

// Displayed only in the morning window (06:00–10:00). Outside it, renders nothing.
const START_HOUR = 6;
const END_HOUR = 10;

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function svg({ size = 18, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
}

// One glyph per routine step — same stroke language as components/icons.tsx.
const IconSunrise = (p: IconProps) => (<svg {...svg(p)}><path d="M12 2v3" /><path d="m4.9 7.9 1.4 1.4" /><path d="m17.7 9.3 1.4-1.4" /><path d="M2 18h20" /><path d="M6 18a6 6 0 0 1 12 0" /><path d="M22 22H2" /></svg>);
const IconSun = (p: IconProps) => (<svg {...svg(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.9 4.9 1.4 1.4" /><path d="m17.7 17.7 1.4 1.4" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.3 17.7-1.4 1.4" /><path d="m19.1 4.9-1.4 1.4" /></svg>);
const IconSpeak = (p: IconProps) => (<svg {...svg(p)}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 10h8" /><path d="M8 13.5h5" /></svg>);
const IconShower = (p: IconProps) => (<svg {...svg(p)}><path d="M4 20v-7a4 4 0 0 1 4-4h.5" /><path d="M8.5 9V5a2.5 2.5 0 0 1 5 0" /><circle cx="18" cy="8" r="2.5" /><path d="M14 14v.01" /><path d="M11 16v.01" /><path d="M17 16v.01" /><path d="M14 18v.01" /></svg>);
const IconFace = (p: IconProps) => (<svg {...svg(p)}><circle cx="12" cy="12" r="9" /><path d="M9 10h.01" /><path d="M15 10h.01" /><path d="M9 15c.8.8 2 1.2 3 1.2s2.2-.4 3-1.2" /></svg>);
const IconBreakfast = (p: IconProps) => (<svg {...svg(p)}><path d="M3 8h12v4a6 6 0 0 1-12 0z" /><path d="M15 9h2.5a2.5 2.5 0 0 1 0 5H15" /><path d="M21 19H3" /></svg>);
const IconPill = (p: IconProps) => (<svg {...svg(p)}><rect x="3" y="9" width="18" height="6" rx="3" /><line x1="12" y1="9" x2="12" y2="15" /></svg>);
const IconTooth = (p: IconProps) => (<svg {...svg(p)}><path d="M12 5.5c-1.5-1.5-4.5-2.5-6.5-1C3 6 3 9 4 12c.7 2 .8 4 1.3 5.6.4 1.3 1.7 1.6 2.3.4.6-1.2.8-3 1.4-4 .3-.5 1.7-.5 2 0 .6 1 .8 2.8 1.4 4 .6 1.2 1.9.9 2.3-.4.5-1.6.6-3.6 1.3-5.6 1-3 1-6-1.5-7.5-2-1.2-5-.2-6.5 1Z" /></svg>);
const IconMeditate = (p: IconProps) => (<svg {...svg(p)}><circle cx="12" cy="5" r="2.5" /><path d="M12 8v5" /><path d="M5 20c0-3 3-5 7-5s7 2 7 5" /><path d="M12 13 6.5 16M12 13l5.5 3" /></svg>);
const IconJournal = (p: IconProps) => (<svg {...svg(p)}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>);

const ROUTINE: { icon: (p: IconProps) => JSX.Element; label: string }[] = [
  { icon: IconSunrise, label: 'Aufstehen' },
  { icon: IconSun, label: 'Tageslicht ansehen' },
  { icon: IconSpeak, label: 'Affirmation vorlesen' },
  { icon: IconShower, label: 'Duschen' },
  { icon: IconFace, label: 'Gesicht waschen oder rasieren + Skincare + Sonnencreme' },
  { icon: IconBreakfast, label: 'Frühstücken' },
  { icon: IconPill, label: 'Vitamine nehmen' },
  { icon: IconTooth, label: 'Zähneputzen und Mundspülung' },
  { icon: IconMeditate, label: 'Meditieren' },
  { icon: IconJournal, label: 'WHOOP Journal und Dashboard Journal' },
];

function inMorningWindow(d: Date) {
  const h = d.getHours();
  return h >= START_HOUR && h < END_HOUR;
}

export function MorningRoutine() {
  // Compute on the client only — the window depends on the user's local clock,
  // and rendering it during SSR would cause a hydration mismatch.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(inMorningWindow(new Date()));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!visible) return null;

  return (
    <div className="card fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="label">Morgenroutine</div>
        <span className="text-[10px] font-medium text-muted">06:00–10:00</span>
      </div>
      <ol>
        {ROUTINE.map(({ icon: Icon, label }, i) => {
          const last = i === ROUTINE.length - 1;
          return (
            <li key={i} className="flex gap-3.5">
              {/* Timeline rail: icon node + connecting line */}
              <div className="flex flex-col items-center">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-elevated shadow-[var(--lip)] text-white/70">
                  <Icon size={17} />
                </span>
                {!last && <span className="w-px flex-1 bg-white/[0.07] my-1" />}
              </div>
              <div className={`flex items-baseline gap-2.5 ${last ? 'pb-0.5' : 'pb-4'} pt-2`}>
                <span className="mono text-[11px] tabular-nums text-muted">{i + 1}</span>
                <span className="text-sm text-white/90 leading-snug">{label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

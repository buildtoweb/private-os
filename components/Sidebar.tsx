'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { XPBar } from './XPBar';

// One shared list drives both the desktop rail and the mobile bottom bar.
// `short` = mobile label; items without it are hidden on mobile (rail only).
const ITEMS = [
  { href: '/',          label: 'Today',     short: 'Today',     desc: 'Habits & Reflexion',     icon: 'dashboard' },
  { href: '/todo',      label: 'Planer',    short: 'Planer',    desc: 'Aufgaben & Tagesplan',   icon: 'todo'      },
  { href: '/health',    label: 'Health',    short: 'Health',    desc: 'WHOOP & Vitalwerte',     icon: 'heart'     },
  { href: '/reflexion', label: 'Reflexion', short: 'Reflexion', desc: 'Wochen, Monate & Ziele', icon: 'book'      },
  { href: '/finance',   label: 'Finanzen',  short: 'Finanzen',  desc: 'Vermögen & Sparen',      icon: 'wallet'    },
] as const;

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  if (path === '/login') return null;

  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  const mobileItems = ITEMS.filter((it) => it.short);

  return (
    <>
      {/* ===== Desktop: vertical glass pill rail (≥1024px) ===== */}
      <aside className="nav-sidebar" aria-label="Hauptnavigation">
        <nav className="nav-sidebar__rail">
          {ITEMS.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-label={it.label}
                aria-current={active ? 'page' : undefined}
                className={`nav-item${active ? ' is-active' : ''}`}
              >
                <Icon name={it.icon} />
                <span className="nav-item__tip">
                  {it.label}
                  <span className="nav-item__tip-desc">{it.desc}</span>
                </span>
                {active && <span className="nav-item__dot" aria-hidden />}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* XP + logout dock (desktop only, bottom-left) */}
      <aside className="hidden lg:flex fixed bottom-4 left-4 z-40 flex-col items-start gap-2">
        <div className="bg-elevated shadow-sheet w-12 overflow-hidden rounded-tile p-2 transition-all duration-200 hover:w-[180px] focus-within:w-[180px]">
          <XPBar compact />
        </div>
        <div className="group relative">
          <button
            onClick={async () => {
              await fetch('/api/login', { method: 'DELETE' });
              router.replace('/login');
              router.refresh();
            }}
            className="bg-elevated shadow-sheet text-muted grid h-12 w-12 place-items-center rounded-tile transition duration-200 ease-spring hover:bg-raised hover:text-primary active:scale-95"
            aria-label="Logout"
          >
            <Icon name="logout" />
          </button>
          <span className="bg-elevated shadow-sheet-lg pointer-events-none absolute bottom-1/2 left-[calc(100%+10px)] translate-y-1/2 -translate-x-2 whitespace-nowrap rounded-[14px] px-3 py-2 text-[12.5px] font-semibold text-primary opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100">
            Logout
          </span>
        </div>
      </aside>

      {/* ===== Mobile: frosted bottom tab bar (<1024px) ===== */}
      <nav className="nav-bottom" aria-label="Hauptnavigation">
        <div
          className="nav-bottom__grid"
          style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}
        >
          {mobileItems.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? 'page' : undefined}
                className={`nav-tab${active ? ' is-active' : ''}`}
              >
                <span className="nav-tab__icon"><Icon name={it.icon} /></span>
                <span className="nav-tab__label">{it.short}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

// Lucide-style glyphs (18px, 1.8 stroke, currentColor) to match the reference.
function Icon({ name }: { name: string }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'dashboard': return (<svg {...p}><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>);
    case 'todo':      return (<svg {...p}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m7 9 1.5 1.5L11 8" /><path d="M14 9h3" /><path d="m7 16 1.5 1.5L11 15" /><path d="M14 16h3" /></svg>);
    case 'heart':     return (<svg {...p}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.49 4.04 3 5.5l7 7Z" /></svg>);
    case 'book':      return (<svg {...p}><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></svg>);
    case 'wallet':    return (<svg {...p}><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" /><path d="M18 12a1 1 0 0 0 0 2h3v-2z" /></svg>);
    case 'logout':    return (<svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>);
    default: return null;
  }
}

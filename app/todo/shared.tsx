import { IconClock, IconMoon, IconSun, IconSunrise } from '@/components/icons';
import { taskAppearance } from '@/lib/todo/appearance';
import type { Priority, Slot, Task, Theme } from '@/lib/todo/types';

export const PRIORITIES: Priority[] = ['high', 'medium', 'low', 'none'];
export const SLOTS: Slot[] = ['anytime', 'morning', 'afternoon', 'evening'];

export const priorityLabels: Record<Priority, string> = { high: 'Hoch', medium: 'Mittel', low: 'Niedrig', none: 'Ohne Priorität' };
export const slotLabels: Record<Slot, string> = { anytime: 'Jederzeit', morning: 'Vormittag', afternoon: 'Nachmittag', evening: 'Abend' };
export const slotHints: Record<Slot, string> = {
  anytime: 'Keine Pläne – heute passt jederzeit',
  morning: 'Was steht am Vormittag an?',
  afternoon: 'Was steht am Nachmittag an?',
  evening: 'Beende den Tag auf deine Art',
};
export const priorityHints: Record<Priority, string> = {
  high: 'Was braucht jetzt Fokus?',
  medium: 'Aufgabe hinzufügen',
  low: 'Irgendwann einmal …',
  none: 'Aufgabe hinzufügen',
};

// Tints are always one of the four accents (STYLE.md), mixed into a surface so
// the result stays opaque.
export const slotTint: Record<Slot, string> = { anytime: 'var(--fg-3)', morning: 'var(--warning)', afternoon: 'var(--error)', evening: 'var(--info)' };
export const priorityTint: Record<Priority, string> = { high: 'var(--error)', medium: 'var(--warning)', low: 'var(--info)', none: 'var(--fg-3)' };
export const themeTint: Record<Theme, string> = {
  work: 'var(--info)', finance: 'var(--warning)', creative: 'var(--error)', health: 'var(--success)',
  home: 'var(--warning)', learning: 'var(--info)', general: 'var(--success)',
};

// Subscribed calendars take the four accents in turn.
const FEED_TINTS = ['var(--info)', 'var(--success)', 'var(--warning)', 'var(--error)'];
export function feedTint(color: number) { return FEED_TINTS[color % FEED_TINTS.length]; }

export function SlotIcon({ slot, size = 16 }: { slot: Slot; size?: number }) {
  if (slot === 'morning') return <IconSunrise size={size} />;
  if (slot === 'afternoon') return <IconSun size={size} />;
  if (slot === 'evening') return <IconMoon size={size} />;
  return <IconClock size={size} />;
}

export function iso(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function fromIso(s: string) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s: string, n: number) { const d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); }
export function startOfWeek(s: string) { return addDays(s, -((fromIso(s).getDay() + 6) % 7)); }
export function uid() { return globalThis.crypto.randomUUID(); }

export const fmtWeekdayLong = new Intl.DateTimeFormat('de-AT', { weekday: 'long' });
export const fmtWeekdayShort = new Intl.DateTimeFormat('de-AT', { weekday: 'short' });
export const fmtMonth = new Intl.DateTimeFormat('de-AT', { month: 'long', year: 'numeric' });
export const fmtDayMonth = new Intl.DateTimeFormat('de-AT', { day: 'numeric', month: 'short' });

export function weekdayInitial(date: string) {
  return fmtWeekdayShort.format(fromIso(date)).replace('.', '').slice(0, 2);
}

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} Min.`;
  const h = Math.floor(minutes / 60); const m = minutes % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

export function blankTask(date: string | null = null, slot: Slot = 'anytime', priority: Priority = 'none'): Task {
  return {
    id: uid(), title: '', priority, date, slot, time: null, duration: 30, repeat: 'none', reminder: null,
    notes: '', subtasks: [], done: false, completedDates: [], order: Date.now(), ...taskAppearance(''),
  };
}

export async function todoRequest(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: object): Promise<{ tasks?: Task[]; task?: Task }> {
  const response = await fetch('/api/todo', {
    method, cache: 'no-store',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || `API-Fehler ${response.status}`);
  return result;
}

export function suggestedSteps(title: string) {
  const t = title.toLocaleLowerCase('de');
  if (/video|film|post|content|reel/.test(t)) return ['Idee und Ablauf festlegen', 'Ersten Entwurf erstellen', 'Prüfen und veröffentlichen'];
  if (/rechnung|budget|finanz|steuer|versicher|zahl/.test(t)) return ['Unterlagen sammeln', 'Zahlen prüfen', 'Erledigen und ablegen'];
  if (/meeting|termin|anruf|anrufen/.test(t)) return ['Ziel notieren', 'Kontakt und Zeit klären', 'Nächste Schritte festhalten'];
  if (/code|dashboard|website|app/.test(t)) return ['Anforderungen notieren', 'Umsetzen', 'Testen und ausrollen'];
  if (/einricht|setup|install/.test(t)) return ['Zubehör bereitlegen', 'Installieren', 'Testen'];
  return ['Vorbereiten', 'Ersten Schritt erledigen', 'Abschluss prüfen'];
}

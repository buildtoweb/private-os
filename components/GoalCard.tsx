'use client';
import { useEffect, useState } from 'react';

// Shared goal-card design — the paper "pinboard" look used both on the Today
// pinboard (display-only) and in the Reflexion → Ziele board (interactive).
// Open goals sit on warm paper with a glossy pushpin; done/given-up goals get
// a quiet dark card so the open work stays visually dominant.

export type GoalCardData = {
  id: string;
  title: string;
  month: string;                 // YYYY-MM(-01)
  status: 'offen' | 'erledigt' | 'abgebrochen' | string;
  category?: string;
  pinned?: boolean;
  period?: 'week' | 'month';
};

export type GoalCardActions = {
  onToggleDone?: () => void;
  onPin?: () => void;
  onGiveUp?: () => void;
  onDelete?: () => void;
  onRename?: (title: string) => void;
  onCategory?: (category: string) => void;
  categories?: readonly string[];
  busy?: boolean;
};

export const SERIF = "'Charter', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
// Warm paper tones — subtle variety, not a rainbow.
const CREAMS = ['#efe9db', '#eae6d8', '#f1ece0', '#e7e3d5'];
// Glossy pushpins, keyed off the goal id. Drawn from the four Tactile
// accents so a wall of notes stays one palette instead of a rainbow.
const PINS = ['#c97b5a', '#7ba888', '#e8a33d', '#9dc4a8', '#7d93b0'];
const MONTHS_SHORT = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];

function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function monthShort(iso: string) {
  const m = Number((iso || '').slice(5, 7));
  return MONTHS_SHORT[m - 1] || (iso || '').slice(0, 7);
}

type Timing = { state: 'overdue' | 'soon' | 'month' | 'later'; label: string };

function goalTiming(goal: GoalCardData): Timing {
  if (goal.status !== 'offen') return { state: 'later', label: '' };
  const today = startOfDay(new Date());
  const end = startOfDay(monthEnd(goal.month));
  const daysLeft = Math.round((end.getTime() - today.getTime()) / 86400000);
  if (daysLeft < 0) return { state: 'overdue', label: 'Überfällig' };
  if (daysLeft === 0) return { state: 'soon', label: 'Heute fällig' };
  if (daysLeft <= 3) return { state: 'soon', label: `Noch ${daysLeft} ${daysLeft === 1 ? 'Tag' : 'Tage'}` };
  const now = new Date();
  const isThisMonth = (goal.month || '').slice(0, 7) === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return isThisMonth ? { state: 'month', label: 'Diesen Monat' } : { state: 'later', label: '' };
}

function monthEnd(iso: string) {
  const [y, m] = (iso || '').slice(0, 7).split('-').map(Number);
  return new Date(y, m, 0);
}
function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

const PILL_STYLE: Record<Timing['state'], { bg: string; color: string }> = {
  overdue: { bg: 'rgba(184,52,52,0.14)', color: '#7d3d2a' },
  soon:    { bg: 'rgba(150,110,30,0.16)', color: '#8a6a2e' },
  month:   { bg: 'rgba(52,120,64,0.15)', color: '#3f6b4a' },
  later:   { bg: 'transparent', color: 'transparent' },
};

export function GoalCard({ goal, actions, className = '' }: { goal: GoalCardData; actions?: GoalCardActions; className?: string }) {
  return goal.status === 'offen'
    ? <OpenCard goal={goal} actions={actions} className={className} />
    : <DoneCard goal={goal} actions={actions} className={className} />;
}

function OpenCard({ goal, actions, className }: { goal: GoalCardData; actions?: GoalCardActions; className: string }) {
  const h = hashId(goal.id);
  const cream = CREAMS[h % CREAMS.length];
  const pin = PINS[h % PINS.length];
  const tilt = ((h % 5) - 2) * 0.35;
  const timing = goalTiming(goal);
  const pill = PILL_STYLE[timing.state];

  return (
    <div
      className={`group relative flex min-h-[150px] flex-col rounded-[14px] px-5 pb-4 pt-7 ${actions?.busy ? 'opacity-60' : ''} ${className}`}
      style={{
        background: cream,
        color: '#2b2721',
        transform: `rotate(${tilt}deg)`,
        boxShadow: '0 6px 16px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.28)',
        fontFamily: 'Inter, system-ui',
      }}
    >
      {/* Pushpin */}
      <span
        className="absolute left-1/2 -top-1.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full"
        style={{
          background: `radial-gradient(circle at 34% 30%, rgba(255,255,255,0.9), ${pin} 46%, rgba(0,0,0,0.4) 130%)`,
          boxShadow: '0 2px 5px rgba(0,0,0,0.45), inset 0 -1px 2px rgba(0,0,0,0.25)',
        }}
      />

      {actions?.onRename
        ? <TitleEditor value={goal.title} onSave={actions.onRename} />
        : <div className="line-clamp-3 font-medium" style={{ fontFamily: SERIF, fontSize: 18, lineHeight: 1.25 }}>{goal.title}</div>}

      {actions?.onCategory && actions.categories
        ? (
          <select
            value={goal.category || ''}
            onChange={(e) => actions.onCategory!(e.target.value)}
            className="mt-1.5 cursor-pointer bg-transparent text-[10px] font-semibold outline-none"
            style={{ color: '#8a8072', appearance: 'none' }}
          >
            {actions.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )
        : goal.category && <div className="mt-1.5 text-[10px] font-semibold" style={{ color: '#8a8072' }}>{goal.category}</div>}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        {timing.label
          ? <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: pill.bg, color: pill.color }}>{timing.label}</span>
          : <span />}
        <span className="text-[10px] font-semibold" style={{ color: '#a89e8b' }}>{monthShort(goal.month)}</span>
      </div>

      {actions && (
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          {actions.onToggleDone && (
            <PaperBtn title="Als erledigt markieren" onClick={actions.onToggleDone} disabled={actions.busy}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
            </PaperBtn>
          )}
          {actions.onPin && (
            <PaperBtn title={goal.pinned ? 'Von Startseite entfernen' : 'Auf Startseite anpinnen'} onClick={actions.onPin} disabled={actions.busy} active={goal.pinned}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill={goal.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.5 6H20l-4.5 3.5 1.5 6.5L12 15l-5 3 1.5-6.5L4 8h5.5z" /></svg>
            </PaperBtn>
          )}
          {actions.onGiveUp && (
            <PaperBtn title="Ziel aufgeben" onClick={actions.onGiveUp} disabled={actions.busy}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4" /><path d="M5 4h11l-2 3.5L16 11H5z" /></svg>
            </PaperBtn>
          )}
          {actions.onDelete && (
            <PaperBtn title="Ziel löschen" onClick={actions.onDelete} disabled={actions.busy}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
            </PaperBtn>
          )}
        </div>
      )}
    </div>
  );
}

function DoneCard({ goal, actions, className }: { goal: GoalCardData; actions?: GoalCardActions; className: string }) {
  const aborted = goal.status === 'abgebrochen';
  return (
    <div
      className={`group relative flex min-h-[130px] flex-col rounded-[14px] border px-5 py-4 ${className}`}
      style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold text-secondary">{goal.category || ' '}</span>
        <button
          onClick={actions?.onToggleDone}
          disabled={!actions?.onToggleDone || actions?.busy}
          title={actions?.onToggleDone ? 'Wieder öffnen' : undefined}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full transition disabled:cursor-default"
          style={{ background: aborted ? 'rgba(184,52,52,0.16)' : '#7ba888' }}
        >
          {aborted
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#dda893" strokeWidth="3" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#08130b" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>}
        </button>
      </div>

      <div className="mt-2 line-clamp-3 line-through" style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.3, color: 'rgba(255,255,255,0.4)' }}>{goal.title}</div>

      <div className="mt-auto flex items-center justify-between pt-3">
        <span className="text-[10px] font-semibold text-muted">{monthShort(goal.month)}</span>
        {actions?.onDelete && (
          <button
            onClick={actions.onDelete}
            disabled={actions.busy}
            title="Ziel löschen"
            className="text-muted opacity-0 transition hover:text-secondary group-hover:opacity-100"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
          </button>
        )}
      </div>
    </div>
  );
}

function PaperBtn({ children, onClick, disabled, active, title }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="grid h-6 w-6 place-items-center rounded-full transition disabled:opacity-40"
      style={{
        background: active ? 'rgba(43,39,33,0.92)' : 'rgba(43,39,33,0.72)',
        color: active ? '#f1ece0' : 'rgba(241,236,224,0.85)',
      }}
    >
      {children}
    </button>
  );
}

function TitleEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <textarea
      value={text}
      rows={2}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { const t = text.trim(); if (t && t !== value) onSave(t); else setText(value); }}
      className="w-full resize-none border-none bg-transparent font-medium outline-none"
      // field-sizing:content grows the field to its text without a JS measure loop
      // (which mis-measures inside a stretched flex/grid card). rows=2 is the fallback.
      style={{ fontFamily: SERIF, fontSize: 18, lineHeight: 1.25, color: '#2b2721', fieldSizing: 'content', overflow: 'hidden' } as React.CSSProperties}
      spellCheck={false}
    />
  );
}

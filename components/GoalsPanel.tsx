'use client';
import { useEffect, useMemo, useState } from 'react';
import { awardXP } from '@/components/XPBar';
import { goalCompletionPenalty, goalCompletionXP, goalGiveUpPenalty } from '@/lib/xp';
import { fetchCached, peekCache, bustCache } from '@/lib/fetchCache';
import { ConfirmDialog, type ConfirmOptions } from '@/components/ConfirmDialog';
import { GoalCard, SERIF, type GoalCardActions } from '@/components/GoalCard';

const GOALS_URL = '/api/goals';
// Bust the cache and tell the shared provider (home's pinned goals) to revalidate.
function notifyGoalsChanged() {
  bustCache('/api/goals');
  window.dispatchEvent(new CustomEvent('goals:changed'));
}

type GoalPeriod = 'week' | 'month';
type GoalStatus = 'offen' | 'erledigt' | 'abgebrochen';
type Goal = { id: string; title: string; month: string; status: GoalStatus; pinned: boolean; category?: string; period?: GoalPeriod };

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const CATEGORIES = ['Business', 'Health', 'Personal', 'Sonstiges'] as const;

const currentMonth = () => new Date().toISOString().slice(0, 7);

// Goals workspace — lives inside the Reflexion tab as the "Ziele" switch.
export function GoalsPanel() {
  const [goals, setGoals] = useState<Goal[]>(() => peekCache<{ goals?: Goal[] }>(GOALS_URL)?.goals || []);
  const [enabled, setEnabled] = useState(() => peekCache<{ enabled?: boolean }>(GOALS_URL)?.enabled !== false);
  const [loading, setLoading] = useState(() => peekCache(GOALS_URL) === undefined);
  const [formMonth, setFormMonth] = useState<string>(currentMonth());
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<{ title: string; category: string; pinned: boolean }>({
    title: '', category: 'Personal', pinned: true,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  async function load() {
    try {
      const j = await fetchCached<any>(GOALS_URL, 30_000);
      setEnabled(j.enabled !== false);
      setGoals(j.goals || []);
      if (j.error || j.hint) setError(j.hint || j.error);
      else setError(null);
    } catch (e: any) {
      setError(e?.message || 'Ziele konnten nicht geladen werden.');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Monthly goals only, grouped into board columns. Legacy weekly goals
  // (period === 'week') are simply not shown.
  const grouped = useMemo(() => {
    const byDateDesc = (a: Goal, b: Goal) => String(b.month || '').localeCompare(String(a.month || ''));
    const monthly = goals.filter(g => (g.period || 'month') === 'month');
    return {
      open: monthly.filter(g => g.status === 'offen').sort(byDateDesc),
      done: monthly.filter(g => g.status === 'erledigt').sort(byDateDesc),
      abandoned: monthly.filter(g => g.status === 'abgebrochen').sort(byDateDesc),
    };
  }, [goals]);
  const total = grouped.open.length + grouped.done.length + grouped.abandoned.length;

  function openAddForm() {
    setFormMonth(currentMonth());
    setShowAdd(true);
  }

  async function add() {
    if (!draft.title.trim()) return;
    setBusy('add');
    try {
      const r = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...draft, month: `${formMonth}-01`, period: 'month', status: 'offen' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.error || `Speichern fehlgeschlagen (${r.status})`);
      setDraft({ title: '', category: 'Personal', pinned: true });
      setShowAdd(false);
      setError(null);
      notifyGoalsChanged();
      await load();
    } catch (e: any) {
      setError(e?.message || 'Ziel konnte nicht gespeichert werden.');
    } finally { setBusy(null); }
  }

  async function patch(id: string, p: Partial<Goal>) {
    setBusy(id);
    const prev = goals;
    setGoals(arr => arr.map(g => g.id === id ? { ...g, ...p } : g));
    try {
      const r = await fetch('/api/goals', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...p }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.error || `Speichern fehlgeschlagen (${r.status})`);
      const previous = goals.find(g => g.id === id);
      if (p.status === 'erledigt' && previous?.status !== 'erledigt') {
        await awardXP('goal_completed', goalCompletionXP(), previous?.month, `goal:${id}:completed`);
      }
      if (previous?.status === 'erledigt' && p.status && p.status !== 'erledigt') {
        await awardXP('goal_uncompleted', goalCompletionPenalty(), previous?.month, `goal:${id}:completed:penalty`);
      }
      // Giving up (-> abgebrochen): heavy one-time penalty. Idempotency key keeps it
      // to a single hit per goal even if it's reopened and given up again.
      if (p.status === 'abgebrochen' && previous?.status !== 'abgebrochen') {
        await awardXP('goal_given_up', goalGiveUpPenalty(), previous?.month, `goal:${id}:givenup`);
      }
      setError(null);
      notifyGoalsChanged();
    } catch (e: any) {
      setGoals(prev);
      setError(e?.message || 'Ziel konnte nicht aktualisiert werden.');
    } finally { setBusy(null); }
  }

  function remove(id: string) {
    setConfirm({
      title: 'Ziel löschen',
      message: 'Dieses Ziel wirklich löschen?',
      confirmLabel: 'Löschen',
      tone: 'danger',
      onConfirm: () => doRemove(id),
    });
  }

  async function doRemove(id: string) {
    setBusy(id);
    const prev = goals;
    setGoals(arr => arr.filter(g => g.id !== id));
    try {
      const r = await fetch(`/api/goals?id=${id}`, { method: 'DELETE' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.error || `Löschen fehlgeschlagen (${r.status})`);
      setError(null);
      notifyGoalsChanged();
    } catch (e: any) {
      setGoals(prev);
      setError(e?.message || 'Ziel konnte nicht gelöscht werden.');
    } finally { setBusy(null); }
  }

  function giveUp(id: string) {
    setConfirm({
      title: 'Ziel aufgeben',
      message: 'Dieses Ziel wirklich aufgeben? Das kostet 150 XP.',
      confirmLabel: 'Aufgeben',
      tone: 'danger',
      onConfirm: () => patch(id, { status: 'abgebrochen' }),
    });
  }

  const actionsFor = (g: Goal): GoalCardActions => ({
    onToggleDone: () => patch(g.id, { status: g.status === 'erledigt' ? 'offen' : 'erledigt' }),
    onPin: () => patch(g.id, { pinned: !g.pinned }),
    onGiveUp: g.status === 'offen' ? () => giveUp(g.id) : undefined,
    onDelete: () => remove(g.id),
    onRename: (t) => patch(g.id, { title: t }),
    onCategory: (c) => patch(g.id, { category: c as any }),
    categories: CATEGORIES,
    busy: busy === g.id,
  });

  if (!loading && !enabled) {
    return (
      <div className="mt-6">
        <div className="card border-dashed">
          <div className="font-semibold mb-2">Ziele konnten nicht geladen werden</div>
          <p className="text-sm text-secondary">
            Die Ziele liegen in Supabase (<code className="text-xs bg-base px-1 py-0.5 rounded">private.goals</code>). Prüfe <code className="text-xs bg-base px-1 py-0.5 rounded">SUPABASE_URL</code> / <code className="text-xs bg-base px-1 py-0.5 rounded">SUPABASE_SECRET_KEY</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <p className="text-secondary text-sm">Monatsziele im Überblick</p>
        <button
          className="btn btn-primary"
          onClick={() => (showAdd ? setShowAdd(false) : openAddForm())}
        >
          {showAdd ? 'Abbrechen' : 'Neues Ziel'}
        </button>
      </div>

      {error && (
        <div className="notice notice--error mb-4">
          <p className="text-red text-sm break-words">{error}</p>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="card mb-6 fade-in">
          <p className="label mb-4">Neues Ziel</p>
          <div className="space-y-3">
            <div>
              <label className="label block mb-1.5">Beschreibung</label>
              <input
                className="input"
                placeholder="z.B. 200 Follower bis Monatsende"
                value={draft.title}
                autoFocus
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
            </div>
            <div>
              <label className="label block mb-1.5">Zeitraum</label>
              <div className="chip text-secondary inline-flex">Für {monthLabel(formMonth)}</div>
            </div>
            <div>
              <label className="label block mb-1.5">Kategorie</label>
              <Segmented
                options={CATEGORIES.map(c => ({ value: c, label: c }))}
                value={draft.category}
                onChange={(v) => setDraft({ ...draft, category: v })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.06]">
            <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.pinned}
                onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                className="accent-primary"
              />
              Auf Startseite anpinnen
            </label>
            <button
              className="btn btn-primary"
              onClick={add}
              disabled={busy === 'add' || !draft.title.trim()}
            >
              {busy === 'add' ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>
      )}

      {loading && <div className="card h-40 animate-pulse" />}

      {!loading && total === 0 && !showAdd && (
        <div className="card text-center py-14">
          <p className="text-secondary text-sm mb-4">Noch keine Ziele.</p>
          <button className="btn btn-primary" onClick={openAddForm}>Ziel anlegen</button>
        </div>
      )}

      {!loading && total > 0 && (
        <div className="space-y-9">
          <BoardSection title="Offen" count={grouped.open.length}>
            {grouped.open.length === 0
              ? <div className="col-span-full card py-6 text-center text-secondary text-sm">Keine offenen Ziele — stark.</div>
              : grouped.open.map(g => <GoalCard key={g.id} goal={g} actions={actionsFor(g)} />)}
          </BoardSection>

          {grouped.done.length > 0 && (
            <BoardSection title="Erledigt" count={grouped.done.length}>
              {grouped.done.map(g => <GoalCard key={g.id} goal={g} actions={actionsFor(g)} />)}
            </BoardSection>
          )}

          {grouped.abandoned.length > 0 && (
            <BoardSection title="Aufgegeben" count={grouped.abandoned.length}>
              {grouped.abandoned.map(g => <GoalCard key={g.id} goal={g} actions={actionsFor(g)} />)}
            </BoardSection>
          )}
        </div>
      )}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

function BoardSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-4">
        <h2 className="text-xl font-semibold" style={{ fontFamily: SERIF }}>{title}</h2>
        <span
          className="grid min-w-[22px] place-items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-secondary tabular-nums"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          {count}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function Segmented({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              active ? 'bg-brand text-white' : 'border border-border text-secondary hover:border-brand/50 hover:text-primary'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function monthLabel(iso: string) {
  if (!iso) return '';
  const [y, mo] = iso.slice(0, 7).split('-');
  return `${MONTHS[Number(mo) - 1]} ${y}`;
}


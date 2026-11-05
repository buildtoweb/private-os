// Goals ("Ziele") storage — self-hosted Supabase (`private.goals`, doc_id/data
// jsonb). Migrated off Notion 2026-07-09; Notion "Ziele" DB kept as a backup.
import { db } from './db';

export const GOALS_ENABLED = true;

export type GoalStatus = 'offen' | 'erledigt' | 'abgebrochen';
export type GoalCategory = 'Business' | 'Health' | 'Personal' | 'Sonstiges';
export type GoalPeriod = 'week' | 'month';

export type Goal = {
  id: string;
  title: string;
  month: string;       // YYYY-MM-01
  status: GoalStatus;
  pinned: boolean;
  category?: GoalCategory;
  period?: GoalPeriod;
  createdAt?: string;
};

const GOALS = 'goals';
const DEFAULT_STATUS: GoalStatus = 'offen';

// Retained so the goals route can degrade gracefully on an unexpected error.
export function optionalGoalsError(e: any) {
  const message = e?.body?.message || e?.message || String(e);
  return {
    enabled: false,
    goals: [],
    error: message,
    hint: 'Goals liegen jetzt in Supabase (private.goals). Prüfe SUPABASE_URL / SUPABASE_SECRET_KEY.',
  };
}

function snapToGoal(id: string, d: Record<string, any> | undefined): Goal {
  const data = d || {};
  const statusName = data.status;
  const status: GoalStatus = ['offen', 'erledigt', 'abgebrochen'].includes(statusName) ? statusName : DEFAULT_STATUS;
  return {
    id,
    title: data.title || '(ohne Titel)',
    month: data.month || '',
    status,
    pinned: !!data.pinned,
    category: data.category as GoalCategory | undefined,
    period: data.period === 'week' ? 'week' : 'month',
    createdAt: data.createdAt,
  };
}

export async function listGoals(monthISO?: string): Promise<Goal[]> {
  const base = db().collection(GOALS);
  const q = monthISO
    ? base
        .where('month', '>=', monthStart(monthISO))
        .where('month', '<=', monthEnd(monthISO))
        .orderBy('month', 'desc')
    : base.orderBy('month', 'desc');
  const snap = await q.get();
  const goals = snap.docs.map((s) => snapToGoal(s.id, s.data()));
  return dropCompletedPastGoals(goals);
}

export async function listPinnedGoals(): Promise<Goal[]> {
  const snap = await db().collection(GOALS).where('pinned', '==', true).orderBy('month', 'desc').get();
  const pinned = snap.docs
    .map((s) => snapToGoal(s.id, s.data()))
    // Given-up goals shouldn't clutter the Today pinboard, even if still pinned.
    .filter((g) => g.status !== 'abgebrochen');
  return dropCompletedPastGoals(pinned);
}

export async function createGoal(g: Partial<Goal>): Promise<{ id: string }> {
  const data: Record<string, any> = {
    title: g.title || 'Neues Ziel',
    month: g.month || new Date().toISOString().slice(0, 7) + '-01',
    status: g.status || DEFAULT_STATUS,
    pinned: !!g.pinned,
    period: g.period || 'month',
    createdAt: new Date().toISOString(),
  };
  if (g.category) data.category = g.category;
  return db().collection(GOALS).add(data);
}

export async function updateGoal(id: string, patch: Partial<Goal>): Promise<{ id: string }> {
  const data: Record<string, any> = {};
  if (patch.title != null) data.title = patch.title;
  if (patch.month) data.month = patch.month;
  if (patch.status) data.status = patch.status;
  if (patch.pinned != null) data.pinned = !!patch.pinned;
  if (patch.category) data.category = patch.category;
  if (patch.period) data.period = patch.period;
  await db().collection(GOALS).doc(id).set(data, { merge: true });
  return { id };
}

export async function deleteGoal(id: string): Promise<void> {
  await db().collection(GOALS).doc(id).delete();
}

// Completed goals whose period has ended are hidden from the active views (they
// stay in the table as history). Mirrors the old Notion "archive on read".
function dropCompletedPastGoals(goals: Goal[]): Goal[] {
  const today = todayInVienna();
  return goals.filter((g) => !(g.status === 'erledigt' && periodEnd(g) < today));
}

function periodEnd(goal: Goal) {
  if ((goal.period || 'month') === 'week') {
    const d = parseISODate(goal.month);
    d.setDate(d.getDate() + 6);
    return formatISODate(d);
  }
  const d = parseISODate(goal.month.slice(0, 7) + '-01');
  d.setMonth(d.getMonth() + 1, 0);
  return formatISODate(d);
}

function todayInVienna() {
  const parts = new Intl.DateTimeFormat('de-AT', {
    timeZone: 'Europe/Vienna',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function parseISODate(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthStart(iso: string) { return iso.slice(0, 7) + '-01'; }
function monthEnd(iso: string) {
  const d = new Date(iso.slice(0, 7) + '-01');
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

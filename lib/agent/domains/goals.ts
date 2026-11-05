// Ziele — monthly and weekly goals from private.goals.
import { listGoals, listPinnedGoals, type Goal } from '@/lib/goals';
import type { Warnings } from '../envelope';
import type { DateRange } from '../range';
import { compact, plural, ratioPct, sentences } from '../format';

export async function buildGoals(range: DateRange, warn: Warnings, opts: { month?: string } = {}) {
  const month = opts.month ?? range.date.slice(0, 7);
  const [goals, pinned] = await Promise.all([
    warn.guard<Goal[]>('goals.list', () => listGoals(month), []),
    warn.guard<Goal[]>('goals.pinned', () => listPinnedGoals(), []),
  ]);

  const open = goals.filter((g) => g.status === 'offen');
  const done = goals.filter((g) => g.status === 'erledigt');
  const abandoned = goals.filter((g) => g.status === 'abgebrochen');

  return compact({
    month,
    counts: {
      total: goals.length,
      open: open.length,
      completed: done.length,
      abandoned: abandoned.length,
      completion_pct: ratioPct(done.length, done.length + open.length),
    },
    open: open.map(shapeGoal),
    completed: done.map(shapeGoal),
    abandoned: abandoned.map(shapeGoal),
    pinned: pinned.map(shapeGoal),
    summary: sentences(
      goals.length
        ? `Für ${month} ${goals.length === 1 ? 'ist 1 Ziel' : `sind ${goals.length} Ziele`} erfasst: ${done.length} erledigt, ${open.length} offen${abandoned.length ? `, ${abandoned.length} abgebrochen` : ''}.`
        : `Für ${month} sind keine Ziele erfasst.`,
      open.length ? `Offen: ${open.slice(0, 5).map((g) => g.title).join('; ')}${open.length > 5 ? ' …' : ''}.` : '',
      pinned.length ? `${plural(pinned.length, 'Ziel ist', 'Ziele sind')} angepinnt.` : '',
    ),
  });
}

function shapeGoal(g: Goal) {
  return compact({
    // The one internal id this API exposes: PATCH /goals addresses a goal by it,
    // so reads have to hand it over for the agent to act on what it just read.
    id: g.id,
    title: g.title,
    period: g.period === 'week' ? 'Woche' : 'Monat',
    period_start: g.month,
    category: g.category,
    status: g.status,
    pinned: g.pinned,
    created: g.createdAt?.slice(0, 10),
  });
}

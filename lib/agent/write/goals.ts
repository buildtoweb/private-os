// Goal write actions — create a goal, change its status, pin it.
//
// XP mirrors components/GoalsPanel.tsx, including the idempotency keys, so the
// browser and the agent can act on the same goal without double-awarding.
// Deletion is deliberately absent: it is the one goal operation an agent cannot
// undo, and nothing in a briefing workflow needs it.
import {
  createGoal as storeCreateGoal, updateGoal as storeUpdateGoal, listGoals,
  type Goal, type GoalCategory, type GoalPeriod, type GoalStatus,
} from '@/lib/goals';
import { goalCompletionXP, goalCompletionPenalty, goalGiveUpPenalty } from '@/lib/xp';
import { awardXP } from '@/lib/xpStore';
import { AgentError } from '../envelope';
import { compact } from '../format';
import type { XPChange } from './habits';

export const GOAL_STATUSES = ['offen', 'erledigt', 'abgebrochen'] as const;
export const GOAL_CATEGORIES = ['Business', 'Health', 'Personal', 'Sonstiges'] as const;
export const GOAL_PERIODS = ['week', 'month'] as const;

async function grant(source: string, xp: number, date: string | undefined, key: string, out: XPChange[]) {
  const res = await awardXP({ habit: source, xpGained: xp, date, idempotencyKey: key });
  out.push({ source, xp: res.duplicate ? 0 : xp, duplicate: res.duplicate });
}

function shape(g: Goal) {
  return compact({
    id: g.id,
    title: g.title,
    period: g.period === 'week' ? 'Woche' : 'Monat',
    period_start: g.month,
    category: g.category,
    status: g.status,
    pinned: g.pinned,
  });
}

/**
 * Goals are addressed by id, and the id is the one internal identifier this API
 * does expose — a write API needs a handle. Reads stay id-free; `find` here maps
 * a title back to an id so the agent can also work from what it read.
 */
async function findGoal(id: string): Promise<Goal> {
  const all = await listGoals();
  const goal = all.find((g) => g.id === id);
  if (!goal) throw new AgentError('goal_not_found', `Kein Ziel mit der id "${id}" gefunden.`, 404);
  return goal;
}

export async function createGoal(input: {
  title: string;
  month: string;
  period: GoalPeriod;
  category?: GoalCategory;
  pinned?: boolean;
}) {
  const { id } = await storeCreateGoal({
    title: input.title,
    month: input.month,
    period: input.period,
    category: input.category,
    pinned: input.pinned ?? false,
    status: 'offen',
  });
  const goal = await findGoal(id);
  return { created: true, goal: shape(goal) };
}

export async function updateGoal(input: {
  id: string;
  title?: string;
  status?: GoalStatus;
  pinned?: boolean;
  category?: GoalCategory;
}) {
  const before = await findGoal(input.id);

  const patch: Partial<Goal> = {};
  if (input.title != null) patch.title = input.title;
  if (input.status != null) patch.status = input.status;
  if (input.pinned != null) patch.pinned = input.pinned;
  if (input.category != null) patch.category = input.category;
  if (!Object.keys(patch).length) {
    throw new AgentError('nothing_to_update', 'Es wurde kein zu änderndes Feld übergeben.', 400);
  }

  await storeUpdateGoal(input.id, patch);
  const after = await findGoal(input.id);

  const xp: XPChange[] = [];
  if (input.status && input.status !== before.status) {
    if (input.status === 'erledigt') {
      await grant('goal_completed', goalCompletionXP(), before.month, `goal:${input.id}:completed`, xp);
    }
    if (before.status === 'erledigt' && input.status !== 'erledigt') {
      await grant('goal_uncompleted', goalCompletionPenalty(), before.month, `goal:${input.id}:completed:penalty`, xp);
    }
    if (input.status === 'abgebrochen') {
      await grant('goal_given_up', goalGiveUpPenalty(), before.month, `goal:${input.id}:givenup`, xp);
    }
  }

  return {
    changed: true,
    previous_status: before.status,
    goal: shape(after),
    xp,
  };
}

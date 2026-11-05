import { agentRoute, agentWriteRoute } from '@/lib/agent/handler';
import { resolveRange } from '@/lib/agent/range';
import { buildGoals } from '@/lib/agent/domains/goals';
import { monthParam } from '@/lib/agent/params';
import { AgentError } from '@/lib/agent/envelope';
import { optionalBoolean, optionalString, oneOf, rejectUnknown, requireString } from '@/lib/agent/write/body';
import {
  createGoal, updateGoal, GOAL_CATEGORIES, GOAL_PERIODS, GOAL_STATUSES,
} from '@/lib/agent/write/goals';
import { appToday } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute(async ({ params, warn }) => {
  const range = resolveRange(params, 1);
  return buildGoals(range, warn, { month: monthParam(params, 'month') });
});

// Body: { title, period?: "month"|"week", month?: "YYYY-MM", category?, pinned? }
export const POST = agentWriteRoute(async ({ body }) => {
  rejectUnknown(body, ['title', 'period', 'month', 'category', 'pinned']);
  const period = oneOf(body, 'period', GOAL_PERIODS, false) ?? 'month';
  const month = optionalString(body, 'month');
  if (month && !/^\d{4}-\d{2}$/.test(month)) {
    throw new AgentError('invalid_param', '"month" muss das Format YYYY-MM haben.', 400);
  }
  return createGoal({
    title: requireString(body, 'title', { max: 300 }),
    // Weekly goals anchor on a concrete date, monthly ones on the first of the month.
    month: month ? `${month}-01` : `${appToday().slice(0, 7)}-01`,
    period,
    category: oneOf(body, 'category', GOAL_CATEGORIES, false),
    pinned: optionalBoolean(body, 'pinned'),
  });
});

// Body: { id, status?, title?, pinned?, category? } — the id comes from GET /goals.
export const PATCH = agentWriteRoute(async ({ body }) => {
  rejectUnknown(body, ['id', 'status', 'title', 'pinned', 'category']);
  return updateGoal({
    id: requireString(body, 'id'),
    title: optionalString(body, 'title', { max: 300 }),
    status: oneOf(body, 'status', GOAL_STATUSES, false),
    pinned: optionalBoolean(body, 'pinned'),
    category: oneOf(body, 'category', GOAL_CATEGORIES, false),
  });
});

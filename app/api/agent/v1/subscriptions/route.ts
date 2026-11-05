import { agentRoute } from '@/lib/agent/handler';
import { resolveRange } from '@/lib/agent/range';
import { buildSubscriptions } from '@/lib/agent/domains/subscriptions';
import { intParam } from '@/lib/agent/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute(async ({ params, warn }) => {
  const range = resolveRange(params, 1);
  return buildSubscriptions(warn, {
    horizonDays: intParam(params, 'horizon', 60, 1, 365),
    anchorDate: range.date,
  });
});

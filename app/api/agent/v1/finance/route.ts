import { agentRoute } from '@/lib/agent/handler';
import { buildFinance } from '@/lib/agent/domains/finance';
import { intParam } from '@/lib/agent/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Finance is always "right now" — a historical net worth is not stored, so this
// endpoint deliberately takes no date parameters.
export const GET = agentRoute(async ({ params, warn }) =>
  buildFinance(warn, { activityLimit: intParam(params, 'activities', 25, 0, 100) }),
);

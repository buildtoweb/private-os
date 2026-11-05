import { agentRoute } from '@/lib/agent/handler';
import { buildXP } from '@/lib/agent/domains/xp';
import { intParam } from '@/lib/agent/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute(async ({ params, warn }) =>
  buildXP(warn, { days: intParam(params, 'days', 7, 1, 90) }),
);

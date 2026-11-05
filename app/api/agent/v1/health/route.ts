import { agentRoute } from '@/lib/agent/handler';
import { resolveRange } from '@/lib/agent/range';
import { buildHealth } from '@/lib/agent/domains/health';
import { boolParam } from '@/lib/agent/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute(async ({ params, warn }) => {
  const range = resolveRange(params, 30);
  return buildHealth(range, warn, { includeBlood: boolParam(params, 'blood', true) });
});

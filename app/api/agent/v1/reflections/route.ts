import { agentRoute } from '@/lib/agent/handler';
import { resolveRange } from '@/lib/agent/range';
import { buildReflections } from '@/lib/agent/domains/reflections';
import { boolParam, intParam, reflectTypeParam } from '@/lib/agent/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute(async ({ params, warn }) =>
  buildReflections(resolveRange(params, 30), warn, {
    limit: intParam(params, 'limit', 10, 1, 25),
    type: reflectTypeParam(params, 'type'),
    includeText: boolParam(params, 'text', true),
  }),
);

import { agentRoute } from '@/lib/agent/handler';
import { resolveRange } from '@/lib/agent/range';
import { buildHabits } from '@/lib/agent/domains/habits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute(async ({ params, warn }) => buildHabits(resolveRange(params, 30), warn));

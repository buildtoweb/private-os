import { agentRoute } from '@/lib/agent/handler';
import { resolveRange } from '@/lib/agent/range';
import { buildPassage } from '@/lib/agent/domains/passage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute(async ({ params, warn }) => buildPassage(resolveRange(params, 1), warn));

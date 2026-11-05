// Discovery endpoint — lets an agent orient itself without external docs.
import { agentRoute } from '@/lib/agent/handler';
import { buildIndex } from '@/lib/agent/catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = agentRoute(async () => buildIndex());

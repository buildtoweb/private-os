import { agentRoute } from '@/lib/agent/handler';
import { resolveRange } from '@/lib/agent/range';
import { buildDailyBrief } from '@/lib/agent/domains/brief';
import { boolParam } from '@/lib/agent/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The finance block is the slow one (Supabase ledger + live prices). `?finance=0` drops it
// so a briefing that only needs body and habits stays fast.
export const GET = agentRoute(async ({ params, warn }) =>
  buildDailyBrief(resolveRange(params, 1), warn, { includeFinance: boolParam(params, 'finance', true) }),
);

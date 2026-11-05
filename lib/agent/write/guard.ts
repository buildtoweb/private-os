// Write gate for the Agent Context API.
//
// Two locks, both must be open:
//   1. the primary Bearer token (never the optional read-only token)
//   2. AGENT_API_WRITE_ENABLED — an explicit opt-in on the deployment
//
// The second lock exists so write access can be revoked instantly without
// rotating the token and reconfiguring the agent: unset the variable, redeploy,
// and every write answers 403 while the whole read side keeps working.
import type { NextRequest } from 'next/server';
import { checkAgentAuth } from '../auth';
import { agentFail } from '../envelope';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

export function writesEnabled(): boolean {
  return TRUTHY.has((process.env.AGENT_API_WRITE_ENABLED || '').trim().toLowerCase());
}

export type WriteGate = { ok: true } | { ok: false; response: ReturnType<typeof agentFail> };

export function checkAgentWriteAuth(req: NextRequest): WriteGate {
  // Token first: an unauthenticated caller must not learn whether writes are on.
  const auth = checkAgentAuth(req, true);
  if (!auth.ok) return auth;

  if (!writesEnabled()) {
    return {
      ok: false,
      response: agentFail(
        'writes_disabled',
        'Schreibzugriff ist auf diesem Deployment deaktiviert (AGENT_API_WRITE_ENABLED).',
        403,
      ),
    };
  }
  return { ok: true };
}

// Bearer-token gate for the Agent Context API.
//
// Primary token plus optional read-only token, compared timing-safely. The dashboard's
// own PIN cookie is deliberately NOT accepted here: a machine client should
// carry a machine credential, and that credential can be rotated on its own.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { agentFail } from './envelope';

/** Compare over SHA-256 digests so the comparison is both constant-time and length-blind. */
function tokensMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

// ─── Rate limiting ────────────────────────────────────────────
// Fixed window, in-process. Vercel's Fluid Compute reuses instances, so this
// meaningfully throttles a runaway client without pulling in Redis — but it is
// per-instance and therefore best-effort, not a security boundary. The Bearer
// token is the security boundary.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string): { allowed: boolean; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  // Cheap sweep so the map can't grow unbounded across a long-lived instance.
  if (hits.size > 500) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSec: 0, remaining: MAX_PER_WINDOW - 1 };
  }
  entry.count += 1;
  const remaining = Math.max(0, MAX_PER_WINDOW - entry.count);
  return {
    allowed: entry.count <= MAX_PER_WINDOW,
    retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    remaining,
  };
}

export type AuthGate = { ok: true } | { ok: false; response: ReturnType<typeof agentFail> };

// Requests the MCP server builds in-process to call a route handler. It has
// already authenticated the caller (OAuth or token) and decided read vs. write,
// so these skip the Bearer check. A WeakSet of object identities can't be
// forged from outside: no header, no secret, nothing on the wire.
const internalRequests = new WeakSet<Request>();

export function markInternalAgentRequest(req: Request) {
  internalRequests.add(req);
}

export function checkAgentAuth(req: NextRequest, write = false): AuthGate {
  if (internalRequests.has(req)) return { ok: true };

  const expected = process.env.AGENT_API_TOKEN || '';
  const grokToken = process.env.AGENT_API_GROK_TOKEN || '';
  if (!expected && grokToken.length < 32) {
    // A server-configuration problem, not a credential problem — say so, since
    // silently 401-ing an unconfigured deployment is impossible to debug.
    return {
      ok: false,
      response: agentFail('not_configured', 'Agent API ist auf diesem Deployment nicht konfiguriert.', 503),
    };
  }

  const presented = bearerToken(req);
  // Identical response for "no header", "wrong scheme" and "wrong token" — the
  // caller learns nothing about which part was wrong.
  const readToken = !write ? process.env.AGENT_API_READ_TOKEN || '' : '';
  const validPrimary = !!presented && !!expected && tokensMatch(presented, expected);
  const validRead = !!presented && readToken.length >= 16 && tokensMatch(presented, readToken);
  const validGrok = !!presented && grokToken.length >= 32 && tokensMatch(presented, grokToken);
  if (!validPrimary && !validRead && !validGrok) {
    return {
      ok: false,
      response: agentFail('unauthorized', 'Unauthorized', 401, { 'www-authenticate': 'Bearer' }),
    };
  }

  // Keyed by a digest of the token, never the token itself.
  const key = createHash('sha256').update(presented).digest('hex').slice(0, 32);
  const limit = rateLimit(key);
  if (!limit.allowed) {
    return {
      ok: false,
      response: agentFail('rate_limited', `Zu viele Anfragen. Limit: ${MAX_PER_WINDOW}/Minute.`, 429, {
        'retry-after': String(limit.retryAfterSec),
      }),
    };
  }

  return { ok: true };
}

export const RATE_LIMIT = { requests: MAX_PER_WINDOW, windowSeconds: WINDOW_MS / 1000 };

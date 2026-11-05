// Shared GET wrapper: auth → rate limit → build → envelope.
//
// Read-only by construction — a route built with this exports nothing but GET,
// and every domain builder below it calls read paths only.
import type { NextRequest } from 'next/server';
import { checkAgentAuth } from './auth';
import { checkAgentWriteAuth } from './write/guard';
import { readBody, type Body } from './write/body';
import { AgentError, Warnings, agentFail, agentOk } from './envelope';

export type AgentContext = {
  params: URLSearchParams;
  warn: Warnings;
};

export function agentRoute(build: (ctx: AgentContext) => Promise<unknown>) {
  return async function GET(req: NextRequest) {
    const gate = checkAgentAuth(req);
    if (!gate.ok) return gate.response;

    const warn = new Warnings();
    try {
      const data = await build({ params: req.nextUrl.searchParams, warn });
      return agentOk(data, warn);
    } catch (e: any) {
      if (e instanceof AgentError) return agentFail(e.code, e.message, e.status);
      // Anything unplanned: a generic code, and the upstream message only
      // because this API serves a single private client. Nothing is logged —
      // response bodies here are personal data.
      return agentFail('internal_error', e?.message ? String(e.message).slice(0, 300) : 'Unerwarteter Fehler.', 500);
    }
  };
}

export type AgentWriteContext = {
  body: Body;
  params: URLSearchParams;
  warn: Warnings;
};

/**
 * A write endpoint: token + the AGENT_API_WRITE_ENABLED opt-in, then a JSON body.
 *
 * Only the handful of routes under lib/agent/write use this. Everything else in
 * the API stays GET-only, so read access can never mutate anything.
 */
export function agentWriteRoute(apply: (ctx: AgentWriteContext) => Promise<unknown>) {
  return async function POST(req: NextRequest) {
    const gate = checkAgentWriteAuth(req);
    if (!gate.ok) return gate.response;

    const warn = new Warnings();
    try {
      const body = await readBody(req);
      const data = await apply({ body, params: req.nextUrl.searchParams, warn });
      return agentOk(data, warn);
    } catch (e: any) {
      if (e instanceof AgentError) return agentFail(e.code, e.message, e.status);
      return agentFail('internal_error', e?.message ? String(e.message).slice(0, 300) : 'Unerwarteter Fehler.', 500);
    }
  };
}

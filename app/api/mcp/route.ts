// MCP endpoint (Streamable HTTP) — the private dashboard as a connector for
// Claude and ChatGPT.
//
// Stateless: every request builds a fresh server and transport. On Vercel the
// next request often lands on another instance anyway, so an in-memory session
// would be worth nothing. The tools live in lib/mcp/server.ts and call the
// /api/agent/v1 route handlers.
//
// Two ways in:
//   - an OAuth access token from the connector flow (PIN consent on
//     /oauth/authorize),
//   - the static agent tokens as Bearer (AGENT_API_TOKEN / AGENT_API_GROK_TOKEN
//     with write tools, AGENT_API_READ_TOKEN read-only) for clients that can
//     set a header.
import { createHash, timingSafeEqual } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { rateLimit, RATE_LIMIT } from '@/lib/agent/auth';
import { createDashboardMcpServer, type McpPrincipal } from '@/lib/mcp/server';
import { mcpResourceUrl, protectedResourceMetadataUrl, publicOrigin, verifyAccessToken } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// get_daily_brief pulls every domain at once, finance with live prices.
export const maxDuration = 120;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
} as const;

function tokensMatch(presented: string, expected: string): boolean {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function staticTokenPrincipal(token: string): McpPrincipal | null {
  const primary = process.env.AGENT_API_TOKEN || '';
  const grok = process.env.AGENT_API_GROK_TOKEN || '';
  const readOnly = process.env.AGENT_API_READ_TOKEN || '';
  if (primary.length >= 16 && tokensMatch(token, primary)) return { kind: 'token', canWrite: true };
  if (grok.length >= 32 && tokensMatch(token, grok)) return { kind: 'token', canWrite: true };
  if (readOnly.length >= 16 && tokensMatch(token, readOnly)) return { kind: 'token', canWrite: false };
  return null;
}

function authenticate(req: NextRequest, origin: string): { principal: McpPrincipal; token: string } | null {
  const match = /^Bearer\s+(.+)$/i.exec((req.headers.get('authorization') ?? '').trim());
  if (!match) return null;
  const token = match[1];
  if (verifyAccessToken(token, mcpResourceUrl(origin))) return { principal: { kind: 'oauth', canWrite: true }, token };
  const principal = staticTokenPrincipal(token);
  return principal ? { principal, token } : null;
}

/** 401 pointing at the resource metadata (RFC 9728) — that is how a connector
 *  knows to start the OAuth flow. */
function unauthorized(origin: string): Response {
  return NextResponse.json(
    { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null },
    {
      status: 401,
      headers: {
        ...CORS,
        'cache-control': 'no-store',
        'www-authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl(origin)}"`,
      },
    },
  );
}

async function handle(req: NextRequest): Promise<Response> {
  const origin = publicOrigin(req.headers);
  const auth = authenticate(req, origin);
  if (!auth) return unauthorized(origin);

  // One MCP request is one tool call at most; same budget as the REST API.
  const limit = rateLimit(`mcp:${createHash('sha256').update(auth.token).digest('hex').slice(0, 32)}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32000, message: `Zu viele Anfragen. Limit: ${RATE_LIMIT.requests}/Minute.` }, id: null },
      { status: 429, headers: { ...CORS, 'retry-after': String(limit.retryAfterSec) } },
    );
  }

  const server = createDashboardMcpServer(auth.principal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // JSON instead of SSE: tools answer in one piece, and plain JSON survives
    // every proxy.
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    // Personal data — never cached, never indexed.
    headers.set('cache-control', 'no-store, private');
    headers.set('x-robots-tag', 'noindex, nofollow');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } finally {
    // With enableJsonResponse the response is fully buffered at this point.
    await server.close().catch(() => {});
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

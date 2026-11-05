// OAuth token endpoint: code → tokens (with PKCE) and refresh.
import { type NextRequest, NextResponse } from 'next/server';
import { OAUTH_CORS, OAuthError, exchangeToken, mcpResourceUrl, publicOrigin } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readParams(req: NextRequest): Promise<URLSearchParams> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(body ?? {})) if (typeof v === 'string') sp.set(k, v);
    return sp;
  }
  return new URLSearchParams(await req.text());
}

export async function POST(req: NextRequest) {
  const origin = publicOrigin(req.headers);
  try {
    const tokens = exchangeToken(await readParams(req), req.headers.get('authorization'), mcpResourceUrl(origin));
    return NextResponse.json(tokens, { headers: { ...OAUTH_CORS, pragma: 'no-cache' } });
  } catch (e) {
    if (e instanceof OAuthError) {
      return NextResponse.json({ error: e.code, error_description: e.message }, { status: e.status, headers: OAUTH_CORS });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500, headers: OAUTH_CORS });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}

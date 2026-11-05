// RFC 7591: Dynamic Client Registration. The connector registers itself here
// before the login starts. Stateless — the client_id is a signed payload (see
// lib/mcp/oauth.ts). Only allowlisted redirect_uris are accepted, so nobody can
// slip in a callback of their own.
import { type NextRequest, NextResponse } from 'next/server';
import { OAUTH_CORS, OAuthError, registerClient } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Der Body muss ein JSON-Objekt sein.' },
      { status: 400, headers: OAUTH_CORS },
    );
  }
  try {
    const client = registerClient(body as Record<string, unknown>);
    return NextResponse.json(
      {
        client_id: client.clientId,
        ...(client.clientSecret ? { client_secret: client.clientSecret, client_secret_expires_at: 0 } : {}),
        client_id_issued_at: client.issuedAt,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: client.authMethod,
      },
      { status: 201, headers: OAUTH_CORS },
    );
  } catch (e) {
    if (e instanceof OAuthError) {
      return NextResponse.json({ error: e.code, error_description: e.message }, { status: e.status, headers: OAUTH_CORS });
    }
    throw e;
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}

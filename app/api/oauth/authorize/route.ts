// Consent to the connector (form posted from /oauth/authorize).
//
// Deliberately NOT excluded in proxy.ts: nobody gets here without the PIN
// session. The session cookie is SameSite=Lax, so a foreign form cannot submit
// this POST on the owner's behalf. The cookie is checked again here anyway — the
// proxy is a redirect, not the only lock.
import { type NextRequest, NextResponse } from 'next/server';
import { COOKIE, verify } from '@/lib/auth';
import { OWNER, issueCode, mcpResourceUrl, parseAuthorizeRequest, publicOrigin, redirectWith } from '@/lib/mcp/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!verify(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const form = await req.formData();
  const params = new URLSearchParams();
  for (const [k, v] of form.entries()) if (typeof v === 'string') params.set(k, v);

  // Re-check everything — the hidden fields come back from the browser and are
  // as untrusted as the original request.
  const parsed = parseAuthorizeRequest(params, mcpResourceUrl(publicOrigin(req.headers)));
  if (!parsed.ok && !parsed.redirectable) {
    return NextResponse.json({ error: 'invalid_request', error_description: parsed.message }, { status: 400 });
  }
  if (!parsed.ok) {
    return NextResponse.redirect(
      redirectWith(parsed.redirectUri, { error: parsed.error, error_description: parsed.message, state: parsed.state }),
      303,
    );
  }

  const { req: authz } = parsed;
  if (params.get('decision') !== 'allow') {
    return NextResponse.redirect(redirectWith(authz.redirectUri, { error: 'access_denied', state: authz.state }), 303);
  }
  return NextResponse.redirect(redirectWith(authz.redirectUri, { code: issueCode(authz, OWNER), state: authz.state }), 303);
}

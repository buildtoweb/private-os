// Pfad-Variante nach RFC 9728 §3.1 (Ressource /api/mcp) — dieselben Metadaten
// wie /.well-known/oauth-protected-resource. Auf diese Adresse zeigt der
// WWW-Authenticate-Header von /api/mcp.
import { type NextRequest, NextResponse } from 'next/server'
import { OAUTH_CORS, protectedResourceMetadata, publicOrigin } from '@/lib/mcp/oauth'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(publicOrigin(req.headers)), { headers: OAUTH_CORS })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS })
}

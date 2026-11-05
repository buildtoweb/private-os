// RFC 8414: Metadaten des Autorisierungsservers. Öffentlich, ohne Daten.
import { type NextRequest, NextResponse } from 'next/server'
import { OAUTH_CORS, authorizationServerMetadata, publicOrigin } from '@/lib/mcp/oauth'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  return NextResponse.json(authorizationServerMetadata(publicOrigin(req.headers)), { headers: OAUTH_CORS })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS })
}

// RFC 9728: Metadaten der geschützten Ressource (/api/mcp). Öffentlich und
// ohne Nutzdaten — der Connector liest hier, wo es sich anmelden muss.
import { type NextRequest, NextResponse } from 'next/server'
import { OAUTH_CORS, protectedResourceMetadata, publicOrigin } from '@/lib/mcp/oauth'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(publicOrigin(req.headers)), { headers: OAUTH_CORS })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS })
}

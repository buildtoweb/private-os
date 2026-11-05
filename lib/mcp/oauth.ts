// OAuth 2.1 für den MCP-Server — damit Claude (claude.ai, Desktop, Code) und
// ChatGPT das private Dashboard als Connector einbinden können.
//
// Connectoren authentifizieren sich per OAuth mit Dynamic Client Registration
// und PKCE, nicht mit einem festen Header. Der Ablauf:
//
//   1. Der Client liest /.well-known/oauth-protected-resource und
//      /.well-known/oauth-authorization-server.
//   2. Er registriert sich (POST /api/oauth/register) und bekommt eine
//      client_id.
//   3. Der Nutzer landet auf /oauth/authorize, ist dort per PIN angemeldet und
//      bestätigt den Zugriff.
//   4. Der Client tauscht den Code gegen Access- und Refresh-Token
//      (POST /api/oauth/token) und ruft damit /api/mcp auf.
//
// Alles ist ZUSTANDSLOS: client_id, Code und Tokens sind mit MCP_OAUTH_SECRET
// signierte Nutzlasten. Keine Tabelle, keine Migration — und eine einfache
// Notbremse: wird das Geheimnis getauscht, sind sofort alle Registrierungen
// und Tokens ungültig. Einzelne Tokens lassen sich dafür nicht gezielt
// widerrufen; für ein Ein-Personen-Dashboard ist das der richtige Tausch.
//
// Unterschied zu einem normalen OAuth-Server: es gibt keine Nutzer und
// Rollen, nur die PIN-Session. `sub` ist deshalb immer OWNER.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Einziger Nutzer dieses Dashboards. */
export const OWNER = 'owner'

/** Konstante Zeit, längenblind (über SHA-256-Digests). */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

// ── Laufzeiten ──────────────────────────────────────────────────────────────
// Kurzer Access-Token; der Refresh-Token hält einen Monat, damit der
// Connector nicht ständig neu verbunden werden muss.
export const CODE_TTL_S = 5 * 60
export const ACCESS_TTL_S = 60 * 60
export const REFRESH_TTL_S = 30 * 24 * 60 * 60

export const MCP_SCOPE = 'dashboard'

// ── Geheimnis ───────────────────────────────────────────────────────────────

export class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message)
    this.name = 'OAuthError'
  }
}

/** Fail closed: ohne ausreichend langes Geheimnis gibt es keinen OAuth-Weg. */
function secret(): string {
  const s = process.env.MCP_OAUTH_SECRET
  if (!s || s.length < 32) {
    throw new OAuthError('server_error', 'OAuth ist nicht konfiguriert (MCP_OAUTH_SECRET fehlt).', 503)
  }
  return s
}

export function oauthConfigured(): boolean {
  const s = process.env.MCP_OAUTH_SECRET
  return !!s && s.length >= 32
}

// ── Signierte Nutzlasten ────────────────────────────────────────────────────

type ClientPayload = {
  typ: 'client'
  /** Erlaubte redirect_uris, exakt so, wie sie registriert wurden. */
  uris: string[]
  name: string
  /** token_endpoint_auth_method: 'none' oder ein Secret-Verfahren. */
  am: 'none' | 'client_secret_post' | 'client_secret_basic'
  iat: number
}

type CodePayload = {
  typ: 'code'
  /** Hash der client_id — die volle id ist lang und steht ohnehin im Request. */
  cid: string
  ruri: string
  /** PKCE code_challenge (S256). */
  cc: string
  sub: string
  res: string
  exp: number
  jti: string
}

type TokenPayload = {
  typ: 'access' | 'refresh'
  cid: string
  sub: string
  res: string
  exp: number
  jti: string
}

type Payload = ClientPayload | CodePayload | TokenPayload

const PREFIX: Record<Payload['typ'], string> = {
  client: 'mcpc',
  code: 'mcpa',
  access: 'mcpt',
  refresh: 'mcpr',
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url')
}

function hmac(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}

function sign(payload: Payload): string {
  const body = `${PREFIX[payload.typ]}.${b64url(JSON.stringify(payload))}`
  return `${body}.${hmac(body)}`
}

/** Prüft Signatur, Typ und Ablauf. Gibt null zurück statt zu werfen — der
 *  Aufrufer entscheidet, welcher OAuth-Fehler daraus wird. */
function verify<T extends Payload>(token: string, typ: T['typ']): T | null {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== PREFIX[typ]) return null
  const body = `${parts[0]}.${parts[1]}`
  if (!safeEqual(parts[2], hmac(body))) return null
  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
  // Der Typ steht auch in der signierten Nutzlast — ein Refresh-Token taugt
  // so nie als Access-Token, auch wenn jemand das Präfix austauscht.
  if (payload.typ !== typ) return null
  if ('exp' in payload && payload.exp * 1000 < Date.now()) return null
  return payload as T
}

function nowS(): number {
  return Math.floor(Date.now() / 1000)
}

function jti(): string {
  return randomBytes(12).toString('base64url')
}

export function clientHash(clientId: string): string {
  return createHash('sha256').update(clientId).digest('base64url').slice(0, 22)
}

// ── Redirect-URIs ───────────────────────────────────────────────────────────
// Bewusst eine Allowlist statt "jede https-URL": sonst könnte sich jeder einen
// Client mit eigener Callback-Adresse registrieren und dem Nutzer einen
// Zustimmungslink schicken, der den Code auf einen fremden Server lenkt.
// Erlaubt sind die Callback-Hosts von Claude und ChatGPT sowie lokale
// Rückrufe (Claude Code, MCP Inspector). Weitere Hosts per
// MCP_OAUTH_REDIRECT_HOSTS (Kommaliste).
const DEFAULT_HTTPS_HOSTS = ['claude.ai', 'claude.com', 'chatgpt.com']
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]']

export function isAllowedRedirectUri(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.hash || u.username || u.password) return false
  if (u.protocol === 'http:') return LOOPBACK_HOSTS.includes(u.hostname)
  if (u.protocol !== 'https:') return false
  const extra = (process.env.MCP_OAUTH_REDIRECT_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  return [...DEFAULT_HTTPS_HOSTS, ...extra].includes(u.hostname.toLowerCase())
}

// ── Client-Registrierung (RFC 7591) ─────────────────────────────────────────

export type RegisteredClient = {
  clientId: string
  clientSecret?: string
  redirectUris: string[]
  name: string
  authMethod: ClientPayload['am']
  issuedAt: number
}

export function registerClient(input: Record<string, unknown>): RegisteredClient {
  const uris = input.redirect_uris
  if (!Array.isArray(uris) || !uris.length || uris.some((u) => typeof u !== 'string')) {
    throw new OAuthError('invalid_redirect_uri', 'redirect_uris muss eine nicht leere Liste von URLs sein.')
  }
  if (uris.length > 10) throw new OAuthError('invalid_redirect_uri', 'Höchstens 10 redirect_uris.')
  const bad = (uris as string[]).filter((u) => !isAllowedRedirectUri(u))
  if (bad.length) {
    throw new OAuthError('invalid_redirect_uri', `Nicht erlaubte redirect_uri: ${bad.join(', ')}`)
  }

  const requested = input.token_endpoint_auth_method
  const am: ClientPayload['am'] =
    requested === 'client_secret_post' || requested === 'client_secret_basic' ? requested : 'none'

  const name =
    typeof input.client_name === 'string' && input.client_name.trim()
      ? input.client_name.trim().slice(0, 100)
      : 'MCP-Client'

  const iat = nowS()
  const clientId = sign({ typ: 'client', uris: uris as string[], name, am, iat })
  return {
    clientId,
    ...(am !== 'none' ? { clientSecret: clientSecretFor(clientId) } : {}),
    redirectUris: uris as string[],
    name,
    authMethod: am,
    issuedAt: iat,
  }
}

/** Das Client-Secret ist aus der client_id abgeleitet — also ebenfalls
 *  zustandslos und mit dem Geheimnis zusammen widerrufbar. */
function clientSecretFor(clientId: string): string {
  return hmac(`client-secret:${clientId}`)
}

export function readClient(clientId: string): RegisteredClient | null {
  const p = verify<ClientPayload>(clientId, 'client')
  if (!p) return null
  return { clientId, redirectUris: p.uris, name: p.name, authMethod: p.am, issuedAt: p.iat }
}

// ── Autorisierungsanfrage ───────────────────────────────────────────────────

export type AuthorizeRequest = {
  client: RegisteredClient
  redirectUri: string
  state: string | null
  codeChallenge: string
  resource: string
}

/**
 * Prüft die Parameter von /oauth/authorize.
 *
 * Zwei Fehlerklassen, wie RFC 6749 §4.1.2.1 sie trennt: Ist client_id oder
 * redirect_uri kaputt, darf NICHT umgeleitet werden (`redirectable: false`) —
 * sonst wäre der Endpunkt ein offener Redirect. Alles andere wird an die
 * (geprüfte) redirect_uri zurückgemeldet.
 */
export function parseAuthorizeRequest(
  params: URLSearchParams,
  expectedResource: string,
): { ok: true; req: AuthorizeRequest } | { ok: false; redirectable: false; message: string } | {
  ok: false
  redirectable: true
  redirectUri: string
  state: string | null
  error: string
  message: string
} {
  const client = readClient(params.get('client_id') ?? '')
  if (!client) return { ok: false, redirectable: false, message: 'Unbekannte oder ungültige client_id.' }

  const redirectUri = params.get('redirect_uri') ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : '')
  if (!redirectUri || !client.redirectUris.includes(redirectUri) || !isAllowedRedirectUri(redirectUri)) {
    return { ok: false, redirectable: false, message: 'Die redirect_uri ist für diesen Client nicht registriert.' }
  }

  const state = params.get('state')
  const back = (error: string, message: string) =>
    ({ ok: false, redirectable: true, redirectUri, state, error, message }) as const

  if (params.get('response_type') !== 'code') return back('unsupported_response_type', 'Nur response_type=code.')
  const codeChallenge = params.get('code_challenge') ?? ''
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    return back('invalid_request', 'PKCE ist Pflicht (code_challenge fehlt oder ist ungültig).')
  }
  if (params.get('code_challenge_method') !== 'S256') {
    return back('invalid_request', 'Nur code_challenge_method=S256.')
  }
  const resource = params.get('resource')
  if (resource && stripSlash(resource) !== stripSlash(expectedResource)) {
    return back('invalid_target', 'Unbekannte resource.')
  }

  return { ok: true, req: { client, redirectUri, state, codeChallenge, resource: expectedResource } }
}

function stripSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

export function issueCode(req: AuthorizeRequest, userId: string): string {
  return sign({
    typ: 'code',
    cid: clientHash(req.client.clientId),
    ruri: req.redirectUri,
    cc: req.codeChallenge,
    sub: userId,
    res: req.resource,
    exp: nowS() + CODE_TTL_S,
    jti: jti(),
  })
}

export function redirectWith(redirectUri: string, params: Record<string, string | null>): string {
  const u = new URL(redirectUri)
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v)
  return u.toString()
}

// ── Token-Endpunkt ──────────────────────────────────────────────────────────

// Codes sind einmalig. Zustandslos lässt sich das nur je Instanz durchsetzen;
// PKCE deckt den Rest ab — ein abgefangener Code nützt ohne code_verifier
// nichts.
const usedCodes = new Map<string, number>()

function markCodeUsed(id: string, exp: number): boolean {
  const now = nowS()
  for (const [k, e] of usedCodes) if (e < now) usedCodes.delete(k)
  if (usedCodes.has(id)) return false
  usedCodes.set(id, exp)
  return true
}

export type TokenResponse = {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}

function issueTokens(cid: string, sub: string, res: string): TokenResponse {
  const now = nowS()
  return {
    access_token: sign({ typ: 'access', cid, sub, res, exp: now + ACCESS_TTL_S, jti: jti() }),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_S,
    refresh_token: sign({ typ: 'refresh', cid, sub, res, exp: now + REFRESH_TTL_S, jti: jti() }),
    scope: MCP_SCOPE,
  }
}

/** Prüft die Client-Authentifizierung am Token-Endpunkt. */
function authenticateClient(
  params: URLSearchParams,
  authorization: string | null,
): RegisteredClient {
  let clientId = params.get('client_id')
  let clientSecret = params.get('client_secret')
  const basic = /^Basic\s+(.+)$/i.exec(authorization ?? '')
  if (basic) {
    const decoded = Buffer.from(basic[1], 'base64').toString('utf8')
    const i = decoded.indexOf(':')
    if (i > 0) {
      clientId = decodeURIComponent(decoded.slice(0, i))
      clientSecret = decodeURIComponent(decoded.slice(i + 1))
    }
  }
  const client = clientId ? readClient(clientId) : null
  if (!client) throw new OAuthError('invalid_client', 'Unbekannter Client.', 401)
  if (client.authMethod !== 'none') {
    if (!clientSecret || !safeEqual(clientSecret, clientSecretFor(client.clientId))) {
      throw new OAuthError('invalid_client', 'Client-Authentifizierung fehlgeschlagen.', 401)
    }
  }
  return client
}

function pkceS256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/** Bearbeitet grant_type=authorization_code und refresh_token. */
export function exchangeToken(
  params: URLSearchParams,
  authorization: string | null,
  expectedResource: string,
): TokenResponse {
  const grant = params.get('grant_type')
  const client = authenticateClient(params, authorization)
  const cid = clientHash(client.clientId)

  if (grant === 'authorization_code') {
    const code = verify<CodePayload>(params.get('code') ?? '', 'code')
    if (!code || code.cid !== cid) throw new OAuthError('invalid_grant', 'Code ungültig oder abgelaufen.')
    if ((params.get('redirect_uri') ?? code.ruri) !== code.ruri) {
      throw new OAuthError('invalid_grant', 'redirect_uri stimmt nicht mit der Autorisierung überein.')
    }
    const verifier = params.get('code_verifier') ?? ''
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !safeEqual(pkceS256(verifier), code.cc)) {
      throw new OAuthError('invalid_grant', 'PKCE-Prüfung fehlgeschlagen.')
    }
    if (code.res !== expectedResource) throw new OAuthError('invalid_grant', 'Code gehört zu einer anderen Ressource.')
    if (!markCodeUsed(code.jti, code.exp)) throw new OAuthError('invalid_grant', 'Code wurde bereits eingelöst.')
    if (code.sub !== OWNER) throw new OAuthError('invalid_grant', 'Unbekannter Nutzer.')
    return issueTokens(cid, code.sub, code.res)
  }

  if (grant === 'refresh_token') {
    const rt = verify<TokenPayload>(params.get('refresh_token') ?? '', 'refresh')
    if (!rt || rt.cid !== cid) throw new OAuthError('invalid_grant', 'Refresh-Token ungültig oder abgelaufen.')
    if (rt.res !== expectedResource) throw new OAuthError('invalid_grant', 'Token gehört zu einer anderen Ressource.')
    if (rt.sub !== OWNER) throw new OAuthError('invalid_grant', 'Unbekannter Nutzer.')
    return issueTokens(cid, rt.sub, rt.res)
  }

  throw new OAuthError('unsupported_grant_type', 'Nur authorization_code und refresh_token.')
}

/** Prüft einen Access-Token für /api/mcp. Gibt die Nutzer-Id zurück. */
export function verifyAccessToken(token: string, expectedResource: string): string | null {
  if (!oauthConfigured()) return null
  const p = verify<TokenPayload>(token, 'access')
  if (!p || p.res !== expectedResource) return null
  return p.sub
}

// ── Metadaten (RFC 8414 / RFC 9728) ─────────────────────────────────────────

/**
 * Die öffentliche Adresse des Dashboards. Issuer, Ressource und Token-Bindung
 * hängen daran — sie muss für Metadaten, Zustimmungsseite und /api/mcp
 * dieselbe sein. MCP_PUBLIC_ORIGIN überschreibt, falls ein Proxy den Host
 * verfälscht; sonst gilt der Host der Anfrage (Vercel setzt ihn korrekt).
 */
export function publicOrigin(headers: Headers): string {
  const fixed = process.env.MCP_PUBLIC_ORIGIN
  if (fixed) return stripSlash(fixed)
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost:3000').split(',')[0].trim()
  const loopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
  const proto = (headers.get('x-forwarded-proto') ?? (loopback ? 'http' : 'https')).split(',')[0].trim()
  return `${proto}://${host}`
}

export function mcpResourceUrl(origin: string): string {
  return `${origin}/api/mcp`
}

export function protectedResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/api/mcp`
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Privates Dashboard',
  }
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: [MCP_SCOPE],
  }
}

// Die OAuth-Endpunkte werden u.U. aus dem Browser aufgerufen (MCP Inspector,
// Web-Clients). Ohne Cookies, also ist `*` hier unbedenklich.
export const OAUTH_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version',
  'Cache-Control': 'no-store',
} as const

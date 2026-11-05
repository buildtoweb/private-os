import { NextRequest, NextResponse } from 'next/server';
import { verifyEdge } from '@/lib/auth-edge';

export const COOKIE = 'dashboard_session';

export const config = {
  // api/notifications and api/agent are machine-facing (n8n, OpenClaw) and carry
  // their own shared-secret / Bearer-token check — the PIN session cookie would
  // never be present there. .well-known/workflow is the Workflow runtime's
  // own endpoint (queue callbacks), authenticated by Vercel. api/mcp and the
  // OAuth discovery/registration/token endpoints are called by Claude and
  // ChatGPT with their own credentials; only the consent page and its POST
  // (/oauth/authorize, /api/oauth/authorize) stay behind the PIN.
  matcher: ['/((?!login|api/login|api/cron|api/notifications|api/agent|api/mcp|api/oauth/register|api/oauth/token|\\.well-known/oauth-|api/whoop/webhook|api/whoop/callback|api/health-sync|_next|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/|fonts/|\\.well-known/workflow/).*)'],
};

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (await verifyEdge(token)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  // Keep the query: the OAuth consent page needs every parameter back.
  url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

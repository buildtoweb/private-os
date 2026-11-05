// Shared guards for route handlers — the same envCheck/errPayload convention
// app/api/habits/route.ts established, extracted so handlers don't each repeat it.
import { NextResponse } from 'next/server';
import { isMissingTable } from './provision';

export function envCheck(): string[] {
  const missing: string[] = [];
  if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SECRET_KEY');
  return missing;
}

export function envGuard(): NextResponse | null {
  const missing = envCheck();
  if (!missing.length) return null;
  return NextResponse.json({ ok: false, error: 'env_missing', missing }, { status: 500 });
}

export function errPayload(e: any) {
  const code = e?.code || e?.status || 'unknown';
  const message = e?.body?.message || e?.message || String(e);
  // A missing table repairs itself now (lib/provision.ts). Getting here with one
  // means that was tried and did not work, so the useful thing to report is why
  // it failed — not the schema-cache sentence PostgREST returns, which means
  // nothing to whoever pressed the button.
  const hint = isMissingTable(e)
    ? `Tabelle fehlt und konnte nicht angelegt werden: ${e?.provision || 'unbekannter Grund'}`
    : undefined;
  return { ok: false, error: 'db_error', code, message, ...(hint ? { hint } : {}) };
}

export function fail(e: any) {
  // Without this a 500 leaves no trace at all in the Vercel runtime logs — the
  // error is caught here, so nothing ever reaches the platform's error reporting
  // and the only copy of the reason is the response body the client throws away.
  console.error('[api] db_error', e?.code ?? '', e?.body?.message || e?.message || e);
  return NextResponse.json(errPayload(e), { status: 500 });
}

export function badRequest(error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...extra }, { status: 400 });
}

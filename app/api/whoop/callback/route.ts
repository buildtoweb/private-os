import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, saveToken, syncRecent } from '@/lib/whoop';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const cookieState = req.cookies.get('whoop_oauth_state')?.value;
  if (!code || !state || state !== cookieState) {
    return NextResponse.json({ ok: false, error: 'invalid_state' }, { status: 400 });
  }
  const token = await exchangeCode(code);
  await saveToken(token);
  try { await syncRecent(14); } catch (e) { console.error('WHOOP initial sync failed', e); }
  const res = NextResponse.redirect(new URL('/whoop', req.url));
  res.cookies.delete('whoop_oauth_state');
  return res;
}

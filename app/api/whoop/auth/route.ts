import { NextResponse } from 'next/server';
import { authUrl } from '@/lib/whoop';
import { randomBytes } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set('whoop_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}

import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { sign, COOKIE, MAX_AGE } from '@/lib/auth';
import { clearFailures, isLocked, recordFailure } from '@/lib/loginThrottle';

const digest = (value: string) => createHash('sha256').update(value).digest();

export async function POST(req: NextRequest) {
  const { pin } = await req.json().catch(() => ({ pin: '' }));
  const expected = process.env.DASHBOARD_PIN;
  if (!expected || !process.env.SESSION_SECRET) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }

  const ip = req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (await isLocked(ip)) {
    return NextResponse.json({ ok: false, error: 'locked' }, { status: 429 });
  }
  if (!timingSafeEqual(digest(String(pin ?? '')), digest(expected))) {
    await recordFailure(ip);
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await clearFailures(ip);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, sign('ok'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}

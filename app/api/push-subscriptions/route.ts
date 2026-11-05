import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verify } from '@/lib/auth';
import {
  isPushConfigured,
  removePushSubscription,
  savePushSubscription,
  validateSubscription,
} from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authenticated(req: NextRequest) {
  return verify(req.cookies.get(COOKIE)?.value);
}

export async function GET(req: NextRequest) {
  if (!authenticated(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ configured: isPushConfigured() }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: NextRequest) {
  if (!authenticated(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ error: 'VAPID_NOT_CONFIGURED' }, { status: 503 });
  const subscription = await req.json().catch(() => null);
  if (!validateSubscription(subscription)) {
    return NextResponse.json({ error: 'invalid_subscription' }, { status: 400 });
  }
  try {
    await savePushSubscription(subscription, req.headers.get('user-agent') || undefined);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'subscription_write_failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!authenticated(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { endpoint } = await req.json().catch(() => ({ endpoint: '' }));
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    return NextResponse.json({ error: 'invalid_endpoint' }, { status: 400 });
  }
  try {
    await removePushSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'subscription_delete_failed' }, { status: 500 });
  }
}

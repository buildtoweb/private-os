import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verify } from '@/lib/auth';
import { sendDashboardPush } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!verify(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await sendDashboardPush({
      title: 'Private Dashboard',
      body: 'Web Push ist korrekt eingerichtet.',
      url: '/',
      tag: 'push-test',
      badgeCount: 1,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.message === 'VAPID_NOT_CONFIGURED' ? 503 : 500;
    return NextResponse.json({ error: error?.message || 'push_failed' }, { status });
  }
}

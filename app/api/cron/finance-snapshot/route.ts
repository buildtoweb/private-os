import { NextRequest, NextResponse } from 'next/server';
import { appToday } from '@/lib/date';
import { buildSummary } from '@/lib/finance/networth';
import { saveValuePoint } from '@/lib/finance/portfolio';
import { checkPriceAlerts } from '@/lib/finance/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await buildSummary();
    await checkPriceAlerts({ force: true }).catch(() => undefined);
    await saveValuePoint({ date: appToday(), value: summary.netWorthEur, invested: summary.returns?.invested });
    return NextResponse.json({ ok: true, date: appToday(), value: summary.netWorthEur });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Finance snapshot failed' }, { status: 500 });
  }
}

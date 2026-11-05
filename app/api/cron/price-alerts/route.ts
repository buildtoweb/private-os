// Checks price alerts and sends a push for each one that crossed its target.
//
// Vercel Hobby only allows daily crons, so poll this every few minutes from
// n8n (x-notify-secret: NOTIFY_WEBHOOK_SECRET) — the same setup as
// /api/cron/todo-reminders, which also runs this check on each call.
import { NextRequest, NextResponse } from 'next/server';
import { checkPriceAlerts } from '@/lib/finance/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const cron = process.env.CRON_SECRET;
  const notify = process.env.NOTIFY_WEBHOOK_SECRET;
  if (cron && req.headers.get('authorization') === `Bearer ${cron}`) return true;
  if (notify && req.headers.get('x-notify-secret') === notify) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const { checked, triggered } = await checkPriceAlerts({ force: true });
    return NextResponse.json({ ok: true, checked, triggered: triggered.map((alert) => alert.name) });
  } catch (error: any) {
    console.error('price-alerts failed', error?.message);
    return NextResponse.json({ ok: false, error: 'price_alert_run_failed' }, { status: 500 });
  }
}

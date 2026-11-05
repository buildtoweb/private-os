// n8n → Telegram fan-out for upcoming subscription charges.
//
// n8n polls this on a schedule and forwards `text` to its Telegram sendMessage
// node (parse_mode HTML). Same "n8n owns the bot" model as the business
// dashboard — no bot token lives in this repo.
//
// A charge is announced exactly once: dedup is keyed on service + due date, so
// polling every 30 minutes does not resend the same warning for seven days.
//
// Auth: shared secret in `x-notify-secret` or `?secret=`. Not behind the PIN
// session gate (see middleware.ts) because n8n is a machine client.
//
// Query params:
//   ?secret=…       required (or x-notify-secret header)
//   ?dryRun=true    compute and return, but do NOT mark as sent
//   ?leadDays=14    override the look-ahead window for this call
//   ?minAmount=100  override the amount threshold for this call
import { NextResponse, type NextRequest } from 'next/server';
import { getSubscriptions } from '@/lib/subscriptions/notion';
import { buildUpcoming, selectDuePayments, startOfToday } from '@/lib/subscriptions/schedule';
import {
  LEAD_DAYS,
  MIN_AMOUNT_EUR,
  formatDigest,
  paymentKey,
  selectPending,
} from '@/lib/subscriptions/telegram';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: NextRequest): boolean {
  const secret = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided =
    req.headers.get('x-notify-secret') ?? req.nextUrl.searchParams.get('secret');
  return provided === secret;
}

function numParam(req: NextRequest, name: string, fallback: number): number {
  const raw = req.nextUrl.searchParams.get(name);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === 'true';
  const leadDays = numParam(req, 'leadDays', LEAD_DAYS);
  const minAmount = numParam(req, 'minAmount', MIN_AMOUNT_EUR);

  try {
    const upcoming = buildUpcoming(await getSubscriptions(), startOfToday());
    const due = selectDuePayments(upcoming, { leadDays, minAmount });
    const { pending, markSent } = await selectPending(due);

    if (pending.length === 0) {
      return NextResponse.json({ count: 0, hasUpdates: false, text: '', payments: [] });
    }

    if (!dryRun) await markSent();

    return NextResponse.json({
      count: pending.length,
      hasUpdates: true,
      text: formatDigest(pending),
      parseMode: 'HTML',
      payments: pending.map((p) => ({
        key: paymentKey(p),
        service: p.service,
        amountEur: p.amount,
        interval: p.interval,
        category: p.category,
        dueDate: p.dueDate,
        daysUntil: p.daysUntil,
      })),
    });
  } catch (e: any) {
    console.error('telegram-push: failed to build subscription reminders', e);
    // PGRST205 = table missing. The dedup table is provisioned out-of-band
    // (scripts/subscriptions-schema.sql); say so instead of a bare 500, or this
    // looks like a code bug when it is really a one-time setup step.
    if (e?.code === 'PGRST205') {
      return NextResponse.json(
        { error: 'Tabelle private.subscription_pushes fehlt — scripts/subscriptions-schema.sql ausführen' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

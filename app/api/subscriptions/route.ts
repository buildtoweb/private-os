import { NextResponse } from 'next/server';
import { getSubscriptions } from '@/lib/subscriptions/notion';
import { buildUpcoming, computeTotals, startOfToday } from '@/lib/subscriptions/schedule';
import { LEAD_DAYS, MIN_AMOUNT_EUR } from '@/lib/subscriptions/telegram';
import type { SubscriptionsSummary } from '@/lib/subscriptions/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const subs = await getSubscriptions();
    const today = startOfToday();

    const summary: SubscriptionsSummary = {
      totals: computeTotals(subs),
      upcoming: buildUpcoming(subs, today),
      undated: subs.filter((s) => s.status !== 'Inaktiv' && !s.anchor),
      inactive: subs.filter((s) => s.status === 'Inaktiv'),
    };

    return NextResponse.json({
      ok: true,
      ...summary,
      // So the card can show the same rule the Telegram push applies.
      reminder: { leadDays: LEAD_DAYS, minAmountEur: MIN_AMOUNT_EUR },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'Abonnements konnten nicht geladen werden' },
      { status: 500 },
    );
  }
}

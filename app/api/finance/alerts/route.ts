import { NextRequest, NextResponse } from 'next/server';
import { ALERT_CURRENCIES, checkPriceAlerts, createAlert, deleteAlert, dismissAlert, listAlerts } from '@/lib/finance/alerts';
import type { AlertCurrency } from '@/lib/finance/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Listing also runs a (throttled) check, so an open dashboard notices a crossed
// target even when no poller is set up.
export async function GET() {
  try {
    await checkPriceAlerts().catch((error) => console.error('price alert check failed', error?.message));
    return NextResponse.json({ ok: true, alerts: await listAlerts() });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const target = Number(body.target);
    if (!body.assetId && !body.symbol) return NextResponse.json({ ok: false, error: 'asset_required' }, { status: 400 });
    if (!ALERT_CURRENCIES.includes(body.currency)) return NextResponse.json({ ok: false, error: 'invalid_currency' }, { status: 400 });
    if (!(target > 0) || !Number.isFinite(target)) return NextResponse.json({ ok: false, error: 'positive_target_required' }, { status: 400 });
    const alert = await createAlert({ assetId: body.assetId ? String(body.assetId) : undefined, symbol: body.symbol ? String(body.symbol) : undefined, currency: body.currency as AlertCurrency, target });
    return NextResponse.json({ ok: true, alert });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, action } = await req.json();
    if (!id || action !== 'dismiss') return NextResponse.json({ ok: false, error: 'id_and_action_required' }, { status: 400 });
    await dismissAlert(String(id));
    return NextResponse.json({ ok: true });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 });
    await deleteAlert(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 }); }
}

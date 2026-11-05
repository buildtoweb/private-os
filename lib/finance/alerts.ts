// Price alerts: "notify me when Solana crosses $90". Server-side only.
//
// An alert remembers which side of the target the price was on when it was
// set, so "crosses" means reaching the target from that side — a buy-the-dip
// alert below the current price and a take-profit alert above it both work
// without the user having to pick a direction.
//
// Checked by /api/cron/price-alerts (poll it every few minutes), by the
// planner's 5-minute reminder poll, and whenever the dashboard lists alerts.
// A triggered alert stays on the dashboard until it is dismissed.
import { db, FIN_ALERTS } from '@/lib/db';
import { withTable } from '@/lib/provision';
import { isPushConfigured, sendDashboardPush } from '@/lib/push';
import { listAssets } from './portfolio';
import { COINGECKO_KEY } from './config';
import { cryptoYahooSymbol, fetchYahooChart, fxRate } from './prices';
import { resolveMarketAsset } from './asset-search';
import type { AlertCurrency, FinanceAsset, PriceAlert } from './types';

export const ALERT_CURRENCIES: AlertCurrency[] = ['EUR', 'USD'];

export async function listAlerts(): Promise<PriceAlert[]> {
  const snap = await withTable(FIN_ALERTS, () => db().collection(FIN_ALERTS).get());
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<PriceAlert, 'id'>) }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function createAlert(input: { assetId?: string; symbol?: string; currency: AlertCurrency; target: number }): Promise<PriceAlert> {
  const marketAsset = !input.assetId && input.symbol ? await resolveMarketAsset(input.symbol) : undefined;
  const asset = input.assetId ? (await listAssets()).find((item) => item.id === input.assetId) : marketAsset;
  if (!asset) throw new Error('asset_not_found');
  const price = await assetPriceIn(asset, input.currency);
  if (price == null) throw new Error('Für dieses Asset ist gerade kein Kurs verfügbar.');
  const alert: Omit<PriceAlert, 'id'> = {
    assetId: input.assetId || `yahoo:${marketAsset!.symbol}`, name: asset.name, symbol: asset.symbol || asset.yahooSymbol || undefined, cls: asset.cls,
    ...(marketAsset ? { marketAsset } : {}),
    currency: input.currency, target: input.target,
    direction: input.target >= price ? 'above' : 'below',
    priceAtCreation: price, lastPrice: price, lastCheckedAt: Date.now(),
    status: 'active', createdAt: Date.now(),
  };
  const ref = await withTable(FIN_ALERTS, () => db().collection(FIN_ALERTS).add(stripUndefined(alert)));
  return { id: ref.id, ...alert };
}

export async function dismissAlert(id: string) {
  await withTable(FIN_ALERTS, () => db().collection(FIN_ALERTS).doc(id).set({ status: 'dismissed' }, { merge: true }));
}

export async function deleteAlert(id: string) {
  await withTable(FIN_ALERTS, () => db().collection(FIN_ALERTS).doc(id).delete());
}

// Dashboard reads may trigger a check, but not more than once a minute per process.
let lastCheck = 0;

export async function checkPriceAlerts({ force = false } = {}) {
  if (!force && Date.now() - lastCheck < 60_000) return { checked: 0, triggered: [] as PriceAlert[] };
  lastCheck = Date.now();
  const active = (await listAlerts()).filter((alert) => alert.status === 'active');
  if (!active.length) return { checked: 0, triggered: [] as PriceAlert[] };

  const assets = await listAssets();
  const prices = new Map<string, number | null>();
  const triggered: PriceAlert[] = [];
  for (const alert of active) {
    const key = `${alert.assetId}:${alert.currency}`;
    if (!prices.has(key)) {
      const asset = assets.find((item) => item.id === alert.assetId) || alert.marketAsset;
      prices.set(key, asset ? await assetPriceIn(asset, alert.currency).catch(() => null) : null);
    }
    const price = prices.get(key);
    if (price == null) continue;
    const hit = alert.direction === 'above' ? price >= alert.target : price <= alert.target;
    const ref = db().collection(FIN_ALERTS).doc(alert.id);
    if (!hit) {
      await ref.set({ lastPrice: price, lastCheckedAt: Date.now() }, { merge: true });
      continue;
    }
    // Mark first: a crash after sending must not produce a second push.
    const done = { ...alert, status: 'triggered' as const, triggeredAt: Date.now(), triggeredPrice: price, lastPrice: price, lastCheckedAt: Date.now() };
    await ref.set({ status: done.status, triggeredAt: done.triggeredAt, triggeredPrice: price, lastPrice: price, lastCheckedAt: done.lastCheckedAt }, { merge: true });
    triggered.push(done);
    if (isPushConfigured()) {
      await sendDashboardPush({
        title: `${alert.name} ${alert.direction === 'below' ? 'unter' : 'über'} ${formatPrice(alert.target, alert.currency)}`,
        body: `Kursalarm ausgelöst · aktuell ${formatPrice(price, alert.currency)}`,
        url: '/finance',
        tag: `price-alert-${alert.id}`,
      }).catch((error) => console.error('price alert push failed', error?.message));
    }
  }
  return { checked: active.length, triggered };
}

/** Live price of one ledger unit of `asset` in `currency`, or null when no source has it. */
export async function assetPriceIn(asset: Pick<FinanceAsset, 'cls' | 'symbol' | 'yahooSymbol' | 'metalYahooSymbol' | 'coinId' | 'quoteMultiplier'>, currency: AlertCurrency): Promise<number | null> {
  const multiplier = asset.quoteMultiplier ?? 1;
  if (asset.cls === 'crypto' && asset.symbol && !asset.yahooSymbol) {
    try { return (await fetchYahooChart(cryptoYahooSymbol(asset.symbol, currency))).price * multiplier; } catch { /* fall through */ }
    if (asset.coinId) {
      const vs = currency.toLowerCase();
      const headers: Record<string, string> = { accept: 'application/json' };
      if (COINGECKO_KEY) headers['x-cg-demo-api-key'] = COINGECKO_KEY;
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(asset.coinId)}&vs_currencies=${vs}`, { headers, cache: 'no-store' }).catch(() => null);
      const value = res?.ok ? (await res.json())?.[asset.coinId]?.[vs] : null;
      if (typeof value === 'number') return value * multiplier;
    }
    return null;
  }
  const symbol = asset.yahooSymbol || asset.metalYahooSymbol;
  if (!symbol) return null;
  const quote = await fetchYahooChart(symbol);
  return quote.price * multiplier * (await fxRate(quote.currency, currency));
}

export function formatPrice(value: number, currency: string) {
  const digits = Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

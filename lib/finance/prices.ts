// Live price fetchers for manual holdings, cached in Supabase with a timestamp.
//
// Strategy (per source): if the cached doc is younger than PRICE_TTL_MS, return
// it. Otherwise attempt a refresh; on any failure (network, rate-limit) fall
// back to the last cached value and mark the result `stale: true` so the UI can
// show a "prices may be delayed" hint instead of breaking.
import { db, FIN_PRICE_CACHE } from '@/lib/db';
import {
  COINGECKO_KEY, METALS_DEV_KEY, METALS_ENABLED, PRICE_TTL_MS,
} from './config';
import type { MarketQuote, PriceMap, PriceResult, QuoteResult } from './types';

type CacheDoc = { source: string; prices: PriceMap; fetchedAt: number };

async function readCache(source: string): Promise<CacheDoc | null> {
  const snap = await db().collection(FIN_PRICE_CACHE).doc(source).get();
  return snap.exists ? (snap.data() as CacheDoc) : null;
}
async function writeCache(source: string, prices: PriceMap) {
  await db().collection(FIN_PRICE_CACHE).doc(source).set(
    { source, prices, fetchedAt: Date.now() }, { merge: true },
  );
}

async function cachedFetch(
  source: string,
  ids: string[],
  fetcher: () => Promise<PriceMap>,
): Promise<PriceResult> {
  const cache = await readCache(source);
  const fresh = cache && Date.now() - cache.fetchedAt < PRICE_TTL_MS;
  // A newly added id is not in the cache yet: fetch instead of pricing it at 0.
  if (fresh && ids.every((id) => cache.prices?.[id] != null)) {
    return { prices: cache!.prices, stale: false, fetchedAt: cache!.fetchedAt };
  }

  try {
    const prices = await fetcher();
    // Merge so a partial response doesn't drop previously known ids.
    const merged = { ...(cache?.prices || {}), ...prices };
    await writeCache(source, merged);
    return { prices: merged, stale: false, fetchedAt: Date.now() };
  } catch {
    // Fall back to whatever we last had.
    return {
      prices: cache?.prices || {},
      stale: true,
      fetchedAt: cache?.fetchedAt || 0,
    };
  }
}

// ─── CoinGecko (EUR) ───────────────────────────────────────
export async function getCryptoPrices(coinIds: string[]): Promise<PriceResult> {
  const ids = [...new Set(coinIds.filter(Boolean))];
  if (!ids.length) return { prices: {}, stale: false, fetchedAt: Date.now() };

  return cachedFetch('coingecko', ids, async () => {
    const url = new URL('https://api.coingecko.com/api/v3/simple/price');
    url.searchParams.set('ids', ids.join(','));
    url.searchParams.set('vs_currencies', 'eur');
    const headers: Record<string, string> = { accept: 'application/json' };
    if (COINGECKO_KEY) headers['x-cg-demo-api-key'] = COINGECKO_KEY;

    const r = await fetch(url.toString(), { headers, cache: 'no-store' });
    if (!r.ok) throw new Error(`coingecko ${r.status}`);
    const json = (await r.json()) as Record<string, { eur?: number }>;
    const prices: PriceMap = {};
    for (const id of ids) if (typeof json[id]?.eur === 'number') prices[id] = json[id]!.eur!;
    return prices;
  });
}

// ─── Metals.dev (EUR per gram) ─────────────────────────────
// Metals.dev returns spot prices per troy ounce. We normalise to EUR/gram so
// holdings stored in grams or ounces can both be valued. Key map: gold->XAU etc.
const OZ_TO_G = 31.1034768;

export async function getMetalPrices(metals: string[]): Promise<PriceResult> {
  const ids = [...new Set(metals.filter(Boolean).map((m) => m.toLowerCase()))];
  if (!ids.length || !METALS_ENABLED) {
    return { prices: {}, stale: !METALS_ENABLED && ids.length > 0, fetchedAt: 0 };
  }

  return cachedFetch('metals', ids, async () => {
    const url = new URL('https://api.metals.dev/v1/latest');
    url.searchParams.set('api_key', METALS_DEV_KEY);
    url.searchParams.set('currency', 'EUR');
    url.searchParams.set('unit', 'g'); // grams
    const r = await fetch(url.toString(), { cache: 'no-store' });
    if (!r.ok) throw new Error(`metals.dev ${r.status}`);
    const json = (await r.json()) as { metals?: Record<string, number> };
    const src = json.metals || {};
    const prices: PriceMap = {};
    for (const m of ids) {
      // metals.dev keys are lowercase metal names (gold, platinum, silver…).
      if (typeof src[m] === 'number') prices[m] = src[m];
    }
    return prices;
  });
}

export function metalUnitPriceEur(pricePerGram: number, unit: 'g' | 'oz'): number {
  return unit === 'oz' ? pricePerGram * OZ_TO_G : pricePerGram;
}

// ─── Yahoo Finance (stocks / ETFs / crypto, no API key) ────
// Yahoo has no supported public API contract, so every response is cached and
// imported prices remain the final fallback. Symbols are persisted on assets,
// which avoids repeated ISIN searches on normal page loads. One failing symbol
// must not take the others down with it, so each is fetched on its own.
type QuoteCacheDoc = { source: string; quotes: Record<string, MarketQuote>; fetchedAt: number };

export async function getYahooQuotes(symbols: string[]): Promise<QuoteResult> {
  const ids = [...new Set(symbols.filter(Boolean))];
  if (!ids.length) return { quotes: {}, stale: false, fetchedAt: Date.now() };

  const source = 'yahoo';
  const snap = await db().collection(FIN_PRICE_CACHE).doc(source).get();
  const cache = snap.exists ? (snap.data() as QuoteCacheDoc) : null;
  const fresh = cache && Date.now() - cache.fetchedAt < PRICE_TTL_MS;
  if (fresh && ids.every((id) => cache.quotes?.[id])) {
    return { quotes: cache.quotes, stale: false, fetchedAt: cache.fetchedAt };
  }

  const settled = await Promise.allSettled(ids.map(fetchYahooChart));
  const raw = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (!raw.length) return { quotes: cache?.quotes || {}, stale: true, fetchedAt: cache?.fetchedAt || 0 };
  const currencies = [...new Set(raw.map((q) => q.currency).filter((c) => c && c !== 'EUR'))];
  const fx = Object.fromEntries(await Promise.all(currencies.map(async (currency) =>
    [currency, await fxRate(currency, 'EUR').catch(() => null)] as const)));
  const quotes: Record<string, MarketQuote> = { ...(cache?.quotes || {}) };
  for (const quote of raw) {
    const rate = quote.currency === 'EUR' ? 1 : fx[quote.currency];
    if (!rate) continue;
    quotes[quote.symbol] = {
      priceEur: quote.price * rate,
      previousCloseEur: quote.previousClose == null ? undefined : quote.previousClose * rate,
      currency: quote.currency,
      asOf: quote.asOf,
    };
  }
  const fetchedAt = Date.now();
  await db().collection(FIN_PRICE_CACHE).doc(source).set({ source, quotes, fetchedAt }, { merge: true });
  // A symbol that failed now keeps its last cached quote; only a missing one is stale.
  return { quotes, stale: ids.some((id) => !quotes[id]), fetchedAt };
}

export type YahooChartQuote = { symbol: string; price: number; previousClose?: number; currency: string; asOf: number };

export async function fetchYahooChart(symbol: string): Promise<YahooChartQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`yahoo ${symbol} ${res.status}`);
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(price)) throw new Error(`yahoo ${symbol} missing price`);
  const previousClose = Number(meta?.chartPreviousClose ?? meta?.previousClose);
  return {
    symbol,
    price,
    previousClose: Number.isFinite(previousClose) ? previousClose : undefined,
    currency: String(meta?.currency || 'EUR'),
    asOf: Number(meta?.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000,
  };
}

// Yahoo lists coins as SOL-EUR / SOL-USD. CoinGecko blocks some server IPs
// outright, so crypto is priced here first and CoinGecko is only the fallback.
export function cryptoYahooSymbol(symbol: string, currency = 'EUR') {
  return `${symbol.trim().toUpperCase()}-${currency}`;
}

// ─── Exchange rates ────────────────────────────────────────
const fxCache = new Map<string, { rate: number; at: number }>();

/** Units of `to` for one unit of `from`, e.g. fxRate('USD', 'EUR') ≈ 0.88. */
export async function fxRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const key = `${from}${to}`;
  const cached = fxCache.get(key);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.rate;
  const { price } = await fetchYahooChart(`${from}${to}=X`);
  fxCache.set(key, { rate: price, at: Date.now() });
  return price;
}

/** Daily closes of `from`→`to`, keyed by YYYY-MM-DD, for converting a price series. */
export async function fxHistory(from: string, to: string, range: string, interval: string): Promise<[string, number][]> {
  if (from === to) return [];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${from}${to}=X?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Wechselkurs ${from}/${to} nicht verfügbar (HTTP ${res.status})`);
  const result = (await res.json())?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
  return timestamps.flatMap((timestamp, index) => {
    const value = closes[index];
    return typeof value === 'number' && Number.isFinite(value) ? [[new Date(timestamp * 1000).toISOString().slice(0, 10), value] as [string, number]] : [];
  });
}

/** Rate on a given day (last close on or before it), for booking a trade made in another currency. */
export async function fxRateOn(from: string, to: string, date: string): Promise<number> {
  if (from === to) return 1;
  if (date >= new Date().toISOString().slice(0, 10)) return fxRate(from, to);
  const day = Date.parse(`${date}T12:00:00Z`);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${from}${to}=X?period1=${Math.floor(day / 1000) - 10 * 86400}&period2=${Math.floor(day / 1000) + 86400}&interval=1d`;
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, cache: 'no-store' });
  if (!res.ok) return fxRate(from, to);
  const result = (await res.json())?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
  let rate: number | null = null;
  timestamps.forEach((timestamp, index) => {
    const value = closes[index];
    if (typeof value === 'number' && Number.isFinite(value) && new Date(timestamp * 1000).toISOString().slice(0, 10) <= date) rate = value;
  });
  return rate ?? fxRate(from, to);
}

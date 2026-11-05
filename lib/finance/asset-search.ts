import type { MarketAsset } from './types';

const CLASSES: Record<string, MarketAsset['cls']> = { EQUITY: 'stocks', ETF: 'etf', CRYPTOCURRENCY: 'crypto' };

export async function searchMarketAssets(query: string): Promise<MarketAsset[]> {
  const params = new URLSearchParams({ q: query, quotesCount: '12', newsCount: '0', enableFuzzyQuery: 'false' });
  const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?${params}`, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }, next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error('Die Asset-Suche ist gerade nicht verfügbar.');
  const json = await response.json();
  const quotes: { symbol?: string; shortname?: string; longname?: string; quoteType?: string; exchDisp?: string }[] = json.quotes || [];
  return quotes.flatMap((quote) => {
    const cls = CLASSES[quote.quoteType || ''];
    if (!cls || !quote.symbol) return [];
    return [{ name: quote.longname || quote.shortname || quote.symbol, symbol: quote.symbol, yahooSymbol: quote.symbol, cls, ...(quote.exchDisp ? { exchange: quote.exchDisp } : {}) }];
  });
}

export async function resolveMarketAsset(symbol: string): Promise<MarketAsset> {
  if (!symbol || symbol.length > 40 || !/^[A-Za-z0-9.^=_-]+$/.test(symbol)) throw new Error('invalid_symbol');
  const asset = (await searchMarketAssets(symbol)).find((item) => item.symbol.toUpperCase() === symbol.toUpperCase());
  if (!asset) throw new Error('asset_not_found');
  return asset;
}

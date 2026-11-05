// Net-worth aggregation backed entirely by Supabase. Market prices are fetched
// independently (Yahoo Finance, CoinGecko, Metals.dev) and cached in Supabase.
import { appToday } from '@/lib/date';
import { AI_ENABLED, METALS_ENABLED } from './config';
import { listCrypto, listMetals, listCash, getSavingsPlan, listGoals, getIncome } from './store';
import { cryptoYahooSymbol, getCryptoPrices, getMetalPrices, getYahooQuotes, metalUnitPriceEur } from './prices';
import { getPortfolioMeta, listAssets, listTransactions, listValueHistory } from './portfolio';
import { readBridge } from './bridge';
import type {
  AllocationSlice, AssetClass, Cashflow, FinanceActivity, FinanceAsset, FinanceSummary, Position,
  ReturnsSummary, SavingsPlanStats, TopMover,
} from './types';

const CLASS_LABELS: Record<AssetClass, string> = {
  stocks: 'Aktien', etf: 'ETFs', crypto: 'Krypto', metals: 'Edelmetalle', cash: 'Cash',
};

export async function buildSummary(): Promise<FinanceSummary> {
  const month = appToday().slice(0, 7);
  const [assets, transactions, valueHistory, meta, crypto, metals, cash, plan, goals, income, bridge] = await Promise.all([
    listAssets(), listTransactions(), listValueHistory(), getPortfolioMeta(),
    listCrypto(), listMetals(), listCash(), getSavingsPlan(), listGoals(), getIncome(month),
    readBridge().catch(() => null),
  ]);

  let stale = false;
  const positions: Position[] = [];
  const unresolvedHoldings = assets.filter((asset) => asset.importedDummy).map((asset) => {
    const shares = transactions.filter((tx) => tx.assetId === asset.id).reduce((total, tx) =>
      total + (tx.type === 'buy' || tx.type === 'transfer_in' ? Math.abs(tx.shares || 0) : 0)
      - (tx.type === 'sell' || tx.type === 'transfer_out' ? Math.abs(tx.shares || 0) : 0), 0);
    return { name: asset.name, shares, symbol: asset.symbol };
  }).filter((asset) => asset.shares > 0.000001);
  const activeAssets = assets.filter((asset) => asset.active && !asset.importedDummy && (asset.cls === 'cash' || asset.shares > 0));
  const quoteSymbol = (asset: FinanceAsset) => asset.yahooSymbol || asset.metalYahooSymbol
    || (asset.cls === 'crypto' && asset.symbol ? cryptoYahooSymbol(asset.symbol) : undefined);
  const quotedAssets = activeAssets.filter((asset) => quoteSymbol(asset));
  const stockQuotes = await getYahooQuotes(quotedAssets.map((asset) => quoteSymbol(asset)!));
  // CoinGecko only for coins Yahoo could not price.
  const cryptoAssets = activeAssets.filter((asset) => asset.coinId && !stockQuotes.quotes[quoteSymbol(asset) || '']);
  const cryptoQuotes = await getCryptoPrices(cryptoAssets.map((asset) => asset.coinId!));
  stale = stockQuotes.stale && quotedAssets.some((asset) => !stockQuotes.quotes[quoteSymbol(asset)!]) || cryptoQuotes.stale;
  const pricesAsOf = Math.min(stockQuotes.fetchedAt || Date.now(), cryptoAssets.length ? cryptoQuotes.fetchedAt || Date.now() : Date.now());

  let previousValue = 0;
  let comparableCurrentValue = 0;
  for (const asset of activeAssets) {
    const yahooSymbol = quoteSymbol(asset);
    const yahoo = yahooSymbol ? stockQuotes.quotes[yahooSymbol] : undefined;
    const cryptoPrice = asset.coinId ? cryptoQuotes.prices[asset.coinId] : undefined;
    const quoteMultiplier = asset.quoteMultiplier ?? 1;
    const price = asset.cls === 'cash' ? 1 : yahoo?.priceEur != null
      ? yahoo.priceEur * quoteMultiplier : cryptoPrice ?? asset.importedPriceEur ?? 0;
    const value = price * asset.shares;
    const cost = asset.costEur || 0;
    if (yahoo?.previousCloseEur != null) {
      previousValue += yahoo.previousCloseEur * quoteMultiplier * asset.shares;
      comparableCurrentValue += value;
    }
    positions.push({
      assetId: asset.id, name: asset.name, cls: asset.cls, valueEur: value, source: 'portfolio',
      symbol: asset.cls === 'metals' ? asset.symbol || asset.identifier : asset.yahooSymbol || asset.symbol || asset.identifier,
      coinId: asset.coinId,
      identifier: asset.identifier, shares: asset.shares, currentPrice: price,
      costEur: asset.cls === 'cash' ? undefined : cost,
      gainEur: asset.cls === 'cash' ? undefined : value - cost,
      gainPct: asset.cls === 'cash' || !cost ? undefined : value / cost - 1,
      realizedEur: asset.realizedEur,
      openingBalanceEur: asset.cls === 'cash' ? asset.openingBalanceEur : undefined,
      openingBalanceDate: asset.cls === 'cash' ? asset.openingBalanceDate : undefined,
    });
  }

  if (crypto.length) {
    const { prices, stale: cryptoStale } = await getCryptoPrices(crypto.map((holding) => holding.coinId));
    stale ||= cryptoStale;
    for (const holding of crypto) {
      const price = prices[holding.coinId] || 0;
      const value = price * (holding.amount || 0);
      const cost = (holding.buyPriceEur || 0) * (holding.amount || 0);
      positions.push({
        name: holding.symbol || holding.coinId, cls: 'crypto', valueEur: value, source: 'manual',
        identifier: holding.symbol, shares: holding.amount, currentPrice: price, costEur: cost || undefined,
        gainEur: cost ? value - cost : undefined, gainPct: cost ? value / cost - 1 : undefined,
      });
    }
  }

  if (metals.length) {
    const { prices, stale: metalsStale } = await getMetalPrices(metals.map((holding) => holding.metal));
    stale ||= metalsStale;
    for (const holding of metals) {
      const unitPrice = metalUnitPriceEur(prices[holding.metal.toLowerCase()] || 0, holding.unit);
      const value = unitPrice * (holding.amount || 0);
      const cost = (holding.buyPriceEur || 0) * (holding.amount || 0);
      positions.push({
        name: `${holding.metal} (${holding.amount}${holding.unit})`, cls: 'metals', valueEur: value, source: 'manual',
        shares: holding.amount, currentPrice: unitPrice, costEur: cost || undefined,
        gainEur: cost ? value - cost : undefined, gainPct: cost ? value / cost - 1 : undefined,
      });
    }
  }
  for (const account of cash) positions.push({ name: account.name, cls: 'cash', valueEur: account.balanceEur || 0, source: 'manual' });

  const netWorthEur = positions.reduce((sum, position) => sum + (position.valueEur || 0), 0);
  for (const position of positions) position.allocationPct = netWorthEur > 0 ? position.valueEur / netWorthEur : 0;
  positions.sort((a, b) => b.valueEur - a.valueEur);

  const byClass = new Map<AssetClass, number>();
  for (const position of positions) byClass.set(position.cls, (byClass.get(position.cls) || 0) + position.valueEur);
  const allocation: AllocationSlice[] = [...byClass.entries()]
    .map(([cls, valueEur]) => ({ cls, label: CLASS_LABELS[cls], valueEur, pct: netWorthEur > 0 ? valueEur / netWorthEur : 0 }))
    .sort((a, b) => b.valueEur - a.valueEur);

  const withGain = positions.filter((position) => position.gainEur != null);
  const winners: TopMover[] = withGain.filter((position) => (position.gainEur || 0) > 0)
    .sort((a, b) => (b.gainEur || 0) - (a.gainEur || 0)).slice(0, 5)
    .map((position) => ({ name: position.name, cls: position.cls, gainEur: position.gainEur || 0, returnPct: position.gainPct || 0 }));
  const losers: TopMover[] = withGain.filter((position) => (position.gainEur || 0) < 0)
    .sort((a, b) => (a.gainEur || 0) - (b.gainEur || 0)).slice(0, 5)
    .map((position) => ({ name: position.name, cls: position.cls, gainEur: position.gainEur || 0, returnPct: position.gainPct || 0 }));

  const activities: FinanceActivity[] = transactions.map((tx) => ({
    id: tx.id, assetId: tx.assetId, type: tx.type, datetime: tx.datetime, name: tx.name,
    identifier: tx.identifier, shares: tx.shares, price: tx.price, amount: tx.amount,
    tax: tx.tax, fee: tx.fee, realizedGainNet: tx.realizedGainNet,
    currency: tx.currency, priceOriginal: tx.priceOriginal, amountOriginal: tx.amountOriginal, fxRate: tx.fxRate,
  }));
  const capital = {
    deposits: sumType(activities, 'deposit'), withdrawals: sumType(activities, 'withdrawal'),
    buys: sumType(activities, 'buy'), sells: sumType(activities, 'sell'), net: 0,
  };
  capital.net = capital.deposits - capital.withdrawals;
  const realizedNet = activities.reduce((sum, activity) => sum + (activity.realizedGainNet || 0), 0);
  const dividendsNet = sumType(activities, 'dividend');
  const interest = sumType(activities, 'interest');
  const fees = activities.reduce((sum, activity) => sum + (activity.fee || 0), 0);
  const taxes = activities.reduce((sum, activity) => sum + (activity.tax || 0), 0);
  const invested = positions.reduce((sum, position) => sum + (position.costEur || 0), 0);
  const unrealizedNet = positions.reduce((sum, position) => sum + (position.gainEur || 0), 0);
  const returns: ReturnsSummary | null = assets.length ? {
    portfolioValue: netWorthEur, invested,
    // Only the ledger has cash flows, so manual holdings must not count as its result.
    xirr: calculateXirr(activities, positions.reduce((sum, p) => sum + (p.source === 'portfolio' ? p.valueEur : 0), 0)),
    ttwror: typeof meta?.returns?.ttwror === 'number' ? meta.returns.ttwror : null,
    realizedNet, unrealizedNet, totalNet: realizedNet + unrealizedNet,
    dividendsNet, interest, fees, taxes,
    netSum: realizedNet + dividendsNet + interest - fees - taxes,
  } : null;

  let savingsPlan: SavingsPlanStats | null = null;
  if (plan && plan.monthlyEur > 0) {
    const match = plan.isin ? positions.find((position) => position.identifier?.toUpperCase() === plan.isin.toUpperCase()) : undefined;
    const monthsElapsed = plan.startDate ? monthsBetween(plan.startDate, appToday()) : 0;
    const planInvested = match?.costEur ?? monthsElapsed * plan.monthlyEur;
    savingsPlan = {
      plan, monthsElapsed, invested: planInvested, currentValue: match?.valueEur ?? null,
      gainEur: match?.gainEur ?? null, gainPct: match?.gainPct ?? null, matched: !!match,
      projection: projectSavingsPlan(match?.valueEur ?? planInvested, plan.monthlyEur),
    };
  }

  const bridgeIncome = bridge?.actualDraw ?? null;
  const monthlyIncome = income?.amountEur ?? bridgeIncome ?? 0;
  const incomeSource: Cashflow['incomeSource'] = income?.amountEur != null ? 'manual' : bridgeIncome != null ? 'bridge' : 'none';
  const monthlyInvested = savingsPlan?.plan.monthlyEur ?? 0;
  const cashflow: Cashflow = {
    month, income: monthlyIncome, incomeSource, invested: monthlyInvested,
    savingsRate: monthlyIncome > 0 ? monthlyInvested / monthlyIncome : null,
    distributable: bridge?.distributableAmount ?? null, taxReservePct: bridge?.taxReservePct ?? null,
  };

  const historyCutoverDate = valueHistory.find((point) => point.updatedAt)?.date ?? null;
  const history = [...valueHistory];
  if (history.at(-1)?.date === appToday()) {
    history[history.length - 1] = { date: appToday(), value: netWorthEur, invested };
  } else {
    history.push({ date: appToday(), value: netWorthEur, invested });
  }

  return {
    netWorthEur,
    unresolvedHoldings,
    hasIndicativeMetalPricing: activeAssets.some((asset) => asset.cls === 'metals' && !!(asset.yahooSymbol || asset.metalYahooSymbol)),
    dayChangePct: previousValue > 0 ? (comparableCurrentValue - previousValue) / previousValue : null,
    historyCutoverDate,
    valuationReconciled: !!meta?.valuationReconciledAt,
    allocation, positions, returns, capital, activities,
    topMovers: { winners, losers }, valueSeries: history, savingsPlan, cashflow, goals, stale, pricesAsOf,
    portfolioReady: assets.length > 0,
    sources: { database: assets.length > 0, yahoo: quotedAssets.length > 0, metals: METALS_ENABLED || activeAssets.some((asset) => asset.cls === 'metals' && !!(asset.yahooSymbol || asset.metalYahooSymbol)), coingecko: true, bridge: !!bridge, ai: AI_ENABLED },
  };
}

function sumType(activities: FinanceActivity[], type: FinanceActivity['type']) {
  return activities.filter((activity) => activity.type === type).reduce((sum, activity) => sum + Math.abs(activity.amount || 0), 0);
}

function calculateXirr(activities: FinanceActivity[], terminalValue: number): number | null {
  const flows = activities
    .filter((activity) => ['buy', 'sell', 'dividend', 'interest'].includes(activity.type) && activity.datetime)
    .map((activity) => ({ date: new Date(activity.datetime).getTime(), amount: activity.type === 'buy' ? -Math.abs(activity.amount) : Math.abs(activity.amount) }));
  if (!flows.length || terminalValue <= 0) return null;
  flows.push({ date: Date.now(), amount: terminalValue });
  flows.sort((a, b) => a.date - b.date);
  const first = flows[0].date;
  const npv = (rate: number) => flows.reduce((sum, flow) => sum + flow.amount / Math.pow(1 + rate, (flow.date - first) / 31_557_600_000), 0);
  let low = -0.9999, high = 10;
  if (npv(low) * npv(high) > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    if (npv(low) * npv(mid) <= 0) high = mid; else low = mid;
  }
  return ((low + high) / 2) * 100;
}

function projectSavingsPlan(currentValue: number, monthly: number) {
  const rate = 0.07 / 12;
  return [5, 10, 20].map((years) => {
    const months = years * 12;
    return { years, valueEur: Math.round(currentValue * Math.pow(1 + rate, months) + monthly * ((Math.pow(1 + rate, months) - 1) / rate)) };
  });
}

function monthsBetween(startISO: string, endISO: string): number {
  const [startYear, startMonth] = startISO.slice(0, 7).split('-').map(Number);
  const [endYear, endMonth] = endISO.slice(0, 7).split('-').map(Number);
  return Math.max(0, (endYear - startYear) * 12 + (endMonth - startMonth));
}

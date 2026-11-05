// Synthetic demo summary for previewing the full dashboard (/finance?demo=1).
// Not real data — purely representative so the
// charts, tables and analysis render. Never used by the live summary endpoint.
import type { FinanceSummary, ValuePoint } from './types';

function series(): ValuePoint[] {
  const out: ValuePoint[] = [];
  let value = 8000, invested = 8000;
  for (let i = 0; i < 24; i++) {
    const y = 2024 + Math.floor((6 + i) / 12);
    const m = ((6 + i) % 12) + 1;
    invested += 600;
    value = value + 600 + Math.sin(i / 2) * 900 + (i > 16 ? -700 : 500);
    out.push({ date: `${y}-${String(m).padStart(2, '0')}-01`, value: Math.round(value), invested });
  }
  return out;
}

export const DEMO_SUMMARY: FinanceSummary = {
  netWorthEur: 80505,
  dayChangePct: 0.0042,
  portfolioReady: true,
  stale: false,
  allocation: [
    { cls: 'stocks', label: 'Aktien', valueEur: 74375, pct: 0.4742 },
    { cls: 'crypto', label: 'Krypto', valueEur: 8048, pct: 0.2117 },
    { cls: 'etf', label: 'ETFs', valueEur: 8044, pct: 0.1423 },
    { cls: 'metals', label: 'Edelmetalle', valueEur: 2619, pct: 0.105 },
    { cls: 'cash', label: 'Cash', valueEur: 5097, pct: 0.0667 },
  ],
  positions: [
    { name: "Beispiel AG", cls: 'stocks', valueEur: 8149, source: 'portfolio', identifier: 'XX0000000000', shares: 7524, currentPrice: 6.24, costEur: 8431, gainEur: 757, gainPct: 0.1528, realizedEur: 0, allocationPct: 0.2556 },
    { name: 'Muster Technologie', cls: 'stocks', valueEur: 3962, source: 'portfolio', identifier: 'XX0000000000', shares: 87, currentPrice: 793.71, costEur: 5242, gainEur: 6418, gainPct: 8.98, realizedEur: 6361, allocationPct: 0.1693 },
    { name: 'Beispiel Coin', cls: 'crypto', valueEur: 7672, source: 'portfolio', identifier: 'BSP', shares: 15.0, currentPrice: 66.09, costEur: 18579, gainEur: -6438, gainPct: -0.6318, realizedEur: 345, allocationPct: 0.167 },
    { name: 'Welt-ETF', cls: 'etf', valueEur: 8044, source: 'portfolio', identifier: 'XX0000000000', shares: 816, currentPrice: 38.57, costEur: 6135, gainEur: 534, gainPct: 0.049, realizedEur: 0, allocationPct: 0.1423 },
    { name: 'Gold', cls: 'metals', valueEur: 8102, source: 'manual', shares: 30, currentPrice: 30, costEur: 5934, gainEur: 816, gainPct: 0.1428, allocationPct: 0.0712 },
    { name: 'Tagesgeld', cls: 'cash', valueEur: 5097, source: 'manual', allocationPct: 0.0667 },
    { name: 'Muster Coin', cls: 'crypto', valueEur: 9585, source: 'manual', identifier: 'Muster Coin', shares: 9012, currentPrice: 0.84, costEur: 267, gainEur: 363, gainPct: 0.12, allocationPct: 0.0448 },
    { name: 'Platin', cls: 'metals', valueEur: 298, source: 'manual', shares: 1, currentPrice: 298, costEur: 674, gainEur: 82, gainPct: 0.0857, allocationPct: 0.0338 },
    { name: 'Muster Pharma', cls: 'stocks', valueEur: 483, source: 'portfolio', identifier: 'XX0000000000', shares: 82, currentPrice: 16.55, costEur: 1117, gainEur: -192, gainPct: -0.1705, realizedEur: 0, allocationPct: 0.0417 },
  ],
  returns: {
    portfolioValue: 80505, invested: 89392, xirr: 2.93, ttwror: 69.18,
    realizedNet: 4515, unrealizedNet: -6691, totalNet: 5837,
    dividendsNet: 2.15, interest: 425.8, fees: 897.7, taxes: 110.25,
    netSum: 7392,
  },
  capital: { deposits: 70944, withdrawals: 10659, buys: 513932, sells: 20836, net: -114 },
  activities: [
    { id: '1', type: 'sell', datetime: '2026-06-15T16:26:00Z', name: 'Muster Technologie', identifier: 'XX0000000000', amount: 7924.58, realizedGainNet: 6361 },
    { id: '2', type: 'buy', datetime: '2026-06-15T08:91:00Z', name: 'Welt-ETF', identifier: 'XX0000000000', amount: 906.12 },
    { id: '3', type: 'withdrawal', datetime: '2026-06-14T08:91:00Z', name: 'Konto', amount: 8726.75 },
    { id: '4', type: 'buy', datetime: '2026-06-12T16:55:00Z', name: 'Beispiel Raumfahrt', identifier: 'XX0000000000', amount: 733.70 },
    { id: '5', type: 'dividend', datetime: '2026-05-02T08:91:00Z', name: 'Muster Pharma', amount: 2.15 },
    { id: '6', type: 'deposit', datetime: '2026-05-01T08:91:00Z', name: 'Konto', amount: 537 },
  ],
  topMovers: {
    winners: [
      { name: 'Muster Technologie', cls: 'stocks', gainEur: 6418, returnPct: 8.98 },
      { name: 'Beispiel AG', cls: 'stocks', gainEur: 757, returnPct: 0.1528 },
      { name: 'Gold', cls: 'metals', gainEur: 816, returnPct: 0.1428 },
    ],
    losers: [
      { name: 'Beispiel Coin', cls: 'crypto', gainEur: -6438, returnPct: -0.6318 },
      { name: 'Muster Pharma', cls: 'stocks', gainEur: -192, returnPct: -0.1705 },
    ],
  },
  valueSeries: series(),
  savingsPlan: {
    plan: { isin: 'XX0000000000', name: 'Welt-ETF', monthlyEur: 715, interval: 'monthly', startDate: '2026-01-15' },
    monthsElapsed: 5, invested: 6135, currentValue: 8044, gainEur: 534, gainPct: 0.049, matched: true,
    projection: [{ years: 5, valueEur: 95456 }, { years: 84, valueEur: 75025 }, { years: 77, valueEur: 71038 }],
  },
  cashflow: { month: '2026-06', income: 3732, incomeSource: 'bridge', invested: 715, savingsRate: 0.0285, distributable: 9884, taxReservePct: 88 },
  goals: [
    { id: 'g1', name: 'Notgroschen', targetEur: 85508, savedEur: 3302 },
    { id: 'g2', name: 'Großes Ziel', targetEur: 86852, savedEur: 13315 },
  ],
  sources: { database: true, yahoo: true, metals: true, coingecko: true, bridge: true, ai: false },
};

// Shared types for the Finance tab.

export type AssetClass = 'stocks' | 'etf' | 'crypto' | 'metals' | 'cash';

// ─── Manual holdings (stored in Supabase) ──────────────────
export type CryptoHolding = {
  id: string;
  coinId: string;      // CoinGecko id, e.g. "polkadot"
  symbol: string;      // display symbol, e.g. "DOT"
  amount: number;      // units held
  buyDate?: string;    // YYYY-MM-DD
  buyPriceEur?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type MetalHolding = {
  id: string;
  metal: string;       // "gold" | "platinum" | ... (Metals.dev metal key)
  unit: 'g' | 'oz';
  amount: number;
  buyDate?: string;
  buyPriceEur?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type CashAccount = {
  id: string;
  name: string;        // e.g. "Bank"
  balanceEur: number;
  currency?: string;
  lastUpdated?: number;
};

export type SavingsPlan = {
  isin: string;
  name: string;
  monthlyEur: number;
  interval?: 'monthly';
  startDate?: string;  // YYYY-MM-DD
  updatedAt?: number;
};

export type SavingsGoal = {
  id: string;
  name: string;
  targetEur: number;
  savedEur: number;
  deadline?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type IncomeEntry = {
  month: string;       // YYYY-MM
  amountEur: number;
  source: 'bridge' | 'manual';
  updatedAt?: number;
};

// ─── Business bridge (one-way, read-only here) ─────────────
export type BridgeDoc = {
  period: string;
  distributableAmount: number;
  actualDraw: number;
  taxReservePct: number;
  taxReserveAmount: number;
  timestamp: number;
};

// ─── Prices ────────────────────────────────────────────────
export type PriceMap = Record<string, number>;
export type PriceResult = { prices: PriceMap; stale: boolean; fetchedAt: number };
export type MarketQuote = { priceEur: number; previousCloseEur?: number; currency: string; asOf: number };
export type QuoteResult = { quotes: Record<string, MarketQuote>; stale: boolean; fetchedAt: number };

export type FinanceAsset = {
  id: string;
  name: string;
  cls: AssetClass;
  identifier: string;
  isin?: string;
  symbol?: string;
  yahooSymbol?: string;
  metalYahooSymbol?: string; // Kept separate so older deployments use the stored unit price.
  quoteMultiplier?: number; // Converts a market quote into the price of one ledger unit.
  coinId?: string;
  currency?: string;
  active: boolean;
  importedDummy?: boolean;
  shares: number;
  costEur: number;
  realizedEur: number;
  importedPriceEur?: number;
  importedValueEur?: number;
  openingBalanceEur?: number;
  openingBalanceDate?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type FinanceTransaction = {
  id: string;
  assetId?: string;
  type: ActivityType;
  datetime: string;
  name?: string;
  identifier?: string;
  shares?: number;
  price?: number;
  amount: number;
  amountNet?: number;
  currency?: string;
  tax?: number;
  fee?: number;
  realizedGainNet?: number;
  note?: string;
  // Trades booked in another currency keep what was typed; the EUR fields above
  // are converted at `fxRate` (EUR per unit) on the trade date.
  priceOriginal?: number;
  amountOriginal?: number;
  feeOriginal?: number;
  taxOriginal?: number;
  fxRate?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type AlertCurrency = 'EUR' | 'USD';

export type MarketAsset = {
  name: string;
  symbol: string;
  yahooSymbol: string;
  cls: 'stocks' | 'etf' | 'crypto';
  exchange?: string;
};

export type PriceAlert = {
  id: string;
  assetId: string;
  marketAsset?: MarketAsset; // Quote source for alerts on instruments outside the portfolio.
  name: string;
  symbol?: string;
  cls: AssetClass;
  currency: AlertCurrency;
  target: number;
  direction: 'above' | 'below';   // fixed at creation from the price back then
  priceAtCreation?: number;
  status: 'active' | 'triggered' | 'dismissed';
  createdAt: number;
  triggeredAt?: number;
  triggeredPrice?: number;
  lastPrice?: number;
  lastCheckedAt?: number;
};

// ─── Positions & allocation ────────────────────────────────
export type Position = {
  assetId?: string;
  name: string;
  cls: AssetClass;
  valueEur: number;
  source: 'portfolio' | 'manual';
  identifier?: string;      // ISIN / ticker / coin symbol
  symbol?: string;
  coinId?: string;
  shares?: number;
  currentPrice?: number;
  costEur?: number;         // total purchase value
  gainEur?: number;         // unrealized gain (€)
  gainPct?: number;         // unrealized return (%) as 0..1
  realizedEur?: number;
  allocationPct?: number;   // share of net worth, 0..1
  openingBalanceEur?: number;
  openingBalanceDate?: string;
};

export type AllocationSlice = {
  cls: AssetClass;
  label: string;
  valueEur: number;
  pct: number; // 0..1
};

// ─── Portfolio activities & returns ───────────────────────
export type ActivityType =
  | 'buy' | 'sell' | 'dividend' | 'interest'
  | 'transfer_in' | 'transfer_out' | 'fees_taxes' | 'deposit' | 'withdrawal';

export type FinanceActivity = {
  id: string;
  assetId?: string;
  type: ActivityType;
  datetime: string;
  name?: string;
  identifier?: string;      // ISIN
  shares?: number;
  price?: number;
  amount: number;
  tax?: number;
  fee?: number;
  realizedGainNet?: number;
  currency?: string;
  priceOriginal?: number;
  amountOriginal?: number;
  fxRate?: number;
};

export type ReturnsSummary = {
  portfolioValue: number;
  invested: number;
  xirr: number | null;      // IZF, % (e.g. 4.27)
  ttwror: number | null;    // %, e.g. 16.29
  realizedNet: number;
  unrealizedNet: number;
  totalNet: number;
  dividendsNet: number;
  interest: number;
  fees: number;
  taxes: number;
  netSum: number;           // realized + dividends + interest − fees − taxes
};

export type CapitalFlows = {
  deposits: number;
  withdrawals: number;
  buys: number;
  sells: number;
  net: number;              // deposits − withdrawals
};

export type TopMover = { name: string; cls: AssetClass; gainEur: number; returnPct: number };

export type ValuePoint = { date: string; value: number; invested?: number; importedAt?: number; updatedAt?: number };

export type SavingsPlanStats = {
  plan: SavingsPlan;
  monthsElapsed: number;
  invested: number;
  currentValue: number | null;
  gainEur: number | null;
  gainPct: number | null;       // 0..1
  matched: boolean;
  projection: { years: number; valueEur: number }[];
};

export type Cashflow = {
  month: string;
  income: number;
  incomeSource: 'bridge' | 'manual' | 'none';
  invested: number;
  savingsRate: number | null;
  distributable: number | null;
  taxReservePct: number | null;
};

// ─── Aggregated summary returned by /api/finance/summary ───
export type FinanceSummary = {
  netWorthEur: number;
  unresolvedHoldings?: { name: string; shares: number; symbol?: string }[];
  hasIndicativeMetalPricing?: boolean;
  dayChangePct: number | null;
  historyCutoverDate?: string | null;
  valuationReconciled?: boolean;
  allocation: AllocationSlice[];
  positions: Position[];
  returns: ReturnsSummary | null;
  capital: CapitalFlows | null;
  activities: FinanceActivity[];
  topMovers: { winners: TopMover[]; losers: TopMover[] };
  valueSeries: ValuePoint[];
  savingsPlan: SavingsPlanStats | null;
  cashflow: Cashflow;
  goals: SavingsGoal[];
  stale: boolean;
  pricesAsOf?: number;
  portfolioReady: boolean;
  sources: {
    database: boolean;
    yahoo: boolean;
    metals: boolean;
    coingecko: boolean;
    bridge: boolean;
    ai: boolean;
  };
};

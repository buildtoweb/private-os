// Finance domain — net worth, allocation, positions, returns, cashflow, goals.
//
// Built entirely on lib/finance/networth.ts's buildSummary(), the same
// aggregation the Finanzen tab renders, so nothing is recomputed here — only
// renamed, rounded and summarised.
//
// Note on "read-only": no user data is written. buildSummary may refresh the
// shared price cache (private.finance_price_cache) exactly as the dashboard does
// when a page is opened; that is a technical cache, not user content.
import { buildSummary } from '@/lib/finance/networth';
import type { FinanceSummary } from '@/lib/finance/types';
import { appToday } from '@/lib/date';
import type { Warnings } from '../envelope';
import { CURRENCY, compact, de, formatEur, fractionToPct, ratioPct, round, sentences } from '../format';

const CLASS_LABELS: Record<string, string> = {
  stocks: 'Aktien', etf: 'ETFs', crypto: 'Krypto', metals: 'Edelmetalle', cash: 'Cash',
};

/** How many activities to hand over — enough for context, not a transaction dump. */
const ACTIVITY_LIMIT = 25;

export async function buildFinance(warn: Warnings, opts: { activityLimit?: number } = {}) {
  const s = await warn.guard<FinanceSummary | null>('finance.summary', () => buildSummary(), null);
  if (!s) {
    return compact({
      currency: CURRENCY,
      available: false,
      summary: 'Die Finanzdaten konnten nicht geladen werden — Details siehe warnings.',
    });
  }

  if (s.stale) warn.add('finance.prices', 'Preise stammen aus dem Cache (externe Kursquelle nicht erreichbar).');
  if (!s.portfolioReady) warn.add('finance.portfolio', 'In Supabase ist noch kein Portfolio angelegt.');

  const activityLimit = opts.activityLimit ?? ACTIVITY_LIMIT;
  const r = s.returns;

  const goals = s.goals.map((g) => compact({
    name: g.name,
    target_eur: round(g.targetEur, 2),
    saved_eur: round(g.savedEur, 2),
    remaining_eur: round(Math.max(0, (g.targetEur || 0) - (g.savedEur || 0)), 2),
    progress_pct: ratioPct(g.savedEur || 0, g.targetEur || 0),
    deadline: g.deadline,
    reached: (g.savedEur || 0) >= (g.targetEur || 0) && (g.targetEur || 0) > 0,
  }));

  return compact({
    currency: CURRENCY,
    available: true,
    as_of: appToday(),
    net_worth_eur: round(s.netWorthEur, 2),
    day_change_pct: s.dayChangePct != null ? fractionToPct(s.dayChangePct) : undefined,

    allocation: s.allocation.map((a) => compact({
      asset_class: CLASS_LABELS[a.cls] ?? a.cls,
      value_eur: round(a.valueEur, 2),
      share_pct: fractionToPct(a.pct),
    })),

    positions: s.positions.map((p) => compact({
      name: p.name,
      asset_class: CLASS_LABELS[p.cls] ?? p.cls,
      identifier: p.identifier,
      value_eur: round(p.valueEur, 2),
      share_pct: fractionToPct(p.allocationPct),
      shares: round(p.shares, 4),
      price_eur: round(p.currentPrice, 2),
      cost_eur: round(p.costEur, 2),
      gain_eur: round(p.gainEur, 2),
      gain_pct: fractionToPct(p.gainPct),
      data_source: p.source === 'portfolio' ? 'eigenes Portfolio' : 'manuell',
    })),

    returns: r ? compact({
      portfolio_value_eur: round(r.portfolioValue, 2),
      invested_eur: round(r.invested, 2),
      xirr_pct: round(r.xirr, 2),
      ttwror_pct: round(r.ttwror, 2),
      realized_net_eur: round(r.realizedNet, 2),
      unrealized_net_eur: round(r.unrealizedNet, 2),
      total_net_eur: round(r.totalNet, 2),
      dividends_net_eur: round(r.dividendsNet, 2),
      interest_eur: round(r.interest, 2),
      fees_eur: round(r.fees, 2),
      taxes_eur: round(r.taxes, 2),
    }) : undefined,

    capital_flows: s.capital ? compact({
      deposits_eur: round(s.capital.deposits, 2),
      withdrawals_eur: round(s.capital.withdrawals, 2),
      buys_eur: round(s.capital.buys, 2),
      sells_eur: round(s.capital.sells, 2),
      net_eur: round(s.capital.net, 2),
    }) : undefined,

    top_movers: compact({
      winners: s.topMovers.winners.map(shapeMover),
      losers: s.topMovers.losers.map(shapeMover),
    }),

    savings_plan: s.savingsPlan ? compact({
      name: s.savingsPlan.plan.name,
      isin: s.savingsPlan.plan.isin,
      monthly_eur: round(s.savingsPlan.plan.monthlyEur, 2),
      started: s.savingsPlan.plan.startDate,
      months_elapsed: s.savingsPlan.monthsElapsed,
      invested_eur: round(s.savingsPlan.invested, 2),
      current_value_eur: round(s.savingsPlan.currentValue, 2),
      gain_eur: round(s.savingsPlan.gainEur, 2),
      gain_pct: fractionToPct(s.savingsPlan.gainPct),
      projection: s.savingsPlan.projection.map((p) => ({ years: p.years, value_eur: p.valueEur })),
    }) : undefined,

    cashflow: compact({
      month: s.cashflow.month,
      income_eur: round(s.cashflow.income, 2),
      income_source: s.cashflow.incomeSource === 'bridge' ? 'Firmen-Dashboard' : s.cashflow.incomeSource === 'manual' ? 'manuell' : 'unbekannt',
      invested_eur: round(s.cashflow.invested, 2),
      savings_rate_pct: fractionToPct(s.cashflow.savingsRate),
      distributable_eur: round(s.cashflow.distributable, 2),
      tax_reserve_pct: s.cashflow.taxReservePct != null ? round(s.cashflow.taxReservePct, 1) : undefined,
    }),

    savings_goals: goals,

    recent_activities: s.activities.slice(0, activityLimit).map((a) => compact({
      date: a.datetime?.slice(0, 10),
      type: a.type,
      name: a.name,
      shares: round(a.shares, 4),
      price_eur: round(a.price, 2),
      amount_eur: round(a.amount, 2),
      fee_eur: round(a.fee, 2),
      tax_eur: round(a.tax, 2),
      realized_gain_eur: round(a.realizedGainNet, 2),
    })),

    data_sources: {
      database: s.sources.database,
      stock_prices: s.sources.yahoo,
      metals_prices: s.sources.metals,
      crypto_prices: s.sources.coingecko,
      business_bridge: s.sources.bridge,
      prices_from_cache: s.stale,
    },

    summary: sentences(
      `Nettovermögen ${formatEur(s.netWorthEur)}, verteilt auf ${s.allocation.length} Anlageklassen (größte: ${s.allocation[0]?.label ?? '–'} mit ${de(fractionToPct(s.allocation[0]?.pct ?? 0))} %).`,
      r ? `Depot ${formatEur(r.portfolioValue)} bei ${formatEur(r.invested)} investiert, IZF ${de(r.xirr, 2)} %, TTWROR ${de(r.ttwror, 2)} %.` : '',
      s.cashflow.savingsRate != null
        ? `Sparquote im ${s.cashflow.month}: ${de(fractionToPct(s.cashflow.savingsRate))} % (${formatEur(s.cashflow.invested)} von ${formatEur(s.cashflow.income)}).`
        : '',
      s.topMovers.winners[0] ? `Bester Wert: ${s.topMovers.winners[0].name} (${formatEur(s.topMovers.winners[0].gainEur)}).` : '',
      s.topMovers.losers[0] ? `Schwächster Wert: ${s.topMovers.losers[0].name} (${formatEur(s.topMovers.losers[0].gainEur)}).` : '',
      !s.portfolioReady ? 'Achtung: In Supabase ist noch kein Portfolio angelegt.' : '',
    ),
  });
}

function shapeMover(m: { name: string; cls: string; gainEur: number; returnPct: number }) {
  return compact({
    name: m.name,
    asset_class: CLASS_LABELS[m.cls] ?? m.cls,
    gain_eur: round(m.gainEur, 2),
    return_pct: fractionToPct(m.returnPct),
  });
}

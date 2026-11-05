'use client';
import type { ReturnsSummary, CapitalFlows } from '@/lib/finance/types';
import { eur, signedEur, signedPct, gainColor } from './format';
import { Money } from './Privacy';

// Headline performance metrics calculated from the local ledger.
export function ReturnsPanel({ returns, capital }: { returns: ReturnsSummary | null; capital: CapitalFlows | null }) {
  if (!returns) {
    return <p className="text-secondary text-sm">Performance-Kennzahlen erscheinen, sobald Transaktionen erfasst sind.</p>;
  }
  const r = returns;
  return (
    <div className="space-y-1">
      <Row k="Portfoliowert" money={eur(r.portfolioValue, { decimals: true })} strong />
      <Row k="Investiert" money={eur(r.invested, { decimals: true })} />
      {capital && <Row k="Cashflow" money={signedEur(capital.net)} />}
      <Divider />
      {r.xirr != null && <Row k="Rendite p. a. (IZF)" badge={signedPct(r.xirr / 100)} badgeColor={gainColor(r.xirr)} />}
      <Divider />
      <Row k="Kursgewinne" money={signedEur(r.unrealizedNet)} color={gainColor(r.unrealizedNet)} />
      <Row k="Realisiert" money={signedEur(r.realizedNet)} color={gainColor(r.realizedNet)} />
      <Row k="Dividenden" money={signedEur(r.dividendsNet)} color={gainColor(r.dividendsNet)} />
      <Row k="Zinsen" money={signedEur(r.interest)} color={gainColor(r.interest)} />
      <Divider />
      <Row k="Steuern" money={eur(r.taxes, { decimals: true })} />
      <Row k="Gebühren" money={eur(r.fees, { decimals: true })} />
      <Divider />
      <Row k="Realisiertes Netto" money={signedEur(r.netSum)} color={gainColor(r.netSum)} />
      <Row k="Gesamtergebnis" money={signedEur(r.netSum + r.unrealizedNet)} color={gainColor(r.netSum + r.unrealizedNet)} strong />
    </div>
  );
}

function Row({ k, money, badge, badgeColor, color, strong }: {
  k: string; money?: string; badge?: string; badgeColor?: string; color?: string; strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className={`text-sm ${strong ? 'font-semibold' : 'text-secondary'}`}>{k}</span>
      {badge != null ? (
        <span className="text-sm font-semibold tabular-nums" style={{ color: badgeColor }}>{badge}</span>
      ) : (
        <Money className={`text-sm tabular-nums ${strong ? 'font-bold' : 'font-medium'}`}>
          <span style={color ? { color } : undefined}>{money}</span>
        </Money>
      )}
    </div>
  );
}

function Divider() { return <hr className="border-border my-1" />; }

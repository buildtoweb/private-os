'use client';
import type { PeriodView } from '@/lib/finance/period';
import { eur, gainColor, signedEur } from './format';
import { Money } from './Privacy';

export function PeriodSummary({ view }: { view: PeriodView }) {
  return (
    <section className="finance-panel">
      <div className="finance-panel-head"><h2>Im Zeitraum</h2></div>
      {view.available ? (
        <>
          <Money className="finance-period-result">
            <span style={{ color: gainColor(view.netGain) }}>{signedEur(view.netGain)}</span>
          </Money>
          <p className="text-muted text-xs mt-2 mb-5">Wertänderung nach Käufen, Verkäufen und Kosten</p>
          <div className="finance-period-rows">
            <Row label="Startwert" value={eur(view.openingValue, { decimals: true })} />
            <Row label="Aktueller Wert" value={eur(view.closingValue, { decimals: true })} />
            <Row label="Käufe / Einzahlungen" value={eur(view.contributions, { decimals: true })} />
            <Row label="Verkäufe / Auszahlungen" value={eur(view.withdrawals, { decimals: true })} />
            <Row label="Dividenden / Zinsen" value={eur(view.income, { decimals: true })} />
            <Row label="Gebühren / Steuern" value={eur(view.charges, { decimals: true })} />
          </div>
          {view.crossesCutover && <p className="finance-footnote">Ohne den Sprung beim Wechsel von Parqet- auf eigene Kurse.</p>}
        </>
      ) : <p className="text-secondary text-sm">Für diesen Zeitraum sind noch keine historischen Portfolio-Werte verfügbar.</p>}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><Money>{value}</Money></div>;
}

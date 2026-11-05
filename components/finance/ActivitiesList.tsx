'use client';
import type { FinanceActivity, ActivityType } from '@/lib/finance/types';
import { eur } from './format';
import { Money } from './Privacy';

const LABEL: Record<ActivityType, string> = {
  buy: 'Kauf', sell: 'Verkauf', dividend: 'Dividende', interest: 'Zinsen',
  transfer_in: 'Einbuchung', transfer_out: 'Ausbuchung', fees_taxes: 'Gebühren',
  deposit: 'Einzahlung', withdrawal: 'Auszahlung',
};
const TONE: Record<ActivityType, string> = {
  buy: 'var(--slate)', sell: 'var(--sage)', dividend: 'var(--sage)', interest: 'var(--sage)',
  transfer_in: 'var(--fg-3)', transfer_out: 'var(--fg-3)', fees_taxes: 'var(--amber)',
  deposit: 'var(--fg-3)', withdrawal: 'var(--fg-3)',
};

export function ActivitiesList({ activities, limit = 8 }: { activities: FinanceActivity[]; limit?: number }) {
  if (!activities.length) {
    return <p className="text-secondary text-sm">Noch keine Käufe, Verkäufe oder Erträge erfasst.</p>;
  }
  return (
    <ul className="finance-timeline">
      {activities.slice(0, limit).map((a) => (
        <li key={a.id}>
          <span className="finance-timeline__dot" style={{ background: TONE[a.type] }} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{a.name}</div>
            <div className="text-xs text-muted">{LABEL[a.type]} · {fmtDate(a.datetime)}</div>
          </div>
          <Money className="text-sm font-semibold tabular-nums shrink-0">{eur(a.amount, { decimals: true })}</Money>
        </li>
      ))}
    </ul>
  );
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = iso.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}` : iso;
}

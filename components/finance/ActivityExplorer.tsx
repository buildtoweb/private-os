'use client';
import { useMemo, useState } from 'react';
import type { ActivityType, FinanceActivity } from '@/lib/finance/types';
import { eur, money, signedEur } from './format';
import { Money } from './Privacy';
import { ActivitiesList } from './ActivitiesList';

const labels: Record<ActivityType, string> = {
  buy: 'Kauf', sell: 'Verkauf', dividend: 'Dividende', interest: 'Zinsen',
  transfer_in: 'Einbuchung', transfer_out: 'Ausbuchung', fees_taxes: 'Gebühren / Steuern',
  deposit: 'Einzahlung', withdrawal: 'Auszahlung',
};

export function ActivityExplorer({ activities }: { activities: FinanceActivity[] }) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ActivityType | 'all'>('all');
  const sorted = useMemo(() => [...activities].sort((a, b) => b.datetime.localeCompare(a.datetime)), [activities]);
  const filtered = useMemo(() => sorted.filter((activity) =>
    (type === 'all' || activity.type === type) &&
    `${activity.name || ''} ${activity.identifier || ''} ${labels[activity.type]}`.toLocaleLowerCase('de-AT').includes(query.toLocaleLowerCase('de-AT')),
  ), [sorted, type, query]);
  const types = [...new Set(sorted.map((activity) => activity.type))];

  return <section className="finance-panel">
    <div className="finance-panel-head">
      <h2>Buchungen</h2>
      <button type="button" className="btn-ghost text-xs" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        {expanded ? 'Weniger' : `Alle ${activities.length} ansehen`}
      </button>
    </div>
    {!expanded ? <ActivitiesList activities={sorted} limit={6} /> : <>
      <div className="finance-activity-filters">
        <input aria-label="Buchungen durchsuchen" placeholder="Name oder Kennung suchen" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Buchungstyp filtern" value={type} onChange={(event) => setType(event.target.value as ActivityType | 'all')}>
          <option value="all">Alle Typen</option>
          {types.map((entry) => <option key={entry} value={entry}>{labels[entry]}</option>)}
        </select>
      </div>
      <div className="finance-activity-list" aria-live="polite">
        {filtered.length ? filtered.map((activity) => <div className="finance-activity-row" key={activity.id}>
          <div className="min-w-0"><strong>{activity.name || labels[activity.type]}</strong><span>{labels[activity.type]} · {activity.datetime.slice(0, 10)}{activity.identifier ? ` · ${activity.identifier}` : ''}</span>
            {(activity.type === 'buy' || activity.type === 'sell') && activity.shares != null && <small>{activity.shares.toLocaleString('de-AT', { maximumFractionDigits: 8 })} Anteile{activity.currency && activity.currency !== 'EUR' && activity.priceOriginal != null ? ` × ${money(activity.priceOriginal, activity.currency)}` : activity.price != null ? ` × ${money(activity.price)}` : ''}</small>}
          </div>
          <div className="finance-activity-row__amount"><Money>{eur(activity.amount, { decimals: true })}</Money>
            {activity.realizedGainNet != null && <small>Realisiert {signedEur(activity.realizedGainNet)}</small>}
            {!!(activity.fee || activity.tax) && <small>Kosten {eur((activity.fee || 0) + (activity.tax || 0), { decimals: true })}</small>}
          </div>
        </div>) : <p className="text-secondary text-sm py-4">Keine passenden Buchungen.</p>}
      </div>
    </>}
  </section>;
}

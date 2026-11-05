// Reads the private Notion database "Abonnements" — the source of truth for
// fixed costs, mirroring how the business dashboard reads "Laufende Kosten".
//
import { notion } from '@/lib/notion';
import { CHARGES_PER_YEAR, type Interval, type SubStatus, type Subscription } from './types';

export const ABO_DB = process.env.NOTION_ABO_DB_ID || '';

const P = {
  service: 'Service',
  amount: 'Kosten',
  interval: 'Intervall',
  status: 'Status',
  category: 'Kategorie',
  renewal: 'Verlängerung',
} as const;

function readTitle(prop: any): string {
  return (prop?.title || []).map((t: any) => t.plain_text || '').join('').trim();
}

function readInterval(prop: any): Interval {
  const name = prop?.select?.name;
  return name === 'Monatlich' || name === 'Quartalsweise' || name === 'Jährlich'
    ? name
    : 'Jährlich';
}

function readStatus(prop: any): SubStatus {
  // "Status" is a status property here, but tolerate a plain select too so a
  // future schema tweak in Notion doesn't blank out every row.
  const name = prop?.status?.name ?? prop?.select?.name;
  return name === 'Inaktiv' || name === 'Probeabo' ? name : 'Aktiv';
}

export async function getSubscriptions(): Promise<Subscription[]> {
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await notion.databases.query({
      database_id: ABO_DB,
      start_cursor: cursor,
      page_size: 100,
    });
    rows.push(...(res.results || []));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return rows
    .map((row): Subscription => {
      const props = row.properties || {};
      const interval = readInterval(props[P.interval]);
      const amount = Number(props[P.amount]?.number) || 0;
      return {
        id: row.id,
        service: readTitle(props[P.service]) || 'Unbenannt',
        amount,
        interval,
        status: readStatus(props[P.status]),
        category: props[P.category]?.select?.name || 'Sonstiges',
        anchor: props[P.renewal]?.date?.start?.slice(0, 10) || null,
        yearlyEur: amount * CHARGES_PER_YEAR[interval],
      };
    })
    .filter((s) => s.service !== 'Unbenannt' || s.amount > 0);
}

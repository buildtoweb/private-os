'use client';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FinanceActivity, ValuePoint } from '@/lib/finance/types';
import { signedPct } from './format';

function externalFlow(activities: FinanceActivity[], from: string, to: string) {
  return activities.reduce((sum, item) => {
    const date = item.datetime.slice(0, 10);
    if (date <= from || date > to) return sum;
    if (item.type === 'deposit' || item.type === 'transfer_in') return sum + Math.abs(item.amount);
    if (item.type === 'withdrawal' || item.type === 'transfer_out') return sum - Math.abs(item.amount);
    return sum;
  }, 0);
}

// The imported history and the ledger's own valuation use different price
// sources, so the one step across `cutoverDate` is treated as flat instead of
// as a gain or loss. Everything either side of it is compared normally.
export function PerformanceAnalysis({ series, activities, cutoverDate }: {
  series: ValuePoint[]; activities: FinanceActivity[]; cutoverDate?: string | null;
}) {
  const analytics = useMemo(() => {
    const points = [...series].filter((point) => Number.isFinite(point.value) && point.value > 0);
    const crosses = (from: ValuePoint, to: ValuePoint) => !!cutoverDate && from.date < cutoverDate && to.date >= cutoverDate;
    const step = (from: ValuePoint, to: ValuePoint) => crosses(from, to)
      ? 0 : (to.value - from.value - externalFlow(activities, from.date, to.date)) / from.value;
    let index = 100;
    let peak = 100;
    const drawdown = points.map((point, position) => {
      const previous = points[position - 1];
      if (previous?.value) index *= 1 + step(previous, point);
      peak = Math.max(peak, index);
      return { date: point.date, value: peak > 0 ? (index / peak - 1) * 100 : 0 };
    });
    const monthly = new Map<string, { first: ValuePoint; last: ValuePoint; previous?: ValuePoint }>();
    points.forEach((point, position) => {
      const key = point.date.slice(0, 7);
      const existing = monthly.get(key);
      if (existing) existing.last = point;
      else monthly.set(key, { first: point, last: point, previous: points[position - 1] });
    });
    // Chain the daily steps so a month containing the cutover stays meaningful.
    const months = [...monthly].map(([month, bucket]) => {
      const inMonth = points.filter((point) => point.date.slice(0, 7) === month);
      const chain = bucket.previous ? [bucket.previous, ...inMonth] : inMonth;
      if (chain.length < 2) return { month, result: null };
      let growth = 1;
      for (let i = 1; i < chain.length; i++) growth *= 1 + step(chain[i - 1], chain[i]);
      return { month, result: growth - 1 };
    });
    return { drawdown, months, worst: drawdown.length ? Math.min(...drawdown.map((point) => point.value)) : null };
  }, [series, activities, cutoverDate]);

  return <section className="finance-panel finance-analysis">
    <div className="finance-panel-head"><h2>Monatsrenditen</h2></div>
    {analytics.months.length ? <div className="finance-heatmap" role="list" aria-label="Monatsrenditen">
      {analytics.months.map(({ month, result }) => <div key={month} role="listitem" className="finance-heatmap__cell" style={{ background: result == null ? undefined : result >= 0 ? `rgba(123,168,136,${Math.min(.45, .1 + Math.abs(result) * 1.2)})` : `rgba(201,123,90,${Math.min(.45, .1 + Math.abs(result) * 1.2)})` }}>
        <span>{monthLabel(month)}</span><strong>{result == null ? '—' : signedPct(result)}</strong>
      </div>)}
    </div> : <p className="text-secondary text-sm">Noch keine vergleichbaren Monatswerte.</p>}
    <p className="finance-footnote">Wertänderung je Monat ohne Ein- und Auszahlungen.</p>
    <div className="finance-analysis__drawdown-head"><span>Größter Rückgang</span><strong>{analytics.worst == null ? '—' : signedPct(analytics.worst / 100)}</strong></div>
    {analytics.drawdown.length > 1 && <div className="finance-analysis__chart"><ResponsiveContainer width="100%" height="100%">
      <LineChart data={analytics.drawdown} margin={{ top: 5, right: 6, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,.06)" />
        <XAxis dataKey="date" minTickGap={50} tickFormatter={(date) => String(date).slice(2, 7)} tick={{ fill: 'rgba(255,255,255,.42)', fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis width={38} tickFormatter={(value) => `${Number(value).toFixed(0)}%`} tick={{ fill: 'rgba(255,255,255,.42)', fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#2a272b', border: 0, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.4)', fontSize: 12 }} formatter={(value: number) => [`${value.toFixed(1)}%`, 'Rückgang']} />
        <Line dataKey="value" type="monotone" stroke="#c97b5a" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer></div>}
  </section>;
}

function monthLabel(month: string) {
  return new Intl.DateTimeFormat('de-AT', { month: 'short', year: '2-digit' }).format(new Date(`${month}-15T12:00:00Z`));
}

'use client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { ValuePoint } from '@/lib/finance/types';
import { eur, eurCompact } from './format';
import { usePrivacy } from './Privacy';

// Portfolio value over time vs. invested capital from our own stored snapshots.
// chart. Glowing brand area. Y-axis amounts hide under privacy mode.
export function ValueChart({ series, cutoverDate, hideInvested = false }: { series: ValuePoint[]; cutoverDate?: string | null; hideInvested?: boolean }) {
  const { hidden } = usePrivacy();
  const hasInvested = !hideInvested && series.some((p) => p.invested != null);
  const data = cutoverDate
    ? series.map((point) => ({
        ...point,
        valueBefore: point.date < cutoverDate ? point.value : null,
        valueAfter: point.date >= cutoverDate ? point.value : null,
        investedBefore: point.date < cutoverDate ? point.invested : null,
        investedAfter: point.date >= cutoverDate ? point.invested : null,
      }))
    : series;

  if (!series.length) {
    return (
      <div className="grid h-full min-h-56 place-items-center text-center">
        <p className="text-secondary text-sm max-w-xs">
          Wertverlauf erscheint, sobald Portfolio-Snapshots gespeichert wurden.
        </p>
      </div>
    );
  }

  // Fills whatever height the parent gives it, so the card can stretch to its
  // neighbour instead of leaving a gap under the curve.
  return (
    <div className="h-full">
      <div className="h-[calc(100%-22px)]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7ba888" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#7ba888" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="date" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickFormatter={(d) => String(d).slice(0, 7)} minTickGap={40} axisLine={false} tickLine={false}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            tickFormatter={(v) => (hidden ? '•••' : eurCompact(v))} width={48} axisLine={false} tickLine={false}
            domain={[(min: number) => Math.max(0, Math.floor(min * 0.95 / 1000) * 1000), (max: number) => Math.ceil(max * 1.05 / 1000) * 1000]}
            tickCount={4}
          />
          <Tooltip
            contentStyle={{ background: '#1c1719', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, fontSize: 12 }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            formatter={(v: number, name) => [hidden ? '•••' : eur(v, { decimals: true }), String(name).startsWith('value') ? 'Portfoliowert' : 'Investiert']}
          />
          {hasInvested && <Area type="monotone" dataKey={cutoverDate ? 'investedBefore' : 'invested'} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />}
          {hasInvested && cutoverDate && <Area type="monotone" dataKey="investedAfter" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />}
          <Area type="monotone" dataKey={cutoverDate ? 'valueBefore' : 'value'} stroke="#9dc4a8" strokeWidth={2} fill="url(#valueFill)" />
          {cutoverDate && <Area type="monotone" dataKey="valueAfter" stroke="#9dc4a8" strokeWidth={2} fill="none" />}
        </AreaChart>
      </ResponsiveContainer>
      </div>
      <div className="finance-chart-legend">
        {hasInvested && <span><i className="finance-chart-legend__invested" /> Investiert</span>}
        <span><i className="finance-chart-legend__value" /> Portfoliowert</span>
      </div>
    </div>
  );
}

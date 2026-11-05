'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

export const HRV_COLOR = '#9dc4a8'; // teal — "calm" / parasympathisch
export const RHF_COLOR = '#c97b5a'; // clay — distinct from HRV
export const REC_COLOR = 'rgba(255,255,255,0.35)';
export const GOOD_COLOR = '#9dc4a8'; // improved / in target
export const BAD_COLOR = '#dda893';  // worsened / out of target

const tickStyle = { fill: '#888', fontSize: 11 };
const grid = '#2a272b';
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monthLabel = (m: string) => { const p = m.split('-'); return `${MONTHS[Number(p[1]) - 1] ?? m} ${p[0]?.slice(2) ?? ''}`; };

const tooltipStyle = {
  contentStyle: { background: '#111', border: '1px solid #2a272b', borderRadius: 12, color: '#f5f2f0', fontSize: 12 },
  labelStyle: { color: '#888' },
};

type MonthPoint = { month: string; hrv: number | null; rhf: number | null; rec: number | null };

// Monthly HRV (teal) vs Ruhepuls (pink) on a shared left axis, Recovery (muted)
// on the right axis — the "big line" of the report.
export function MonthlyTrendChart({ data }: { data: MonthPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={tickStyle} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis yAxisId="l" domain={[30, 85]} tick={tickStyle} axisLine={false} tickLine={false} width={34} />
          <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={tickStyle} axisLine={false} tickLine={false} width={30} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(m: any) => monthLabel(String(m))}
            formatter={(v: any, name: any) => [name === 'Recovery' ? `${v}%` : name === 'Ruhepuls' ? `${v} bpm` : `${v} ms`, name]}
          />
          <Line yAxisId="r" type="monotone" dataKey="rec" name="Recovery" stroke={REC_COLOR} strokeWidth={1.4} dot={false} />
          <Line yAxisId="l" type="monotone" dataKey="rhf" name="Ruhepuls" stroke={RHF_COLOR} strokeWidth={2.4} dot={{ r: 2.4, fill: RHF_COLOR }} />
          <Line yAxisId="l" type="monotone" dataKey="hrv" name="HRV" stroke={HRV_COLOR} strokeWidth={2.4} dot={{ r: 2.4, fill: HRV_COLOR }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// A single blood marker over time (2–4 points across years), with a dashed
// target line. Line colour encodes whether the change is healthy.
type TrendPoint = { date: string; value: number; inRange: boolean };
export function MarkerTrendChart({
  points, unit, target, color,
}: { points: TrendPoint[]; unit: string; target?: number; color: string }) {
  const data = points.map((p) => ({ ...p, year: p.date.slice(0, 4) }));
  const vals = points.map((p) => p.value).concat(target != null ? [target] : []);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.2 || Math.max(1, hi * 0.1);
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="year" tick={tickStyle} axisLine={false} tickLine={false} />
          <YAxis domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]} tick={tickStyle} axisLine={false} tickLine={false} width={34} />
          <Tooltip {...tooltipStyle} formatter={(v: any) => [`${v} ${unit}`, 'Wert']} />
          {target != null && (
            <ReferenceLine y={target} stroke="rgba(255,255,255,0.35)" strokeDasharray="4 4"
              label={{ value: `Ziel ${target}`, position: 'insideTopRight', fill: '#888', fontSize: 10 }} />
          )}
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.4} dot={{ r: 3, fill: color }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

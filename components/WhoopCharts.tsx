'use client';
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

type Day = {
  date: string;
  recovery?: number; hrv?: number; rhr?: number; strain?: number;
  sleepHours?: number; sleepPerformance?: number;
  sleepStages?: { light: number; deep: number; rem: number; awake: number };
  spo2?: number; respiratoryRate?: number; skinTempC?: number; steps?: number;
};
type Metric = 'recovery' | 'hrv' | 'strain' | 'sleepHours' | 'spo2' | 'respiratoryRate' | 'skinTempC' | 'steps';
type Props = { data: Day[]; days?: number };
const color = { recovery: '#9dc4a8', strain: '#c97b5a', sleepHours: '#9aacc4', hrv: '#b2a9c0', spo2: '#9aacc4', respiratoryRate: '#b2a9c0', skinTempC: '#c97b5a', steps: '#9dc4a8' };
const tick = { fill: '#aaa3a9', fontSize: 11 };
const tooltip = { contentStyle: { background: '#211f22', border: '1px solid #494449', borderRadius: 12, color: '#f5f2f0', fontSize: 12 }, labelStyle: { color: '#ccc' } };
const dayMs = 86400000;
const n = (value: number, decimals = 0) => value.toLocaleString('de-DE', { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function ordered(data: Day[]) { return [...data].sort((a, b) => a.date.localeCompare(b.date)); }
function visible(data: Day[], days: number) {
  const sorted = ordered(data);
  if (!sorted.length) return [];
  const from = Date.parse(`${sorted.at(-1)!.date}T00:00:00Z`) - (days - 1) * dayMs;
  return sorted.filter(d => Date.parse(`${d.date}T00:00:00Z`) >= from);
}
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function comparison(data: Day[], key: Metric) {
  const rows = ordered(data);
  if (!rows.length) return null;
  const end = Date.parse(`${rows.at(-1)!.date}T00:00:00Z`);
  const current: number[] = [], previous: number[] = [];
  for (const row of rows) {
    const age = Math.round((end - Date.parse(`${row.date}T00:00:00Z`)) / dayMs);
    const value = row[key];
    if (!valid(value)) continue;
    if (age >= 0 && age < 7) current.push(value);
    else if (age >= 7 && age < 14) previous.push(value);
  }
  return { current: average(current), previous: average(previous), currentCount: current.length, previousCount: previous.length };
}
function direction(data: Day[], key: Metric, unit: string, decimals = 0) {
  const c = comparison(data, key);
  if (!c || c.currentCount < 4) return 'Für die letzte Woche liegen noch zu wenige Messungen vor.';
  if (c.previousCount < 4 || c.current == null || c.previous == null) return `Letzte 7 Tage: Ø ${n(c.current!, decimals)}${unit}. Für einen Vergleich fehlen ältere Messungen.`;
  const delta = c.current - c.previous;
  const threshold = key === 'strain' || key === 'sleepHours' ? 0.3 : key === 'skinTempC' ? 0.15 : key === 'spo2' ? 0.2 : key === 'steps' ? 300 : 1;
  const deltaUnit = key === 'recovery' || key === 'spo2' ? ' Punkte' : unit;
  return `Letzte 7 Tage Ø ${n(c.current, decimals)}${unit} · ${Math.abs(delta) < threshold ? 'nahe der Vorwoche' : `${delta > 0 ? '+' : '−'}${n(Math.abs(delta), decimals)}${deltaUnit} zur Vorwoche`} (${c.currentCount}/7 Tage).`;
}
function series(data: Day[], days: number, key: Metric) {
  const rows = visible(data, days);
  return rows.map((row, i) => {
    const date = Date.parse(`${row.date}T00:00:00Z`);
    const window = rows.slice(Math.max(0, i - 6), i + 1)
      .filter(d => Math.round((date - Date.parse(`${d.date}T00:00:00Z`)) / dayMs) < 7)
      .map(d => d[key]).filter(valid);
    return { ...row, smooth: window.length >= 3 ? average(window) : null };
  });
}
function Card({ title, metricColor, summary, detail, children }: { title: string; metricColor: string; summary: string; detail?: string; children: React.ReactNode }) {
  return <section className="card min-w-0">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{title}</h3><span className="h-2 w-2 rounded-full shrink-0" style={{ background: metricColor }} /></div>
    <div className="h-48 min-w-0 mt-4">{children}</div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-secondary mt-2"><span><i className="inline-block w-3 h-0.5 align-middle mr-1" style={{ background: metricColor }} />7-Tage-Mittel</span><span><i className="inline-block w-3 h-0.5 align-middle mr-1 bg-white/30" />Tageswert</span></div>
    <div className="border-t border-border mt-3 pt-3"><p className="text-sm font-semibold leading-snug">{summary}</p>{detail && <p className="text-xs text-secondary mt-1 leading-relaxed">{detail}</p>}</div>
  </section>;
}
function MetricChart({ data, days = 30, metric, title, unit, decimals = 0, domain, target, detail, bars = false, summary }: Props & { metric: Metric; title: string; unit: string; decimals?: number; domain?: [number | string, number | string]; target?: number; detail?: string; bars?: boolean; summary?: string }) {
  const rows = series(data, days, metric);
  const hasValues = rows.some(row => valid(row[metric]));
  return <Card title={title} metricColor={color[metric]} summary={hasValues ? summary ?? direction(data, metric, unit, decimals) : 'Für diesen Zeitraum liegen keine Messungen vor.'} detail={hasValues ? detail : undefined}>
    {hasValues ? <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#393439" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(s: string) => s.slice(5)} tick={tick} axisLine={false} tickLine={false} minTickGap={28} />
        <YAxis domain={domain ?? ['auto', 'auto']} tick={tick} axisLine={false} tickLine={false} width={metric === 'steps' ? 48 : 36} tickFormatter={(v: number) => n(v)} />
        {target != null && <ReferenceLine y={target} stroke="#c3b287" strokeDasharray="4 4" />}
        <Tooltip {...tooltip} labelFormatter={(label: unknown) => String(label)} formatter={(value: number, name: string) => [`${n(value, decimals)}${unit}`, name === 'smooth' ? '7-Tage-Mittel' : 'Tageswert']} />
        {bars ? <Bar dataKey={metric} fill={color[metric]} fillOpacity={0.35} maxBarSize={20} /> : <Line type="linear" dataKey={metric} stroke={color[metric]} strokeOpacity={0.35} strokeWidth={1.5} dot={false} connectNulls={false} />}
        <Line type="monotone" dataKey="smooth" stroke={color[metric]} strokeWidth={3} dot={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer> : <div className="h-full grid place-items-center text-sm text-secondary">Keine Daten</div>}
  </Card>;
}
export function TrendsOverview({ data }: { data: Day[] }) {
  const recent = visible(data, 7);
  const measured = recent.filter(d => valid(d.recovery));
  if (!recent.length) return <div className="card text-sm text-secondary">Noch keine WHOOP-Daten für eine Wochenauswertung.</div>;
  const lastDate = recent.map(d => d.date).sort().at(-1)!;
  const low = measured.filter(d => d.recovery! < 34).length;
  const highAfterLow = measured.filter(d => d.recovery! < 34 && valid(d.strain) && d.strain! >= 14).length;
  const sleep = recent.filter(d => valid(d.sleepHours));
  const short = sleep.filter(d => d.sleepHours! < 7).length;
  const recovery = comparison(data, 'recovery');
  const messages: string[] = [];
  if (!measured.length && !sleep.length) messages.push('Für diese Woche liegen noch zu wenige Erholungs- und Schlafwerte für eine Einordnung vor.');
  if (highAfterLow) messages.push(`${highAfterLow} ${highAfterLow === 1 ? 'Tag' : 'Tage'} mit hoher Belastung trotz roter Recovery. Prüfe, ob du danach ausreichend Erholung hattest.`);
  if (short >= 3) messages.push(`${short} von ${sleep.length} Nächten unter 7 Stunden. Prüfe, ob sich das in deiner Recovery zeigt.`);
  if (recovery && recovery.currentCount >= 4 && recovery.previousCount >= 4 && recovery.current != null && recovery.previous != null && recovery.current - recovery.previous <= -10) messages.push(`Recovery im Wochenschnitt ${n(recovery.previous - recovery.current)} Punkte unter der Vorwoche. Schau auf Schlaf und Belastung zusammen.`);
  if (!messages.length) messages.push(low >= 3 ? `${low} Tage mit roter Recovery in der erfassten Woche. Plane Belastung an grünen Tagen und beobachte die Erholung.` : 'Keine deutliche Auffälligkeit in den verfügbaren Wochendaten. Die Karten zeigen, welche Werte sich zur Vorwoche verändert haben.');
  return <div className="card border-l-2 border-l-[var(--sage)]"><div className="label mb-2">Letzte erfasste Woche · bis {lastDate}</div><ul className="space-y-1.5 text-sm leading-relaxed">{messages.map(m => <li key={m}>{m}</li>)}</ul><p className="text-xs text-secondary mt-3">Beobachtung aus WHOOP-Daten · keine medizinische Diagnose</p></div>;
}
export function RecoveryChart(props: Props) { return <MetricChart {...props} metric="recovery" title="Erholung" unit=" %" domain={[0, 100]} target={67} detail="Gestrichelte Linie: grüne WHOOP-Zone ab 67 %. Vergleiche besonders die Erholung nach belastenden Tagen." />; }
export function StrainChart(props: Props) { return <MetricChart {...props} metric="strain" title="Belastung" unit="" decimals={1} domain={[0, 21]} bars detail="WHOOP-Skala 0–21. Hohe Belastung ist vor allem zusammen mit niedriger Recovery relevant." />; }
export function SleepChart(props: Props) { return <MetricChart {...props} metric="sleepHours" title="Schlafdauer" unit=" h" decimals={1} domain={[0, 12]} target={7} detail="Gestrichelte Linie: 7 Stunden. Vergleiche kurze Nächte mit der Recovery am Folgetag." />; }
export function HrvChart(props: Props) { return <MetricChart {...props} metric="hrv" title="HRV" unit=" ms" detail="Die eigene Veränderung zählt mehr als der Vergleich mit anderen. Einzelne Ausschläge sind wenig aussagekräftig." />; }
export function StepsChart(props: Props) { return <MetricChart {...props} metric="steps" title="Schritte" unit=" Schritte" domain={[0, 'auto']} bars detail="WHOOP zählt je Zyklus von Aufwachen zu Aufwachen, der laufende Tag ist noch nicht vollständig. Andere Apps können deshalb abweichen." />; }
export function SleepStagesChart({ data, days = 30 }: Props) {
  const rows = visible(data, days).filter(d => d.sleepStages).map(d => ({ date: d.date, ...d.sleepStages }));
  const recent = visible(data, 7).filter(d => d.sleepStages);
  const deep = average(recent.map(d => d.sleepStages!.deep).filter(valid));
  const rem = average(recent.map(d => d.sleepStages!.rem).filter(valid));
  return <section className="card min-w-0"><h3 className="text-sm font-semibold">Schlafphasen</h3>
    {rows.length ? <><div className="h-48 min-w-0 mt-4"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}><CartesianGrid stroke="#393439" vertical={false} /><XAxis dataKey="date" tickFormatter={(s: string) => s.slice(5)} tick={tick} axisLine={false} tickLine={false} minTickGap={28} /><YAxis tick={tick} axisLine={false} tickLine={false} width={36} /><Tooltip {...tooltip} formatter={(v: number, name: string) => [`${n(v)} min`, name]} /><Bar dataKey="deep" name="Tief" stackId="s" fill="#6b879c" /><Bar dataKey="rem" name="REM" stackId="s" fill="#a398b1" /><Bar dataKey="light" name="Leicht" stackId="s" fill="#bdc9d0" /><Bar dataKey="awake" name="Wach" stackId="s" fill="#706b70" /></ComposedChart></ResponsiveContainer></div>
    <div className="flex flex-wrap gap-3 text-[11px] text-secondary mt-2"><span>■ Tief</span><span>■ REM</span><span>■ Leicht</span><span>■ Wach</span></div><div className="border-t border-border mt-3 pt-3"><p className="text-sm font-semibold">Letzte 7 Tage: Ø {deep == null ? '–' : n(deep)} Min. Tiefschlaf · Ø {rem == null ? '–' : n(rem)} Min. REM</p><p className="text-xs text-secondary mt-1">Einzelne Schlafphasen schwanken stark. Beobachte den Wochenschnitt.</p></div></> : <p className="text-sm text-secondary mt-4">Für diesen Zeitraum liegen keine Schlafphasen vor.</p>}
  </section>;
}
export function VitalMetricCharts({ data, days = 30 }: Props) {
  const skin = comparison(data, 'skinTempC');
  const baseline = skin?.previous ?? null;
  return <>
    <MetricChart data={data} days={days} metric="respiratoryRate" title="Atemrate" unit="/min" decimals={1} detail="Veränderungen gegenüber deiner eigenen Basis sind hier aussagekräftiger als einzelne Nächte." />
    <MetricChart data={data} days={days} metric="spo2" title="Sauerstoffsättigung" unit=" %" decimals={1} domain={[90, 100]} detail="Einzelne niedrige Messungen können Messfehler sein. Achte auf wiederholte Abweichungen." />
    <MetricChart data={data} days={days} metric="skinTempC" title="Hauttemperatur" unit=" °C" decimals={1} target={baseline ?? undefined} detail={baseline == null ? 'Für eine persönliche Basis fehlen Werte der Vorwoche.' : `Gestrichelte Linie: Vorwochenschnitt ${n(baseline, 1)} °C.`} />
  </>;
}

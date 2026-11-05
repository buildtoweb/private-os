'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useCachedFetch } from '@/lib/fetchCache';
import { HRV_COLOR, RHF_COLOR, GOOD_COLOR, BAD_COLOR } from './ReportCharts';

const MonthlyTrendChart = dynamic(() => import('./ReportCharts').then(m => m.MonthlyTrendChart), {
  ssr: false, loading: () => <div className="h-64 animate-pulse rounded-card bg-white/[0.03]" />,
});
const MarkerTrendChart = dynamic(() => import('./ReportCharts').then(m => m.MarkerTrendChart), {
  ssr: false, loading: () => <div className="h-40 animate-pulse rounded-card bg-white/[0.03]" />,
});

// ── types (mirror lib/health/analysis + store) ──────────────────────
type Behavior = { key: string; label: string; n: number; dhrv: number; drec: number };
type Report = {
  summary: { hrv: number; rhf: number; rec: number; days: number; hrvMin: number; hrvMax: number; rhfMin: number; rhfMax: number; greenPct: number; sleepH: number; sleepEff: number };
  daily: { d: string; hrv: number | null; rhf: number | null; rec: number | null }[];
  monthly: { month: string; hrv: number; rhf: number; rec: number; strain: number }[];
  sleep: { light: number; deep: number; rem: number; awake: number; perf: number; eff: number; durH: number; consistency: number; rr: number };
  workouts: { name: string; label: string; count: number }[];
  workoutSummary: { total: number; perWeek: number };
  behavior: Behavior[];
  zones: { green: number; yellow: number; red: number };
  weekend: { weekdayRec: number; weekendRec: number; weekdayRhr: number; weekendRhr: number };
  dateRange: { from: string; to: string };
};
type Flag = 'ok' | 'low' | 'high' | 'watch';
type Marker = { group: string; name: string; value: number | string; unit?: string; refLow?: number; refHigh?: number; refText?: string; flag?: Flag; key?: string };
type BloodPanel = { date: string; dateApprox?: boolean; lab: string; label?: string; shortLabel?: string; kind?: 'blood' | 'allergy'; note?: string; markers: Marker[] };
type TrendPoint = { date: string; value: number; inRange: boolean };
type Trend = { key: string; label: string; unit: string; goal: 'high' | 'low' | 'range'; target?: number; points: TrendPoint[]; direction: 'improved' | 'worsened' | 'stable'; first: number; last: number; changePct: number };
type FlaggedMarker = Marker & { panelDate: string; source?: string; prev?: { date: string; value: number }; delta?: number; movingToTarget?: boolean };
type BloodInsights = { latestDate: string | null; latestLabel: string | null; flagged: FlaggedMarker[]; improved: FlaggedMarker[]; trends: Trend[]; allergyNote: string | null; counts: { total: number; abnormal: number } };
type TrendMonth = { month: string; hrv: number | null; rhf: number | null; rec: number | null; days: number };
type Payload = { ok: boolean; report: Report; blood: BloodPanel[]; bloodInsights: BloodInsights; narrative: any; trend: { monthly: TrendMonth[]; through: string; liveDays: number } };
type TrendRange = 3 | 6 | 12 | 'all';

// ── helpers ─────────────────────────────────────────────────────────
const de = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n: number, d = 1) => (n > 0 ? '+' : '') + de(n, d);
const fmtDate = (s: string) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
function trendForRange(monthly: TrendMonth[], range: TrendRange) {
  if (range === 'all' || !monthly.length) return monthly;
  const [year, month] = monthly.at(-1)!.month.split('-').map(Number);
  const from = new Date(Date.UTC(year, month - range, 1)).toISOString().slice(0, 7);
  return monthly.filter(point => point.month >= from);
}

// Narrative tones → Tactile notice variants (sage / amber / clay).
const TONE_NOTICE: Record<string, string> = { calm: 'notice--ok', amber: 'notice--warn', pulse: 'notice--error' };

// ── small building blocks ───────────────────────────────────────────
function SectionHead({ n, title }: { n: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border pb-3 mb-5">
      <span className="mono text-sm font-semibold" style={{ color: RHF_COLOR }}>{n}</span>
      <h3 className="text-lg md:text-xl font-semibold tracking-[-0.01em]">{title}</h3>
    </div>
  );
}

function Callout({ tone = 'calm', title, children }: { tone?: string; title: string; children: React.ReactNode }) {
  return (
    <div className={`notice ${TONE_NOTICE[tone] ?? 'notice--ok'} mt-4`}>
      <div className="font-semibold text-sm mb-1">{title}</div>
      <p className="text-secondary text-sm leading-relaxed">{children}</p>
    </div>
  );
}

function Readout({ label, value, unit, sub, color }: { label: string; value: string; unit?: string; sub?: string; color?: string }) {
  return (
    <div className="card-pad-sm">
      <div className="label">{label}</div>
      <div className="text-3xl md:text-4xl font-semibold mt-2 tracking-[-0.02em]" style={{ color: color ?? 'var(--fg)' }}>
        {value}{unit && <span className="text-base font-medium text-secondary ml-1">{unit}</span>}
      </div>
      {sub && <div className="mono text-xs text-secondary mt-1">{sub}</div>}
    </div>
  );
}

// Faint HRV sparkline (the report's "ECG" hero line).
function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const W = 1000, H = 48, min = Math.min(...series), max = Math.max(...series), span = max - min || 1;
  const d = series.map((v, i) => `${i ? 'L' : 'M'}${((i / (series.length - 1)) * W).toFixed(1)} ${(H - ((v - min) / span) * H * 0.8 - H * 0.1).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-10 mt-4" aria-hidden>
      <path d={d} fill="none" stroke={RHF_COLOR} strokeWidth={1.2} opacity={0.7} />
    </svg>
  );
}

const FLAG: Record<string, { cls: string; text: string }> = {
  ok: { cls: 'badge-success', text: 'Normal' },
  watch: { cls: 'badge-warning', text: 'Beobachten' },
  low: { cls: 'badge-warning', text: 'Zu niedrig' },
  high: { cls: 'badge-error', text: 'Erhöht' },
};

// ── main ────────────────────────────────────────────────────────────
export function Koerperbefund() {
  const { data, loading, error } = useCachedFetch<Payload>('/api/health/report', 10 * 60_000);
  const [trendRange, setTrendRange] = useState<TrendRange>(12);

  if (loading) return <div className="grid gap-5">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="card h-48 animate-pulse" />)}</div>;
  // Missing tables (pre-import) surface as a "table not found" error — show the
  // friendly import instructions rather than the raw Postgres message.
  const notImported = !!error && /table|schema cache|does not exist/i.test(error.message);
  if (notImported) return <EmptyState empty />;
  if (error || !data?.ok) return <EmptyState message={error?.message} />;
  if (!data.report.summary.days) return <EmptyState empty />;

  const { report: r, blood, bloodInsights: bi, narrative: nar } = data;
  const s = r.summary;
  const sleepTotal = r.sleep.light + r.sleep.deep + r.sleep.rem;
  const hrvSeries = r.daily.map(d => d.hrv).filter((x): x is number => x != null);
  const bloodCount = blood.filter(p => p.kind !== 'allergy').length;
  const maxWorkout = Math.max(1, ...r.workouts.map(w => w.count));
  const maxAbsBehav = Math.max(1, ...r.behavior.map(b => Math.abs(b.dhrv)));
  const trendMonths = trendForRange(data.trend?.monthly ?? r.monthly.map(m => ({ ...m, days: 0 })), trendRange);
  const liveThrough = data.trend?.through ?? r.dateRange.to;

  return (
    <div className="max-w-4xl w-full min-w-0 overflow-x-clip text-primary">
      {/* Hero */}
      <div className="border-b-2 border-white/15 pb-5">
        <div className="label flex flex-wrap justify-between gap-2">
          <span>Persönlicher Körperbefund</span>
          <span>{fmtDate(r.dateRange.from)} – {fmtDate(r.dateRange.to)}</span>
        </div>
        <h2 className="text-3xl md:text-5xl font-bold tracking-[-0.02em] mt-4">Dein Körper, <span className="text-secondary font-normal">in Daten.</span></h2>
        <p className="text-secondary text-sm md:text-base mt-3 max-w-[60ch]">
          {s.days} Tage WHOOP-Biometrie aus dem Export, {r.workoutSummary.total} Workouts und {bloodCount} {bloodCount === 1 ? 'Blutbefund' : 'Blutbefunde'} — ausgewertet bis zum Exportdatum. Der Herztrend wird mit laufenden WHOOP-Daten ergänzt.
        </p>
        <Sparkline series={hrvSeries} />
      </div>

      <div className="card mt-5 text-sm leading-relaxed">
        <div className="label mb-2">Datenstand</div>
        <p>WHOOP-Export und Befundtext: bis {fmtDate(r.dateRange.to)} · Verlauf mit Live-Sync: bis {fmtDate(liveThrough)}.</p>
        <p className="text-secondary mt-1">Blutwerte: bis {fmtDate(blood[0]?.date ?? '')}. Neue Blutbefunde und WHOOP-Journal-Einträge erscheinen nach einem erneuten Import; der gespeicherte Befundtext aktualisiert sich dabei nicht von selbst.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <Readout label="HRV · Ø" value={de(s.hrv)} unit="ms" sub={`Spanne ${s.hrvMin}–${s.hrvMax}`} color={HRV_COLOR} />
        <Readout label="Ruhepuls · Ø" value={de(s.rhf)} unit="bpm" sub={`Spanne ${s.rhfMin}–${s.rhfMax}`} />
        <Readout label="Recovery · Ø" value={de(s.rec)} unit="%" sub={`${s.greenPct}% grüne Tage`} />
        <Readout label="Schlaf · Ø" value={de(s.sleepH, 1)} unit="h" sub={`${s.sleepEff}% Effizienz`} />
      </div>

      {/* 01 — Trend */}
      <section className="mt-12">
        <SectionHead n="01" title="Die große Linie: HRV & Ruhepuls" />
        {nar?.trend?.lead && <p className="text-primary text-sm md:text-base leading-relaxed mb-4 max-w-[66ch]">{nar.trend.lead}</p>}
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div><div className="label">Monatsdurchschnitt · HRV, Ruhepuls und Recovery</div><p className="text-xs text-secondary mt-1">Export + laufende WHOOP-Daten bis {fmtDate(liveThrough)}</p></div>
            <div className="seg" role="group" aria-label="Zeitraum des Körperbefund-Trends">
              {([{ value: 3, label: 'Quartal' }, { value: 6, label: 'Halbjahr' }, { value: 12, label: 'Jahr' }, { value: 'all', label: 'Alles' }] as const).map(option =>
                <button key={option.value} type="button" className={trendRange === option.value ? 'on' : ''} aria-pressed={trendRange === option.value} onClick={() => setTrendRange(option.value)}>{option.label}</button>
              )}
            </div>
          </div>
          {trendMonths.length ? <MonthlyTrendChart data={trendMonths} /> : <div className="h-64 grid place-items-center text-sm text-secondary">Keine Werte in diesem Zeitraum.</div>}
          <div className="flex flex-wrap gap-4 mono text-xs text-secondary mt-3">
            <Legend color={HRV_COLOR} label="HRV (ms)" />
            <Legend color={RHF_COLOR} label="Ruhepuls (bpm)" />
            <Legend color="rgba(255,255,255,0.35)" label="Recovery (%)" />
          </div>
        </div>
        {nar?.trend?.callout && <Callout tone={nar.trend.callout.tone} title={nar.trend.callout.title}>{nar.trend.callout.body}</Callout>}
      </section>

      {/* 02 — Drivers */}
      {r.behavior.length > 0 && (
        <section className="mt-12">
          <SectionHead n="02" title="Was deine Werte wirklich bewegt" />
          {nar?.drivers?.lead && <p className="text-primary text-sm md:text-base leading-relaxed mb-4 max-w-[66ch]">{nar.drivers.lead}</p>}
          <div className="card">
            <div className="label mb-4">Veränderung des HRV (ms) an „Ja"-Tagen ggü. „Nein"-Tagen</div>
            <div className="flex flex-col gap-2.5">
              {r.behavior.map(b => {
                const neg = b.dhrv < 0;
                const w = (Math.abs(b.dhrv) / maxAbsBehav) * 50;
                return (
                  <div key={b.key} className="grid items-center gap-2.5 text-sm" style={{ gridTemplateColumns: '120px 1fr 48px' }}>
                    <span className="text-right text-secondary truncate">{b.label}</span>
                    <div className="relative h-5 rounded-full" style={{ background: 'var(--bg-2)', boxShadow: 'var(--well)' }}>
                      <span className="absolute top-0 bottom-0 w-px left-1/2" style={{ background: 'var(--hairline)' }} />
                      <span className="absolute top-0.5 bottom-0.5 rounded-full" style={{ background: neg ? 'var(--error)' : 'var(--success)', [neg ? 'right' : 'left']: '50%', width: `${w}%` }} />
                    </div>
                    <span className="mono text-xs" style={{ color: neg ? BAD_COLOR : GOOD_COLOR }}>{signed(b.dhrv)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {nar?.drivers?.callouts?.map((c: any, i: number) => <Callout key={i} tone={c.tone} title={c.title}>{c.body}</Callout>)}
        </section>
      )}

      {/* 03 — Sleep */}
      <section className="mt-12">
        <SectionHead n="03" title="Schlaf" />
        {nar?.sleep?.lead && <p className="text-primary text-sm md:text-base leading-relaxed mb-4 max-w-[66ch]">{nar.sleep.lead}</p>}
        <div className="card">
          <div className="label mb-3">Schlafarchitektur · Ø pro Nacht</div>
          {/* Schlaf = slate laut Palette; drei Helligkeiten + neutrales Wach-Segment */}
          <div className="flex h-11 rounded-full overflow-hidden mono text-xs text-white/90" style={{ boxShadow: 'var(--well)' }}>
            {([['Leicht', r.sleep.light, 'rgba(125,147,176,0.38)'], ['Tief', r.sleep.deep, '#7d93b0'], ['REM', r.sleep.rem, 'rgba(125,147,176,0.66)'], ['Wach', r.sleep.awake, 'var(--surface-2)']] as const).map(([name, min, bg]) => {
              const total = sleepTotal + r.sleep.awake;
              const share = min / (total || 1);
              return (
                <div key={name} className="flex items-center justify-center min-w-0" style={{ width: `${share * 100}%`, background: bg }}>
                  {share > 0.1 && `${name} ${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`}
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
            <Stat v={`${de(r.sleep.durH, 1)} h`} l="Schlaf Ø" />
            <Stat v={`${pct(r.sleep.deep, sleepTotal)}%`} l="Tiefschlaf" />
            <Stat v={`${pct(r.sleep.rem, sleepTotal)}%`} l="REM" />
            <Stat v={`${r.sleep.eff}%`} l="Effizienz" />
            <Stat v={`${r.sleep.consistency}%`} l="Konsistenz" />
            <Stat v={de(r.sleep.rr, 1)} l="Atemfreq." />
          </div>
        </div>
        {nar?.sleep?.callout && <Callout tone={nar.sleep.callout.tone} title={nar.sleep.callout.title}>{nar.sleep.callout.body}</Callout>}
      </section>

      {/* 04 — Training */}
      <section className="mt-12">
        <SectionHead n="04" title="Training" />
        {nar?.training?.lead && <p className="text-sm md:text-base leading-relaxed mb-4 max-w-[66ch]">{nar.training.lead}</p>}
        <div className="card">
          <div className="label mb-4">Aktivitäten nach Häufigkeit · Top {r.workouts.length}</div>
          <div className="flex flex-col gap-2">
            {r.workouts.map(w => (
              <div key={w.name} className="grid items-center gap-2.5 text-sm" style={{ gridTemplateColumns: '120px 1fr 32px' }}>
                <span className="truncate">{w.label}</span>
                <div className="relative h-4 rounded-full" style={{ background: 'var(--bg-2)', boxShadow: 'var(--well)' }}>
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(w.count / maxWorkout) * 100}%`, background: 'var(--success)' }} />
                </div>
                <span className="mono text-xs text-secondary text-right">{w.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div className="card">
            <div className="label mb-3">Recovery-Verteilung</div>
            <div className="flex h-7 rounded-full overflow-hidden mono text-xs font-semibold text-black/80" style={{ boxShadow: 'var(--well)' }}>
              <div className="grid place-items-center" style={{ width: `${r.zones.green}%`, background: 'var(--success)' }}>{r.zones.green}%</div>
              <div className="grid place-items-center" style={{ width: `${r.zones.yellow}%`, background: 'var(--warning)' }}>{r.zones.yellow}%</div>
              <div className="grid place-items-center" style={{ width: `${r.zones.red}%`, background: 'var(--error)' }}>{r.zones.red}%</div>
            </div>
            <p className="mono text-xs text-secondary mt-3">Grün ≥67 · Gelb 34–66 · Rot &lt;34. Nur {r.zones.red}% rote Tage.</p>
          </div>
          <div className="card">
            <div className="label mb-3">Wochenend-Effekt</div>
            <p className="text-sm text-secondary leading-relaxed">
              Sa/So liegt deine Recovery bei {r.weekend.weekendRec}% ggü. {r.weekend.weekdayRec}% unter der Woche, dein Ruhepuls bei {r.weekend.weekendRhr} ggü. {r.weekend.weekdayRhr} bpm.
              {nar?.training?.weekend ? ` ${nar.training.weekend}` : ''}
            </p>
          </div>
        </div>
      </section>

      {/* 05 — Labs (2026 focus + Verlauf) */}
      {blood.length > 0 && (() => {
        const bloodPanels = blood.filter(p => p.kind !== 'allergy');
        const allergy = blood.find(p => p.kind === 'allergy');
        // A lab round can span several draws days apart (two labs a
        // day apart) — everything within 45 days of the newest counts as current.
        const newestT = new Date(bloodPanels[0].date).getTime();
        const isCurrent = (p: BloodPanel) => newestT - new Date(p.date).getTime() < 45 * 864e5;
        const current = bloodPanels.filter(isCurrent);
        const older = bloodPanels.filter(p => !isCurrent(p));
        return (
        <section className="mt-12">
          <SectionHead n="05" title="Blutbefunde 2026 & Verlauf" />
          {nar?.labs?.lead && <p className="text-primary text-sm md:text-base leading-relaxed mb-4 max-w-[66ch]">{nar.labs.lead}</p>}

          {/* 2026 im Fokus — auffällige Werte beider aktueller Panels */}
          <div className="card">
            <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
              <span className="label">Im Fokus · {bi.latestLabel}</span>
              <span className="mono text-xs text-secondary">{bi.counts.abnormal} von {bi.counts.total} Werten auffällig</span>
            </div>
            {bi.flagged.length === 0 ? (
              <p className="text-secondary text-sm">Keine auffälligen Werte — alles im Referenzbereich.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {bi.flagged.map((m, i) => {
                  const flag = FLAG[m.flag ?? 'ok'];
                  const ref = m.refText ?? (m.refLow != null && m.refHigh != null ? `${de(m.refLow, m.refLow % 1 ? 1 : 0)}–${de(m.refHigh, m.refHigh % 1 ? 1 : 0)}` : '—');
                  return (
                    <div key={i} className="rounded-[18px] p-3.5" style={{ background: 'var(--surface-2)', boxShadow: 'var(--shadow-1), var(--lip)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-sm">{m.name}</span>
                        <span className={`badge ${flag.cls} shrink-0`}>{flag.text}</span>
                      </div>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-2xl font-semibold mono">{typeof m.value === 'number' ? de(m.value, m.value % 1 ? 2 : 0) : m.value}</span>
                        <span className="text-secondary text-xs">{m.unit} · Ref {ref}</span>
                      </div>
                      <div className="mono text-xs mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {m.prev && m.delta != null && (
                          <span style={{ color: m.movingToTarget ? GOOD_COLOR : BAD_COLOR }}>
                            {m.movingToTarget ? '▲ besser' : '▼ schlechter'} · {de(m.prev.value, m.prev.value % 1 ? 1 : 0)} ({m.prev.date.slice(0, 4)}) → {de(typeof m.value === 'number' ? m.value : m.prev.value + m.delta, 1)} ({signed(m.delta)})
                          </span>
                        )}
                        {m.source && <span className="text-muted">{m.source}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Verlauf — trend charts for markers measured across years */}
          {bi.trends.length > 0 && (
            <div className="mt-4">
              <div className="label mb-3">Verlauf über die Jahre</div>
              <div className="grid md:grid-cols-2 gap-4">
                {bi.trends.map(t => {
                  const color = t.direction === 'improved' ? GOOD_COLOR : t.direction === 'worsened' ? BAD_COLOR : 'rgba(255,255,255,0.5)';
                  const dirBadge = t.direction === 'improved' ? { cls: 'badge-success', text: 'Verbessert' } : t.direction === 'worsened' ? { cls: 'badge-error', text: 'Verschlechtert' } : { cls: 'badge-muted', text: 'Stabil' };
                  return (
                    <div key={t.key} className="card">
                      <div className="flex items-baseline justify-between mb-1 gap-2">
                        <span className="font-medium text-sm">{t.label}</span>
                        <span className={`badge ${dirBadge.cls}`}>{dirBadge.text}</span>
                      </div>
                      <div className="mono text-xs text-secondary mb-2">
                        {de(t.first, t.first % 1 ? 1 : 0)} → {de(t.last, t.last % 1 ? 1 : 0)} {t.unit}
                        {t.goal !== 'range' && ` · Ziel ${t.goal === 'high' ? '≥' : '≤'} ${t.target}`}
                      </div>
                      <MarkerTrendChart points={t.points} unit={t.unit} target={t.goal !== 'range' ? t.target : undefined} color={color} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {nar?.labs?.callouts?.map((c: any, i: number) => <Callout key={i} tone={c.tone} title={c.title}>{c.body}</Callout>)}

          {/* Allergie 2026 */}
          {allergy && (
            <Callout tone="amber" title={`${allergy.label ?? 'Allergie'} · ${fmtDate(allergy.date)}`}>{allergy.note}</Callout>
          )}

          {/* Beide aktuellen Befunde vollständig, einklappbar */}
          <div className="mt-6">
            <div className="label mb-3">Vollständige Befunde 2026</div>
            {current.map((panel, i) => (
              <details key={panel.date} className="card mb-3" open={i === 0}>
                <summary className="cursor-pointer flex items-baseline justify-between gap-2 min-h-[28px]">
                  <span className="font-medium text-sm">{panel.label ?? fmtDate(panel.date)}</span>
                  <span className="mono text-xs text-secondary">{fmtDate(panel.date)}</span>
                </summary>
                {panel.note && <p className="text-secondary text-sm mt-3 max-w-[70ch] leading-relaxed">{panel.note}</p>}
                <div className="mt-3"><PanelTables panel={panel} /></div>
              </details>
            ))}
          </div>

          {/* Ältere Befunde */}
          {older.length > 0 && (
            <div className="mt-6">
              <div className="label mb-3">Frühere Befunde</div>
              {older.map(panel => (
                <details key={panel.date} className="card mb-3">
                  <summary className="cursor-pointer flex items-baseline justify-between gap-2 min-h-[28px]">
                    <span className="font-medium text-sm">{panel.label ?? fmtDate(panel.date)}</span>
                    <span className="mono text-xs text-secondary">{panel.dateApprox ? '≈ ' : ''}{fmtDate(panel.date)}</span>
                  </summary>
                  <div className="mt-3"><PanelTables panel={panel} /></div>
                </details>
              ))}
            </div>
          )}
        </section>
        );
      })()}

      {/* 06 — Synthesis */}
      {nar?.synthesis && (
        <section className="mt-12">
          <SectionHead n="06" title="Einordnung & nächste Schritte" />
          <p className="text-primary text-sm md:text-base leading-relaxed mb-4 max-w-[66ch]">{nar.synthesis.lead}</p>
          <div className="card">
            <div className="label mb-2">Konkret, in Reihenfolge der Wirkung</div>
            <ol className="flex flex-col">
              {nar.synthesis.steps?.map((step: any, i: number) => (
                <li key={i} className="grid gap-3 py-4 border-b border-border last:border-0" style={{ gridTemplateColumns: '32px 1fr' }}>
                  <span className="mono text-sm font-semibold pt-0.5" style={{ color: RHF_COLOR }}>{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="font-semibold text-sm">{step.title}</div>
                    <p className="text-secondary text-sm mt-1 leading-relaxed">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {nar?.disclaimer && <p className="text-secondary text-xs italic mt-8 max-w-[70ch] leading-relaxed">{nar.disclaimer}</p>}
      <div className="border-t-2 border-white/15 mt-10 pt-5 mono text-xs text-secondary">
        Körperbefund · {s.days} Exporttage bis {fmtDate(r.dateRange.to)} · Trend bis {fmtDate(liveThrough)} · {bloodCount} {bloodCount === 1 ? 'Blutbefund' : 'Blutbefunde'}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><i className="inline-block w-2.5 h-[3px] rounded" style={{ background: color }} />{label}</span>;
}
function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className="p-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="text-xl font-semibold">{v}</div>
      <div className="label mt-1">{l}</div>
    </div>
  );
}

// Render a panel's markers as one small table per `group`, abnormal rows tinted.
function PanelTables({ panel }: { panel: BloodPanel }) {
  const groups: [string, Marker[]][] = [];
  for (const m of panel.markers) {
    const g = groups.find(([name]) => name === m.group);
    if (g) g[1].push(m); else groups.push([m.group, [m]]);
  }
  const fmtVal = (m: Marker) => `${typeof m.value === 'number' ? de(m.value, m.value % 1 ? 2 : 0) : m.value}${m.unit ? ` ${m.unit}` : ''}`;
  const fmtRef = (m: Marker) => m.refText ?? (m.refLow != null && m.refHigh != null ? `${de(m.refLow, m.refLow % 1 ? 1 : 0)}–${de(m.refHigh, m.refHigh % 1 ? 1 : 0)}` : '—');
  return (
    <div className="grid gap-4">
      {groups.map(([name, markers]) => (
        <div key={name} className="card min-w-0">
          <div className="label mb-2">{name}</div>
          <div className="min-w-0">
            <table className="w-full table-fixed text-sm border-collapse">
              <tbody>
                {markers.map((m, i) => {
                  const flag = FLAG[m.flag ?? 'ok'];
                  const abn = m.flag && m.flag !== 'ok';
                  return (
                    <tr key={i} className="block border-b border-border py-2 sm:table-row sm:border-0 sm:py-0">
                      <td className="block min-w-0 break-words font-medium sm:table-cell sm:w-[36%] sm:py-1.5 sm:pr-3 sm:border-b sm:border-border">{m.name}</td>
                      <td className="inline-block max-w-full break-words mono mr-3 sm:table-cell sm:w-[25%] sm:py-1.5 sm:pr-3 sm:border-b sm:border-border" style={abn ? { color: m.flag === 'high' ? BAD_COLOR : m.flag === 'low' ? 'var(--warning)' : undefined } : undefined}>{fmtVal(m)}</td>
                      <td className="inline-block max-w-full break-words mono text-secondary mr-3 sm:table-cell sm:w-[25%] sm:py-1.5 sm:pr-3 sm:border-b sm:border-border">{fmtRef(m)}</td>
                      <td className="inline-block sm:table-cell sm:w-[14%] sm:py-1.5 sm:border-b sm:border-border sm:text-right">{abn ? <span className={`badge ${flag.cls}`}>{flag.text}</span> : <span className="text-secondary mono text-xs">ok</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ empty, message }: { empty?: boolean; message?: string }) {
  return (
    <div className="card text-center py-12">
      <div className="text-lg font-semibold">{empty ? 'Noch keine historischen Daten' : 'Report konnte nicht geladen werden'}</div>
      <p className="text-secondary text-sm mt-2 max-w-[52ch] mx-auto leading-relaxed">
        {empty
          ? 'Führe den Import aus: scripts/health-schema.sql einmal im Supabase-SQL-Editor, dann node --env-file=.env.local scripts/import-whoop-history.mjs.'
          : (message ?? 'Bitte später erneut versuchen.')}
      </p>
    </div>
  );
}

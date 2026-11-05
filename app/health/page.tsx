'use client';
import { useEffect, useState, type JSX } from 'react';
import dynamic from 'next/dynamic';
import { WhoopHero } from '@/components/WhoopHero';
import { useCachedFetch, bustCache } from '@/lib/fetchCache';
import { IconRefresh, IconBattery, IconMoon, IconBolt, IconActivity, IconCheck, IconMinus, IconWarning } from '@/components/icons';
import { mergeCurrentDaily } from '@/lib/whoopMerge';
import { AnimatedTabs } from '@/components/AnimatedTabs';

// Charts pull in recharts — lazy-load them so the heavy library stays out of the
// initial bundle and loads only when the Health page actually renders.
const chartFallback = () => <div className="card h-56 animate-pulse" />;
const RecoveryChart = dynamic(() => import('@/components/WhoopCharts').then(m => m.RecoveryChart), { ssr: false, loading: chartFallback });
const StrainChart = dynamic(() => import('@/components/WhoopCharts').then(m => m.StrainChart), { ssr: false, loading: chartFallback });
const SleepChart = dynamic(() => import('@/components/WhoopCharts').then(m => m.SleepChart), { ssr: false, loading: chartFallback });
const HrvChart = dynamic(() => import('@/components/WhoopCharts').then(m => m.HrvChart), { ssr: false, loading: chartFallback });
const StepsChart = dynamic(() => import('@/components/WhoopCharts').then(m => m.StepsChart), { ssr: false, loading: chartFallback });
const SleepStagesChart = dynamic(() => import('@/components/WhoopCharts').then(m => m.SleepStagesChart), { ssr: false, loading: chartFallback });
const VitalMetricCharts = dynamic(() => import('@/components/WhoopCharts').then(m => m.VitalMetricCharts), { ssr: false, loading: chartFallback });
const TrendsOverview = dynamic(() => import('@/components/WhoopCharts').then(m => m.TrendsOverview), { ssr: false, loading: chartFallback });

// The static "Körperbefund" report (manual WHOOP-export analysis + blood panels).
// Lazy so its recharts trend + report code stay out of the initial Health bundle.
const Koerperbefund = dynamic(() => import('@/components/health/Koerperbefund').then(m => m.Koerperbefund), {
  ssr: false, loading: () => <div className="card h-96 animate-pulse" />,
});

type WhoopDay = {
  date: string;
  bodyWeightKg?: number;
  recovery?: number; strain?: number; sleepHours?: number; hrv?: number; rhr?: number; sleepPerformance?: number;
  sleepStages?: { light: number; deep: number; rem: number; awake: number };
  spo2?: number; respiratoryRate?: number; skinTempC?: number; steps?: number;
};

const HISTORY_DAYS = 180;

export default function HealthPage() {
  const { data, loading, error, refresh } = useCachedFetch<{ days: WhoopDay[] }>(
    `/api/whoop/daily?days=${HISTORY_DAYS}`,
    5 * 60_000,
  );
  const whoopDays = data?.days ?? [];
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'live' | 'report'>('live');
  const [trendDays, setTrendDays] = useState<14 | 30 | 90>(30);

  useEffect(() => {
    if (error) setErr(error.message);
    else if (data) setErr(null);
  }, [error, data]);

  async function sync() {
    setSyncing(true);
    try {
      const r = await fetch(`/api/whoop/sync?days=${HISTORY_DAYS}`, { method: 'POST' });
      if (!r.ok) throw new Error('sync_failed');
      bustCache('/api/whoop/daily');
      window.dispatchEvent(new CustomEvent('whoop:changed'));
      await refresh();
      setErr(null);
    } catch (e: any) {
      setErr('Sync fehlgeschlagen — verbinde WHOOP neu via Connect.');
    } finally { setSyncing(false); }
  }

  const last = mergeCurrentDay(whoopDays);
  const recentDays = lastCalendarDays(whoopDays, 30);
  const avgRecovery = avg(recentDays.map(d => d.recovery));
  const avgSleep = avg(recentDays.map(d => d.sleepHours));
  const avgStrain = avg(recentDays.map(d => d.strain));
  const currentWeight = [...whoopDays].reverse().find(d => d.bodyWeightKg != null)?.bodyWeightKg;
  const needsWhoopConnect = !loading && (
    whoopDays.length === 0 ||
    /connect|token|verbinde/i.test(err || '')
  );

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-8 pb-12 min-w-0">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="h1">Health</h1>
          <p className="text-secondary text-sm mt-1">{tab === 'live' ? 'WHOOP & Apple Health · letzte 6 Monate' : 'Manueller WHOOP-Export & Blutbefunde · Jahresanalyse'}</p>
        </div>
        {/* Same sliding-pill tabs the rest of the dashboard uses, for consistency. */}
        <div className="control-row">
          {tab === 'live' && (
            <>
              <button onClick={sync} disabled={syncing} className="btn-ghost inline-flex items-center gap-1.5"><IconRefresh size={14} className={syncing ? 'animate-spin' : undefined} />{syncing ? 'Sync…' : 'Sync'}</button>
              {needsWhoopConnect && <a href="/api/whoop/auth" className="btn btn-primary">Connect WHOOP</a>}
            </>
          )}
          <AnimatedTabs<'live' | 'report'>
            tabs={[{ value: 'live', label: 'Aktuell' }, { value: 'report', label: 'Körperbefund' }]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>

      {tab === 'report' && <div className="mt-8 min-w-0"><Koerperbefund /></div>}

      {tab === 'live' && <>

      {err && (
        <div className="card mt-4 border-red/30">
          <p className="text-red text-sm">{err}</p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2"><WhoopHero day={last || null} /></div>
        <div className="card flex flex-col justify-center gap-0 h-full">
          <div className="label">Durchschnitt · letzte 30 Tage</div>
          <AvgRow icon={IconBattery} label="⌀ Erholung" value={avgRecovery != null ? `${Math.round(avgRecovery)}%` : '–'} />
          <hr className="border-white/[0.06]" />
          <AvgRow icon={IconMoon} label="⌀ Schlaf" value={avgSleep != null ? `${avgSleep.toFixed(1)} h` : '–'} />
          <hr className="border-white/[0.06]" />
          <AvgRow icon={IconBolt} label="⌀ Belastung" value={avgStrain != null ? avgStrain.toFixed(1) : '–'} />
        </div>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 gap-5 mt-6">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="card h-56 animate-pulse" />)}</div>
      ) : (
        <>
          <div className="mt-6">
            <HealthSummary days={whoopDays} />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="h2">WHOOP Trends</h2>
              <p className="text-secondary text-xs mt-1">7-Tage-Mittel und Vergleich der letzten zwei Wochen</p>
            </div>
            <div className="seg" role="group" aria-label="Zeitraum der Trends">
              {([14, 30, 90] as const).map(days => <button key={days} type="button" className={trendDays === days ? 'on' : ''} aria-pressed={trendDays === days} onClick={() => setTrendDays(days)}>{days} Tage</button>)}
            </div>
          </div>
          <div className="mt-3"><TrendsOverview data={whoopDays} /></div>
          <div className="grid md:grid-cols-2 gap-5 mt-3">
            <RecoveryChart data={whoopDays} days={trendDays} />
            <StrainChart data={whoopDays} days={trendDays} />
            <SleepChart data={whoopDays} days={trendDays} />
            <HrvChart data={whoopDays} days={trendDays} />
            <SleepStagesChart data={whoopDays} days={trendDays} />
            <StepsChart data={whoopDays} days={trendDays} />
          </div>

          <h2 className="h2 mt-8">Vitalwerte</h2>
          <div className="grid md:grid-cols-3 gap-5 mt-3">
            <VitalMetricCharts data={whoopDays} days={trendDays} />
          </div>

          <div className="mt-8">
            <BodyMetricCard weight={currentWeight} />
          </div>
        </>
      )}

      </>}
    </main>
  );
}

type Tone = 'good' | 'ok' | 'bad' | 'neutral';
type MetricIcon = (p: { size?: number }) => JSX.Element;

const TONE: Record<Tone, { color: string; Icon: MetricIcon }> = {
  good: { color: '#7ba888', Icon: IconCheck },
  ok: { color: '#e8a33d', Icon: IconMinus },
  bad: { color: '#c97b5a', Icon: IconWarning },
  neutral: { color: 'rgba(255,255,255,0.4)', Icon: IconMinus },
};

function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function formatValue(value?: number, suffix = '') {
  if (value == null) return '–';
  const num = suffix === 'h' ? value.toFixed(1) : String(Math.round(value));
  return suffix ? `${num} ${suffix}` : num;
}

// Personal analysis: compare today's value to the user's own average/baseline and
// state whether it's above/below and in the optimal range.
function analyze(opts: {
  value?: number; avg?: number; unit?: string; digits?: number;
  zoneLabel?: string; optimalNote: string; avgLabel?: string;
}): { text: string; sub: string } {
  const { value, avg: a, unit = '', digits = 0, zoneLabel, optimalNote, avgLabel = 'Ø' } = opts;
  if (value == null) return { text: 'Noch kein Wert.', sub: optimalNote };
  const f = (n: number) => (digits ? n.toFixed(digits) : String(Math.round(n)));
  let trend = '';
  if (a != null) {
    const d = value - a;
    trend = Math.abs(d) < (digits ? 0.15 : 0.5)
      ? 'genau auf deinem Schnitt'
      : `${f(Math.abs(d))}${unit} ${d > 0 ? 'über' : 'unter'} deinem Schnitt`;
  }
  const parts = [trend, zoneLabel].filter(Boolean) as string[];
  const text = parts.length ? cap(parts.join(' – ')) + '.' : '';
  const sub = a != null
    ? `Heute ${f(value)}${unit} · ${avgLabel} ${f(a)}${unit} · ${optimalNote}`
    : `Heute ${f(value)}${unit} · ${optimalNote}`;
  return { text, sub };
}

function HealthSummary({ days }: { days: WhoopDay[] }) {
  const last = mergeCurrentDay(days);
  const recAvg = avg(days.map(d => d.recovery));
  const hrvAvg = avg(days.map(d => d.hrv));
  const sleepAvg = avg(days.map(d => d.sleepHours));
  const strainAvg = avg(days.map(d => d.strain));
  const r = last?.recovery, s = last?.sleepHours, st = last?.strain, h = last?.hrv;

  const recZone = (v: number) => v >= 67 ? 'grüner Bereich' : v >= 34 ? 'mittlerer Bereich' : 'roter Bereich';
  const sleepZone = (v: number) => v >= 7 ? 'genug Schlaf' : v >= 6 ? 'etwas knapp' : 'zu wenig';

  const notes = [
    {
      label: 'Recovery', value: r, suffix: '%', icon: IconBattery,
      tone: (r == null ? 'neutral' : r >= 67 ? 'good' : r >= 34 ? 'ok' : 'bad') as Tone,
      ...analyze({ value: r, avg: recAvg, unit: ' %', zoneLabel: r == null ? undefined : recZone(r), optimalNote: 'optimal ab 67 %' }),
    },
    {
      label: 'Schlaf', value: s, suffix: 'h', icon: IconMoon,
      tone: (s == null ? 'neutral' : s >= 7 ? 'good' : s >= 6 ? 'ok' : 'bad') as Tone,
      ...analyze({ value: s, avg: sleepAvg, unit: ' h', digits: 1, zoneLabel: s == null ? undefined : sleepZone(s), optimalNote: 'Ziel 7–9 h' }),
    },
    {
      label: 'Belastung', value: st, suffix: '', icon: IconBolt,
      // Strain is judged against your recovery, not a fixed threshold.
      tone: (st == null ? 'neutral' : (r != null && r < 34 && st >= 14) ? 'bad' : 'neutral') as Tone,
      ...analyze({
        value: st, avg: strainAvg, unit: '',
        zoneLabel: st == null ? undefined
          : (r != null && r < 34 && st >= 14) ? 'hoch für deine Recovery'
          : (r != null && r >= 67) ? 'Recovery trägt das'
          : 'im üblichen Rahmen',
        optimalNote: 'Skala 0–21',
      }),
    },
    {
      label: 'HRV', value: h, suffix: 'ms', icon: IconActivity,
      tone: (h == null || hrvAvg == null ? 'neutral' : h >= hrvAvg ? 'good' : 'ok') as Tone,
      // The average IS the baseline here, so the trend line already says it all.
      ...analyze({ value: h, avg: hrvAvg, unit: ' ms', optimalNote: 'höher = besser erholt', avgLabel: 'Basis' }),
    },
  ];
  return (
    <div className="card">
      <div className="label mb-3">Auswertung heute · Vergleich mit deinem verfügbaren Verlauf</div>
      <div className="grid md:grid-cols-4 gap-3">
        {notes.map(n => {
          const t = TONE[n.tone];
          return (
            <div key={n.label} className="rounded-card border border-border p-3 overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-start justify-between gap-3">
                {/* metric icon + label = what it's about */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-elevated shadow-[var(--lip)] text-white/55">
                    <n.icon size={15} />
                  </span>
                  <span className="text-xs font-semibold text-white/40 truncate">{n.label}</span>
                </div>
                {/* status badge = how good at a glance */}
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border"
                  style={{ borderColor: `${t.color}55`, color: t.color, background: `${t.color}14` }}
                  aria-hidden
                >
                  <t.Icon size={14} />
                </span>
              </div>
              <div className="text-2xl font-semibold mt-3" style={{ color: 'var(--color-text-primary, #f5f2f0)' }}>{formatValue(n.value, n.suffix)}</div>
              <p className="text-primary text-sm mt-2">{n.text}</p>
              <p className="text-secondary text-xs mt-1 leading-relaxed">{n.sub}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Staleness-aware: a value is never carried forward past the freshness window,
// so a stalled WHOOP sync shows "no current data" rather than a week-old value.
function mergeCurrentDay(days: WhoopDay[]): WhoopDay | null {
  return mergeCurrentDaily(days);
}


function avg(xs: (number | undefined)[]) {
  const a = xs.filter((x): x is number => typeof x === 'number');
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : undefined;
}
function lastCalendarDays(days: WhoopDay[], count: number) {
  const latest = days.map(d => d.date).sort().at(-1);
  if (!latest) return [];
  const from = Date.parse(`${latest}T00:00:00Z`) - (count - 1) * 86400000;
  return days.filter(d => Date.parse(`${d.date}T00:00:00Z`) >= from);
}
function BodyMetricCard({ weight }: { weight?: number }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="label">Gewicht aus WHOOP</span>
      </div>
      <div className="text-3xl font-semibold text-primary">
        {weight != null ? `${weight.toLocaleString('de-DE')} kg` : '–'}
      </div>
      <p className="text-secondary text-xs mt-3 leading-relaxed">
        WHOOP stellt per API nur die aktuellen Body Measurements bereit, keine historische Gewichtsreihe. Ab jetzt wird der aktuelle Wert bei jedem Sync gespeichert; echte Rückhistorie kann die WHOOP API hier nicht nachliefern.
      </p>
    </div>
  );
}
function AvgRow({ label, value, color, icon: Icon }: { label: string; value: string; color?: string; icon?: MetricIcon }) {
  return (
    <div className="flex items-center justify-between gap-3 py-4 px-1">
      <span className="label text-xs flex items-center gap-2">
        {Icon && (
          <span className="grid h-6 w-6 place-items-center rounded-[8px] bg-elevated shadow-[var(--lip)] text-white/50">
            <Icon size={13} />
          </span>
        )}
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums" style={{ color: color ?? 'var(--color-text-primary, #f5f2f0)' }}>{value}</span>
    </div>
  );
}

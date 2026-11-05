'use client';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { WhoopHero } from '@/components/WhoopHero';
import { sportIconKey, sportName, type SportIconKey } from '@/lib/whoop-sports';
import { useCachedFetch, bustCache } from '@/lib/fetchCache';
import { IconRefresh, IconActivity, IconRun, IconBike, IconDumbbell, IconBall, IconWater, IconMind } from '@/components/icons';

const SPORT_ICON: Record<SportIconKey, (p: { size?: number }) => JSX.Element> = {
  run: IconRun, bike: IconBike, strength: IconDumbbell, ball: IconBall, water: IconWater, mind: IconMind, activity: IconActivity,
};
function SportIcon({ id }: { id: number }) {
  const Glyph = SPORT_ICON[sportIconKey(id)];
  return <Glyph size={20} />;
}

type Workout = {
  id: string | number;
  sportId: number;
  start: string;
  end: string;
  durationMin: number;
  strain?: number;
  avgHr?: number;
  maxHr?: number;
  kilojoule?: number;
  distanceMeter?: number;
  altitudeGainMeter?: number;
  zonesMin?: { z0: number; z1: number; z2: number; z3: number; z4: number; z5: number };
};

type Stages = { light: number; deep: number; rem: number; awake: number };

type WhoopDay = {
  date: string;
  bodyWeightKg?: number;
  heightMeter?: number;
  maxHeartRate?: number;
  recovery?: number;
  hrv?: number;
  rhr?: number;
  spo2?: number;
  skinTempC?: number;
  strain?: number;
  avgHr?: number;
  maxHr?: number;
  kilojoule?: number;
  sleepHours?: number;
  sleepPerformance?: number;
  sleepEfficiency?: number;
  sleepConsistency?: number;
  respiratoryRate?: number;
  sleepStages?: Stages;
  disturbances?: number;
  sleepCycleCount?: number;
  workouts?: Workout[];
};

const COLORS = {
  light: '#9aacc4',
  deep: '#41505f',
  rem: '#8b8299',
  awake: '#888',
  green: '#7ba888',
  blue: '#7d93b0',
  orange: '#c97b5a',
  purple: '#8b8299',
  red: '#c97b5a',
  yellow: '#e8a33d',
};

export default function WhoopPage() {
  const todayRes = useCachedFetch<{ day: WhoopDay | null }>('/api/whoop/daily?today=1', 5 * 60_000);
  const daysRes = useCachedFetch<{ days: WhoopDay[] }>('/api/whoop/daily?days=14', 5 * 60_000);
  const today = todayRes.data?.day ?? null;
  const days = useMemo(() => daysRes.data?.days ?? [], [daysRes.data]);
  const loading = todayRes.loading || daysRes.loading;
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const e = todayRes.error || daysRes.error;
    if (e) setErr(e.message);
  }, [todayRes.error, daysRes.error]);

  async function sync() {
    setSyncing(true); setInfo(null);
    try {
      const r = await fetch('/api/whoop/sync', { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(j?.error || j?.message || 'Sync fehlgeschlagen — verbinde WHOOP neu.');
      } else {
        setInfo(`Sync ok · ${j.synced ?? 0} Tage aktualisiert`);
        bustCache('/api/whoop/daily');
        window.dispatchEvent(new CustomEvent('whoop:changed'));
        await Promise.all([todayRes.refresh(), daysRes.refresh()]);
      }
    } finally { setSyncing(false); }
  }

  const allWorkouts = useMemo(() => {
    const out: (Workout & { date: string })[] = [];
    for (const d of [...days].reverse()) {
      for (const w of d.workouts || []) out.push({ ...w, date: d.date });
    }
    return out;
  }, [days]);

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-8 pt-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="h1">WHOOP</h1>
          <p className="text-secondary text-sm mt-1">Recovery, Schlaf, Belastung & Workouts</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={sync} disabled={syncing} className="btn-ghost inline-flex items-center gap-1.5"><IconRefresh size={14} className={syncing ? 'animate-spin' : undefined} />{syncing ? 'Sync…' : 'Sync'}</button>
          <a href="/api/whoop/auth" className="btn btn-primary">Connect WHOOP</a>
        </div>
      </div>

      {err && (
        <div className="notice notice--error mt-4">
          <p className="text-red text-sm">{err}</p>
          <p className="text-secondary text-xs mt-2">
            Tipp: Wenn dies das erste Mal ist, zuerst auf <strong>Connect WHOOP</strong> klicken. Bei „no whoop token"
            ist die OAuth-Verknüpfung noch nicht erfolgt oder das Refresh-Token abgelaufen.
          </p>
        </div>
      )}
      {info && (
        <div className="notice notice--ok mt-4">
          <p className="text-green text-sm">{info}</p>
        </div>
      )}

      <div className="mt-6">
        <WhoopHero day={today} />
      </div>

      {/* Detail metrics — today */}
      {today && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <Metric label="SpO₂" value={today.spo2 != null ? `${today.spo2}%` : '–'} color={COLORS.blue} />
          <Metric label="Hauttemp." value={today.skinTempC != null ? `${today.skinTempC} °C` : '–'} color={COLORS.orange} />
          <Metric label="Atemrate" value={today.respiratoryRate != null ? `${today.respiratoryRate}/min` : '–'} color={COLORS.purple} />
          <Metric label="Schlaf-Eff." value={today.sleepEfficiency != null ? `${Math.round(today.sleepEfficiency)}%` : '–'} color={COLORS.green} />
          <Metric label="Schlaf-Konsistenz" value={today.sleepConsistency != null ? `${Math.round(today.sleepConsistency)}%` : '–'} color={COLORS.green} />
          <Metric label="Störungen" value={today.disturbances != null ? `${today.disturbances}` : '–'} color={COLORS.red} />
          <Metric label="Gewicht" value={today.bodyWeightKg != null ? `${today.bodyWeightKg} kg` : '–'} color={COLORS.purple} />
          <Metric label="Max HF" value={today.maxHeartRate != null ? `${today.maxHeartRate} bpm` : '–'} color={COLORS.red} />
          <Metric label="Ø HF Tag" value={today.avgHr != null ? `${today.avgHr} bpm` : '–'} color={COLORS.red} />
          <Metric label="Kalorien" value={today.kilojoule != null ? `${Math.round(today.kilojoule * 0.239)} kcal` : '–'} color={COLORS.orange} />
        </div>
      )}

      {/* Sleep stages */}
      {today?.sleepStages && (
        <section className="mt-8">
          <h2 className="h2">Schlafphasen heute</h2>
          <SleepStagesBar stages={today.sleepStages} cycles={today.sleepCycleCount} />
        </section>
      )}

      {/* Sleep stages — last 14 days */}
      {days.some(d => d.sleepStages) && (
        <section className="mt-8">
          <h2 className="h2">Schlafphasen · letzte 14 Tage</h2>
          <SleepStagesHistory days={days} />
        </section>
      )}

      {/* Workouts */}
      <section className="mt-8">
        <h2 className="h2">Workouts · letzte 14 Tage</h2>
        {allWorkouts.length === 0 ? (
          <div className="card mt-3 text-center py-8 text-secondary text-sm">
            Keine Workouts in den letzten 14 Tagen aufgezeichnet.
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {allWorkouts.map(w => <WorkoutCard key={`${w.date}-${w.id}`} w={w} />)}
          </ul>
        )}
      </section>

      {/* History table */}
      <h2 className="h2 mt-8">Letzte 14 Tage</h2>
      {loading ? (
        <div className="card mt-3 h-40 animate-pulse" />
      ) : days.length === 0 ? (
        <div className="card mt-3 text-center py-8 text-secondary text-sm">
          Noch keine WHOOP-Daten. Klicke auf <strong>Connect WHOOP</strong>, dann auf <strong>Sync</strong>.
        </div>
      ) : (
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-secondary text-xs">
                <th className="text-left py-2 px-2">Datum</th>
                <th className="text-right px-2">Recovery</th>
                <th className="text-right px-2">HRV</th>
                <th className="text-right px-2">RHR</th>
                <th className="text-right px-2">SpO₂</th>
                <th className="text-right px-2">Schlaf</th>
                <th className="text-right px-2">Gewicht</th>
                <th className="text-right px-2">Eff.</th>
                <th className="text-right px-2">Strain</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map(d => (
                <tr key={d.date} className="border-t border-border">
                  <td className="py-2 px-2">{d.date}</td>
                  <td className="text-right px-2 mono">{d.recovery != null ? `${Math.round(d.recovery)}%` : '–'}</td>
                  <td className="text-right px-2 mono">{d.hrv != null ? `${Math.round(d.hrv)}` : '–'}</td>
                  <td className="text-right px-2 mono">{d.rhr != null ? `${Math.round(d.rhr)}` : '–'}</td>
                  <td className="text-right px-2 mono">{d.spo2 != null ? `${d.spo2}%` : '–'}</td>
                  <td className="text-right px-2 mono">{d.sleepHours != null ? `${d.sleepHours}h` : '–'}</td>
                  <td className="text-right px-2 mono">{d.bodyWeightKg != null ? `${d.bodyWeightKg}kg` : '–'}</td>
                  <td className="text-right px-2 mono">{d.sleepEfficiency != null ? `${Math.round(d.sleepEfficiency)}%` : '–'}</td>
                  <td className="text-right px-2 mono">{d.strain != null ? d.strain.toFixed(1) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="label">{label}</div>
      <div className="mono mt-2 text-xl font-semibold" style={{ color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function SleepStagesBar({ stages, cycles }: { stages: Stages; cycles?: number }) {
  const total = stages.light + stages.deep + stages.rem + stages.awake || 1;
  const segs = [
    { key: 'deep', label: 'Tiefschlaf', mins: stages.deep, color: COLORS.deep },
    { key: 'rem', label: 'REM', mins: stages.rem, color: COLORS.rem },
    { key: 'light', label: 'Leichtschlaf', mins: stages.light, color: COLORS.light },
    { key: 'awake', label: 'Wach', mins: stages.awake, color: COLORS.awake },
  ];
  return (
    <div className="card mt-3">
      <div className="flex h-7 rounded-full overflow-hidden border border-border">
        {segs.map(s => (
          <div
            key={s.key}
            title={`${s.label}: ${formatMin(s.mins)}`}
            style={{ width: `${(s.mins / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        {segs.map(s => (
          <div key={s.key} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded" style={{ background: s.color }} />
            <span className="text-secondary">{s.label}</span>
            <span className="ml-auto font-semibold mono">{formatMin(s.mins)}</span>
          </div>
        ))}
      </div>
      {cycles != null && (
        <div className="text-xs text-secondary mt-3">{cycles} Schlafzyklen</div>
      )}
    </div>
  );
}

function SleepStagesHistory({ days }: { days: WhoopDay[] }) {
  const max = Math.max(1, ...days.map(d => {
    const s = d.sleepStages; if (!s) return 0;
    return s.light + s.deep + s.rem + s.awake;
  }));
  return (
    <div className="card mt-3 overflow-x-auto">
      <div className="flex items-end gap-1 min-w-[560px] h-44">
        {days.map(d => {
          const s = d.sleepStages || { light: 0, deep: 0, rem: 0, awake: 0 };
          const total = s.light + s.deep + s.rem + s.awake || 1;
          const h = (total / max) * 100;
          const seg = (mins: number) => `${(mins / total) * 100}%`;
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-[20px]">
              <div className="flex-1 w-full flex items-end">
                <div className="w-full rounded-md overflow-hidden border border-border" style={{ height: `${h}%` }}>
                  <div style={{ height: seg(s.deep), background: COLORS.deep }} />
                  <div style={{ height: seg(s.rem), background: COLORS.rem }} />
                  <div style={{ height: seg(s.light), background: COLORS.light }} />
                  <div style={{ height: seg(s.awake), background: COLORS.awake }} />
                </div>
              </div>
              <span className="text-[9px] text-secondary">{d.date.slice(8)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-3 text-xs">
        <Legend color={COLORS.deep} label="Tiefschlaf" />
        <Legend color={COLORS.rem} label="REM" />
        <Legend color={COLORS.light} label="Leichtschlaf" />
        <Legend color={COLORS.awake} label="Wach" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded" style={{ background: color }} />
      <span className="text-secondary">{label}</span>
    </span>
  );
}

function WorkoutCard({ w }: { w: Workout & { date: string } }) {
  const z = w.zonesMin || { z0: 0, z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  const totalZ = z.z0 + z.z1 + z.z2 + z.z3 + z.z4 + z.z5 || 1;
  const zoneColors = ['#444', '#9aacc4', '#7ba888', '#e8a33d', '#c97b5a', '#c97b5a'];
  const startTime = new Date(w.start).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return (
    <li className="card">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-elevated shadow-[var(--lip)] text-secondary">
          <SportIcon id={w.sportId} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div className="font-semibold">{sportName(w.sportId)}</div>
            <div className="text-secondary text-xs">{w.date} · {startTime}</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
            <Cell label="Dauer" value={formatMin(w.durationMin)} />
            <Cell label="Strain" value={w.strain != null ? w.strain.toFixed(1) : '–'} color={COLORS.orange} />
            <Cell label="Ø HF" value={w.avgHr != null ? `${w.avgHr} bpm` : '–'} color={COLORS.red} />
            <Cell label="Max HF" value={w.maxHr != null ? `${w.maxHr} bpm` : '–'} color={COLORS.red} />
            {w.kilojoule != null && <Cell label="Kalorien" value={`${Math.round(w.kilojoule * 0.239)} kcal`} color={COLORS.orange} />}
            {w.distanceMeter != null && w.distanceMeter > 0 && <Cell label="Distanz" value={`${(w.distanceMeter / 1000).toFixed(2)} km`} />}
            {w.altitudeGainMeter != null && w.altitudeGainMeter > 0 && <Cell label="Höhenmeter" value={`${Math.round(w.altitudeGainMeter)} m`} />}
          </div>
          <div className="mt-3">
            <div className="text-[10px] text-secondary mb-1.5">HF-Zonen</div>
            <div className="flex h-2.5 rounded-full overflow-hidden border border-border">
              {zoneColors.map((c, i) => {
                const m = (z as any)[`z${i}`] || 0;
                if (!m) return null;
                return <div key={i} title={`Z${i}: ${formatMin(m)}`} style={{ width: `${(m / totalZ) * 100}%`, background: c }} />;
              })}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-secondary mono">
              {[0, 1, 2, 3, 4, 5].map(i => (
                <span key={i}>Z{i} {formatMin((z as any)[`z${i}`] || 0)}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mono font-semibold mt-0.5" style={{ color: color || '#f5f2f0' }}>{value}</div>
    </div>
  );
}

function formatMin(min: number): string {
  if (!min) return '0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

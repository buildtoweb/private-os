'use client';
import { Ring } from './Ring';
import { RecoveryRing } from './RecoveryRing';

type Day = { date?: string; recovery?: number; strain?: number; sleepHours?: number; sleepPerformance?: number; hrv?: number; rhr?: number };

export function WhoopHero({ day }: { day: Day | null }) {
  const empty = !day;
  const sleepValue = day?.sleepPerformance != null
    ? day.sleepPerformance / 100
    : day?.sleepHours != null
      ? Math.min(1, day.sleepHours / 8)
      : 0;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">WHOOP</span>
          {/* Live dot only when fresh data is present — a stalled sync (no current
              row) must not look "live", which previously masked week-old values. */}
          <span
            className={`w-2 h-2 rounded-full ${empty ? 'bg-secondary/40' : 'bg-green pulse-dot'}`}
            aria-hidden
          />
        </div>
        {day?.date
          ? <span className="text-xs text-secondary">{new Date(day.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}</span>
          : <span className="text-xs text-secondary">keine aktuellen Daten</span>}
      </div>
      <div className="grid grid-cols-3 gap-3 md:gap-6">
        <RingStat
          value={sleepValue}
          color="#7d93b0"
          big={day?.sleepPerformance != null ? `${Math.round(day.sleepPerformance)}%` : day?.sleepHours != null ? `${day.sleepHours}h` : '–'}
          label="Schlaf"
          empty={empty}
        />
        <div className="grid place-items-center text-center">
          <RecoveryRing
            recovery={day?.recovery}
            hrv={day?.hrv}
            rhr={day?.rhr}
            sleepHours={day?.sleepHours}
            sleepPerformance={day?.sleepPerformance}
            size={120}
          />
        </div>
        <RingStat
          value={Math.min(1, (day?.strain ?? 0) / 21)}
          color="#c97b5a"
          big={day?.strain != null ? day.strain.toFixed(1) : '–'}
          label="Belastung"
          empty={empty}
        />
      </div>
      <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-border text-xs">
        <Mini label="HRV" value={day?.hrv != null ? `${Math.round(day.hrv)} ms` : '–'} />
        <Mini label="RHR" value={day?.rhr != null ? `${Math.round(day.rhr)} bpm` : '–'} />
        <Mini label="Schlaf h" value={day?.sleepHours != null ? `${day.sleepHours} h` : '–'} />
      </div>
    </div>
  );
}

function RingStat({ value, color, big, label, empty }: { value: number; color: string; big: string; label: string; empty: boolean }) {
  return (
    <div className="grid place-items-center text-center">
      <Ring value={value} color={color} size={120} stroke={10} label={big} sublabel={label} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="font-semibold text-primary">{value}</div>
      <div className="label mt-1">{label}</div>
    </div>
  );
}

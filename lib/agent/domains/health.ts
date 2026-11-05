// Health domain — WHOOP recovery/sleep/strain plus the blood-panel findings.
//
// Reads `private.whoop_daily` directly instead of going through
// lib/whoop.ts's getRecentDaily/getTodayDaily: those trigger a throttled WHOOP
// sync, which WRITES. This API is strictly read-only, so it does its own read
// and reuses only the pure staleness/merge logic from lib/whoopMerge.ts.
import { db, WHOOP_DAILY, BLOOD_TESTS, type WhoopDaily } from '@/lib/db';
import { mergeCurrentDaily, MAX_CURRENT_STALE_DAYS } from '@/lib/whoopMerge';
import { sportName } from '@/lib/whoop-sports';
import { computeBloodInsights, type BloodPanel } from '@/lib/health/blood';
import { getHabitsRange } from '@/lib/habitsStore';
import { appToday } from '@/lib/date';
import type { Warnings } from '../envelope';
import { type DateRange, previousPeriod, shiftDays } from '../range';
import { average, compact, compare, de, germanDate, plural, round, sentences } from '../format';

async function loadDaily(fromISO: string, toISO: string): Promise<WhoopDaily[]> {
  const snap = await db().collection(WHOOP_DAILY)
    .where('date', '>=', fromISO)
    .where('date', '<=', toISO)
    .orderBy('date', 'asc')
    .get();
  return snap.docs.map((d) => d.data() as WhoopDaily);
}

export async function buildHealth(range: DateRange, warn: Warnings, opts: { includeBlood?: boolean } = {}) {
  const prev = previousPeriod(range);
  const today = appToday();

  const [days, prevDays, bodyRows] = await Promise.all([
    warn.guard('health.whoop', () => loadDaily(range.from, range.to), [] as WhoopDaily[]),
    warn.guard('health.whoop_previous', () => loadDaily(prev.from, prev.to), [] as WhoopDaily[]),
    // Steps / weight / active calories come from the Apple Health shortcut, which
    // writes into the habits rows rather than into whoop_daily.
    warn.guard('health.apple_health', () => getHabitsRange(range.from, range.to), [] as Awaited<ReturnType<typeof getHabitsRange>>),
  ]);

  // ── Snapshot for the anchor day ────────────────────────────
  // For today the newest fields are merged across the last few rows (today's row
  // often has only strain until WHOOP scores last night's sleep). For a past day
  // the exact row is the honest answer.
  let snapshotRow: WhoopDaily | null;
  let isCurrent: boolean;
  if (range.isToday && !range.explicitDate) {
    const recent = await warn.guard('health.whoop_recent', () => loadDaily(shiftDays(today, -10), today), [] as WhoopDaily[]);
    snapshotRow = mergeCurrentDaily(recent);
    isCurrent = !!snapshotRow;
  } else {
    snapshotRow = days.find((d) => d.date === range.date) ?? null;
    isCurrent = false;
  }
  if (range.isToday && !snapshotRow) {
    warn.add('health.whoop', `Keine aktuellen WHOOP-Daten (älter als ${MAX_CURRENT_STALE_DAYS} Tage) — die Synchronisation steht möglicherweise still.`);
  }

  const yesterdayRow = days.find((d) => d.date === shiftDays(range.date, -1))
    ?? (await warn.guard('health.whoop_yesterday', () => loadDaily(shiftDays(range.date, -1), shiftDays(range.date, -1)), [] as WhoopDaily[]))[0]
    ?? null;

  const bodyRow = bodyRows.find((r) => r.date === range.date);
  const snapshot = snapshotRow ? shapeDay(snapshotRow, bodyRow) : undefined;

  // ── Period averages + comparison to the previous window ────
  const avg = averages(days);
  const prevAvg = averages(prevDays);
  const trend = compact({
    recovery_pct: compare(avg.recovery_pct, prevAvg.recovery_pct, 1, 1),
    hrv_ms: compare(avg.hrv_ms, prevAvg.hrv_ms, 1, 1),
    resting_hr_bpm: compare(avg.resting_hr_bpm, prevAvg.resting_hr_bpm, 1, 0.5),
    strain: compare(avg.strain, prevAvg.strain, 1, 0.3),
    sleep_hours: compare(avg.sleep_hours, prevAvg.sleep_hours, 1, 0.2),
    sleep_performance_pct: compare(avg.sleep_performance_pct, prevAvg.sleep_performance_pct, 1, 1),
  });

  const vsYesterday = yesterdayRow && snapshotRow
    ? compact({
        recovery_pct: compare(snapshotRow.recovery, yesterdayRow.recovery, 0, 0),
        hrv_ms: compare(snapshotRow.hrv, yesterdayRow.hrv, 1, 0),
        resting_hr_bpm: compare(snapshotRow.rhr, yesterdayRow.rhr, 0, 0),
        strain: compare(snapshotRow.strain, yesterdayRow.strain, 1, 0),
        sleep_hours: compare(snapshotRow.sleepHours, yesterdayRow.sleepHours, 1, 0),
      })
    : undefined;

  const vs7dAverage = snapshotRow
    ? compact({
        recovery_pct: compare(snapshotRow.recovery, average(days.slice(-7).map((d) => d.recovery)), 1, 1),
        hrv_ms: compare(snapshotRow.hrv, average(days.slice(-7).map((d) => d.hrv)), 1, 1),
        sleep_hours: compare(snapshotRow.sleepHours, average(days.slice(-7).map((d) => d.sleepHours)), 1, 0.2),
      })
    : undefined;

  // ── Workouts in the range ──────────────────────────────────
  const workouts = days.flatMap((d) => (d.workouts || []).map((w) => compact({
    date: d.date,
    sport: sportName(w.sportId),
    start: w.start,
    duration_min: round(w.durationMin, 0),
    strain: round(w.strain, 1),
    avg_hr_bpm: round(w.avgHr, 0),
    max_hr_bpm: round(w.maxHr, 0),
    distance_m: round(w.distanceMeter, 0),
    energy_kj: round(w.kilojoule, 0),
  })));

  // ── Blood panels (small table, always cheap) ───────────────
  const blood = opts.includeBlood === false ? undefined : await buildBlood(warn);

  const recovery = snapshotRow?.recovery;
  const zone = recovery == null ? null : recovery >= 67 ? 'grün' : recovery >= 34 ? 'gelb' : 'rot';

  return compact({
    range: { from: range.from, to: range.to, days: range.days, anchor_date: range.date },
    snapshot: snapshot
      ? { ...snapshot, is_current: isCurrent, recovery_zone: zone ?? undefined }
      : undefined,
    data_available: !!snapshot,
    comparison: compact({ vs_yesterday: vsYesterday, vs_7day_average: vs7dAverage }),
    period_averages: { ...avg, days_with_data: days.length },
    previous_period: { from: prev.from, to: prev.to, ...prevAvg },
    trend,
    workouts: {
      count: workouts.length,
      per_week: range.days ? round((workouts.length / range.days) * 7, 1) : undefined,
      total_minutes: round(workouts.reduce((n, w) => n + (w.duration_min || 0), 0), 0),
      sessions: workouts,
    },
    blood,
    summary: sentences(
      snapshot
        ? `Am ${snapshot.date}: Recovery ${de(snapshot.recovery_pct, 0)} %${zone ? ` (${zone})` : ''}, HRV ${de(snapshot.hrv_ms)} ms, Ruhepuls ${de(snapshot.resting_hr_bpm, 0)} bpm, Schlaf ${de(snapshot.sleep?.hours)} h.`
        : 'Für den angefragten Tag liegen keine WHOOP-Daten vor.',
      trend.recovery_pct?.direction && trend.recovery_pct.direction !== 'stable'
        ? `Die Recovery liegt im ${range.days}-Tage-Schnitt ${trend.recovery_pct.direction === 'up' ? 'über' : 'unter'} der Vorperiode (${de(trend.recovery_pct.current, 0)} % vs. ${de(trend.recovery_pct.previous, 0)} %).`
        : '',
      workouts.length ? `${plural(workouts.length, 'Workout', 'Workouts')} im Zeitraum.` : 'Keine Workouts im Zeitraum.',
      blood?.abnormal_count
        ? `Letztes Blutbild ${blood.latest_date}: ${blood.abnormal_count} von ${blood.marker_count} Werten außerhalb der Norm.`
        : '',
    ),
  });
}

// ─── shaping ───────────────────────────────────────────────────

function shapeDay(d: WhoopDaily, body?: { schritte?: number; gewicht?: number; aktiveKalorien?: number }) {
  return compact({
    date: d.date,
    weekday: germanDate(d.date),
    recovery_pct: round(d.recovery, 0),
    hrv_ms: round(d.hrv, 1),
    resting_hr_bpm: round(d.rhr, 0),
    spo2_pct: round(d.spo2, 1),
    skin_temp_c: round(d.skinTempC, 1),
    strain: round(d.strain, 1),
    avg_hr_bpm: round(d.avgHr, 0),
    max_hr_bpm: round(d.maxHr, 0),
    energy_kj: round(d.kilojoule, 0),
    sleep: compact({
      hours: round(d.sleepHours, 1),
      performance_pct: round(d.sleepPerformance, 0),
      efficiency_pct: round(d.sleepEfficiency, 0),
      consistency_pct: round(d.sleepConsistency, 0),
      respiratory_rate: round(d.respiratoryRate, 1),
      latency_min: round(d.sleepLatencyMin, 0),
      disturbances: d.disturbances,
      cycles: d.sleepCycleCount,
      stages_min: d.sleepStages
        ? {
            light: round(d.sleepStages.light, 0),
            deep: round(d.sleepStages.deep, 0),
            rem: round(d.sleepStages.rem, 0),
            awake: round(d.sleepStages.awake, 0),
          }
        : undefined,
    }),
    body: compact({
      weight_kg: round(d.bodyWeightKg ?? body?.gewicht, 1),
      height_m: round(d.heightMeter, 2),
      max_hr_bpm: round(d.maxHeartRate, 0),
      steps: body?.schritte,
      active_calories_kcal: body?.aktiveKalorien,
    }),
    workouts_today: (d.workouts || []).length || undefined,
  });
}

function averages(days: WhoopDaily[]) {
  return compact({
    recovery_pct: average(days.map((d) => d.recovery), 0),
    hrv_ms: average(days.map((d) => d.hrv), 1),
    resting_hr_bpm: average(days.map((d) => d.rhr), 0),
    strain: average(days.map((d) => d.strain), 1),
    sleep_hours: average(days.map((d) => d.sleepHours), 1),
    sleep_performance_pct: average(days.map((d) => d.sleepPerformance), 0),
    sleep_efficiency_pct: average(days.map((d) => d.sleepEfficiency), 0),
    respiratory_rate: average(days.map((d) => d.respiratoryRate), 1),
  });
}

async function buildBlood(warn: Warnings) {
  const panels = await warn.guard('health.blood', async () => {
    const snap = await db().collection(BLOOD_TESTS).get();
    return snap.docs.map((d) => d.data() as BloodPanel);
  }, [] as BloodPanel[]);
  if (!panels.length) return undefined;

  const insights = computeBloodInsights(panels);
  return compact({
    latest_date: insights.latestDate,
    latest_label: insights.latestLabel,
    marker_count: insights.counts.total,
    abnormal_count: insights.counts.abnormal,
    abnormal: insights.flagged.slice(0, 25).map((m) => compact({
      name: m.name,
      group: m.group,
      value: m.value,
      unit: m.unit,
      status: m.flag,
      reference: m.refText || (m.refLow != null && m.refHigh != null ? `${m.refLow}–${m.refHigh}` : undefined),
      previous_value: m.prev?.value,
      previous_date: m.prev?.date,
      delta: m.delta,
      moving_to_target: m.movingToTarget,
    })),
    trends: insights.trends.map((t) => compact({
      marker: t.label,
      unit: t.unit,
      direction: t.direction === 'improved' ? 'verbessert' : t.direction === 'worsened' ? 'verschlechtert' : 'stabil',
      first_value: t.first,
      latest_value: t.last,
      change_pct: t.changePct,
      target: t.target,
      measurements: t.points.length,
    })),
    allergy_note: insights.allergyNote,
  });
}

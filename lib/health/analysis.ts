// Körperbefund analysis — recomputes the whole report from the raw imported
// WHOOP rows (private.whoop_cycles / _sleeps / _workouts / _journal). Pure
// functions, no I/O, so the report is deterministic and re-import-safe.

export type CycleRow = {
  start?: string; date?: string; recovery?: number; rhr?: number; hrv?: number;
  strain?: number; skinTempC?: number; spo2?: number;
};
export type SleepRow = {
  date?: string; nap?: boolean; performance?: number; respiratoryRate?: number;
  asleepMin?: number; inBedMin?: number; lightMin?: number; deepMin?: number;
  remMin?: number; awakeMin?: number; efficiency?: number; consistency?: number;
};
export type WorkoutRow = { date?: string; activity?: string; durationMin?: number; strain?: number };
export type JournalRow = { date?: string; answers?: Record<string, boolean> };

export type BehaviorEffect = { key: string; label: string; n: number; dhrv: number; drec: number };
export type MonthPoint = { month: string; hrv: number; rhf: number; rec: number; strain: number };
export type DayPoint = { d: string; hrv: number | null; rhf: number | null; rec: number | null };

export type Report = {
  summary: {
    hrv: number; rhf: number; rec: number; days: number;
    hrvMin: number; hrvMax: number; rhfMin: number; rhfMax: number;
    greenPct: number; sleepH: number; sleepEff: number;
  };
  daily: DayPoint[];
  monthly: MonthPoint[];
  sleep: {
    light: number; deep: number; rem: number; awake: number;
    perf: number; eff: number; durH: number; consistency: number; rr: number;
  };
  workouts: { name: string; label: string; count: number }[];
  workoutSummary: { total: number; perWeek: number };
  behavior: BehaviorEffect[];
  zones: { green: number; yellow: number; red: number };
  weekend: { weekdayRec: number; weekendRec: number; weekdayRhr: number; weekendRhr: number };
  dateRange: { from: string; to: string };
};

// Journal questions we surface as behaviour drivers (English text → DE label).
const DRIVERS: Record<string, string> = {
  'Have any alcoholic drinks?': 'Alkohol',
  'Consumed caffeine?': 'Koffein',
  'Took anti-anxiety medication?': 'Angst-Medikament',
  'Felt nervous or anxious?': 'Nervös/ängstlich',
  'Experienced stress?': 'Stress',
  'Ate food close to bedtime?': 'Essen vor dem Schlafen',
  'Spend time outdoors?': 'Zeit draußen',
  'Took a cold shower?': 'Kalte Dusche',
  'Consumed magnesium?': 'Magnesium',
  'Took vitamin D?': 'Vitamin D',
  'Took creatine?': 'Kreatin',
  'Took omega 3 supplement?': 'Omega 3',
  'Journaled your thoughts?': 'Journaling',
  'Read (non-screened device) while in bed?': 'Lesen (kein Screen)',
  'Viewed a screen device in bed?': 'Screen im Bett',
  'Played video games?': 'Gaming',
  'Slept in the same bed as usual?': 'Eigenes Bett',
  'Experienced bloating?': 'Blähungen',
  'Experienced fatigue?': 'Müdigkeit',
  'Practiced breathwork?': 'Atemübung',
};

const ACTIVITY_DE: Record<string, string> = {
  Walking: 'Gehen', 'Strength Trainer': 'Krafttraining', Weightlifting: 'Gewichte',
  Dance: 'Tanzen', Running: 'Laufen', Elliptical: 'Crosstrainer', Activity: 'Aktivität',
  'Race Walking': 'Race Walking', Cycling: 'Radfahren', Boxing: 'Boxen', Swimming: 'Schwimmen',
  'Functional Fitness': 'Functional', Hiking: 'Wandern', Pilates: 'Pilates', Yoga: 'Yoga',
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function computeReport(
  cycles: CycleRow[], sleeps: SleepRow[], workouts: WorkoutRow[], journal: JournalRow[],
): Report {
  // ── per-date recovery metrics (average cycles that share a date; naps add rows)
  const byDate = new Map<string, { hrv: number[]; rhr: number[]; rec: number[]; strain: number[] }>();
  for (const c of cycles) {
    if (!c.date || c.recovery == null) continue;
    if (!byDate.has(c.date)) byDate.set(c.date, { hrv: [], rhr: [], rec: [], strain: [] });
    const b = byDate.get(c.date)!;
    if (c.hrv != null) b.hrv.push(c.hrv);
    if (c.rhr != null) b.rhr.push(c.rhr);
    b.rec.push(c.recovery);
    if (c.strain != null) b.strain.push(c.strain);
  }
  const dates = [...byDate.keys()].sort();
  const dayMetric = (d: string) => {
    const b = byDate.get(d)!;
    return { hrv: b.hrv.length ? mean(b.hrv) : null, rhf: b.rhr.length ? mean(b.rhr) : null, rec: mean(b.rec) };
  };

  // ── daily series
  const daily: DayPoint[] = dates.map((d) => {
    const m = dayMetric(d);
    return { d, hrv: m.hrv == null ? null : Math.round(m.hrv), rhf: m.rhf == null ? null : Math.round(m.rhf), rec: Math.round(m.rec) };
  });

  // ── monthly aggregation
  const monthMap = new Map<string, { hrv: number[]; rhf: number[]; rec: number[]; strain: number[] }>();
  for (const d of dates) {
    const mo = d.slice(0, 7);
    if (!monthMap.has(mo)) monthMap.set(mo, { hrv: [], rhf: [], rec: [], strain: [] });
    const g = monthMap.get(mo)!;
    const b = byDate.get(d)!;
    g.hrv.push(...b.hrv); g.rhf.push(...b.rhr); g.rec.push(...b.rec); g.strain.push(...b.strain);
  }
  const monthly: MonthPoint[] = [...monthMap.entries()].sort().map(([month, g]) => ({
    month, hrv: r1(mean(g.hrv)), rhf: r1(mean(g.rhf)), rec: r1(mean(g.rec)), strain: r1(mean(g.strain)),
  }));

  // ── summary
  const allHrv = dates.map((d) => dayMetric(d).hrv).filter((x): x is number => x != null);
  const allRhf = dates.map((d) => dayMetric(d).rhf).filter((x): x is number => x != null);
  const allRec = dates.map((d) => dayMetric(d).rec);
  const greenPct = Math.round((allRec.filter((r) => r >= 67).length / (allRec.length || 1)) * 100);

  // ── sleep (main sleeps only, not naps)
  const mainSleeps = sleeps.filter((s) => !s.nap && s.asleepMin);
  const sleep = {
    light: Math.round(mean(mainSleeps.map((s) => s.lightMin ?? 0))),
    deep: Math.round(mean(mainSleeps.map((s) => s.deepMin ?? 0))),
    rem: Math.round(mean(mainSleeps.map((s) => s.remMin ?? 0))),
    awake: Math.round(mean(mainSleeps.map((s) => s.awakeMin ?? 0))),
    perf: Math.round(mean(mainSleeps.map((s) => s.performance ?? 0))),
    eff: Math.round(mean(mainSleeps.filter((s) => s.efficiency).map((s) => s.efficiency!))),
    durH: r1(mean(mainSleeps.map((s) => (s.asleepMin ?? 0) / 60))),
    consistency: Math.round(mean(mainSleeps.filter((s) => s.consistency).map((s) => s.consistency!))),
    rr: r1(mean(mainSleeps.filter((s) => s.respiratoryRate).map((s) => s.respiratoryRate!))),
  };

  // ── workouts (count by activity, top 10)
  const wCount = new Map<string, number>();
  for (const w of workouts) if (w.activity) wCount.set(w.activity, (wCount.get(w.activity) ?? 0) + 1);
  const workoutsTop = [...wCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, label: ACTIVITY_DE[name] ?? name, count }));
  const totalWorkouts = workouts.length;
  const weeks = dates.length ? Math.max(1, (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / (7 * 864e5)) : 1;

  // ── behaviour drivers (journal yes/no → next day's recovery metrics for that date)
  const behavior: BehaviorEffect[] = [];
  for (const [q, label] of Object.entries(DRIVERS)) {
    const yes: { hrv: number[]; rec: number[] } = { hrv: [], rec: [] };
    const no: { hrv: number[]; rec: number[] } = { hrv: [], rec: [] };
    for (const j of journal) {
      if (!j.date || !j.answers || !(q in j.answers)) continue;
      const m = byDate.has(j.date) ? dayMetric(j.date) : null;
      if (!m) continue;
      const bucket = j.answers[q] ? yes : no;
      if (m.hrv != null) bucket.hrv.push(m.hrv);
      bucket.rec.push(m.rec);
    }
    if (yes.hrv.length < 12 || no.hrv.length < 12) continue; // ignore thin samples
    behavior.push({
      key: q, label, n: yes.hrv.length,
      dhrv: r1(mean(yes.hrv) - mean(no.hrv)),
      drec: r1(mean(yes.rec) - mean(no.rec)),
    });
  }
  behavior.sort((a, b) => a.dhrv - b.dhrv); // most negative first

  // ── recovery zones
  const green = allRec.filter((r) => r >= 67).length;
  const red = allRec.filter((r) => r < 34).length;
  const yellow = allRec.length - green - red;
  const zones = {
    green: Math.round((green / (allRec.length || 1)) * 100),
    yellow: Math.round((yellow / (allRec.length || 1)) * 100),
    red: Math.round((red / (allRec.length || 1)) * 100),
  };

  // ── weekend effect
  const wk = { wdRec: [] as number[], weRec: [] as number[], wdRhr: [] as number[], weRhr: [] as number[] };
  for (const d of dates) {
    const dow = new Date(d + 'T00:00:00').getDay(); // 0 Sun … 6 Sat
    const m = dayMetric(d);
    const weekend = dow === 0 || dow === 6;
    (weekend ? wk.weRec : wk.wdRec).push(m.rec);
    if (m.rhf != null) (weekend ? wk.weRhr : wk.wdRhr).push(m.rhf);
  }

  return {
    summary: {
      hrv: Math.round(mean(allHrv)), rhf: Math.round(mean(allRhf)), rec: Math.round(mean(allRec)),
      days: dates.length,
      hrvMin: allHrv.length ? Math.round(Math.min(...allHrv)) : 0, hrvMax: allHrv.length ? Math.round(Math.max(...allHrv)) : 0,
      rhfMin: allRhf.length ? Math.round(Math.min(...allRhf)) : 0, rhfMax: allRhf.length ? Math.round(Math.max(...allRhf)) : 0,
      greenPct, sleepH: sleep.durH, sleepEff: sleep.eff,
    },
    daily, monthly, sleep,
    workouts: workoutsTop,
    workoutSummary: { total: totalWorkouts, perWeek: r1(totalWorkouts / weeks) },
    behavior, zones,
    weekend: {
      weekdayRec: Math.round(mean(wk.wdRec)), weekendRec: Math.round(mean(wk.weRec)),
      weekdayRhr: Math.round(mean(wk.wdRhr)), weekendRhr: Math.round(mean(wk.weRhr)),
    },
    dateRange: { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' },
  };
}

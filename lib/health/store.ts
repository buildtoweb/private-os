// Read side for the Körperbefund report: load the raw imported rows from
// Supabase, recompute the analysis, and bundle it with the blood panels and the
// stored narrative. Server-only (uses lib/db → service key).
import { db, WHOOP_CYCLES, WHOOP_SLEEPS, WHOOP_WORKOUTS, WHOOP_JOURNAL, BLOOD_TESTS, HEALTH_REPORT, WHOOP_DAILY, type WhoopDaily } from '../db';
import { supa } from '../supabase';
import { computeReport, type CycleRow, type SleepRow, type WorkoutRow, type JournalRow, type Report } from './analysis';
import { computeBloodInsights, type BloodInsights } from './blood';
import { buildCombinedTrend } from './trends';

async function loadAll<T>(table: string, afterDate?: string): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supa().from(table).select('doc_id,data').order('doc_id', { ascending: true }).range(offset, offset + pageSize - 1);
    if (afterDate) query = query.gt('data->>date', afterDate);
    const { data, error } = await query;
    if (error) throw error;
    result.push(...(data ?? []).map(row => row.data as T));
    if (!data || data.length < pageSize) break;
  }
  return result;
}

export type BloodPanel = {
  date: string; dateApprox?: boolean; lab: string; label?: string; source?: string;
  markers: { group: string; name: string; value: number | string; unit?: string;
    refLow?: number; refHigh?: number; refText?: string; flag?: 'ok' | 'low' | 'high' | 'watch' }[];
};

export type Koerperbefund = {
  report: Report;
  blood: BloodPanel[];
  bloodInsights: BloodInsights;
  narrative: Record<string, any> | null;
  trend: ReturnType<typeof buildCombinedTrend>;
};

export async function getKoerperbefund(): Promise<Koerperbefund> {
  const [cycles, sleeps, workouts, journal, blood, narrativeSnap] = await Promise.all([
    loadAll<CycleRow>(WHOOP_CYCLES),
    loadAll<SleepRow>(WHOOP_SLEEPS),
    loadAll<WorkoutRow>(WHOOP_WORKOUTS),
    loadAll<JournalRow>(WHOOP_JOURNAL),
    loadAll<BloodPanel>(BLOOD_TESTS),
    db().collection(HEALTH_REPORT).doc('koerperbefund').get(),
  ]);

  const report = computeReport(cycles, sleeps, workouts, journal);
  const live = report.dateRange.to ? await loadAll<WhoopDaily>(WHOOP_DAILY, report.dateRange.to) : [];
  const trend = buildCombinedTrend(report.daily, live, report.dateRange.to);
  const bloodInsights = computeBloodInsights(blood);
  blood.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first

  return {
    report,
    blood,
    bloodInsights,
    narrative: narrativeSnap.exists ? (narrativeSnap.data() as Record<string, any>) : null,
    trend,
  };
}

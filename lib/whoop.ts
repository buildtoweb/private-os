import { db, FieldValue, WHOOP_TOKEN, WHOOP_DAILY, WhoopTokenDoc, WhoopDaily, WhoopWorkout } from './db';
import { appToday } from './date';
import { mergeCurrentDaily } from './whoopMerge';

const WHOOP_AUTH = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API = 'https://api.prod.whoop.com/developer';

export const TOKEN_DOC_ID = 'singleton';
export const SCOPES = [
  'read:recovery',
  'read:cycles',
  'read:sleep',
  'read:workout',
  'read:profile',
  'read:body_measurement',
  'offline',
].join(' ');

export function authUrl(state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.WHOOP_CLIENT_ID!,
    redirect_uri: process.env.WHOOP_REDIRECT_URI!,
    scope: SCOPES,
    state,
  });
  return `${WHOOP_AUTH}?${params}`;
}

export async function exchangeCode(code: string): Promise<WhoopTokenDoc> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.WHOOP_CLIENT_ID!,
    client_secret: process.env.WHOOP_CLIENT_SECRET!,
    redirect_uri: process.env.WHOOP_REDIRECT_URI!,
  });
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`whoop token exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return tokenFromResponse(json);
}

export async function refreshToken(refresh_token: string): Promise<WhoopTokenDoc> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token,
    client_id: process.env.WHOOP_CLIENT_ID!,
    client_secret: process.env.WHOOP_CLIENT_SECRET!,
    scope: SCOPES,
  });
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`whoop refresh failed: ${res.status} ${await res.text()}`);
  return tokenFromResponse(await res.json());
}

function tokenFromResponse(j: any): WhoopTokenDoc {
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (Number(j.expires_in || 3600) - 60) * 1000,
    scope: j.scope,
  };
}

export async function saveToken(t: WhoopTokenDoc) {
  await db().collection(WHOOP_TOKEN).doc(TOKEN_DOC_ID).set(t);
}

export async function loadToken(): Promise<WhoopTokenDoc | null> {
  const snap = await db().collection(WHOOP_TOKEN).doc(TOKEN_DOC_ID).get();
  return snap.exists ? (snap.data() as WhoopTokenDoc) : null;
}

export async function getValidAccessToken(): Promise<string | null> {
  const t = await loadToken();
  if (!t) return null;
  if (Date.now() < t.expires_at) return t.access_token;
  const refreshed = await refreshToken(t.refresh_token);
  await saveToken(refreshed);
  return refreshed.access_token;
}

async function whoopFetch(path: string, token: string, params?: Record<string, string>) {
  const url = new URL(`${WHOOP_API}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`whoop ${path} ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json();
}

async function whoopFetchCollection(path: string, token: string, params: Record<string, string>) {
  const records: any[] = [];
  let nextToken: string | undefined;
  do {
    const page = await whoopFetch(path, token, nextToken ? { ...params, nextToken } : params);
    records.push(...(page.records || []));
    nextToken = page.next_token || page.nextToken;
  } while (nextToken);
  return { records };
}

const msToMin = (ms?: number) => (typeof ms === 'number' ? Math.round(ms / 60_000) : 0);
const msToHours = (ms?: number) => (typeof ms === 'number' ? Math.round((ms / 3_600_000) * 10) / 10 : undefined);
const round1 = (n?: number) => (typeof n === 'number' ? Math.round(n * 10) / 10 : undefined);
const dateFromWhoop = (iso?: string, offset?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso.slice(0, 10);
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset || '');
  if (!m) return iso.slice(0, 10);
  const sign = m[1] === '-' ? -1 : 1;
  const minutes = sign * (Number(m[2]) * 60 + Number(m[3]));
  return new Date(d.getTime() + minutes * 60_000).toISOString().slice(0, 10);
};
const pruneUndefined = <T extends Record<string, any>>(obj: T): T => {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) delete obj[key];
    else if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) pruneUndefined(obj[key]);
  }
  return obj;
};

// Sync the last N days from WHOOP into Supabase daily collection.
// Pulls Recovery, Sleep, Cycle (Strain), Workouts, and current body measurements.
export async function syncRecent(days = 7) {
  const token = await getValidAccessToken();
  if (!token) throw new Error('no whoop token; auth at /api/whoop/auth');
  const end = new Date();
  const start = new Date(Date.now() - days * 86400_000);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const [recovery, sleep, cycles, workouts, body] = await Promise.all([
    whoopFetchCollection('/v2/recovery', token, { start: startISO, end: endISO, limit: '25' }),
    whoopFetchCollection('/v2/activity/sleep', token, { start: startISO, end: endISO, limit: '25' }),
    whoopFetchCollection('/v2/cycle', token, { start: startISO, end: endISO, limit: '25' }),
    whoopFetchCollection('/v2/activity/workout', token, { start: startISO, end: endISO, limit: '25' }).catch(() => ({ records: [] })),
    whoopFetch('/v2/user/measurement/body', token).catch(() => null),
  ]);

  const byDate = new Map<string, WhoopDaily>();
  const sleepIdToDate = new Map<string, string>();
  const cycleIdToDate = new Map<string, string>();
  const sleepDates = new Set<string>();
  const staleSleepDates = new Set<string>();
  const upd = (date: string, patch: Partial<WhoopDaily>) => {
    const cur = byDate.get(date) || { date, updatedAt: Date.now() };
    byDate.set(date, { ...cur, ...patch, updatedAt: Date.now() });
  };
  const append = (date: string, w: WhoopWorkout) => {
    const cur = byDate.get(date) || { date, updatedAt: Date.now() };
    const list = [...(cur.workouts || []), w];
    byDate.set(date, { ...cur, workouts: list, updatedAt: Date.now() });
  };

  for (const r of recovery.records || []) {
    const d = dateFromWhoop(r.created_at || r.updated_at, r.timezone_offset);
    if (!d) continue;
    if (r.sleep_id != null) sleepIdToDate.set(String(r.sleep_id), d);
    if (r.cycle_id != null) cycleIdToDate.set(String(r.cycle_id), d);
    upd(d, {
      recovery: r.score?.recovery_score,
      hrv: round1(r.score?.hrv_rmssd_milli),
      rhr: r.score?.resting_heart_rate,
      spo2: round1(r.score?.spo2_percentage),
      skinTempC: round1(r.score?.skin_temp_celsius),
    });
  }

  for (const s of sleep.records || []) {
    const d = (s.id != null ? sleepIdToDate.get(String(s.id)) : undefined) || dateFromWhoop(s.end || s.start, s.timezone_offset);
    if (!d) continue;
    if (s.nap) continue; // skip naps; only main sleep counts toward day
    sleepDates.add(d);
    const startDate = dateFromWhoop(s.start, s.timezone_offset);
    if (startDate && startDate !== d) staleSleepDates.add(startDate);
    const ss = s.score?.stage_summary || {};
    const inBedMs: number | undefined = ss.total_in_bed_time_milli;
    const awakeMs: number = ss.total_awake_time_milli || 0;
    const lightMs: number = ss.total_light_sleep_time_milli || 0;
    const deepMs: number = ss.total_slow_wave_sleep_time_milli || 0;
    const remMs: number = ss.total_rem_sleep_time_milli || 0;
    const sleepMs = lightMs + deepMs + remMs; // actual sleep, not in-bed
    upd(d, {
      sleepHours: msToHours(sleepMs || inBedMs),
      sleepPerformance: round1(s.score?.sleep_performance_percentage),
      sleepEfficiency: round1(s.score?.sleep_efficiency_percentage),
      sleepConsistency: round1(s.score?.sleep_consistency_percentage),
      respiratoryRate: round1(s.score?.respiratory_rate),
      sleepStages: {
        light: msToMin(lightMs),
        deep: msToMin(deepMs),
        rem: msToMin(remMs),
        awake: msToMin(awakeMs),
      },
      disturbances: ss.disturbance_count,
      sleepCycleCount: ss.sleep_cycle_count,
    });
  }

  for (const staleDate of staleSleepDates) {
    if (sleepDates.has(staleDate)) continue;
    upd(staleDate, {
      sleepHours: FieldValue.delete() as any,
      sleepPerformance: FieldValue.delete() as any,
      sleepEfficiency: FieldValue.delete() as any,
      sleepConsistency: FieldValue.delete() as any,
      respiratoryRate: FieldValue.delete() as any,
      sleepStages: FieldValue.delete() as any,
      disturbances: FieldValue.delete() as any,
      sleepCycleCount: FieldValue.delete() as any,
    });
  }

  for (const c of cycles.records || []) {
    const d = (c.id != null ? cycleIdToDate.get(String(c.id)) : undefined)
      || dateFromWhoop(c.end || new Date().toISOString(), c.timezone_offset);
    if (!d) continue;
    upd(d, {
      strain: round1(c.score?.strain),
      avgHr: c.score?.average_heart_rate,
      maxHr: c.score?.max_heart_rate,
      kilojoule: round1(c.score?.kilojoule),
      ...stepsPatch(c),
    });
  }

  for (const w of workouts.records || []) {
    const d = dateFromWhoop(w.start, w.timezone_offset);
    if (!d) continue;
    const startMs = new Date(w.start).getTime();
    const endMs = new Date(w.end).getTime();
    const zd = w.score?.zone_durations || w.score?.zone_duration || {};
    const workout: WhoopWorkout = pruneUndefined({
      id: w.id,
      sportId: typeof w.sport_id === 'number' ? w.sport_id : -1,
      start: w.start,
      end: w.end,
      durationMin: Math.max(0, Math.round((endMs - startMs) / 60_000)),
      strain: round1(w.score?.strain),
      avgHr: w.score?.average_heart_rate,
      maxHr: w.score?.max_heart_rate,
      kilojoule: round1(w.score?.kilojoule),
      distanceMeter: w.score?.distance_meter,
      altitudeGainMeter: w.score?.altitude_gain_meter,
      zonesMin: {
        z0: msToMin(zd.zone_zero_milli),
        z1: msToMin(zd.zone_one_milli),
        z2: msToMin(zd.zone_two_milli),
        z3: msToMin(zd.zone_three_milli),
        z4: msToMin(zd.zone_four_milli),
        z5: msToMin(zd.zone_five_milli),
      },
    });
    append(d, workout);
  }

  if (body) {
    const today = appToday();
    upd(today, {
      bodyWeightKg: round1(body.weight_kilogram),
      heightMeter: round1(body.height_meter),
      maxHeartRate: body.max_heart_rate,
    });
  }

  const batch = db().batch();
  for (const [date, doc] of byDate) {
    batch.set(db().collection(WHOOP_DAILY).doc(date), doc, { merge: true });
  }
  await batch.commit();
  return { synced: byDate.size };
}

// Reads trigger a live refresh of the current cycle + latest recovery, but a single
// page view can call several read functions. Throttle + coalesce so we hit the
// WHOOP API at most once per window instead of once per read.
const CURRENT_CYCLE_THROTTLE_MS = 60_000;
let lastCurrentCycleAt = 0;
let currentCycleInFlight: Promise<void> | null = null;

function syncCurrentCycleThrottled(): Promise<void> {
  if (Date.now() - lastCurrentCycleAt < CURRENT_CYCLE_THROTTLE_MS) return Promise.resolve();
  if (currentCycleInFlight) return currentCycleInFlight;
  currentCycleInFlight = Promise.all([syncCurrentCycle(), syncLatestRecovery()])
    .then(() => { lastCurrentCycleAt = Date.now(); })
    .finally(() => { currentCycleInFlight = null; });
  return currentCycleInFlight;
}

// Fetches the most recent recovery record from WHOOP and writes it to Supabase
// so the dashboard always reflects the current day's recovery without waiting for
// the nightly cron sync.
async function syncLatestRecovery() {
  const token = await getValidAccessToken();
  if (!token) return;
  const end = new Date();
  const start = new Date(Date.now() - 2 * 86400_000);
  const data = await whoopFetchCollection('/v2/recovery', token, {
    start: start.toISOString(),
    end: end.toISOString(),
    limit: '5',
  });
  const records: any[] = data.records || [];
  if (!records.length) return;
  // Most recently created record wins.
  const latest = records.sort((a, b) =>
    String(b.created_at || b.updated_at || '').localeCompare(String(a.created_at || a.updated_at || ''))
  )[0];
  if (!latest?.score) return;
  const date = dateFromWhoop(latest.created_at || latest.updated_at, latest.timezone_offset);
  if (!date) return;
  await db().collection(WHOOP_DAILY).doc(date).set({
    date,
    recovery: latest.score.recovery_score,
    hrv: round1(latest.score.hrv_rmssd_milli),
    rhr: latest.score.resting_heart_rate,
    spo2: round1(latest.score.spo2_percentage),
    skinTempC: round1(latest.score.skin_temp_celsius),
    updatedAt: Date.now(),
  }, { merge: true });
}

async function syncCurrentCycle() {
  const token = await getValidAccessToken();
  if (!token) return;
  const end = new Date();
  const start = new Date(Date.now() - 2 * 86400_000);
  const cycles = await whoopFetchCollection('/v2/cycle', token, {
    start: start.toISOString(),
    end: end.toISOString(),
    limit: '25',
  });
  const records = cycles.records || [];
  const current = records.find((c: any) => !c.end) || records
    .slice()
    .sort((a: any, b: any) => String(b.updated_at || b.end || b.start).localeCompare(String(a.updated_at || a.end || a.start)))[0];
  if (!current?.score) return;
  const date = current.end
    ? dateFromWhoop(current.end, current.timezone_offset)
    : dateFromWhoop(new Date().toISOString(), current.timezone_offset);
  if (!date) return;
  await db().collection(WHOOP_DAILY).doc(date).set({
    date,
    strain: round1(current.score.strain),
    avgHr: current.score.average_heart_rate,
    maxHr: current.score.max_heart_rate,
    kilojoule: round1(current.score.kilojoule),
    ...stepsPatch(current),
    updatedAt: Date.now(),
  }, { merge: true });
}

// step_count sits on the cycle itself, not in its score. WHOOP sends null when it
// has no step data (strap not worn); that must not overwrite a stored count.
function stepsPatch(cycle: any): { steps?: number } {
  return typeof cycle.step_count === 'number' ? { steps: cycle.step_count } : {};
}

export async function getRecentDaily(days = 30): Promise<WhoopDaily[]> {
  await syncCurrentCycleThrottled().catch(() => {});
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const snap = await db().collection(WHOOP_DAILY)
    .where('date', '>=', since)
    .orderBy('date', 'asc')
    .get();
  return snap.docs.map(d => d.data() as WhoopDaily);
}

export async function getDailyForDate(date: string): Promise<WhoopDaily | null> {
  await syncCurrentCycleThrottled().catch(() => {});
  const snap = await db().collection(WHOOP_DAILY).doc(date).get();
  return snap.exists ? (snap.data() as WhoopDaily) : null;
}

export async function getTodayDaily(): Promise<WhoopDaily | null> {
  await syncCurrentCycleThrottled().catch(() => {});
  // Merge the most recent rows that actually exist (not a fixed calendar window):
  // today's row often holds only strain, and recovery/sleep may be a day old.
  // mergeCurrentDaily surfaces the newest value per field but drops anything past
  // the staleness window, so a stalled sync shows "no current data" instead of a
  // week-old value presented as today's. Matches the Health page's snapshot logic.
  const since = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
  const snap = await db().collection(WHOOP_DAILY)
    .where('date', '>=', since)
    .orderBy('date', 'asc')
    .get();
  const docs = snap.docs.map(d => d.data() as WhoopDaily);
  return mergeCurrentDaily(docs);
}

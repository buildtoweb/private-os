// Data layer for the private dashboard.
//
// Migrated from Firestore to the self-hosted Supabase (`private` schema). Every
// former Firestore collection is a table `private.<name>` with shape
// `doc_id text primary key, data jsonb`, so a document's id maps to `doc_id`
// and its fields map to `data`.
//
// To keep the (well-tested) call sites untouched, this module exposes a thin
// Firestore-compatible surface — collection / doc / get / set / add / delete /
// where / orderBy / limit / batch — backed by supabase-js. Data volumes here are
// tiny (hundreds of rows), so ordering and limiting are applied in JS for exact
// numeric/string semantics rather than fighting jsonb operators in PostgREST.
import { randomBytes } from 'node:crypto';
import { supa } from './supabase';

// ─── Table names (formerly Firestore collections) ─────────────
export const WHOOP_DAILY = 'whoop_daily';
export const WHOOP_TOKEN = 'whoop_token';
export const XP_LOG = 'xp_log';

// Static / manually-imported health history (Körperbefund) — separate from the
// live `whoop_daily` sync. Populated by scripts/import-whoop-history.mjs.
export const WHOOP_CYCLES = 'whoop_cycles';
export const WHOOP_SLEEPS = 'whoop_sleeps';
export const WHOOP_WORKOUTS = 'whoop_workouts';
export const WHOOP_JOURNAL = 'whoop_journal';
export const BLOOD_TESTS = 'blood_tests';
export const HEALTH_REPORT = 'health_report';

// Finance — the private finance tables.
export const FIN_CRYPTO = 'finance_crypto';
export const FIN_METALS = 'finance_metals';
export const FIN_CASH = 'finance_cash';
export const FIN_INCOME = 'finance_income';          // doc id = YYYY-MM
export const FIN_SAVINGS_PLAN = 'finance_savings_plan';
export const FIN_GOALS = 'finance_goals';
export const FIN_PRICE_CACHE = 'finance_price_cache'; // doc id = source
export const FIN_ASSETS = 'finance_assets';
export const FIN_TRANSACTIONS = 'finance_transactions';
export const FIN_VALUE_HISTORY = 'finance_value_history'; // doc id = YYYY-MM-DD
export const FIN_PORTFOLIO_META = 'finance_portfolio_meta'; // doc id = current
export const FIN_ALERTS = 'finance_alerts'; // price alerts, see lib/finance/alerts.ts
// One-way bridge from the business dashboard. Written via POST /api/finance/bridge,
// read-only otherwise. Doc id = period (e.g. "2026-06" or "latest").
export const BUSINESS_BRIDGE = 'business_bridge';

// Daily passage — read/favourite log. See scripts/passages-schema.sql.
// The corpus itself is static and lives in lib/passages/, not in the DB.
export const PASSAGE_LOG = 'passage_log';               // doc id = YYYY-MM-DD

// Abonnements — which upcoming-payment reminders already went to Telegram.
// Doc id = "<service-slug>__<YYYY-MM-DD due date>", so a reminder is sent once
// per charge rather than once per day. See scripts/subscriptions-schema.sql.
export const SUBSCRIPTION_PUSHES = 'subscription_pushes';

// Per-device Web Push subscriptions. The endpoint and encryption keys never
// leave the server-side private schema after registration.
export const PUSH_SUBSCRIPTIONS = 'push_subscriptions';

// Subscribed calendars (Google / iCloud secret iCal links) shown read-only in
// the planner. See lib/todo/calendar.ts.
export const CALENDAR_FEEDS = 'calendar_feeds';

// ─── FieldValue.delete() sentinel ─────────────────────────────
// Compared by identity in the merge path (never serialized).
const DELETE_SENTINEL = Object.freeze({ __fieldValueDelete: true });
export const FieldValue = {
  delete(): any {
    return DELETE_SENTINEL;
  },
};

const PAGE_SIZE = 1000;

type Row = { doc_id: string; data: Record<string, any> };
type DocData = Record<string, any>;

// Firestore-style 20-char base62 id for `.add()`.
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function genId(): string {
  const bytes = randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

function stripSentinels(data: DocData): DocData {
  const out: DocData = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === DELETE_SENTINEL) continue;
    out[k] = v;
  }
  return out;
}

function applyMerge(existing: DocData, incoming: DocData): DocData {
  const out: DocData = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === DELETE_SENTINEL) delete out[k];
    else out[k] = v;
  }
  return out;
}

// ─── Snapshots ─────────────────────────────────────────────────
class DocSnapshot {
  readonly id: string;
  readonly exists: boolean;
  private readonly _data: DocData | undefined;
  constructor(id: string, data: DocData | undefined) {
    this.id = id;
    this.exists = data !== undefined;
    this._data = data;
  }
  data(): DocData | undefined {
    return this._data;
  }
}

class QuerySnapshot {
  readonly docs: DocSnapshot[];
  constructor(docs: DocSnapshot[]) {
    this.docs = docs;
  }
  get empty(): boolean {
    return this.docs.length === 0;
  }
}

// ─── Document reference ────────────────────────────────────────
class DocRef {
  constructor(private readonly table: string, readonly id: string) {}

  async get(): Promise<DocSnapshot> {
    const { data, error } = await supa()
      .from(this.table)
      .select('doc_id,data')
      .eq('doc_id', this.id)
      .maybeSingle();
    if (error) throw error;
    const row = data as Row | null;
    return new DocSnapshot(this.id, row ? row.data ?? {} : undefined);
  }

  async set(value: DocData, opts?: { merge?: boolean }): Promise<void> {
    let payload: DocData;
    if (opts?.merge) {
      const snap = await this.get();
      payload = applyMerge(snap.exists ? snap.data()! : {}, value);
    } else {
      payload = stripSentinels(value);
    }
    const { error } = await supa()
      .from(this.table)
      .upsert({ doc_id: this.id, data: payload }, { onConflict: 'doc_id' });
    if (error) throw error;
  }

  async delete(): Promise<void> {
    const { error } = await supa().from(this.table).delete().eq('doc_id', this.id);
    if (error) throw error;
  }
}

// ─── Query (chainable where / orderBy / limit) ─────────────────
type WhereOp = '==' | '>=' | '>' | '<=' | '<';
type Filter = { field: string; op: WhereOp; value: any };
type Order = { field: string; dir: 'asc' | 'desc' };

function compare(a: any, b: any): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = a == null ? '' : String(a);
  const bs = b == null ? '' : String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

class Query {
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private lim: number | null = null;
  constructor(protected readonly table: string) {}

  where(field: string, op: WhereOp, value: any): Query {
    this.filters.push({ field, op, value });
    return this;
  }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): Query {
    this.orders.push({ field, dir });
    return this;
  }
  limit(n: number): Query {
    this.lim = n;
    return this;
  }

  async get(): Promise<QuerySnapshot> {
    // PostgREST caps a response (1000 rows by default), so a table past that size
    // would silently return an arbitrary subset. Page until a short page arrives.
    const data: Row[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let q = supa().from(this.table).select('doc_id,data');
      // Push equality/range filters down to PostgREST (jsonb text operators).
      for (const f of this.filters) {
        const col = `data->>${f.field}`;
        const v = String(f.value);
        if (f.op === '==') q = q.eq(col, v);
        else if (f.op === '>=') q = q.gte(col, v);
        else if (f.op === '>') q = q.gt(col, v);
        else if (f.op === '<=') q = q.lte(col, v);
        else if (f.op === '<') q = q.lt(col, v);
      }
      const { data: page, error } = await q.order('doc_id').range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      data.push(...(page as Row[]));
      if (page.length < PAGE_SIZE) break;
    }
    let rows = data.map((r) => new DocSnapshot(r.doc_id, r.data ?? {}));

    // orderBy + limit applied in JS for exact numeric/string ordering.
    for (const o of [...this.orders].reverse()) {
      rows.sort((a, b) => {
        const c = compare(a.data()?.[o.field], b.data()?.[o.field]);
        return o.dir === 'desc' ? -c : c;
      });
    }
    if (this.lim != null) rows = rows.slice(0, this.lim);
    return new QuerySnapshot(rows);
  }
}

// ─── Collection reference ──────────────────────────────────────
class CollectionRef extends Query {
  doc(id: string): DocRef {
    return new DocRef(this.table, id);
  }

  async add(value: DocData): Promise<{ id: string }> {
    const id = genId();
    const { error } = await supa()
      .from(this.table)
      .insert({ doc_id: id, data: stripSentinels(value) });
    if (error) throw error;
    return { id };
  }

  // NOTE: `get()` is intentionally inherited from Query. where()/orderBy()/limit()
  // return `this`, so a chained query stays on this instance and must resolve to
  // Query.get() (which applies the filters). With no query methods, Query.get()
  // fetches the whole collection — same as a bare `collection().get()`.
}

// ─── Batch ─────────────────────────────────────────────────────
class WriteBatch {
  private ops: Array<() => Promise<void>> = [];
  set(ref: DocRef, value: DocData, opts?: { merge?: boolean }): WriteBatch {
    this.ops.push(() => ref.set(value, opts));
    return this;
  }
  async commit(): Promise<void> {
    // Small batches (a handful of docs) — run sequentially so a merge read for
    // one doc can't race a write to the same doc.
    for (const op of this.ops) await op();
  }
}

// ─── Firestore-compatible entrypoint ───────────────────────────
export const db = () => ({
  collection(name: string): CollectionRef {
    return new CollectionRef(name);
  },
  batch(): WriteBatch {
    return new WriteBatch();
  },
});

// ─── XP model + level maths (unchanged) ────────────────────────
export type XPEntry = {
  date: string;
  habit: string;
  xpGained: number;
  totalXP: number;
  level: number;
  createdAt: number;
  idempotencyKey?: string;
};

const XP_LEVEL_FACTOR = 60;

export function levelForXP(totalXP: number): number {
  return Math.floor(Math.sqrt(Math.max(0, totalXP) / XP_LEVEL_FACTOR));
}

export function xpForNextLevel(level: number): number {
  return Math.pow(level + 1, 2) * XP_LEVEL_FACTOR;
}

// ─── WHOOP types (unchanged) ───────────────────────────────────
export type WhoopWorkout = {
  id: string | number;
  sportId: number;
  start: string; // ISO
  end: string; // ISO
  durationMin: number;
  strain?: number;
  avgHr?: number;
  maxHr?: number;
  kilojoule?: number;
  distanceMeter?: number;
  altitudeGainMeter?: number;
  zonesMin?: { z0: number; z1: number; z2: number; z3: number; z4: number; z5: number };
};

export type WhoopSleepStages = {
  light: number; // minutes
  deep: number; // minutes (slow_wave)
  rem: number; // minutes
  awake: number; // minutes
};

export type WhoopDaily = {
  date: string;
  // Profile / body measurement
  bodyWeightKg?: number;
  heightMeter?: number;
  maxHeartRate?: number;
  // Recovery
  recovery?: number;
  hrv?: number;
  rhr?: number;
  spo2?: number; // %
  skinTempC?: number; // °C
  // Strain / Cycle
  strain?: number;
  avgHr?: number; // ø HF Tag
  maxHr?: number; // Max HF Tag
  kilojoule?: number; // verbrauchte Energie kJ
  steps?: number; // Schritte je WHOOP-Zyklus (Aufwachen bis Aufwachen)
  // Sleep
  sleepHours?: number;
  sleepPerformance?: number; // %
  sleepEfficiency?: number; // %
  sleepConsistency?: number; // %
  respiratoryRate?: number; // breaths/min
  sleepLatencyMin?: number;
  sleepStages?: WhoopSleepStages;
  disturbances?: number;
  sleepCycleCount?: number;
  // Workouts (today's)
  workouts?: WhoopWorkout[];
  updatedAt: number;
};

export type WhoopTokenDoc = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms
  scope?: string;
};

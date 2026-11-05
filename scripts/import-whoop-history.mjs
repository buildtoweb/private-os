// One-off (idempotent) import: manual WHOOP export CSVs + blood panels →
// self-hosted Supabase (private schema, doc_id/data jsonb — same shape as lib/db.ts).
//
// This is the STATIC / historical health data that powers the "Körperbefund"
// report, kept separate from the live `whoop_daily` table.
//
// Prereq: run scripts/health-schema.sql once in the Supabase Studio SQL editor.
// Run:    node --env-file=.env.local scripts/import-whoop-history.mjs
//
// Source files live (gitignored) in scripts/health-data/. Override the dir with
// HEALTH_DATA_DIR=/some/path.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.HEALTH_DATA_DIR || join(HERE, 'health-data');

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: 'private' }, auth: { persistSession: false, autoRefreshToken: false } },
);

// ─── CSV parser (RFC-4180-ish: quotes, embedded commas/newlines) ─────
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* ignore */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter((r) => r.length > 1 && r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const readCsv = (name) => parseCsv(readFileSync(join(DATA_DIR, name), 'utf8'));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; };
const dateOf = (ts) => (ts && ts.length >= 10 ? ts.slice(0, 10) : undefined);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

async function upsertChunked(table, records) {
  for (let i = 0; i < records.length; i += 200) {
    const chunk = records.slice(i, i + 200);
    const { error } = await supa.from(table).upsert(chunk, { onConflict: 'doc_id' });
    if (error) throw new Error(`${table} upsert failed: ${JSON.stringify(error)}`);
  }
  console.log(`  ${table.padEnd(16)} ← ${records.length} rows`);
}

// ─── Cycles (recovery / HRV / RHR / strain / skin temp / spo2) ───────
function buildCycles() {
  return readCsv('whoop_physiological_cycles.csv').map((r) => {
    const start = r['Cycle start time'];
    return {
      doc_id: start,
      data: clean({
        start, end: r['Cycle end time'], tz: r['Cycle timezone'], date: dateOf(start),
        recovery: num(r['Recovery score %']),
        rhr: num(r['Resting heart rate (bpm)']),
        hrv: num(r['Heart rate variability (ms)']),
        skinTempC: num(r['Skin temp (celsius)']),
        spo2: num(r['Blood oxygen %']),
        strain: num(r['Day Strain']),
        kilocalorie: num(r['Energy burned (cal)']),
        maxHr: num(r['Max HR (bpm)']),
        avgHr: num(r['Average HR (bpm)']),
        sleepPerformance: num(r['Sleep performance %']),
        respiratoryRate: num(r['Respiratory rate (rpm)']),
        asleepMin: num(r['Asleep duration (min)']),
        sleepConsistency: num(r['Sleep consistency %']),
        sleepEfficiency: num(r['Sleep efficiency %']),
      }),
    };
  }).filter((x) => x.doc_id);
}

// ─── Sleeps ──────────────────────────────────────────────────────────
function buildSleeps() {
  return readCsv('whoop_sleeps.csv').map((r) => {
    const onset = r['Sleep onset'];
    return {
      doc_id: onset,
      data: clean({
        onset, wake: r['Wake onset'], date: dateOf(r['Cycle start time'] || onset),
        nap: r['Nap'] === 'true',
        performance: num(r['Sleep performance %']),
        respiratoryRate: num(r['Respiratory rate (rpm)']),
        asleepMin: num(r['Asleep duration (min)']),
        inBedMin: num(r['In bed duration (min)']),
        lightMin: num(r['Light sleep duration (min)']),
        deepMin: num(r['Deep (SWS) duration (min)']),
        remMin: num(r['REM duration (min)']),
        awakeMin: num(r['Awake duration (min)']),
        efficiency: num(r['Sleep efficiency %']),
        consistency: num(r['Sleep consistency %']),
      }),
    };
  }).filter((x) => x.doc_id);
}

// ─── Workouts ────────────────────────────────────────────────────────
function buildWorkouts() {
  return readCsv('whoop_workouts.csv').map((r) => {
    const start = r['Workout start time'];
    return {
      doc_id: start,
      data: clean({
        start, end: r['Workout end time'], date: dateOf(r['Cycle start time'] || start),
        activity: r['Activity name'],
        durationMin: num(r['Duration (min)']),
        strain: num(r['Activity Strain']),
        kilocalorie: num(r['Energy burned (cal)']),
        maxHr: num(r['Max HR (bpm)']),
        avgHr: num(r['Average HR (bpm)']),
        z1: num(r['HR Zone 1 %']), z2: num(r['HR Zone 2 %']), z3: num(r['HR Zone 3 %']),
        z4: num(r['HR Zone 4 %']), z5: num(r['HR Zone 5 %']),
      }),
    };
  }).filter((x) => x.doc_id && x.data.activity);
}

// ─── Journal (collapse to one row per day) ───────────────────────────
function buildJournal() {
  const byDate = new Map();
  for (const r of readCsv('whoop_journal_entries.csv')) {
    const date = dateOf(r['Cycle start time']);
    if (!date) continue; // newest open cycle has no start — skip
    const q = r['Question text'];
    if (!q) continue;
    if (!byDate.has(date)) byDate.set(date, { date, answers: {}, notes: {} });
    const rec = byDate.get(date);
    rec.answers[q] = r['Answered yes'] === 'true';
    if (r['Notes']) rec.notes[q] = r['Notes'];
  }
  return [...byDate.values()].map((rec) => ({
    doc_id: rec.date,
    data: clean({ date: rec.date, answers: rec.answers, notes: Object.keys(rec.notes).length ? rec.notes : undefined }),
  }));
}

// ─── Blood panels + narrative ────────────────────────────────────────
function buildBlood() {
  const panels = JSON.parse(readFileSync(join(DATA_DIR, 'blood.json'), 'utf8'));
  // Blood panels keep doc_id = date (stable, overwrite in place). Allergy panels
  // share a date with a blood panel, so they get a distinct suffixed id.
  return panels.map((p) => ({ doc_id: p.kind === 'allergy' ? `${p.date}-allergy` : p.date, data: p }));
}
function buildNarrative() {
  const n = JSON.parse(readFileSync(join(DATA_DIR, 'narrative.json'), 'utf8'));
  return [{ doc_id: 'koerperbefund', data: { ...n, seededAt: new Date().toISOString() } }];
}

async function main() {
  console.log(`Importing from ${DATA_DIR} →`, process.env.SUPABASE_URL);
  await upsertChunked('whoop_cycles', buildCycles());
  await upsertChunked('whoop_sleeps', buildSleeps());
  await upsertChunked('whoop_workouts', buildWorkouts());
  await upsertChunked('whoop_journal', buildJournal());
  await upsertChunked('blood_tests', buildBlood());
  await upsertChunked('health_report', buildNarrative());
  console.log('Done.');
}

main().catch((e) => { console.error('\nImport failed:', e.message); process.exit(1); });

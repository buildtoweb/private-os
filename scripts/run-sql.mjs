// Run a .sql file against the self-hosted Supabase.
//
// Direct Postgres (5432) is firewalled and the Supavisor pooler (6543) needs a
// tenant id we don't have, so DDL goes through the Studio pg-meta SQL runner
// (same endpoint the dashboard's SQL editor uses), authed with the dashboard
// basic-auth creds. Runs as the `postgres` superuser.
//
// Usage:
//   SUPABASE_STUDIO_URL=https://… DASH_USER=admin DASH_PASS=… node scripts/run-sql.mjs scripts/health-schema.sql
import { readFileSync } from 'node:fs';

const BASE = process.env.SUPABASE_STUDIO_URL;
if (!BASE) { console.error('SUPABASE_STUDIO_URL fehlt'); process.exit(1); }
const AUTH = 'Basic ' + Buffer.from(`${process.env.DASH_USER}:${process.env.DASH_PASS}`).toString('base64');
const ENDPOINT = `${BASE}/api/platform/pg-meta/default/query`;

async function run(query) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text;
}

const file = process.argv[2];
if (!file) { console.error('usage: node scripts/run-sql.mjs <file.sql>'); process.exit(1); }
const sql = readFileSync(file, 'utf8');
console.log('Executing', file, `(${sql.length} chars)…`);
const result = await run(sql);
try {
  const rows = JSON.parse(result);
  console.log(`  → done. ${Array.isArray(rows) ? rows.length : 0} row(s) returned.`);
  if (Array.isArray(rows) && rows.length) console.log(JSON.stringify(rows.slice(0, 20), null, 2));
} catch {
  console.log('  → done.', result.slice(0, 200));
}

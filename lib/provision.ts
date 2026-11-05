// Creates a missing table so the app repairs itself instead of asking a human.
//
// Every table in this dashboard is provisioned by hand: `scripts/run-sql.mjs`
// against the Studio SQL runner, which needs the dashboard credentials and a
// network route to the Supabase host. Neither exists inside a deployed
// function, and neither exists in a cloud agent session. The result was a
// feature that shipped, looked finished, and failed on every write until someone
// sat down at a laptop with the right env vars — with the failure showing up as
// a button that simply sprang back.
//
// The deployment can do it itself. In a self-hosted Supabase, Kong routes /pg/
// to pg-meta and admits the `admin` ACL group, and the service key this app
// already holds is in that group. The same key that reads and writes rows can
// run this DDL.
//
// Deliberately narrow, and worth keeping that way:
//
//   * The statements below are the only ones that can ever be executed. They are
//     constants in this file — nothing is read from disk, nothing is assembled
//     from a request, and there is no endpoint that accepts SQL. A caller can
//     only pick one of the entries by table name.
//   * Every statement is `create … if not exists` plus a cache reload. Nothing
//     drops, alters, reads or returns data, so running one twice is a no-op and
//     running one at the wrong moment cannot lose anything.
//   * It is reached only from the error path, when Postgres has just said the
//     table is not there.
//
// Mirrors scripts/*-schema.sql, which stay as the copy a human runs by hand.
// Four lines each, `if not exists`, and they have not changed since they were
// written; if you edit one, edit both.

const DDL: Record<string, string> = {
  passage_log: `
    create schema if not exists private;
    create table if not exists private.passage_log (
      doc_id text primary key,
      data   jsonb not null default '{}'::jsonb
    );
    notify pgrst, 'reload schema';
  `,
  subscription_pushes: `
    create schema if not exists private;
    create table if not exists private.subscription_pushes (
      doc_id text primary key,
      data   jsonb not null default '{}'::jsonb
    );
    notify pgrst, 'reload schema';
  `,
  finance_alerts: `
    create schema if not exists private;
    create table if not exists private.finance_alerts (
      doc_id text primary key,
      data   jsonb not null default '{}'::jsonb
    );
    revoke all on table private.finance_alerts from public, anon, authenticated;
    grant select, insert, update, delete on table private.finance_alerts to service_role;
    notify pgrst, 'reload schema';
  `,
  push_subscriptions: `
    create schema if not exists private;
    create table if not exists private.push_subscriptions (
      doc_id text primary key,
      data   jsonb not null default '{}'::jsonb
    );
    revoke all on table private.push_subscriptions from public, anon, authenticated;
    grant select, insert, update, delete on table private.push_subscriptions to service_role;
    notify pgrst, 'reload schema';
  `,
  login_attempts: `
    create schema if not exists private;
    create table if not exists private.login_attempts (
      doc_id text primary key,
      data   jsonb not null default '{}'::jsonb
    );
    revoke all on table private.login_attempts from public, anon, authenticated;
    grant select, insert, update, delete on table private.login_attempts to service_role;
    notify pgrst, 'reload schema';
  `,
  calendar_feeds: `
    create schema if not exists private;
    create table if not exists private.calendar_feeds (
      doc_id text primary key,
      data   jsonb not null default '{}'::jsonb
    );
    revoke all on table private.calendar_feeds from public, anon, authenticated;
    grant select, insert, update, delete on table private.calendar_feeds to service_role;
    notify pgrst, 'reload schema';
  `,
};

// PostgREST answers from a cached picture of the schema, so a table it has not
// seen yet is reported as missing rather than as an error about privileges.
const MISSING_TABLE = /42P01|PGRST205|does not exist|schema cache/i;

export function isMissingTable(e: any): boolean {
  const code = e?.code ?? '';
  const message = e?.body?.message || e?.message || String(e ?? '');
  return MISSING_TABLE.test(`${code} ${message}`);
}

type Result = { ok: boolean; detail: string };

// One attempt per table per process. A table that cannot be created will not
// start succeeding because we ask again on the next request, and retrying every
// time would turn one broken feature into a stream of writes at the database.
const attempted = new Map<string, Promise<Result>>();

export function provisionTable(table: string): Promise<Result> {
  const pending = attempted.get(table);
  if (pending) return pending;
  const run = attempt(table);
  attempted.set(table, run);
  return run;
}

async function attempt(table: string): Promise<Result> {
  const ddl = Object.prototype.hasOwnProperty.call(DDL, table) ? DDL[table] : null;
  if (!ddl) return { ok: false, detail: `für ${table} ist kein Schema hinterlegt` };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, detail: 'SUPABASE_URL / SUPABASE_SECRET_KEY fehlen' };

  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/pg/query`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json',
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ query: ddl }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, detail: `pg-meta HTTP ${res.status}: ${text.slice(0, 200)}` };
    console.log(`[provision] private.${table} angelegt`);
    return { ok: true, detail: `private.${table} angelegt` };
  } catch (e: any) {
    return { ok: false, detail: `pg-meta nicht erreichbar: ${e?.message || e}` };
  }
}

/**
 * Runs a database operation, and if it failed only because its table does not
 * exist yet, creates the table and runs it once more.
 *
 * On a provisioning failure the ORIGINAL error is rethrown with the reason
 * attached — the caller asked to read or write a row, and "could not create the
 * table either" is context for that, not a replacement for it.
 */
export async function withTable<T>(table: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e: any) {
    if (!isMissingTable(e)) throw e;
    console.error(`[provision] private.${table} fehlt — lege sie an`);
    const result = await provisionTable(table);
    if (!result.ok) {
      console.error(`[provision] fehlgeschlagen: ${result.detail}`);
      throw Object.assign(e, { provision: result.detail });
    }
    return await run();
  }
}

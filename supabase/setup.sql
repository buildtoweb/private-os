-- Komplette Datenbank für dieses Dashboard. Einmal im Supabase SQL Editor
-- ausführen. Mehrfaches Ausführen schadet nicht und löscht keine Daten.
--
-- Sicherheit: Alle Daten sind privat. Nur die App greift darauf zu, und zwar
-- serverseitig mit dem Secret Key (Rolle service_role). Die Rollen anon und
-- authenticated bekommen hier bewusst KEINE Rechte. Die Supabase-Doku zu
-- eigenen Schemas empfiehlt GRANT ... TO anon, authenticated. Das hier nicht
-- übernehmen: Damit könnte jeder mit dem öffentlichen Key alles lesen.

create schema if not exists private;

-- Jede Tabelle speichert Dokumente: doc_id plus JSON (siehe lib/db.ts).
create table if not exists private.habits (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.goals (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.xp_log (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.login_attempts (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.whoop_daily (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.whoop_token (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.whoop_cycles (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.whoop_sleeps (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.whoop_workouts (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.whoop_journal (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.blood_tests (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.health_report (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_crypto (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_metals (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_cash (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_income (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_savings_plan (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_goals (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_price_cache (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_assets (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_transactions (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_value_history (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_portfolio_meta (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.finance_alerts (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.business_bridge (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.passage_log (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.subscription_pushes (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.push_subscriptions (doc_id text primary key, data jsonb not null default '{}'::jsonb);
create table if not exists private.calendar_feeds (doc_id text primary key, data jsonb not null default '{}'::jsonb);

-- Der Planer ist die einzige Tabelle mit echten Spalten.
create table if not exists private.todo_tasks (
  id uuid primary key,
  title text not null check (char_length(trim(title)) between 1 and 300),
  priority text not null default 'none' check (priority in ('high', 'medium', 'low', 'none')),
  scheduled_date date,
  slot text not null default 'anytime' check (slot in ('anytime', 'morning', 'afternoon', 'evening')),
  duration integer not null default 30 check (duration between 1 and 1440),
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  notes text not null default '',
  subtasks jsonb not null default '[]'::jsonb check (jsonb_typeof(subtasks) = 'array'),
  done boolean not null default false,
  completed_dates date[] not null default '{}'::date[],
  sort_order double precision not null default 0,
  emoji text not null default '✨',
  theme text not null default 'general' check (theme in ('work', 'finance', 'creative', 'health', 'home', 'learning', 'general')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  start_time text check (start_time is null or start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  reminder integer check (reminder is null or reminder between 0 and 1440),
  reminded_dates date[] not null default '{}'::date[]
);

create index if not exists todo_tasks_active_date_idx
  on private.todo_tasks (scheduled_date, slot, sort_order)
  where deleted_at is null;

-- Rechte: alles zu, nur service_role darf hinein.
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
alter default privileges in schema private revoke all on tables from public, anon, authenticated;
alter default privileges in schema private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema private revoke all on functions from public, anon, authenticated;

grant usage on schema private to service_role;
grant select, insert, update, delete on all tables in schema private to service_role;
alter default privileges in schema private grant select, insert, update, delete on tables to service_role;

-- Zweiter Riegel: Row Level Security ohne Policies sperrt alle außer service_role.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
  end loop;
end $$;

notify pgrst, 'reload schema';

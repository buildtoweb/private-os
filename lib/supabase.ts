// Server-side Supabase client for the self-hosted instance.
//
// All private-dashboard data lives in the `private` Postgres schema (one table
// per former Firestore collection, shape: `doc_id text pk, data jsonb`). We talk
// to it through PostgREST over HTTPS — the only port exposed by the VPS — using
// the service/secret key, so RLS is bypassed and this must NEVER run client-side.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Generic params are loosened because the client targets the non-default
// `private` schema (createClient would otherwise infer the `public` default).
let client: SupabaseClient<any, any, any> | null = null;

export function supa(): SupabaseClient<any, any, any> {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  // Prefer the modern secret key; fall back to the legacy service_role JWT.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env vars missing (SUPABASE_URL / SUPABASE_SECRET_KEY)');
  }
  client = createClient(url, key, {
    db: { schema: 'private' },
    auth: { persistSession: false, autoRefreshToken: false },
    // Next.js patches global fetch and caches GET requests in its Data Cache —
    // even inside `dynamic = 'force-dynamic'` route handlers. supabase-js reads
    // are GETs to PostgREST, so without this a stale snapshot can be served
    // indefinitely (e.g. the Health page's days=180 query returning week-old
    // WHOOP data). Force every PostgREST call to bypass the cache; this data is
    // tiny and always wants to be fresh.
    global: {
      fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  return client;
}

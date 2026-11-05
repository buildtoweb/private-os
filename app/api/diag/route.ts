import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Check = { name: string; ok: boolean; detail?: string };

async function describeNotionTarget(id: string) {
  const { notion } = await import('@/lib/notion');
  try {
    const page: any = await notion.pages.retrieve({ page_id: id });
    const titleProp = Object.values(page.properties || {}).find((p: any) => p.type === 'title') as any;
    const title = titleProp?.title?.map((t: any) => t.plain_text).join('') || page.id;
    let childDbHint = '';
    try {
      const children: any = await notion.blocks.children.list({ block_id: id, page_size: 100 });
      const childDbs = (children.results || [])
        .filter((b: any) => b.type === 'child_database')
        .map((b: any) => `${b.child_database?.title || 'Datenbank'} (${b.id})`);
      if (childDbs.length) childDbHint = ` Gefundene Datenbanken auf dieser Seite: ${childDbs.join(', ')}`;
    } catch {}
    return `Die ID zeigt auf eine Notion-Seite "${title}", nicht auf eine Datenbank.${childDbHint}`;
  } catch {
    return undefined;
  }
}

async function checkNotion(): Promise<Check[]> {
  const checks: Check[] = [];
  const token = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
  const reflectDb = process.env.NOTION_REFLECT_DB_ID || process.env.NOTION_REFLECT_DB;
  // Habits + Goals now live in Supabase (private schema); Notion is only used
  // for reflection entries.
  checks.push({ name: 'NOTION_TOKEN gesetzt', ok: !!token });
  checks.push({ name: 'NOTION_REFLECT_DB_ID gesetzt', ok: !!reflectDb });
  if (!token) return checks;

  if (reflectDb) {
    try {
      const { notion } = await import('@/lib/notion');
      await notion.databases.retrieve({ database_id: reflectDb });
      checks.push({ name: 'Reflect-DB erreichbar', ok: true });
    } catch (e: any) {
      const target = await describeNotionTarget(reflectDb).catch(() => undefined);
      checks.push({
        name: 'Reflect-DB erreichbar',
        ok: false,
        detail: target || e?.body?.message || e?.message || String(e),
      });
    }
  }
  return checks;
}

async function checkSupabase(): Promise<Check[]> {
  const checks: Check[] = [];
  const ok = !!process.env.SUPABASE_URL && (!!process.env.SUPABASE_SECRET_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  checks.push({ name: 'Supabase-ENV vollständig', ok });
  if (!ok) return checks;
  try {
    const { supa } = await import('@/lib/supabase');
    const { error } = await supa().from('whoop_daily').select('doc_id').limit(1);
    if (error) throw error;
    checks.push({ name: 'Supabase (private) erreichbar', ok: true });
    for (const table of ['habits', 'goals'] as const) {
      const { error: tErr } = await supa().from(table).select('doc_id').limit(1);
      checks.push({
        name: `Supabase ${table} erreichbar`,
        ok: !tErr,
        detail: tErr?.message,
      });
    }
  } catch (e: any) {
    checks.push({ name: 'Supabase (private) erreichbar', ok: false, detail: e?.message || String(e) });
  }
  return checks;
}

async function checkWhoop(): Promise<Check[]> {
  const checks: Check[] = [];
  checks.push({ name: 'WHOOP_CLIENT_ID gesetzt', ok: !!process.env.WHOOP_CLIENT_ID });
  checks.push({ name: 'WHOOP_CLIENT_SECRET gesetzt', ok: !!process.env.WHOOP_CLIENT_SECRET });
  checks.push({ name: 'WHOOP_REDIRECT_URI gesetzt', ok: !!process.env.WHOOP_REDIRECT_URI });
  if (!process.env.SUPABASE_URL) {
    checks.push({ name: 'WHOOP-Token in Supabase', ok: false, detail: 'Supabase nicht konfiguriert' });
    return checks;
  }
  try {
    const { getValidAccessToken, loadToken } = await import('@/lib/whoop');
    const t = await loadToken();
    checks.push({
      name: 'WHOOP-Token in Supabase',
      ok: !!t,
      detail: t ? `expires_at=${new Date(t.expires_at).toISOString()}` : 'Noch nicht verbunden — /api/whoop/auth aufrufen',
    });
    if (t) {
      await getValidAccessToken();
      checks.push({ name: 'WHOOP-Token refreshbar', ok: true });
    }
  } catch (e: any) {
    checks.push({ name: 'WHOOP-Token refreshbar', ok: false, detail: e?.message || String(e) });
  }
  return checks;
}

export async function GET() {
  const [notionChecks, supabaseChecks, whoopChecks] = await Promise.all([
    checkNotion().catch(e => [{ name: 'Notion', ok: false, detail: String(e) }] as Check[]),
    checkSupabase().catch(e => [{ name: 'Supabase', ok: false, detail: String(e) }] as Check[]),
    checkWhoop().catch(e => [{ name: 'WHOOP', ok: false, detail: String(e) }] as Check[]),
  ]);
  const env = {
    DASHBOARD_PIN: !!process.env.DASHBOARD_PIN,
    SESSION_SECRET: !!process.env.SESSION_SECRET,
    HEALTH_SYNC_TOKEN: !!process.env.HEALTH_SYNC_TOKEN,
    WHOOP_WEBHOOK_SECRET: !!process.env.WHOOP_WEBHOOK_SECRET,
  };
  return NextResponse.json({
    ok: [...notionChecks, ...supabaseChecks, ...whoopChecks].every(c => c.ok),
    env,
    notion: notionChecks,
    supabase: supabaseChecks,
    whoop: whoopChecks,
  });
}

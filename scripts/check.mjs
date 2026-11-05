// npm run check: prüft die Einrichtung und sagt bei jedem Fehler, was zu tun ist.
// Liest und schreibt keine Nutzdaten und gibt keine Geheimnisse aus.
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

let failed = false;
const ok = (text) => console.log(`  OK      ${text}`);
const off = (text) => console.log(`  AUS     ${text}`);
const bad = (text, fix) => {
  failed = true;
  console.log(`  FEHLER  ${text}\n          -> ${fix}`);
};

console.log('\nGrundlagen');
const major = Number(process.versions.node.split('.')[0]);
if (major >= 22) ok(`Node.js ${process.versions.node}`);
else bad(`Node.js ${process.versions.node} ist zu alt`, 'Node.js 22 oder neuer von https://nodejs.org installieren');

if (!existsSync('.env.local')) {
  bad('.env.local fehlt', 'npm run setup ausführen');
  process.exit(1);
}
process.loadEnvFile('.env.local');
const env = process.env;

for (const [key, fix] of [
  ['DASHBOARD_PIN', 'in .env.local eine Zahl mit 6 Stellen eintragen'],
  ['SESSION_SECRET', '.env.local löschen und npm run setup erneut ausführen'],
  ['CRON_SECRET', '.env.local löschen und npm run setup erneut ausführen'],
  ['SUPABASE_URL', 'SETUP.md, Schritt 2'],
]) {
  if (env[key]) ok(key);
  else bad(`${key} fehlt`, fix);
}
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (key) ok('SUPABASE_SECRET_KEY');
else bad('SUPABASE_SECRET_KEY fehlt', 'SETUP.md, Schritt 2');
if (key?.startsWith('sb_publishable_')) {
  bad('Das ist der Publishable Key', 'den Secret Key (beginnt mit sb_secret_) verwenden');
}

console.log('\nDatenbank');
if (env.SUPABASE_URL && key) {
  const tables = [...readFileSync('supabase/setup.sql', 'utf8').matchAll(/create table if not exists private\.(\w+)/g)].map((m) => m[1]);
  const client = createClient(env.SUPABASE_URL, key, {
    db: { schema: 'private' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const missing = [];
  let stop = false;
  for (const table of tables) {
    const column = table === 'todo_tasks' ? 'id' : 'doc_id';
    const { error, status } = await client.from(table).select(column).limit(1);
    if (!error) continue;
    const text = `${error.code ?? ''} ${error.message ?? ''}`;
    if (/PGRST106|Invalid schema|schema must be one of/i.test(text)) {
      bad('Das Schema "private" ist nicht freigegeben', 'SETUP.md, Schritt 3: bei "Exposed schemas" private hinzufügen');
      stop = true;
    } else if (status === 401 || /invalid api key|jwt/i.test(text)) {
      bad('Supabase lehnt den Key ab', 'SUPABASE_SECRET_KEY prüfen, er beginnt mit sb_secret_');
      stop = true;
    } else if (/42501|permission denied/i.test(text)) {
      bad('Keine Berechtigung auf den Tabellen', 'den Secret Key verwenden und supabase/setup.sql erneut ausführen');
      stop = true;
    } else if (/42P01|PGRST205|does not exist|schema cache/i.test(text)) {
      missing.push(table);
      continue;
    } else {
      bad(`Keine Verbindung zu Supabase (${error.message || status})`, 'SUPABASE_URL prüfen, sie sieht so aus: https://abc123.supabase.co');
      stop = true;
    }
    if (stop) break;
  }
  if (missing.length) {
    bad(`${missing.length} von ${tables.length} Tabellen fehlen`, 'SETUP.md, Schritt 3: supabase/setup.sql im SQL Editor ausführen');
  } else if (!stop) {
    ok(`alle ${tables.length} Tabellen erreichbar`);
  }
} else {
  off('übersprungen, weil Zugangsdaten fehlen');
}

console.log('\nOptionale Funktionen');
const optional = [
  ['WHOOP', ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET', 'WHOOP_REDIRECT_URI']],
  ['Notion-Reflexionen', ['NOTION_TOKEN', 'NOTION_REFLECT_DB_ID']],
  ['Notion-Abonnements', ['NOTION_TOKEN', 'NOTION_ABO_DB_ID']],
  ['KI-Einblicke im Finanz-Tab', ['GEMINI_API_KEY']],
  ['Push-Nachrichten', ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']],
];
for (const [name, keys] of optional) {
  const missing = keys.filter((k) => !env[k]);
  if (!missing.length) ok(name);
  else off(`${name} (fehlt: ${missing.join(', ')})`);
}

console.log(failed ? '\nNoch nicht fertig. Behebe die Fehler oben und starte npm run check erneut.\n' : '\nAlles bereit. Starten mit: npm run dev\n');
process.exit(failed ? 1 : 0);

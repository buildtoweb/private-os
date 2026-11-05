// npm run setup: legt .env.local an und erzeugt alle Geheimnisse.
// Überschreibt nie eine vorhandene Datei. Danach fehlen nur noch die zwei
// Supabase-Werte, siehe SETUP.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, randomInt } from 'node:crypto';
import webpush from 'web-push';

const FILE = '.env.local';
if (existsSync(FILE)) {
  console.log(`${FILE} gibt es schon, es wurde nichts geändert.\nWeiter mit: npm run check`);
  process.exit(0);
}

const secret = () => randomBytes(32).toString('base64url');
const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
const vapid = webpush.generateVAPIDKeys();

const values = {
  DASHBOARD_PIN: pin,
  SESSION_SECRET: secret(),
  CREDENTIALS_KEY: secret(),
  CRON_SECRET: secret(),
  AGENT_API_TOKEN: secret(),
  MCP_OAUTH_SECRET: secret(),
  HEALTH_SYNC_TOKEN: secret(),
  NOTIFY_WEBHOOK_SECRET: secret(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: 'mailto:admin@example.com',
};

let text = readFileSync('.env.example', 'utf8');
for (const [key, value] of Object.entries(values)) {
  text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
}
writeFileSync(FILE, text, { mode: 0o600 });

console.log(`${FILE} ist angelegt.

Dein Login-PIN: ${pin}
Du kannst ihn in ${FILE} bei DASHBOARD_PIN ändern.

Trage jetzt SUPABASE_URL und SUPABASE_SECRET_KEY in ${FILE} ein (SETUP.md, Schritt 2).
Danach prüfen mit: npm run check`);

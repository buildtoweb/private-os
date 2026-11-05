# PWA, iOS Push und App-Badges

Das Dashboard ist als `standalone` PWA konfiguriert. Auf iPhone/iPad wird es ohne
App Store und ohne Apple Developer Account über **Teilen → Zum Home-Bildschirm**
installiert. Desktop- und normale Browser-Nutzung bleiben unverändert.

## Einmaliges Setup

1. Die Push-Tabelle wird beim ersten Aktivieren von Benachrichtigungen sicher
   und idempotent über den bestehenden Supabase-Service-Key angelegt. Falls das
   automatische Provisioning einmal nicht verfügbar ist, bleibt der manuelle
   Fallback:

   ```bash
   DASH_USER=… DASH_PASS=… node scripts/run-sql.mjs scripts/push-subscriptions-schema.sql
   ```

2. Ein VAPID-Schlüsselpaar erzeugen (einmalig, anschließend sicher verwahren):

   ```bash
   npx web-push generate-vapid-keys
   ```

3. In Vercel für Production (und bei Bedarf Preview) exakt diese Variablen setzen:

   ```dotenv
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<Public Key aus Schritt 2>
   VAPID_PRIVATE_KEY=<Private Key aus Schritt 2>
   VAPID_SUBJECT=mailto:<verantwortliche E-Mail-Adresse>
   ```

   `VAPID_PRIVATE_KEY` bleibt ausschließlich auf dem Server. Der öffentliche Key
   darf und muss im Browser verfügbar sein. Die bereits vorhandenen Variablen
   `SUPABASE_URL` und `SUPABASE_SECRET_KEY` (alternativ
   `SUPABASE_SERVICE_ROLE_KEY`) werden weiterhin serverseitig verwendet.

4. Neu deployen. Bereits eingerichtete Push-Abonnements bleiben aktiv. Die frühere
   Settings-Oberfläche zum manuellen Aktivieren und Testen wurde entfernt; neue
   Abonnements benötigen daher wieder einen eigenen, bewusst ausgelösten
   Berechtigungsdialog, bevor Push-Nachrichten empfangen werden können.

## Push aus Backend-Ereignissen senden

Serverseitige Jobs oder Route Handler importieren `sendDashboardPush` aus
`lib/push.ts`:

```ts
await sendDashboardPush({
  title: '3 offene Tasks',
  body: 'Ein Task ist heute fällig.',
  url: '/ziele',
  tag: 'tasks-due',
  badgeCount: 3,
});
```

Die Route muss mit `/` beginnen. Notification-Klicks öffnen diese Route innerhalb
der App. Abgelaufene Subscriptions (HTTP 404/410 vom Push-Dienst) werden
automatisch entfernt.

## Sinnvolle Benachrichtigungen

- wenige, handlungsrelevante Hinweise: heute fällige Tasks oder überfällige Ziele;
- fehlgeschlagene WHOOP-/Health-Synchronisation statt jeder erfolgreichen Sync;
- wichtige Finanzereignisse, etwa ein selbst gewählter Schwellenwert;
- bevorstehende größere Abonnementzahlungen;
- neue Leads nur dann, wenn eine zeitnahe Reaktion sinnvoll ist.

Routinewerte, jede Habit-Aktion und häufige „Alles okay“-Meldungen sollten keine
Push-Nachricht erzeugen. Für Sammelzustände eignet sich ein Badge besser.

## Cache- und Datenschutzverhalten

Der Service Worker cached nur Fonts, Icons, versionierte Next.js-Assets und eine
neutrale Offline-Seite. Navigationen und `/api/*` werden nie gespeichert. Damit
werden keine Auth-Cookies, Tokens oder sensiblen Dashboard-Antworten als
vermeintlich aktuelle Offline-Daten angezeigt. Push-Endpoints und Schlüssel liegen
nur in `private.push_subscriptions`; Browserrollen erhalten keine Tabellenrechte.

Die Badge-Utility `lib/badge.ts` stellt `setAppBadge(count)`, `clearAppBadge()` und
`supportsAppBadge()` bereit. Auf nicht unterstützten Geräten bleiben alle Aufrufe
fehlerfrei und liefern `false` zurück.

# Einrichtung

Diese Anleitung setzt keine Programmierkenntnisse voraus. Du bekommst am Ende dein eigenes Dashboard im Internet, geschützt mit einem PIN. Die Grundeinrichtung kostet nichts.

Du kannst diese Anleitung auch Claude Code geben: Ordner öffnen und schreiben „Richte dieses Projekt für mich ein."

## Das baust du

| Dienst | Aufgabe |
|---|---|
| GitHub | Speichert deine Kopie des Codes |
| Supabase | Die Datenbank mit deinen Daten |
| Vercel | Macht das Dashboard im Internet erreichbar |

## Schritt 1: Code holen

Du brauchst [Node.js](https://nodejs.org) ab Version 22 und [Git](https://git-scm.com).

1. Klicke oben auf dieser GitHub-Seite auf **Fork** und dann auf **Create fork**.
2. Öffne das Terminal und lade deine Kopie herunter. Ersetze `DEIN-NAME` durch deinen GitHub-Namen:

```bash
git clone https://github.com/DEIN-NAME/private-os.git
```

```bash
cd private-os
```

3. Installiere alles und erzeuge deine Geheimnisse:

```bash
npm install
```

```bash
npm run setup
```

**Notiere dir den PIN, der jetzt angezeigt wird.** Du findest ihn später auch in der neuen Datei `.env.local`. Diese Datei enthält deine Schlüssel und wird nie hochgeladen.

## Schritt 2: Datenbank anlegen

1. Erstelle ein kostenloses Konto auf [supabase.com](https://supabase.com).
2. Klicke auf **New project**. Wähle einen Namen, ein starkes Datenbank-Passwort und die Region **Central EU (Frankfurt)**.
3. Warte, bis das Projekt fertig ist. Das dauert ein bis zwei Minuten.
4. Öffne **Project Settings** und dann **API Keys**. Kopiere den **Secret Key**, er beginnt mit `sb_secret_`.
5. Öffne die Projekt-URL unter **Project Settings** → **Data API**. Sie sieht so aus: `https://abc123.supabase.co`.
6. Öffne `.env.local` in einem Texteditor und trage beide Werte ein:

```
SUPABASE_URL=https://abc123.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

Die Namen der Menüpunkte ändern sich bei Supabase gelegentlich. Wenn du etwas nicht findest, suche in den Einstellungen nach „API".

## Schritt 3: Tabellen erstellen

1. Öffne in Supabase links den **SQL Editor**.
2. Öffne die Datei `supabase/setup.sql` aus deinem Ordner, kopiere den gesamten Inhalt und füge ihn im SQL Editor ein.
3. Klicke auf **Run**. Es erscheint „Success".
4. Gehe zu **Project Settings** → **Data API**. Trage bei **Exposed schemas** zusätzlich `private` ein und speichere.

Führe auf keinen Fall die GRANT-Befehle aus der Supabase-Doku zu eigenen Schemas aus. Sonst könnte jeder mit dem öffentlichen Key deine Daten lesen.

Prüfe jetzt alles:

```bash
npm run check
```

Bei einem Fehler steht direkt darunter, was zu tun ist. Wenn die Prüfung durchläuft, starte das Dashboard:

```bash
npm run dev
```

Öffne <http://localhost:3000> und melde dich mit deinem PIN an.

## Schritt 4: Online stellen

1. Erstelle ein Konto auf [vercel.com](https://vercel.com) und melde dich mit GitHub an.
2. Klicke auf **Add New** → **Project** und wähle dein Repository aus. Klicke noch **nicht** auf Deploy.
3. Klappe **Environment Variables** auf. Kopiere den gesamten Inhalt von `.env.local` und füge ihn in das erste Feld ein. Vercel übernimmt alle Einträge.
4. Klicke auf **Deploy**.

Danach hast du eine Adresse wie `https://dein-projekt.vercel.app`. Vercel aktualisiert die Seite von jetzt an bei jeder Änderung in deinem Repository.

Auf dem Handy kannst du das Dashboard wie eine App installieren, siehe [docs/pwa.md](docs/pwa.md).

**Die Grundeinrichtung ist damit fertig.** Alles Weitere ist optional.

## Optional: WHOOP

1. Erstelle auf [developer.whoop.com](https://developer.whoop.com) eine App.
2. Trage als Redirect URL `https://DEINE-ADRESSE/api/whoop/callback` ein.
3. Trage als Webhook URL `https://DEINE-ADRESSE/api/whoop/webhook` ein.
4. Wähle die Scopes `read:recovery`, `read:sleep`, `read:workout`, `read:profile`, `read:body_measurement` und `offline`.
5. Trage `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` und `WHOOP_REDIRECT_URI` in Vercel unter **Settings** → **Environment Variables** ein und deploye neu.
6. Melde dich am Dashboard an und öffne `https://DEINE-ADRESSE/api/whoop/auth`.

Wenn die Daten irgendwann stehen bleiben, öffne diese Adresse einfach noch einmal.

## Optional: Apple Health

Erstelle einen iOS-Kurzbefehl, der täglich diese Anfrage sendet:

- URL: `https://DEINE-ADRESSE/api/health-sync`
- Methode: `POST`, Inhalt als JSON

```json
{ "token": "DEIN_HEALTH_SYNC_TOKEN", "date": "2026-01-31", "schritte": 8000, "gewicht": 75, "aktiveKalorien": 500 }
```

Den Token findest du in `.env.local` bei `HEALTH_SYNC_TOKEN`.

## Optional: Notion

Erstelle unter [notion.so/my-integrations](https://www.notion.so/my-integrations) eine Integration und trage ihren Token als `NOTION_TOKEN` ein. Teile danach jede Datenbank mit dieser Integration. Die Datenbank-ID ist die lange Zeichenfolge in ihrer Adresse.

**Reflexionen** (`NOTION_REFLECT_DB_ID`) braucht diese Spalten:

| Spalte | Typ |
|---|---|
| Name | Titel |
| Datum | Datum |
| Typ | Auswahl: Tag, Woche, Monat |
| Periode | Text |

**Abonnements** (`NOTION_ABO_DB_ID`) braucht diese Spalten:

| Spalte | Typ |
|---|---|
| Service | Titel |
| Kosten | Zahl |
| Intervall | Auswahl: Monatlich, Quartalsweise, Jährlich |
| Status | Status: Aktiv, Inaktiv, Probeabo |
| Kategorie | Auswahl |
| Verlängerung | Datum |

## Optional: KI

- **KI-Einblicke im Finanz-Tab:** Erstelle einen Key in [Google AI Studio](https://aistudio.google.com) und trage ihn als `GEMINI_API_KEY` ein.
- **Claude oder ChatGPT verbinden:** siehe [MCP_SERVER.md](MCP_SERVER.md).

## Anpassen

Diese Dinge sind im Code festgelegt. Am einfachsten bittest du Claude Code darum, zum Beispiel: „Ersetze meine Gewohnheiten durch Laufen und Lesen."

| Was | Wo |
|---|---|
| Gewohnheiten | `lib/habits.ts`, Beschriftungen auch in `lib/notion.ts`, `components/XPBar.tsx`, `components/HabitIcon.tsx` |
| Morgenroutine | `components/MorningRoutine.tsx` |
| Tagestext | `lib/passages/`, nur Texte verwenden, die du nutzen darfst |
| Zeitzone | `APP_TIMEZONE` in `lib/date.ts`, dazu `lib/goals.ts` und `lib/todo/schedule.ts` |

Die Finanzen rechnen in Euro.

## Wenn etwas nicht geht

| Problem | Lösung |
|---|---|
| Irgendetwas stimmt nicht | `npm run check` ausführen |
| Login meldet „noch nicht eingerichtet" | `DASHBOARD_PIN` oder `SESSION_SECRET` fehlt |
| Login meldet „Zu viele Versuche" | 15 Minuten warten |
| Online geht es nicht, lokal schon | Fehlen die Werte in Vercel? Nach jeder Änderung neu deployen |
| Finanzen oder Heute zeigen Fehler | Wurde `supabase/setup.sql` ausgeführt und `private` freigegeben? |
| Eine Seite zeigt keine Daten | Die Quelle ist optional und noch nicht verbunden |

## Updates holen

Klicke auf GitHub in deinem Fork auf **Sync fork**. Vercel aktualisiert danach automatisch. Führe nach Updates `supabase/setup.sql` erneut aus, das ist gefahrlos.

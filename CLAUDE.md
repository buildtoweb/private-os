@AGENTS.md

# Private OS

Persönliches Dashboard: Next.js auf Vercel, Daten in Supabase. Ein Nutzer, Login per PIN.

## Wenn der Nutzer das Projekt einrichten will

Führe ihn durch [SETUP.md](SETUP.md). Er ist vermutlich kein Entwickler, also erkläre jeden Klick in einfachen Worten.

1. Prüfe zuerst den Stand mit `npm install` und `npm run setup`. `npm run setup` überschreibt nichts.
2. Sprich danach SETUP.md Schritt für Schritt durch. Konten bei Supabase, Vercel und GitHub legt der Nutzer selbst an. Passwörter gibt er selbst ein.
3. Nach jedem Schritt: `npm run check`. Das Skript nennt für jeden Fehler die Lösung.
4. Lass den Nutzer Keys selbst in `.env.local` eintragen. Bitte ihn nicht, Secrets in den Chat zu kopieren.
5. Optionale Funktionen wie WHOOP oder Notion richtest du nur ein, wenn der Nutzer sie will. Die App läuft auch ohne.

## Regeln

- `.env.local` niemals committen, ausgeben oder in den Chat kopieren.
- Nie `GRANT ... TO anon` oder `authenticated` auf das Schema `private` setzen, auch wenn die Supabase-Doku das für eigene Schemas zeigt. Nur `service_role` hat Zugriff.
- Der Supabase-Client läuft nur auf dem Server. Der Secret Key darf nie in Client-Code oder eine `NEXT_PUBLIC_`-Variable.
- Neue Tabelle: in `supabase/setup.sql` ergänzen, Konstante in `lib/db.ts` anlegen.
- Oberflächentexte sind Deutsch. Für das Design gilt [STYLE.md](STYLE.md).

## Aufbau

| Ort | Inhalt |
|---|---|
| `app/` | Seiten und API-Routen |
| `components/` | Oberfläche |
| `lib/` | Logik je Bereich, `lib/db.ts` ist die Datenschicht |
| `proxy.ts` | Schützt alle Seiten mit dem PIN-Login |
| `supabase/setup.sql` | Komplette Datenbank |
| `lib/habits.ts` | Die Gewohnheiten, sie sind im Code definiert |

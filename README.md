# Private OS

Ein persönliches Dashboard für Gewohnheiten, Gesundheit, Planung, Reflexion und Finanzen. Jeder betreibt seine eigene Kopie mit eigener Datenbank, deine Daten bleiben also bei dir.

## Was drin ist

| Bereich | Funktion | Braucht |
|---|---|---|
| Heute | Tagesüberblick, Stimmung, Morgenroutine, Tagestext | nur die Grundeinrichtung |
| Gewohnheiten | Abhaken, Serien, XP und Level | nur die Grundeinrichtung |
| Ziele und Planer | Ziele, To-dos, Erinnerungen, Kalender lesen | nur die Grundeinrichtung |
| Finanzen | Depot, Krypto, Metalle, Bargeld, Kursalarme | nur die Grundeinrichtung, KI-Einblicke brauchen Gemini |
| Gesundheit | Erholung, Schlaf, Belastung, Trends | WHOOP oder Apple Health |
| Reflexion | Tages-, Wochen- und Monatsrückblicke | Notion |
| Abonnements | Fixkosten und Erinnerungen | Notion |
| KI-Zugriff | Claude oder ChatGPT lesen und pflegen deine Daten | optional, siehe [MCP_SERVER.md](MCP_SERVER.md) |

## Einrichten

Du brauchst etwa 30 Minuten und kostenlose Konten bei GitHub, Supabase und Vercel.

Die Anleitung für Einsteiger steht in **[SETUP.md](SETUP.md)**.

Oder lass dich von Claude Code führen. Öffne den Ordner und schreibe:

> Richte dieses Projekt für mich ein.

Kurzfassung für Entwickler:

```bash
npm install
npm run setup
```

Dann `supabase/setup.sql` ausführen, das Schema `private` freigeben, die Werte in `.env.local` eintragen und prüfen:

```bash
npm run check
```

```bash
npm run dev
```

## Technik

Next.js, React, Tailwind, Supabase (Postgres), Vercel (Hosting, Cron, Workflow).

| Datei | Inhalt |
|---|---|
| [SETUP.md](SETUP.md) | Einrichtung und Anpassung |
| [CLAUDE.md](CLAUDE.md) | Regeln für KI-Assistenten |
| [STYLE.md](STYLE.md) | Design-System |
| [AGENT_API.md](AGENT_API.md) | API für KI-Agenten |
| [MCP_SERVER.md](MCP_SERVER.md) | Connector für Claude und ChatGPT |
| [docs/pwa.md](docs/pwa.md) | Installation als App auf dem Handy |

## Lizenz

[MIT](LICENSE). Die Schriften Inter und JetBrains Mono stehen unter der SIL Open Font License, siehe `public/fonts/`.

## Sicherheit

Deine Daten liegen in deiner eigenen Datenbank und nie im Repository. Ein Fork eines öffentlichen Repositorys ist immer öffentlich, trage deshalb nie Zugangsdaten oder persönliche Inhalte in den Code ein. Veröffentliche nie deine `.env.local` und wähle einen PIN, den niemand errät.

# Design System — Tactile

Dieses Dokument definiert die Designprinzipien und wiederverwendbaren Muster des
Dashboards. Alle KI-generierten UI-Änderungen sollen sich daran orientieren.

Die Richtung heißt **Tactile** („App statt Seite"), ausgewählt am 2026-08-08 aus
drei Entwürfen. Sie ersetzt das vorherige Glasmorphismus-System vollständig.

> **Quelle der Wahrheit ist `app/globals.css`.** Die Farbwerte stehen zusätzlich
> als Literale in `tailwind.config.ts`, weil Tailwind echte Werte braucht, um
> Opacity-Varianten wie `text-secondary/70` zu erzeugen. Ändert sich ein Token,
> muss es an **beiden** Stellen geändert werden.

---

## Grundprinzipien

- **Physisch, nicht flach.** Tiefe entsteht aus Licht und Schatten — nie aus
  Transparenz. Es gibt **kein** `backdrop-filter`, **kein** `blur`, keine
  halbtransparenten Flächen. Jede Oberfläche ist deckend.
- **Kein Rahmen, sondern eine Kante.** Flächen tragen `box-shadow` plus eine
  helle Oberkante (`--lip`), keinen `border`. Wo eine farbige Umrandung nötig
  ist (Hinweiskarten), wird sie als `inset 0 0 0 1px` im Schatten-Stack gezeichnet.
- **Keine Emojis in der UI** — Emojis gehören in Inhalte (Nutzertexte, Notizen),
  nicht in Labels, Buttons oder UI-Chrome.
- **Keine Regenbogenfarben** — es gibt genau vier Akzente mit fester Bedeutung.
  Nicht jedes Label bekommt eine eigene Farbe.
- **Satzschreibung, keine Versalien.** Keine `uppercase`-Mikrolabels und kein
  weites `letter-spacing` — das gehörte zur verworfenen Richtung A.
- **Große Trefferflächen.** Das Dashboard wird primär am iPhone bedient:
  Buttons und Zeilen mindestens 44px hoch.
- **Konsistenz über Kreativität** — neue Komponenten verwenden die definierten
  Token und Klassen statt eigener Inline-Styles.

---

## Farbpalette

### Flächen — fünf deckende Stufen, hellste liegt vorn

```
--bg        #141315   Seitenhintergrund
--bg-2      #191719   Vertiefungen (Wells): Inputs, Tracks, Segmented Controls
--surface   #211f22   Karten / Sheets
--surface-2 #2a272b   Zeilen, Chips, Buttons auf einer Karte
--raised    #322e33   Aktiver/erledigter Zustand, Segmented-Pill
```

### Schrift — drei Stufen, nicht mehr

```
--fg        #f5f2f0                    primär
--fg-2      rgba(245,242,240,0.60)     sekundär   (text-secondary)
--fg-3      rgba(245,242,240,0.34)     gedimmt    (text-muted, .label)
--hairline  rgba(255,255,255,0.055)    Trennlinien (border-border)
```

### Akzente — genau vier, jeder mit fester Bedeutung

```
--sage   #7ba888   Fortschritt, Positiv, aktiver Navigationszustand   (--success)
--amber  #e8a33d   Aufmerksamkeit, „in Arbeit"                        (--warning)
--clay   #c97b5a   Belastung, Fehler, Destruktives                    (--error)
--slate  #7d93b0   neutrale Daten (Schlaf, Aktien, Karten-Geometrie)  (--info)
```

`--sage-2 #9dc4a8` ist die hellere Sage für Verläufe und Text auf dunklem Grund.

**Regeln:**
- Im Code die **semantischen** Namen verwenden (`var(--success)`), nicht den
  Farbton (`var(--sage)`) — außer die Bedeutung ist tatsächlich „diese Farbe".
- Es wird **kein fünfter Akzent** eingeführt. Braucht eine Kategorie eine
  eigene Farbe (Anlageklassen, Habit-Kategorien), wird aus diesen vier gewählt.
- Sage ist für Fortschritt und Positives reserviert. Ein Segmented Control ist
  weder das eine noch das andere — dessen aktiver Zustand ist `--raised`.
- 0 % ist **kein** Fehler. Ein leerer Fortschritt ist neutral (`--fg-3`), nicht clay.

### Elevation

```
--shadow-1  Karten, Zeilen, Buttons
--shadow-2  gehobene/aktive Flächen, Popovers, die Desktop-Rail
--shadow-3  Modals
--lip       inset 0 1px 0 rgba(255,255,255,0.055)  — die beleuchtete Oberkante
--well      inset 0 1px 3px rgba(0,0,0,0.50)       — die Vertiefung
```

Eine Fläche trägt entweder `--shadow-n, --lip` (sie liegt oben) oder `--well`
(sie liegt darunter). Nie beides.

---

## Typografie-Skala

| Klasse / Verwendung        | Größe    | Gewicht | Farbe    |
|----------------------------|----------|---------|----------|
| `.h1` (Seitentitel)        | 30/34px  | 700     | `--fg`   |
| `.h2` (Abschnittstitel)    | 19px     | 650     | `--fg`   |
| `.prose` (Lesetext)        | 16.5px   | 400     | fg/86 %  |
| `.tile__name` (Zeilentitel)| 15.5px   | 560     | `--fg`   |
| `text-sm`                  | 14px     | 400     | `--fg-2` |
| `.eyebrow`                 | 12px     | 600     | `--fg-3` |
| `.label` (Sektions-Label)  | 11.5px   | 600     | `--fg-3` |
| `.tile__sub`               | 12.5px   | 400     | `--fg-3` |

Zahlen in Statistiken bekommen `.num` (bzw. `.mono`) für Tabellenziffern, damit
Spalten untereinander stehen.

---

## Komponenten-Muster

### Sheet / Card `.card`
Deckender Container für alle Widget-Inhalte.
```tsx
<div className="card">…</div>
```
- Padding 20px, Radius 22px, `--shadow-1` + `--lip`, **kein** Border
- Kleinere Einheiten: `.card-pad-sm` (18px Radius, 12px Padding)
- Hover hebt nur auf Zeigergeräten (`@media (hover: hover)`) — ein klebender
  `:hover` auf iOS ließe Karten sonst dauerhaft angehoben aussehen

### Zeile / Tile `.tile`
Die Signatur-Interaktion: eine drückbare Zeile mit mindestens 62px Höhe.
```tsx
<button className={`tile ${done ? 'is-on' : ''}`}>
  <span className={`disc ${done ? 'is-on' : ''}`}>…</span>
  <span className="tile__name">Journaling</span>
</button>
```
`.disc` ist leer eine Vertiefung mit feinem Rand, erledigt eine sage Scheibe,
die aufliegt. Beim Drücken skaliert die Zeile auf 0.975.

### Hinweiskarte `.notice`
Für Fehler-, Warn- und Erfolgsmeldungen — **nicht** `.card` mit Inline-`borderColor`
(Sheets haben keinen Border, das Attribut wirkt nicht).
```tsx
<div className="notice notice--error">…</div>   {/* clay  */}
<div className="notice notice--warn">…</div>    {/* amber */}
<div className="notice notice--ok">…</div>      {/* sage  */}
```

### Stat-Kachel `.wash`
Farbe pro Domäne statt einem Akzent überall:
```tsx
<div className="wash wash--sage">…</div>   {/* auch --amber --clay --slate */}
```

### Button
```tsx
<button className="btn-primary">Primär</button>   {/* sage, dunkle Schrift */}
<button className="btn-ghost">Sekundär</button>   {/* surface-2           */}
<button className="btn-sm">Kompakt</button>       {/* 36px, nur sekundär  */}
```
Alle Pillen (`border-radius: 999px`), min. 44px hoch, federn beim Drücken.

### Segmented Control
Statisch `.seg`, oder `<AnimatedTabs>` wenn der Indikator zwischen Breiten
animieren soll. Beide sehen gleich aus — Änderungen an einem gehören ins andere.
```tsx
<div className="seg">
  <button className="on">Deutsch</button>
  <button>Original</button>
</div>
```

### Kopfzeile mit Bedienelementen `.control-row`
Tactiles 44px-Pillen passen zu dritt nicht mehr neben einen Button auf ein
360px-Display. Die Zeile scrollt deshalb selbst, statt die Seite quer zu ziehen:
```tsx
<div className="control-row">
  <button className="btn-ghost text-sm">Exportieren</button>
  <AnimatedTabs … />
</div>
```

### Input `.input`
```tsx
<input className="input" />
<textarea className="input resize-none" />
```
Vertiefung (`--well`), kein Border. Focus-Ring kommt aus `.input:focus`.

### Fortschrittsbalken `.track`
```tsx
<div className="track"><i style={{ width: `${pct}%` }} /></div>
```

### Status-Badge `.badge`
```tsx
<span className="badge badge-success">Erledigt</span>
<span className="badge badge-warning">Ausstehend</span>
<span className="badge badge-muted">Neutral</span>
```

### Chip `.chip`
Für Metadaten-Tags (z. B. „KW 20"). Keine individuellen Inline-Farben.

---

## Bewegung

```
--spring  cubic-bezier(0.34, 1.4, 0.64, 1)   Zustandswechsel, Drücken, Pills
--ease    cubic-bezier(0.4, 0, 0.2, 1)       Ein-/Ausblenden, Farbwechsel
```

Zustände federn, Farben nicht. `prefers-reduced-motion` wird global respektiert
(alle Transitions auf 0.01ms) — neue Animationen brauchen dafür nichts Eigenes.

---

## Abstände

| Token               | Wert    | Verwendung                     |
|---------------------|---------|--------------------------------|
| `gap-1.5`           | 6px     | Inline-Elemente                |
| `gap-2` / `gap-2.5` | 8–10px  | Listen-Items                   |
| `gap-3`             | 12px    | Card-interne Blöcke            |
| `mb-1.5`            | 6px     | Label → Input                  |
| `mb-3`              | 12px    | Sektions-Label → Inhalt        |
| `space-y-4`         | 16px    | Felder innerhalb einer Sektion |
| `space-y-5`         | 20px    | Karten untereinander           |
| `space-y-6`         | 24px    | Sektionen innerhalb einer Card |

---

## Was zu vermeiden ist

| Vermeiden                                   | Stattdessen                                  |
|---------------------------------------------|----------------------------------------------|
| `backdrop-filter` / `bg-white/5`             | deckende `--surface` / `--surface-2`         |
| `border: 1px solid …` auf einer Fläche       | `--shadow-1, --lip`                          |
| `.card` + Inline-`borderColor`               | `.notice notice--error/warn/ok`              |
| `uppercase` + `tracking-[0.14em]`            | `.label` (Satzschreibung)                    |
| `style={{ color: '#e8a33d' }}`               | `var(--warning)` bzw. `text-yellow`          |
| Ein fünfter Akzent / eine neue Kategorie-Farbe | einen der vier Akzente wiederverwenden     |
| Sage für einen neutralen aktiven Zustand     | `--raised`                                   |
| Trefferfläche unter 44px                     | `.btn` / `.tile` Mindesthöhen                |
| Emojis als Icons in UI-Chrome                | SVG-Icons aus `components/icons.tsx`         |

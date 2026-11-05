// Machine-readable description of the Agent Context API.
//
// Served by GET /api/agent/v1/index so an external agent can orient itself
// without reading AGENT_API.md: which domains exist, which endpoints serve them,
// which query parameters they take, and what the conventions are.
//
// Keep this in sync with the routes — it is the contract, not documentation.
import { APP_TIMEZONE } from '@/lib/date';
import { AGENT_API_VERSION, AGENT_SOURCE } from './envelope';
import { MAX_RANGE_DAYS } from './range';
import { RATE_LIMIT } from './auth';
import { CURRENCY } from './format';
import { writesEnabled } from './write/guard';
import { DAILY_HABIT_KEYS, WEEKLY_HABIT_KEYS } from './write/habits';
import { GOAL_CATEGORIES, GOAL_PERIODS, GOAL_STATUSES } from './write/goals';

export const BASE_PATH = `/api/agent/${AGENT_API_VERSION}`;

type ParamSpec = { name: string; type: string; description: string; default?: string };

export type EndpointSpec = {
  path: string;
  domain: string;
  title: string;
  description: string;
  params: ParamSpec[];
  returns: string[];
};

const DATE_PARAM: ParamSpec = {
  name: 'date', type: 'YYYY-MM-DD',
  description: 'Einzelner Tag. Nicht zusammen mit from/to verwendbar.',
  default: 'heute (Europe/Vienna)',
};
const FROM_PARAM: ParamSpec = {
  name: 'from', type: 'YYYY-MM-DD',
  description: 'Beginn des Zeitraums (inklusive).',
};
const TO_PARAM: ParamSpec = {
  name: 'to', type: 'YYYY-MM-DD',
  description: 'Ende des Zeitraums (inklusive).',
  default: 'heute',
};

export const ENDPOINTS: EndpointSpec[] = [
  {
    path: `${BASE_PATH}/index`,
    domain: 'meta',
    title: 'Discovery',
    description: 'Dieses Dokument: alle Domänen, Endpunkte, Parameter und Konventionen.',
    params: [],
    returns: ['domains', 'endpoints', 'conventions', 'not_available'],
  },
  {
    path: `${BASE_PATH}/daily-brief`,
    domain: 'brief',
    title: 'Morgen-Briefing',
    description: 'Alle für ein Morgen-Briefing relevanten Daten in einem Response: Gesundheit, Gewohnheiten, Ziele, Finanzen (kompakt), anstehende Abbuchungen, Tagespassage, XP und das letzte Tages-Journal.',
    params: [
      { ...DATE_PARAM, description: 'Tag, für den das Briefing gilt.' },
      { name: 'finance', type: 'boolean', description: 'Finanz-Block einschließen. Auf 0 setzen, wenn externe Kursabfragen zu langsam sind.', default: '1' },
    ],
    returns: ['date', 'health', 'habits', 'goals', 'subscriptions', 'finance', 'passage', 'xp', 'journal', 'summary'],
  },
  {
    path: `${BASE_PATH}/health`,
    domain: 'health',
    title: 'Gesundheit (WHOOP + Blutbild)',
    description: 'Recovery, HRV, Ruhepuls, Strain, Schlaf und Workouts aus WHOOP, Schritte/Gewicht aus Apple Health, plus auffällige Blutwerte und deren Verlauf.',
    params: [
      DATE_PARAM, FROM_PARAM, TO_PARAM,
      { name: 'blood', type: 'boolean', description: 'Blutbild-Block einschließen.', default: '1' },
    ],
    returns: ['snapshot', 'comparison', 'period_averages', 'previous_period', 'trend', 'workouts', 'blood', 'summary'],
  },
  {
    path: `${BASE_PATH}/habits`,
    domain: 'habits',
    title: 'Gewohnheiten',
    description: '9 Tages- und 3 Wochen-Gewohnheiten mit Serien, Bestserien, Erfüllungsquoten, Stimmung, Urlaubsmodus und perfekten Tagen.',
    params: [DATE_PARAM, FROM_PARAM, TO_PARAM],
    returns: ['day', 'daily', 'weekly', 'totals', 'paused_months', 'summary'],
  },
  {
    path: `${BASE_PATH}/finance`,
    domain: 'finance',
    title: 'Finanzen',
    description: 'Nettovermögen, Allokation, Positionen, Rendite (IZF/TTWROR), Kapitalflüsse, Sparplan, Cashflow/Sparquote und Sparziele. Immer der aktuelle Stand — kein Zeitraum-Parameter.',
    params: [
      { name: 'activities', type: 'integer 0–100', description: 'Anzahl der letzten Depot-Transaktionen im Response.', default: '25' },
    ],
    returns: ['net_worth_eur', 'allocation', 'positions', 'returns', 'capital_flows', 'top_movers', 'savings_plan', 'cashflow', 'savings_goals', 'recent_activities', 'data_sources', 'summary'],
  },
  {
    path: `${BASE_PATH}/subscriptions`,
    domain: 'subscriptions',
    title: 'Abonnements / Fixkosten',
    description: 'Laufende Kosten mit Monats- und Jahressumme, Kategorien und den nächsten Abbuchungen. Fälligkeiten werden aus dem Verlängerungsdatum vorwärts gerollt, sind also auch bei veralteten Einträgen korrekt.',
    params: [
      { name: 'horizon', type: 'integer 1–365', description: 'Wie viele Tage in die Zukunft "upcoming" reicht.', default: '60' },
      { ...DATE_PARAM, description: 'Stichtag, ab dem die nächsten Abbuchungen berechnet werden.' },
    ],
    returns: ['totals', 'by_category', 'upcoming', 'due_soon', 'without_schedule', 'inactive', 'reminder_rule', 'summary'],
  },
  {
    path: `${BASE_PATH}/goals`,
    domain: 'goals',
    title: 'Ziele',
    description: 'Wochen- und Monatsziele mit Status, Kategorie und angepinnten Zielen.',
    params: [
      { name: 'month', type: 'YYYY-MM', description: 'Monat, dessen Ziele geliefert werden.', default: 'Monat des Ankerdatums' },
      DATE_PARAM,
    ],
    returns: ['month', 'counts', 'open', 'completed', 'abandoned', 'pinned', 'summary'],
  },
  {
    path: `${BASE_PATH}/todo`,
    domain: 'todo',
    title: 'Planer / To-dos',
    description: 'Alle Aufgaben aus der Supabase-Datenbank: Priorität, Datum, Tageszeit, Reihenfolge, Wiederholung, Unteraufgaben, Notizen, Erledigungsstatus, Emoji und Cover-Thema. Die id ist der stabile Schlüssel für Änderungen.',
    params: [
      { name: 'include_deleted', type: 'boolean 0|1', description: 'Auch weich gelöschte Aufgaben mit deletedAt liefern.', default: '0' },
      { name: 'date', type: 'YYYY-MM-DD | today | tomorrow', description: 'Nur Aufgaben an diesem Tag, inklusive wiederkehrender; jede trägt doneOnDate.', default: '—' },
      { name: 'open', type: 'boolean 0|1', description: 'Nur offene Aufgaben (mit date: offen an diesem Tag).', default: '0' },
      { name: 'inbox', type: 'boolean 0|1', description: 'Nur ungeplante Aufgaben der To-do-Liste (date = null).', default: '0' },
    ],
    returns: ['tasks', 'count', 'summary'],
  },
  {
    path: `${BASE_PATH}/reflections`,
    domain: 'reflections',
    title: 'Reflexionen',
    description: 'Reflexions-Einträge (Tag/Woche/Monat) inklusive Volltext, plus die täglichen Journal-Felder (dankbar, Intention, gut gemacht, morgen besser).',
    params: [
      FROM_PARAM, TO_PARAM, DATE_PARAM,
      { name: 'limit', type: 'integer 1–25', description: 'Maximale Anzahl Reflexions-Einträge.', default: '10' },
      { name: 'type', type: 'Tag | Woche | Monat', description: 'Nur Einträge dieses Typs.' },
      { name: 'text', type: 'boolean', description: 'Volltext der Einträge mitliefern.', default: '1' },
    ],
    returns: ['entries', 'daily_journal', 'counts', 'has_more', 'summary'],
  },
  {
    path: `${BASE_PATH}/passage`,
    domain: 'passage',
    title: 'Tagespassage',
    description: 'Die Buchpassage des Tages (deutsch + englisch) samt Lesestatus. Die Auswahl ist deterministisch: dasselbe Datum liefert immer dieselbe Passage.',
    params: [DATE_PARAM],
    returns: ['book', 'chapter', 'text_de', 'text_en', 'read_minutes', 'read', 'favorite', 'summary'],
  },
  {
    path: `${BASE_PATH}/xp`,
    domain: 'xp',
    title: 'XP & Level',
    description: 'Gamification-Stand: Level, Gesamt-XP, Fortschritt zum nächsten Level und die XP-Bewegung der letzten Tage.',
    params: [
      { name: 'days', type: 'integer 1–90', description: 'Zeitfenster für die XP-Bilanz.', default: '7' },
    ],
    returns: ['level', 'total_xp', 'level_progress_pct', 'period', 'recent_events', 'summary'],
  },
];

export const DOMAINS = [
  { domain: 'health', title: 'Gesundheit', path: `${BASE_PATH}/health`, sources: ['WHOOP', 'Apple Health', 'Blutbefunde'] },
  { domain: 'habits', title: 'Gewohnheiten', path: `${BASE_PATH}/habits`, sources: ['Dashboard-Datenbank'] },
  { domain: 'finance', title: 'Finanzen', path: `${BASE_PATH}/finance`, sources: ['Supabase-Portfolio', 'Yahoo Finance', 'CoinGecko', 'Metals.dev', 'Firmen-Bridge'] },
  { domain: 'subscriptions', title: 'Abonnements / Fixkosten', path: `${BASE_PATH}/subscriptions`, sources: ['Notion'] },
  { domain: 'goals', title: 'Ziele', path: `${BASE_PATH}/goals`, sources: ['Dashboard-Datenbank'] },
  { domain: 'todo', title: 'Planer / To-dos', path: `${BASE_PATH}/todo`, sources: ['Supabase'] },
  { domain: 'reflections', title: 'Reflexionen', path: `${BASE_PATH}/reflections`, sources: ['Notion', 'Dashboard-Datenbank'] },
  { domain: 'passage', title: 'Tagespassage', path: `${BASE_PATH}/passage`, sources: ['Statischer Korpus', 'Dashboard-Datenbank'] },
  { domain: 'xp', title: 'XP & Level', path: `${BASE_PATH}/xp`, sources: ['Dashboard-Datenbank'] },
];

/** Domains an agent might expect from a life dashboard but that this one does not track. */
export const NOT_AVAILABLE = [
  { domain: 'crm', reason: 'Dieses Dashboard führt kein CRM. Kunden- und Kontaktdaten liegen ausschließlich im Firmen-Dashboard.' },
  { domain: 'timetracking', reason: 'Es gibt keine Zeiterfassung in diesem Dashboard.' },
  { domain: 'projects', reason: 'Projekte werden hier nicht geführt — es gibt nur Ziele (siehe /goals).' },
  { domain: 'calendar', reason: 'Kein externer Kalender angebunden. Geplante To-dos stehen unter /todo.' },
  { domain: 'travel', reason: 'Die Reisen-Erweiterung des Dashboards ist stillgelegt — es gibt keine Reisedaten mehr abzurufen.' },
  { domain: 'raw_credentials', reason: 'OAuth-Tokens, Zugangsdaten und interne IDs werden grundsätzlich nicht ausgeliefert.' },
];


export type WriteEndpointSpec = {
  path: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  domain: string;
  title: string;
  description: string;
  body: { name: string; type: string; required: boolean; description: string }[];
  returns: string[];
};

export const WRITE_ENDPOINTS: WriteEndpointSpec[] = [
  {
    path: `${BASE_PATH}/todo`, method: 'POST', domain: 'todo', title: 'To-do anlegen',
    description: 'Legt eine Aufgabe an. Fehlende optionale Felder bekommen dieselben Standardwerte wie im Planer; Emoji und Cover-Thema werden aus dem Titel gewählt. Eine mitgesendete UUID macht Wiederholungen erkennbar.',
    body: [
      { name: 'title', type: 'string 1–300', required: true, description: 'Aufgabentitel.' },
      { name: 'id', type: 'UUID', required: false, description: 'Optionaler stabiler Schlüssel für idempotente Wiederholungen.' },
      { name: 'priority', type: 'high | medium | low | none', required: false, description: 'Standard: none.' },
      { name: 'date', type: 'YYYY-MM-DD | null', required: false, description: 'Geplantes Datum; null für die To-do-Liste.' },
      { name: 'slot', type: 'anytime | morning | afternoon | evening', required: false, description: 'Standard: anytime.' },
      { name: 'time', type: 'HH:MM | null', required: false, description: 'Optionale Startzeit (Europe/Vienna). Ohne Zeit gilt der Beginn des Tagesabschnitts.' },
      { name: 'reminder', type: 'integer 0–1440 | null', required: false, description: 'Push-Erinnerung in Minuten vor dem Start; null = keine. Mit time standardmäßig 0 (zum Start).' },
      { name: 'duration', type: 'integer 1–1440', required: false, description: 'Minuten; Standard: 30.' },
      { name: 'repeat', type: 'none | daily | weekly | monthly', required: false, description: 'Standard: none.' },
      { name: 'notes', type: 'string', required: false, description: 'Freie Notizen.' },
      { name: 'subtasks', type: '{id,title,done}[]', required: false, description: 'Teilschritte.' },
      { name: 'done', type: 'boolean', required: false, description: 'Erledigtstatus für eine nicht wiederkehrende Aufgabe.' },
      { name: 'completedDates', type: 'YYYY-MM-DD[]', required: false, description: 'Erledigte Termine einer wiederkehrenden Aufgabe.' },
      { name: 'order', type: 'number', required: false, description: 'Sortierung innerhalb der Liste oder des Tagesabschnitts.' },
      { name: 'emoji', type: 'string', required: false, description: 'Symbol; wird sonst automatisch aus dem Titel gewählt und folgt bei Umbenennung dem neuen Titel, solange es nicht von Hand gesetzt wurde.' },
      { name: 'theme', type: 'work | finance | creative | health | home | learning | general', required: false, description: 'Illustrations-Thema; wird sonst aus dem Titel abgeleitet.' },
    ], returns: ['created', 'task'],
  },
  {
    path: `${BASE_PATH}/todo`, method: 'PATCH', domain: 'todo', title: 'To-do ändern',
    description: 'Ändert die angegebenen Felder einer Aufgabe. Setze done explizit; für einen einzelnen Termin einer wiederkehrenden Aufgabe verwende completedDates. Für Verschieben und Sortieren setze date, slot, priority oder order.',
    body: [
      { name: 'id', type: 'UUID', required: true, description: 'Schlüssel aus GET /todo.' },
      { name: 'title / priority / date / slot / time / reminder / duration / repeat / notes / subtasks / done / completedDates / order / emoji / theme', type: 'passender Feldtyp wie POST bzw. boolean oder YYYY-MM-DD[]', required: false, description: 'Nur die zu ändernden Felder übergeben.' },
    ], returns: ['changed', 'task'],
  },
  {
    path: `${BASE_PATH}/todo`, method: 'DELETE', domain: 'todo', title: 'To-do weich löschen',
    description: 'Blendet die Aufgabe aus dem Planer aus; der Datensatz bleibt wiederherstellbar.',
    body: [{ name: 'id', type: 'UUID', required: true, description: 'Schlüssel aus GET /todo.' }], returns: ['deleted', 'id', 'recoverable'],
  },
  {
    path: `${BASE_PATH}/todo/restore`, method: 'POST', domain: 'todo', title: 'To-do wiederherstellen',
    description: 'Stellt eine zuvor weich gelöschte Aufgabe wieder her.',
    body: [{ name: 'id', type: 'UUID', required: true, description: 'Schlüssel aus GET /todo?include_deleted=1.' }], returns: ['restored', 'task'],
  },
  {
    path: `${BASE_PATH}/habits/toggle`,
    method: 'POST',
    domain: 'habits',
    title: 'Tages-Gewohnheit setzen',
    description: 'Hakt eine Tages-Gewohnheit für einen Tag ab oder wieder aus. Vergibt dabei automatisch die serienabhängige XP, den Perfect-Day-Bonus bzw. die entsprechenden Strafpunkte — genau wie das Dashboard.',
    body: [
      { name: 'habit', type: `string (${DAILY_HABIT_KEYS.join(' | ')})`, required: true, description: 'Schlüssel der Gewohnheit.' },
      { name: 'done', type: 'boolean', required: true, description: 'Zielzustand, kein Umschalten — ein wiederholter Aufruf ändert nichts.' },
      { name: 'date', type: 'YYYY-MM-DD', required: false, description: 'Standard: heute. Zukünftige Tage werden abgelehnt.' },
    ],
    returns: ['changed', 'habit', 'done', 'streak_days', 'day', 'xp'],
  },
  {
    path: `${BASE_PATH}/habits/weekly`,
    method: 'POST',
    domain: 'habits',
    title: 'Wochen-Gewohnheit setzen',
    description: 'Setzt den Wochenwert für die ISO-Woche des Datums. Zähler (gym, sauna) brauchen "value", die Checkboxen (reflexion, lesen) brauchen "done". XP wird beim Erreichen bzw. Unterschreiten des Wochenziels vergeben.',
    body: [
      { name: 'habit', type: `string (${WEEKLY_HABIT_KEYS.join(' | ')})`, required: true, description: 'Schlüssel der Wochen-Gewohnheit.' },
      { name: 'value', type: 'integer 0–50', required: false, description: 'Neuer Zählerstand — erforderlich für gym und sauna.' },
      { name: 'done', type: 'boolean', required: false, description: 'Erledigt ja/nein — erforderlich für reflexion und lesen.' },
      { name: 'date', type: 'YYYY-MM-DD', required: false, description: 'Irgendein Tag der gemeinten Woche. Standard: heute.' },
    ],
    returns: ['changed', 'habit', 'previous_value', 'value', 'target', 'met', 'xp'],
  },
  {
    path: `${BASE_PATH}/habits/day`,
    method: 'POST',
    domain: 'habits',
    title: 'Stimmung, Notiz und Tages-Journal',
    description: 'Schreibt Stimmung, eine freie Notiz und die vier Journal-Felder. Sobald ein Journal-Feld gefüllt wird, hakt das die Gewohnheit "Journaling" automatisch mit ab und vergibt die Reflexions-XP — dieselbe Regel wie im Dashboard.',
    body: [
      { name: 'mood', type: 'integer 1–10', required: false, description: 'Stimmung des Tages.' },
      { name: 'note', type: 'string', required: false, description: 'Freie Notiz.' },
      { name: 'grateful_for', type: 'string', required: false, description: 'Wofür dankbar.' },
      { name: 'intention', type: 'string', required: false, description: 'Intention für den Tag.' },
      { name: 'done_well', type: 'string', required: false, description: 'Was gut gelaufen ist.' },
      { name: 'better_tomorrow', type: 'string', required: false, description: 'Was morgen besser laufen soll.' },
      { name: 'date', type: 'YYYY-MM-DD', required: false, description: 'Standard: heute.' },
    ],
    returns: ['changed', 'journaling_auto_checked', 'day', 'journal', 'xp'],
  },
  {
    path: `${BASE_PATH}/goals`,
    method: 'POST',
    domain: 'goals',
    title: 'Ziel anlegen',
    description: 'Legt ein neues Ziel mit Status "offen" an.',
    body: [
      { name: 'title', type: 'string', required: true, description: 'Titel des Ziels.' },
      { name: 'period', type: GOAL_PERIODS.join(' | '), required: false, description: 'Standard: month.' },
      { name: 'month', type: 'YYYY-MM', required: false, description: 'Standard: aktueller Monat.' },
      { name: 'category', type: GOAL_CATEGORIES.join(' | '), required: false, description: 'Kategorie des Ziels.' },
      { name: 'pinned', type: 'boolean', required: false, description: 'Auf der Startseite anpinnen.' },
    ],
    returns: ['created', 'goal'],
  },
  {
    path: `${BASE_PATH}/goals`,
    method: 'PATCH',
    domain: 'goals',
    title: 'Ziel ändern',
    description: 'Ändert Status, Titel, Kategorie oder Pin eines Ziels. Beim Wechsel auf "erledigt" gibt es XP, bei "abgebrochen" einen deutlichen Abzug. Die id stammt aus GET /goals.',
    body: [
      { name: 'id', type: 'string', required: true, description: 'id des Ziels, wie von GET /goals geliefert.' },
      { name: 'status', type: GOAL_STATUSES.join(' | '), required: false, description: 'Neuer Status.' },
      { name: 'title', type: 'string', required: false, description: 'Neuer Titel.' },
      { name: 'category', type: GOAL_CATEGORIES.join(' | '), required: false, description: 'Neue Kategorie.' },
      { name: 'pinned', type: 'boolean', required: false, description: 'An-/abpinnen.' },
    ],
    returns: ['changed', 'previous_status', 'goal', 'xp'],
  },
];

/** Write operations that exist in the dashboard but are deliberately not offered. */
export const WRITES_NOT_AVAILABLE = [
  { operation: 'endgültig löschen', reason: 'Kein Agent-Endpunkt löscht Daten endgültig. To-dos können nur weich gelöscht und wiederhergestellt werden.' },
  { operation: 'finanzen', reason: 'Krypto-, Edelmetall- und Cash-Positionen, Sparplan, Sparziele und Einkommen bleiben schreibgeschützt — Geldbeträge ändert nur der Mensch.' },
  { operation: 'urlaubsmodus', reason: 'Urlaubstage verändern rückwirkend Serien und Erfüllungsquoten über einen ganzen Zeitraum. Bewusst dem Dashboard vorbehalten.' },
  { operation: 'reflexionen', reason: 'Reflexions-Einträge liegen in Notion. Lesen ja, schreiben nein — eine externe Datenbank ist kein Ort für automatische Schreibzugriffe.' },
  { operation: 'abonnements', reason: 'Notion ist die Quelle der Wahrheit; auch das Dashboard selbst schreibt dort nicht hinein.' },
  { operation: 'zukünftige tage', reason: 'Ein Eintrag für morgen würde jede Erfüllungsquote verfälschen, die "noch nicht passiert" von "verpasst" unterscheidet.' },
];

export function buildIndex() {
  return {
    api: { name: 'Agent Context API', version: AGENT_API_VERSION, source: AGENT_SOURCE, base_path: BASE_PATH },
    conventions: {
      auth: 'HTTP-Header "Authorization: Bearer <AGENT_API_TOKEN>". Ohne gültigen Token: 401.',
      methods: 'Lesen immer per GET. Schreiben nur über die unter "write_endpoints" genannten Pfade (POST/PATCH/DELETE) und nur, wenn "writes.enabled" true ist.',
      timezone: APP_TIMEZONE,
      date_format: 'YYYY-MM-DD (Kalendertag in Europe/Vienna)',
      timestamp_format: 'ISO 8601 mit Offset, z. B. 2026-08-27T07:15:00+02:00',
      max_range_days: MAX_RANGE_DAYS,
      envelope_success: '{ "ok": true, "generated_at": "...", "source": "private-dashboard", "data": { ... }, "warnings": [ { "source": "...", "message": "..." } ] }',
      envelope_error: '{ "ok": false, "generated_at": "...", "source": "private-dashboard", "error": { "code": "...", "message": "..." } }',
      partial_failure: 'Fällt eine einzelne Unterquelle aus, liefert der Endpunkt trotzdem 200 mit den übrigen Daten; die fehlende Quelle steht in "warnings".',
      numbers: 'Zahlen sind Zahlen, nie Strings. Felder auf "_pct" sind Prozentwerte (12.3 bedeutet 12,3 %). Felder auf "_eur" sind Beträge in der Währung des Feldes "currency".',
      currency: CURRENCY,
      empty_fields: 'Felder ohne Wert werden weggelassen statt als null geliefert. "false" und 0 sind echte Werte und bleiben erhalten.',
      summary_field: 'Jede Domäne liefert ein Feld "summary" mit ein bis zwei Sätzen Klartext auf Deutsch.',
      rate_limit: `${RATE_LIMIT.requests} Anfragen pro ${RATE_LIMIT.windowSeconds} Sekunden je Token; danach 429 mit Retry-After.`,
    },
    error_codes: [
      { code: 'unauthorized', status: 401, meaning: 'Token fehlt oder ist falsch.' },
      { code: 'rate_limited', status: 429, meaning: 'Zu viele Anfragen.' },
      { code: 'not_configured', status: 503, meaning: 'AGENT_API_TOKEN ist auf dem Deployment nicht gesetzt.' },
      { code: 'invalid_date', status: 400, meaning: 'Ein Datums-Parameter hat nicht das Format YYYY-MM-DD oder existiert nicht.' },
      { code: 'invalid_range', status: 400, meaning: '"from" liegt nach "to".' },
      { code: 'range_too_large', status: 400, meaning: `Der Zeitraum überschreitet ${MAX_RANGE_DAYS} Tage.` },
      { code: 'conflicting_params', status: 400, meaning: '"date" wurde zusammen mit "from"/"to" gesendet.' },
      { code: 'invalid_param', status: 400, meaning: 'Ein Query-Parameter hat einen unzulässigen Wert.' },
      { code: 'writes_disabled', status: 403, meaning: 'Schreibzugriff ist auf diesem Deployment nicht aktiviert.' },
      { code: 'invalid_body', status: 400, meaning: 'Request-Body ist kein gültiges JSON-Objekt.' },
      { code: 'unknown_field', status: 400, meaning: 'Der Body enthält ein Feld, das dieser Endpunkt nicht kennt.' },
      { code: 'unknown_habit', status: 400, meaning: 'Der Gewohnheits-Schlüssel existiert nicht (oder nicht in dieser Frequenz).' },
      { code: 'habit_not_tracked_yet', status: 400, meaning: 'Die Gewohnheit wurde an diesem Tag noch nicht getrackt.' },
      { code: 'vacation_day', status: 409, meaning: 'Der Tag ist als Urlaubstag markiert und wird nicht getrackt.' },
      { code: 'future_date', status: 400, meaning: 'Für zukünftige Tage kann nichts eingetragen werden.' },
      { code: 'goal_not_found', status: 404, meaning: 'Kein Ziel mit dieser id.' },
      { code: 'todo_not_found', status: 404, meaning: 'Kein To-do mit dieser id.' },
      { code: 'todo_exists', status: 409, meaning: 'Eine To-do-id existiert bereits.' },
      { code: 'invalid_id', status: 400, meaning: 'Eine To-do-id ist keine UUID.' },
      { code: 'nothing_to_update', status: 400, meaning: 'Es wurde kein zu änderndes Feld übergeben.' },
      { code: 'internal_error', status: 500, meaning: 'Unerwarteter Fehler.' },
    ],
    domains: DOMAINS,
    endpoints: ENDPOINTS,
    writes: {
      enabled: writesEnabled(),
      note: writesEnabled()
        ? 'Schreibzugriff ist aktiv. Jeder Schreibvorgang liefert den resultierenden Zustand; Habit- und Zieländerungen liefern auch die vergebene XP zurück.'
        : 'Schreibzugriff ist auf diesem Deployment deaktiviert (AGENT_API_WRITE_ENABLED). Alle Schreib-Endpunkte antworten mit 403.',
      idempotency: 'Zustände werden explizit gesetzt, nicht umgeschaltet. Für wiederholbare To-do-Erstellung eine eigene UUID mitgeben; ein Duplikat antwortet 409. Habit-XP hat feste Idempotenz-Schlüssel.',
      xp: 'Habit- und Ziel-Schreibvorgänge vergeben XP nach den Dashboard-Regeln. To-do-Schreibvorgänge vergeben keine XP.',
    },
    write_endpoints: WRITE_ENDPOINTS,
    not_available: NOT_AVAILABLE,
    writes_not_available: WRITES_NOT_AVAILABLE,
    hint: 'Für ein Morgen-Briefing genügt ein einziger Aufruf von ' + `${BASE_PATH}/daily-brief`,
  };
}

// Read-only appointments from subscribed calendars.
//
// Two kinds of source:
//   * ics    — a secret .ics link (Google: "Privatadresse im iCal-Format"),
//              downloaded whole at most every few minutes.
//   * caldav — an iCloud calendar read over CalDAV with an app-specific
//              password (lib/todo/caldav.ts), so it never has to be made public.
//              The password lives sealed (lib/secretBox.ts) in an account row.
// Events are expanded with ical.js into the days the planner asks for. Nothing
// is written back to the calendars.
import { createHash } from 'node:crypto';
import ICAL from 'ical.js';
import { db, CALENDAR_FEEDS } from '@/lib/db';
import { withTable } from '@/lib/provision';
import { open, seal } from '@/lib/secretBox';
import { CalDavError, discoverCalendars, fetchEvents } from './caldav';
import { TIME_ZONE } from './schedule';
import type { CalendarEvent, CalendarFeed } from './types';

type StoredFeed = { kind?: 'ics' | 'caldav'; name: string; url: string; color: number; createdAt: string; account?: string };
type StoredAccount = { kind: 'account'; provider: 'icloud'; username: string; secret: string; createdAt: string };
type Row = { id: string } & (StoredFeed | StoredAccount);
const isAccount = (row: Row): row is { id: string } & StoredAccount => (row as StoredAccount).kind === 'account';

const TTL = 5 * 60_000;
const MAX_BYTES = 8 * 1024 * 1024;
const cache = new Map<string, { at: number; text: Promise<string> }>();

export class CalendarError extends Error {}

function normalizeUrl(raw: string) {
  const url = raw.trim().replace(/^webcals?:\/\//i, 'https://');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new CalendarError('Das ist kein gültiger Link.'); }
  if (parsed.protocol !== 'https:') throw new CalendarError('Der Link muss mit https:// oder webcal:// beginnen.');
  return parsed.toString();
}

async function download(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store', headers: { accept: 'text/calendar, */*' }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 404 && /calendar\.google\.com\/calendar\/ical\/[^/]+\/public\//.test(url)) {
    throw new CalendarError('Das ist die öffentliche Adresse – sie geht nur bei öffentlichen Kalendern. Nimm die „Privatadresse im iCal-Format“ (enthält /private-…/).');
  }
  if (!res.ok) throw new CalendarError(`Kalender antwortet mit ${res.status}.`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new CalendarError('Kalender ist zu groß.');
  if (!text.includes('BEGIN:VCALENDAR')) throw new CalendarError('Unter dem Link liegt kein Kalender (iCal).');
  return text;
}

function fetchFeed(url: string) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.text;
  const text = download(url);
  cache.set(url, { at: Date.now(), text });
  text.catch(() => cache.delete(url));
  return text;
}

// ——— Feeds ———

type Feed = CalendarFeed & { url: string; kind: 'ics' | 'caldav'; account?: string };

async function rows(): Promise<Row[]> {
  const snap = await withTable(CALENDAR_FEEDS, () => db().collection(CALENDAR_FEEDS).get());
  return snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as StoredFeed | StoredAccount) }));
}

export async function listFeeds(): Promise<Feed[]> {
  return (await rows())
    .filter((row): row is { id: string } & StoredFeed => !isAccount(row))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(f => ({
      id: f.id, name: f.name, color: f.color, url: f.url, kind: f.kind ?? 'ics', account: f.account,
      host: f.kind === 'caldav' ? 'iCloud · privat' : new URL(f.url).hostname,
    }));
}

const feedId = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 24);

export async function addFeed(name: string, rawUrl: string) {
  const url = normalizeUrl(rawUrl);
  const text = await download(url);
  const label = name.trim().slice(0, 60) || calendarName(text) || new URL(url).hostname;
  const feeds = await listFeeds();
  const id = feedId(url);
  const existing = feeds.find(f => f.id === id);
  await withTable(CALENDAR_FEEDS, () => db().collection(CALENDAR_FEEDS).doc(id).set({
    kind: 'ics', name: label, url, color: existing?.color ?? feeds.length % 4, createdAt: new Date().toISOString(),
  } satisfies StoredFeed));
  cache.set(url, { at: Date.now(), text: Promise.resolve(text) });
  return id;
}

/** Signs in to iCloud and subscribes every calendar that holds events. */
export async function addICloud(username: string, password: string) {
  const user = username.trim().toLowerCase();
  // App-specific passwords look like abcd-efgh-ijkl-mnop; Apple accepts them with or without dashes.
  const pass = password.trim().replace(/\s+/g, '');
  if (!/^\S+@\S+$/.test(user)) throw new CalendarError('Bitte die Apple-ID (E-Mail) angeben.');
  if (!/^[a-z]{4}-?[a-z]{4}-?[a-z]{4}-?[a-z]{4}$/i.test(pass)) {
    throw new CalendarError('Das sieht nicht nach einem app-spezifischen Passwort aus (xxxx-xxxx-xxxx-xxxx). Dein normales Apple-Passwort bitte nicht verwenden.');
  }
  let calendars;
  try { calendars = await discoverCalendars({ username: user, password: pass }); }
  catch (e) { throw new CalendarError(e instanceof CalDavError ? e.message : 'iCloud ist gerade nicht erreichbar.'); }
  if (!calendars.length) throw new CalendarError('In diesem iCloud-Konto gibt es keine Kalender mit Terminen.');

  const all = await rows();
  const feeds = all.filter(r => !isAccount(r));
  const account = `account-${createHash('sha256').update(`icloud:${user}`).digest('hex').slice(0, 16)}`;
  const now = new Date().toISOString();
  await withTable(CALENDAR_FEEDS, () => db().collection(CALENDAR_FEEDS).doc(account).set({
    kind: 'account', provider: 'icloud', username: user, secret: seal(pass), createdAt: now,
  } satisfies StoredAccount));
  let color = feeds.length;
  for (const cal of calendars) {
    const id = feedId(cal.url);
    const existing = feeds.find(f => f.id === id) as StoredFeed | undefined;
    await db().collection(CALENDAR_FEEDS).doc(id).set({
      kind: 'caldav', name: cal.name.slice(0, 60), url: cal.url, account,
      color: existing?.color ?? color++ % 4, createdAt: existing?.createdAt ?? now,
    } satisfies StoredFeed);
  }
  return calendars.length;
}

export async function removeFeed(id: string) {
  const all = await rows();
  const feed = all.find(r => r.id === id);
  await withTable(CALENDAR_FEEDS, () => db().collection(CALENDAR_FEEDS).doc(id).delete());
  // The last calendar of an iCloud account takes the stored password with it.
  const account = feed && !isAccount(feed) ? feed.account : undefined;
  if (account && !all.some(r => r.id !== id && !isAccount(r) && r.account === account)) {
    await db().collection(CALENDAR_FEEDS).doc(account).delete();
  }
}

async function credentials(account: string) {
  const row = (await rows()).find(r => r.id === account);
  if (!row || !isAccount(row)) throw new CalendarError('iCloud-Konto fehlt – bitte neu verbinden.');
  try { return { username: row.username, password: open(row.secret) }; }
  catch { throw new CalendarError('Gespeichertes Passwort ist nicht mehr lesbar – bitte neu verbinden.'); }
}

function fetchCalDav(feed: Feed, from: string, to: string): Promise<string[]> {
  const key = `${feed.url}|${from}|${to}`;
  const hit = davCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.objects;
  const objects = (async () => {
    const auth = await credentials(feed.account!);
    // A day of margin on both sides so time zones never cut an event off.
    const start = Date.parse(`${from}T00:00:00Z`) - 86_400_000;
    const end = Date.parse(`${to}T00:00:00Z`) + 2 * 86_400_000;
    try { return await fetchEvents(feed.url, auth, start, end); }
    catch (e) { throw new CalendarError(e instanceof CalDavError ? e.message : 'iCloud ist gerade nicht erreichbar.'); }
  })();
  davCache.set(key, { at: Date.now(), objects });
  objects.catch(() => davCache.delete(key));
  return objects;
}
const davCache = new Map<string, { at: number; objects: Promise<string[]> }>();

function calendarName(text: string) {
  return /^X-WR-CALNAME:(.+)$/m.exec(text)?.[1]?.trim().slice(0, 60);
}

// ——— Time ———

/** Wall-clock parts of an instant in Vienna. */
function vienna(ms: number) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type: string) => f.find(p => p.type === type)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

/** UTC instant of a wall-clock time in any IANA zone. */
function zonedInstant(t: ICAL.Time, zone: string) {
  const guess = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  try {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(f.find(p => p.type === type)?.value);
    const seen = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return guess - (seen - guess);
  } catch {
    return zonedInstant(t, TIME_ZONE);
  }
}

function instant(t: ICAL.Time): number {
  const zone = t.zone;
  if (zone === ICAL.Timezone.utcTimezone) return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  // A zone the feed defined (VTIMEZONE) converts itself; anything else is read
  // as the IANA name it carries, and floating times as Vienna.
  if (zone && zone !== ICAL.Timezone.localTimezone && zone.component) return t.toUnixTime() * 1000;
  return zonedInstant(t, (t as unknown as { timezone?: string }).timezone || zone?.tzid || TIME_ZONE);
}

function isoDate(t: ICAL.Time) {
  return `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

function addDay(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ——— Events ———

export function expand(feedId: string, text: string, from: string, to: string): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch { /* a broken zone falls back to its name */ }
  }
  const vevents = root.getAllSubcomponents('vevent');
  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    if (event.isRecurrenceException()) exceptions.push(event);
    else masters.set(event.uid, event);
  }
  for (const ex of exceptions) masters.get(ex.uid)?.relateException(ex);

  const out: CalendarEvent[] = [];
  const rangeStart = Date.parse(`${from}T00:00:00Z`) - 36 * 3600_000;
  const rangeEnd = Date.parse(`${to}T00:00:00Z`) + 60 * 3600_000;

  function push(event: ICAL.Event, start: ICAL.Time, end: ICAL.Time) {
    if ((event.component.getFirstPropertyValue('status') as string | null)?.toUpperCase() === 'CANCELLED') return;
    const title = event.summary?.trim() || 'Termin';
    const base = { feedId, title, location: event.location?.trim() ?? '' };
    if (start.isDate) {
      // All-day: DTEND is the (exclusive) day after.
      const first = isoDate(start);
      const last = end && end.compare(start) > 0 ? addDay(isoDate(end), -1) : first;
      for (let day = first < from ? from : first; day <= last && day <= to; day = addDay(day, 1)) {
        out.push({ ...base, id: `${feedId}:${event.uid}:${first}:${day}`, date: day, time: null, end: null, duration: 0 });
      }
      return;
    }
    const s = instant(start);
    const e = end ? instant(end) : s;
    const at = vienna(s);
    if (at.date < from || at.date > to) return;
    const until = vienna(e);
    out.push({ ...base, id: `${feedId}:${event.uid}:${s}`, date: at.date, time: at.time, end: until.date === at.date ? until.time : '24:00', duration: Math.max(0, Math.round((e - s) / 60_000)) });
  }

  for (const event of masters.values()) {
    try {
      if (!event.isRecurring()) { push(event, event.startDate, event.endDate); continue; }
      const it = event.iterator();
      for (let next = it.next(), n = 0; next && n < 5000; next = it.next(), n++) {
        const ms = next.isDate ? Date.parse(`${isoDate(next)}T12:00:00Z`) : instant(next);
        if (ms > rangeEnd) break;
        const details = event.getOccurrenceDetails(next);
        const endMs = details.endDate ? (details.endDate.isDate ? Date.parse(`${isoDate(details.endDate)}T12:00:00Z`) : instant(details.endDate)) : ms;
        if (endMs < rangeStart) continue;
        push(details.item, details.startDate, details.endDate);
      }
    } catch { /* one malformed event must not hide the rest */ }
  }
  return out;
}

export async function calendarEvents(from: string, to: string) {
  const feeds = await listFeeds();
  const events: CalendarEvent[] = [];
  const status: CalendarFeed[] = await Promise.all(feeds.map(async source => {
    const { url, kind, account: _account, ...feed } = source;
    try {
      if (kind === 'caldav') {
        for (const object of await fetchCalDav(source, from, to)) events.push(...expand(feed.id, object, from, to));
      } else {
        events.push(...expand(feed.id, await fetchFeed(url), from, to));
      }
      return feed;
    } catch (e) {
      return { ...feed, error: e instanceof CalendarError ? e.message : 'Kalender konnte nicht gelesen werden.' };
    }
  }));
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.title.localeCompare(b.title));
  return { feeds: status, events };
}

// Minimal CalDAV client for iCloud: find the user's calendars and read the
// events of a time range. Authenticates with an app-specific password, so the
// calendars stay private (no "public calendar" link needed).
//
//   PROPFIND caldav.icloud.com            → current-user-principal
//   PROPFIND <principal>                  → calendar-home-set (pNN-caldav.icloud.com)
//   PROPFIND <home>, Depth 1              → calendars that hold events
//   REPORT   <calendar>, calendar-query   → one iCalendar object per event
import { XMLParser } from 'fast-xml-parser';

export const ICLOUD_CALDAV = 'https://caldav.icloud.com/';

export class CalDavError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

type Auth = { username: string; password: string };
export type RemoteCalendar = { url: string; name: string };

const parser = new XMLParser({
  removeNSPrefix: true, ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, trimValues: true,
  isArray: name => name === 'response' || name === 'propstat' || name === 'comp',
});

type Node = Record<string, unknown>;
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '#text' in value) return String((value as Node)['#text']);
  return '';
}

async function request(url: string, method: 'PROPFIND' | 'REPORT', auth: Auth, body: string, depth: '0' | '1') {
  let target = url;
  // Follow redirects by hand: fetch drops the Authorization header when a
  // redirect changes host, and iCloud moves every account to its own pNN host.
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(target, {
      method, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20_000),
      headers: {
        authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`,
        depth, 'content-type': 'application/xml; charset=utf-8',
      },
      body,
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) { target = new URL(location, target).toString(); continue; }
    if (res.status === 401 || res.status === 403) throw new CalDavError('Apple-ID oder app-spezifisches Passwort stimmt nicht.', res.status);
    if (res.status !== 207 && !res.ok) throw new CalDavError(`iCloud antwortet mit ${res.status}.`, res.status);
    return { url: target, responses: responses(await res.text()) };
  }
  throw new CalDavError('iCloud leitet zu oft um.');
}

/** <multistatus> → [{ href, props }] using only the 200 propstats. */
export function responses(xml: string): { href: string; props: Node }[] {
  const doc = parser.parse(xml) as Node;
  const list = ((doc.multistatus as Node | undefined)?.response ?? []) as Node[];
  return list.map(r => {
    const props: Node = {};
    for (const ps of (r.propstat ?? []) as Node[]) {
      if (!/\s200\s/.test(` ${text(ps.status)} `)) continue;
      Object.assign(props, ps.prop as Node);
    }
    return { href: text(r.href), props };
  });
}

function href(prop: unknown) {
  return text((prop as Node | undefined)?.href);
}

export async function discoverCalendars(auth: Auth, base = ICLOUD_CALDAV): Promise<RemoteCalendar[]> {
  const principalRes = await request(base, 'PROPFIND', auth,
    '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>', '0');
  const principal = href(principalRes.responses[0]?.props['current-user-principal']);
  if (!principal) throw new CalDavError('iCloud hat kein Konto gemeldet.');

  const homeRes = await request(new URL(principal, principalRes.url).toString(), 'PROPFIND', auth,
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>', '0');
  const home = href(homeRes.responses[0]?.props['calendar-home-set']);
  if (!home) throw new CalDavError('iCloud hat keinen Kalenderordner gemeldet.');
  const homeUrl = new URL(home, homeRes.url).toString();

  const listRes = await request(homeUrl, 'PROPFIND', auth,
    '<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/><c:supported-calendar-component-set/></d:prop></d:propfind>', '1');
  return listRes.responses.flatMap(({ href: path, props }) => {
    const type = props.resourcetype as Node | undefined;
    if (!type || !('calendar' in type)) return [];
    const comps = ((props['supported-calendar-component-set'] as Node | undefined)?.comp ?? []) as Node[];
    if (comps.length && !comps.some(c => String(c['@_name']).toUpperCase() === 'VEVENT')) return [];
    return [{ url: new URL(path, listRes.url).toString(), name: text(props.displayname) || 'iCloud' }];
  });
}

function stamp(ms: number) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** Raw iCalendar objects of every event that touches [start, end). */
export async function fetchEvents(url: string, auth: Auth, start: number, end: number): Promise<string[]> {
  const body = `<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${stamp(start)}" end="${stamp(end)}"/></c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
  const res = await request(url, 'REPORT', auth, body, '1');
  return res.responses.map(r => text(r.props['calendar-data'])).filter(ics => ics.includes('BEGIN:VCALENDAR'));
}

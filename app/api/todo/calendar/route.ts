import { NextRequest, NextResponse } from 'next/server';
import { COOKIE, verify } from '@/lib/auth';
import { addFeed, addICloud, calendarEvents, CalendarError, removeFeed } from '@/lib/todo/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'cache-control': 'no-store, private' };
const day = /^\d{4}-\d{2}-\d{2}$/;
function denied(req: NextRequest) { return !verify(req.cookies.get(COOKIE)?.value); }
function unauthorized() { return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers }); }
function failure(error: unknown) {
  if (!(error instanceof CalendarError)) console.error('[calendar]', error);
  const message = error instanceof CalendarError ? error.message : 'Kalender konnte nicht verarbeitet werden.';
  return NextResponse.json({ ok: false, error: message }, { status: error instanceof CalendarError ? 400 : 500, headers });
}

export async function GET(req: NextRequest) {
  if (denied(req)) return unauthorized();
  const from = req.nextUrl.searchParams.get('from') ?? '';
  const to = req.nextUrl.searchParams.get('to') ?? '';
  if (!day.test(from) || !day.test(to) || to < from || Date.parse(to) - Date.parse(from) > 120 * 86_400_000) {
    return NextResponse.json({ ok: false, error: 'from/to müssen YYYY-MM-DD sein (max. 120 Tage).' }, { status: 400, headers });
  }
  try { return NextResponse.json({ ok: true, ...(await calendarEvents(from, to)) }, { headers }); }
  catch (error) { return failure(error); }
}

export async function POST(req: NextRequest) {
  if (denied(req)) return unauthorized();
  try {
    const { name, url, kind, username, password } = await req.json().catch(() => ({}));
    if (kind === 'icloud') {
      if (typeof username !== 'string' || typeof password !== 'string') throw new CalendarError('Apple-ID und app-spezifisches Passwort angeben.');
      return NextResponse.json({ ok: true, calendars: await addICloud(username, password) }, { status: 201, headers });
    }
    if (typeof url !== 'string' || !url.trim()) throw new CalendarError('Bitte einen Kalender-Link einfügen.');
    return NextResponse.json({ ok: true, id: await addFeed(typeof name === 'string' ? name : '', url) }, { status: 201, headers });
  } catch (error) { return failure(error); }
}

export async function DELETE(req: NextRequest) {
  if (denied(req)) return unauthorized();
  try {
    const { id } = await req.json().catch(() => ({}));
    if (typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) throw new CalendarError('Unbekannter Kalender.');
    await removeFeed(id);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return failure(error); }
}

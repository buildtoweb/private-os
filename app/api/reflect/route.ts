import { NextRequest, NextResponse } from 'next/server';
import { createReflectEntry, getReflectEntriesPage, updateReflectEntry } from '@/lib/notion';
import { appToday } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const limit = Number(searchParams.get('limit') || '10');
    const cursor = searchParams.get('cursor') || undefined;
    const typeParam = searchParams.get('type') || undefined;
    const type = typeParam === 'Woche' || typeParam === 'Monat' || typeParam === 'Tag' ? typeParam : undefined;
    const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const page = await getReflectEntriesPage({
      pageSize: limit,
      startCursor: cursor,
      type,
      from: isDate(fromParam) ? fromParam : undefined,
      to: isDate(toParam) ? toParam : undefined,
    });
    return NextResponse.json({ enabled: true, ...page });
  } catch (e: any) {
    return NextResponse.json({
      enabled: false,
      entries: [],
      error: e?.body?.message || e?.message || String(e),
      hint: 'Prüfe NOTION_REFLECT_DB_ID: Es muss die ID einer Datenbank sein, nicht die ID einer Seite. Außerdem muss die DB mit der Notion-Integration geteilt sein.',
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, text, date, type } = await req.json();
    if (type === 'Monat') return NextResponse.json({ ok: false, error: 'monthly_reflection_disabled' }, { status: 410 });
    if (!text && !title) return NextResponse.json({ ok: false, error: 'empty' }, { status: 400 });
    const page = await createReflectEntry(title || `Reflexion ${date || appToday()}`, text || '', date, type);
    return NextResponse.json({ ok: true, id: (page as any).id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.body?.message || e?.message || String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, title, text } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 });
    await updateReflectEntry(id, title || '', text || '');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.body?.message || e?.message || String(e) }, { status: 500 });
  }
}

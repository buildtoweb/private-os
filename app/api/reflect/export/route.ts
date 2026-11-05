import { NextRequest, NextResponse } from 'next/server';
import { getReflectEntries, ReflectType } from '@/lib/notion';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Returns ALL reflection entries (with full text) of a given type, for export.
export async function GET(req: NextRequest) {
  try {
    const typeParam = req.nextUrl.searchParams.get('type') || undefined;
    const type =
      typeParam === 'Woche' || typeParam === 'Monat' || typeParam === 'Tag'
        ? (typeParam as ReflectType)
        : undefined;
    const entries = await getReflectEntries(type);
    return NextResponse.json({ ok: true, entries });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.body?.message || e?.message || String(e), entries: [] },
      { status: 500 },
    );
  }
}

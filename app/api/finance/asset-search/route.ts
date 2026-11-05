import { NextRequest, NextResponse } from 'next/server';
import { searchMarketAssets } from '@/lib/finance/asset-search';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get('q') || '').trim();
  if (query.length < 2) return NextResponse.json({ ok: true, assets: [] });
  if (query.length > 100) return NextResponse.json({ ok: false, error: 'query_too_long' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, assets: await searchMarketAssets(query) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'search_unavailable' }, { status: 502 });
  }
}

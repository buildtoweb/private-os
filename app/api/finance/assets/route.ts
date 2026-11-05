import { NextRequest, NextResponse } from 'next/server';
import { createAsset, deleteAsset, listAssets, listTransactions, updateAsset } from '@/lib/finance/portfolio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try { return NextResponse.json({ ok: true, assets: await listAssets() }); }
  catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.identifier) return NextResponse.json({ ok: false, error: 'name_and_identifier_required' }, { status: 400 });
    if (!['stocks', 'etf', 'crypto', 'metals', 'cash'].includes(body.cls)) return NextResponse.json({ ok: false, error: 'invalid_asset_class' }, { status: 400 });
    return NextResponse.json({ ok: true, id: await createAsset(body) });
  }
  catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ...patch } = await req.json();
    if (!id) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 });
    await updateAsset(id, patch);
    return NextResponse.json({ ok: true });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 });
    if ((await listTransactions()).some((tx) => tx.assetId === id)) {
      return NextResponse.json({ ok: false, error: 'asset_has_transactions' }, { status: 409 });
    }
    await deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) { return NextResponse.json({ ok: false, error: error?.message || String(error) }, { status: 500 }); }
}

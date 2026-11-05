import { NextRequest, NextResponse } from 'next/server';
import {
  listCrypto, createCrypto, updateCrypto, deleteCrypto,
  listMetals, createMetal, updateMetal, deleteMetal,
  listCash, createCash, updateCash, deleteCash,
} from '@/lib/finance/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Kind = 'crypto' | 'metals' | 'cash';
function kindOf(v: string | null): Kind | null {
  return v === 'crypto' || v === 'metals' || v === 'cash' ? v : null;
}

export async function GET() {
  try {
    const [crypto, metals, cash] = await Promise.all([listCrypto(), listMetals(), listCash()]);
    return NextResponse.json({ ok: true, crypto, metals, cash });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const kind = kindOf(body.kind);
    if (!kind) return NextResponse.json({ ok: false, error: 'kind_required' }, { status: 400 });
    const id =
      kind === 'crypto' ? await createCrypto(body)
      : kind === 'metals' ? await createMetal(body)
      : await createCash(body);
    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { kind: rawKind, id, ...patch } = await req.json();
    const kind = kindOf(rawKind);
    if (!kind || !id) return NextResponse.json({ ok: false, error: 'kind_and_id_required' }, { status: 400 });
    if (kind === 'crypto') await updateCrypto(id, patch);
    else if (kind === 'metals') await updateMetal(id, patch);
    else await updateCash(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const kind = kindOf(req.nextUrl.searchParams.get('kind'));
    const id = req.nextUrl.searchParams.get('id');
    if (!kind || !id) return NextResponse.json({ ok: false, error: 'kind_and_id_required' }, { status: 400 });
    if (kind === 'crypto') await deleteCrypto(id);
    else if (kind === 'metals') await deleteMetal(id);
    else await deleteCash(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

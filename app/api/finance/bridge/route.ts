import { NextRequest, NextResponse } from 'next/server';
import { readBridge, writeBridge } from '@/lib/finance/bridge';
import { BRIDGE_WRITE_ENABLED, BRIDGE_WRITE_TOKEN } from '@/lib/finance/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read: the private dashboard consumes the bridge summary.
export async function GET() {
  try {
    const bridge = await readBridge();
    return NextResponse.json({ ok: true, bridge });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

// Write: ONLY the business dashboard, holding the shared secret, may push the
// minimal summary. Authenticated + field-whitelisted (see writeBridge) so no
// business-confidential data can cross.
export async function POST(req: NextRequest) {
  try {
    if (!BRIDGE_WRITE_ENABLED) {
      return NextResponse.json({ ok: false, error: 'bridge_write_disabled' }, { status: 503 });
    }
    const auth = req.headers.get('authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '');
    if (token !== BRIDGE_WRITE_TOKEN) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    const body = await req.json();
    const bridge = await writeBridge(body);
    return NextResponse.json({ ok: true, bridge });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

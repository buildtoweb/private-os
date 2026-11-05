import { NextRequest, NextResponse } from 'next/server';
import { syncRecent } from '@/lib/whoop';
import { createHmac, timingSafeEqual } from 'crypto';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get('x-whoop-signature') || '';
  const timestamp = req.headers.get('x-whoop-signature-timestamp') || '';
  const secret = process.env.WHOOP_WEBHOOK_SECRET;
  if (secret) {
    const expected = createHmac('sha256', secret).update(timestamp + raw).digest('base64');
    try {
      const ok = timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
    } catch {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }
  try { await syncRecent(3); } catch (e) { /* best-effort */ }
  return NextResponse.json({ ok: true });
}

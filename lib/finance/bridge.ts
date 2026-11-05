// Business → Private bridge. ONE-WAY: the business dashboard writes this doc,
// the private dashboard only reads it. No business-confidential detail (clients,
// invoices, revenue) ever crosses — only the three modeled concepts below.
import { db, BUSINESS_BRIDGE } from '@/lib/db';
import type { BridgeDoc } from './types';

const LATEST_DOC = 'latest';

// Only these fields are ever accepted/exposed across the bridge.
export const BRIDGE_FIELDS = [
  'period', 'distributableAmount', 'actualDraw', 'taxReservePct', 'taxReserveAmount',
] as const;

export async function readBridge(): Promise<BridgeDoc | null> {
  const snap = await db().collection(BUSINESS_BRIDGE).doc(LATEST_DOC).get();
  if (!snap.exists) return null;
  const d = snap.data() as Partial<BridgeDoc>;
  return {
    period: d.period || LATEST_DOC,
    distributableAmount: Number(d.distributableAmount) || 0,
    actualDraw: Number(d.actualDraw) || 0,
    taxReservePct: Number(d.taxReservePct) || 0,
    taxReserveAmount: Number(d.taxReserveAmount) || 0,
    timestamp: Number(d.timestamp) || 0,
  };
}

// Writes only the whitelisted fields. Any extra keys in `input` are dropped, so
// the business side can never accidentally push confidential data here.
export async function writeBridge(input: Record<string, unknown>): Promise<BridgeDoc> {
  const clean: Record<string, unknown> = {};
  for (const k of BRIDGE_FIELDS) {
    if (input[k] === undefined) continue;
    clean[k] = k === 'period' ? String(input[k]) : Number(input[k]) || 0;
  }
  clean.timestamp = Date.now();
  if (!clean.period) clean.period = LATEST_DOC;
  await db().collection(BUSINESS_BRIDGE).doc(LATEST_DOC).set(clean, { merge: true });
  return (await readBridge())!;
}

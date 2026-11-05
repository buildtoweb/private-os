// Daily-passage interaction storage (private.passage_log, doc_id = date).
//
// Server-only: pulls in lib/db.ts (node:crypto). The corpus itself is static and
// lives in git — only what the user did with it is persisted here.
import { db, PASSAGE_LOG } from './db';
import { withTable } from './provision';
import type { PassageLog } from './passages/types';

function toLog(id: string, d: Record<string, any> | undefined): PassageLog {
  const data = d || {};
  return {
    date: data.date || id,
    passageId: data.passageId || '',
    sourceId: data.sourceId || '',
    read: !!data.read,
    favorite: !!data.favorite,
    readAt: data.readAt ?? null,
  };
}

export async function getPassageLog(dateISO: string): Promise<PassageLog | null> {
  // Reading is what runs when the dashboard is merely opened, so this is where
  // a table that was never created gets noticed and fixed — before the first
  // press of "gelesen" rather than after it.
  return withTable(PASSAGE_LOG, async () => {
    const snap = await db().collection(PASSAGE_LOG).doc(dateISO).get();
    return snap.exists ? toLog(snap.id, snap.data()) : null;
  });
}

export async function getFavorites(): Promise<PassageLog[]> {
  const snap = await db().collection(PASSAGE_LOG).where('favorite', '==', true).get();
  return snap.docs.map((s) => toLog(s.id, s.data()));
}

/**
 * Field-level merge, like upsertHabits: marking a passage read must not clear a
 * favourite set a moment earlier, and vice versa.
 */
export async function upsertPassageLog(
  dateISO: string,
  patch: Partial<PassageLog> & { passageId: string; sourceId: string },
): Promise<PassageLog> {
  return withTable(PASSAGE_LOG, async () => {
    const ref = db().collection(PASSAGE_LOG).doc(dateISO);
    const snap = await ref.get();
    const existing = snap.exists ? toLog(snap.id, snap.data()) : null;

    const next: PassageLog = {
      date: dateISO,
      passageId: patch.passageId,
      sourceId: patch.sourceId,
      read: patch.read ?? existing?.read ?? false,
      favorite: patch.favorite ?? existing?.favorite ?? false,
      readAt: existing?.readAt ?? null,
    };
    // Stamp readAt the first time it flips to read, and clear it if un-read.
    if (next.read && !next.readAt) next.readAt = new Date().toISOString();
    if (!next.read) next.readAt = null;

    await ref.set(next as any);
    return next;
  });
}

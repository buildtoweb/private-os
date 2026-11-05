// Brute-force brake for the PIN login. A six-digit PIN has only a million
// values, so without this a script could walk through all of them.
//
// Counted in the database because serverless instances share no memory. Two
// limits: per IP, and across all IPs so a botnet gets no further than one
// client. An attacker can lock the login for 15 minutes at a time, but existing
// sessions keep working, which is the right trade for one-person health data.
//
// A database failure never locks the owner out: the check simply passes.
import { createHash } from 'node:crypto';
import { db } from './db';
import { withTable } from './provision';

const TABLE = 'login_attempts';
const WINDOW_MS = 15 * 60_000;
const MAX_PER_IP = 5;
const MAX_TOTAL = 30;
const ALL = 'all';

type Attempts = { fails: number; since: number };

const ipKey = (ip: string) => createHash('sha256').update(ip).digest('hex');

async function read(id: string): Promise<Attempts> {
  const snap = await withTable(TABLE, () => db().collection(TABLE).doc(id).get());
  const data = snap.exists ? (snap.data() as Attempts) : null;
  if (!data || Date.now() - data.since > WINDOW_MS) return { fails: 0, since: Date.now() };
  return data;
}

export async function isLocked(ip: string): Promise<boolean> {
  try {
    const [one, all] = await Promise.all([read(ipKey(ip)), read(ALL)]);
    return one.fails >= MAX_PER_IP || all.fails >= MAX_TOTAL;
  } catch (e) {
    console.error('[login] Sperrprüfung fehlgeschlagen', e);
    return false;
  }
}

export async function recordFailure(ip: string): Promise<void> {
  try {
    await Promise.all([ipKey(ip), ALL].map(async (id) => {
      const current = await read(id);
      await db().collection(TABLE).doc(id).set({ ...current, fails: current.fails + 1 });
    }));
  } catch (e) {
    console.error('[login] Fehlversuch nicht gespeichert', e);
  }
}

export async function clearFailures(ip: string): Promise<void> {
  try {
    await db().collection(TABLE).doc(ipKey(ip)).delete();
  } catch (e) {
    console.error('[login] Zähler nicht zurückgesetzt', e);
  }
}

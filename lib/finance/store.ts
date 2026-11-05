// CRUD for the manual finance tables (Supabase `private` schema). Server-side only.
import {
  db,
  FIN_CRYPTO, FIN_METALS, FIN_CASH, FIN_INCOME,
  FIN_SAVINGS_PLAN, FIN_GOALS,
} from '@/lib/db';
import type {
  CryptoHolding, MetalHolding, CashAccount,
  SavingsPlan, SavingsGoal, IncomeEntry,
} from './types';

function now() { return Date.now(); }

// ─── Crypto ────────────────────────────────────────────────
export async function listCrypto(): Promise<CryptoHolding[]> {
  const snap = await db().collection(FIN_CRYPTO).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CryptoHolding, 'id'>) }));
}
export async function createCrypto(h: Partial<CryptoHolding>): Promise<string> {
  const ref = await db().collection(FIN_CRYPTO).add({
    coinId: h.coinId || '',
    symbol: h.symbol || '',
    amount: Number(h.amount) || 0,
    buyDate: h.buyDate || null,
    buyPriceEur: h.buyPriceEur != null ? Number(h.buyPriceEur) : null,
    createdAt: now(), updatedAt: now(),
  });
  return ref.id;
}
export async function updateCrypto(id: string, patch: Partial<CryptoHolding>) {
  const data = cleanPatch(patch, ['coinId', 'symbol', 'amount', 'buyDate', 'buyPriceEur']);
  await db().collection(FIN_CRYPTO).doc(id).set({ ...data, updatedAt: now() }, { merge: true });
}
export async function deleteCrypto(id: string) {
  await db().collection(FIN_CRYPTO).doc(id).delete();
}

// ─── Metals ────────────────────────────────────────────────
export async function listMetals(): Promise<MetalHolding[]> {
  const snap = await db().collection(FIN_METALS).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MetalHolding, 'id'>) }));
}
export async function createMetal(h: Partial<MetalHolding>): Promise<string> {
  const ref = await db().collection(FIN_METALS).add({
    metal: h.metal || 'gold',
    unit: h.unit || 'g',
    amount: Number(h.amount) || 0,
    buyDate: h.buyDate || null,
    buyPriceEur: h.buyPriceEur != null ? Number(h.buyPriceEur) : null,
    createdAt: now(), updatedAt: now(),
  });
  return ref.id;
}
export async function updateMetal(id: string, patch: Partial<MetalHolding>) {
  const data = cleanPatch(patch, ['metal', 'unit', 'amount', 'buyDate', 'buyPriceEur']);
  await db().collection(FIN_METALS).doc(id).set({ ...data, updatedAt: now() }, { merge: true });
}
export async function deleteMetal(id: string) {
  await db().collection(FIN_METALS).doc(id).delete();
}

// ─── Cash ──────────────────────────────────────────────────
export async function listCash(): Promise<CashAccount[]> {
  const snap = await db().collection(FIN_CASH).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CashAccount, 'id'>) }));
}
export async function createCash(c: Partial<CashAccount>): Promise<string> {
  const ref = await db().collection(FIN_CASH).add({
    name: c.name || 'Konto',
    balanceEur: Number(c.balanceEur) || 0,
    currency: c.currency || 'EUR',
    lastUpdated: now(),
  });
  return ref.id;
}
export async function updateCash(id: string, patch: Partial<CashAccount>) {
  const data = cleanPatch(patch, ['name', 'balanceEur', 'currency']);
  await db().collection(FIN_CASH).doc(id).set({ ...data, lastUpdated: now() }, { merge: true });
}
export async function deleteCash(id: string) {
  await db().collection(FIN_CASH).doc(id).delete();
}

// ─── Savings plan (single config doc, id "current") ────────
const PLAN_DOC = 'current';
export async function getSavingsPlan(): Promise<SavingsPlan | null> {
  const snap = await db().collection(FIN_SAVINGS_PLAN).doc(PLAN_DOC).get();
  return snap.exists ? (snap.data() as SavingsPlan) : null;
}
export async function setSavingsPlan(p: Partial<SavingsPlan>) {
  await db().collection(FIN_SAVINGS_PLAN).doc(PLAN_DOC).set({
    isin: p.isin || '',
    name: p.name || '',
    monthlyEur: Number(p.monthlyEur) || 0,
    interval: 'monthly',
    startDate: p.startDate || null,
    updatedAt: now(),
  }, { merge: true });
}
export async function deleteSavingsPlan() {
  await db().collection(FIN_SAVINGS_PLAN).doc(PLAN_DOC).delete();
}

// ─── Savings goals ─────────────────────────────────────────
export async function listGoals(): Promise<SavingsGoal[]> {
  const snap = await db().collection(FIN_GOALS).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<SavingsGoal, 'id'>) }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
export async function createGoal(g: Partial<SavingsGoal>): Promise<string> {
  const ref = await db().collection(FIN_GOALS).add({
    name: g.name || 'Sparziel',
    targetEur: Number(g.targetEur) || 0,
    savedEur: Number(g.savedEur) || 0,
    deadline: g.deadline || null,
    createdAt: now(), updatedAt: now(),
  });
  return ref.id;
}
export async function updateGoal(id: string, patch: Partial<SavingsGoal>) {
  const data = cleanPatch(patch, ['name', 'targetEur', 'savedEur', 'deadline']);
  await db().collection(FIN_GOALS).doc(id).set({ ...data, updatedAt: now() }, { merge: true });
}
export async function deleteGoal(id: string) {
  await db().collection(FIN_GOALS).doc(id).delete();
}

// ─── Income (per month, manual override) ───────────────────
export async function getIncome(month: string): Promise<IncomeEntry | null> {
  const snap = await db().collection(FIN_INCOME).doc(month).get();
  return snap.exists ? (snap.data() as IncomeEntry) : null;
}
export async function setIncome(month: string, amountEur: number, source: 'bridge' | 'manual' = 'manual') {
  await db().collection(FIN_INCOME).doc(month).set({
    month, amountEur: Number(amountEur) || 0, source, updatedAt: now(),
  }, { merge: true });
}

// Drops undefined/unknown keys and coerces numeric fields so partial PATCHes
// never overwrite stored values with garbage.
const NUMERIC = new Set(['amount', 'balanceEur', 'buyPriceEur', 'monthlyEur', 'targetEur', 'savedEur', 'amountEur']);
function cleanPatch<T extends Record<string, any>>(patch: T, allowed: string[]): Partial<T> {
  const out: Record<string, any> = {};
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    out[k] = NUMERIC.has(k) && patch[k] !== null ? Number(patch[k]) : patch[k];
  }
  return out as Partial<T>;
}

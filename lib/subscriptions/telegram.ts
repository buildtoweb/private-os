// Telegram reminder formatting + de-duplication.
//
// Same ownership model as the business dashboard: this app does NOT hold a bot
// token and never talks to Telegram. n8n owns the bot credential and the
// schedule; it polls /api/notifications/telegram-push and forwards the returned
// `text` to its Telegram sendMessage node.
//
// Dedup differs from the business side on purpose. There, a digest repeats
// daily until the task is done. Here the reminder is a one-shot heads-up ("in 7
// days €320 leaves your account"), so the key is per *charge*
// (service + due date), not per day — otherwise n8n polling every 30 minutes
// would resend the same warning on all seven days.
// Server-only: reads the Supabase service key via lib/db. Imported exclusively
// from route handlers. (This repo has no `server-only` package — lib/db.ts
// relies on the same convention.)
import { db, SUBSCRIPTION_PUSHES } from '@/lib/db';
import type { UpcomingPayment } from './types';

/** Notify this many days ahead of a charge. */
export const LEAD_DAYS = Number(process.env.SUBS_LEAD_DAYS) || 7;
/** Only charges at or above this amount are worth a push. */
export const MIN_AMOUNT_EUR = Number(process.env.SUBS_MIN_AMOUNT_EUR) || 50;

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents: "Verlängerung" -> "verlangerung"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Stable identity of one charge. */
export function paymentKey(p: UpcomingPayment): string {
  return `${slug(p.service)}__${p.dueDate}`;
}

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const eur = (n: number) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(n);

const dmy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

function whenLabel(days: number): string {
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  return `in ${days} Tagen`;
}

/** The message n8n forwards. HTML parse_mode. */
export function formatDigest(payments: UpcomingPayment[]): string {
  const total = payments.reduce((n, p) => n + p.amount, 0);
  const lines: string[] = [];

  lines.push(
    payments.length === 1
      ? '<b>Anstehende Abbuchung</b>'
      : `<b>${payments.length} anstehende Abbuchungen</b>`,
  );
  lines.push('');

  for (const p of payments) {
    lines.push(
      `• <b>${escapeHtml(p.service)}</b> — ${eur(p.amount)}\n` +
        `  ${whenLabel(p.daysUntil)} · ${dmy(p.dueDate)} · ${escapeHtml(p.interval)}`,
    );
  }

  if (payments.length > 1) {
    lines.push('');
    lines.push(`Summe: <b>${eur(total)}</b>`);
  }
  return lines.join('\n');
}

// ─── Dedup state ──────────────────────────────────────────────

// One point lookup per candidate. The db shim's where() only speaks scalar
// comparisons against `data->>field` — it has no `in` and cannot filter on the
// document id — and there are at most a dozen candidates per run, so direct
// doc reads are both simpler and exact.
async function alreadySent(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const hits = await Promise.all(
    keys.map(async (k) => ((await db().collection(SUBSCRIPTION_PUSHES).doc(k).get()).exists ? k : null)),
  );
  return new Set(hits.filter((k): k is string => k !== null));
}

/**
 * Split `candidates` into the ones not yet pushed, plus a committer that records
 * them. The caller marks them sent only after n8n has actually taken delivery
 * (i.e. not on a dry run).
 */
export async function selectPending(
  candidates: UpcomingPayment[],
): Promise<{ pending: UpcomingPayment[]; markSent: () => Promise<void> }> {
  const keyed = candidates.map((p) => [paymentKey(p), p] as const);
  const sent = await alreadySent(keyed.map(([k]) => k));
  const pending = keyed.filter(([k]) => !sent.has(k));

  return {
    pending: pending.map(([, p]) => p),
    markSent: async () => {
      await Promise.all(
        pending.map(([k, p]) =>
          db().collection(SUBSCRIPTION_PUSHES).doc(k).set({
            service: p.service,
            dueDate: p.dueDate,
            amountEur: p.amount,
            sentAt: new Date().toISOString(),
          }),
        ),
      );
    },
  };
}

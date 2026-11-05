// Abonnements / Fixkosten — read from the private Notion database, with the
// schedule maths taken from lib/subscriptions/schedule.ts (the same anchor
// roll-forward the dashboard card and the Telegram reminder use).
import { getSubscriptions } from '@/lib/subscriptions/notion';
import { buildUpcoming, computeTotals, parseIsoDate, startOfToday } from '@/lib/subscriptions/schedule';
import { LEAD_DAYS, MIN_AMOUNT_EUR } from '@/lib/subscriptions/telegram';
import type { Subscription } from '@/lib/subscriptions/types';
import type { Warnings } from '../envelope';
import { CURRENCY, compact, formatEur, plural, ratioPct, round, sentences } from '../format';

/** Default horizon for "was steht an" — long enough for a monthly overview. */
const DEFAULT_HORIZON_DAYS = 60;

export async function buildSubscriptions(
  warn: Warnings,
  opts: { horizonDays?: number; anchorDate?: string } = {},
) {
  const subs = await warn.guard<Subscription[]>('subscriptions.notion', () => getSubscriptions(), []);
  if (!subs.length) {
    return compact({
      currency: CURRENCY,
      available: false,
      summary: 'Keine Abonnement-Daten verfügbar — Details siehe warnings.',
    });
  }

  const today = opts.anchorDate ? (parseIsoDate(opts.anchorDate) ?? startOfToday()) : startOfToday();
  const horizon = opts.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const totals = computeTotals(subs);
  const upcoming = buildUpcoming(subs, today);
  const withinHorizon = upcoming.filter((p) => p.daysUntil <= horizon);

  const active = subs.filter((s) => s.status !== 'Inaktiv');
  const undated = active.filter((s) => !s.anchor);
  if (undated.length) {
    warn.add('subscriptions.schedule', `${undated.length} aktive Abos ohne Verlängerungsdatum — für sie lässt sich kein Fälligkeitstermin berechnen.`);
  }

  const nextCharge = withinHorizon[0];
  const dueSoon = withinHorizon.filter((p) => p.daysUntil <= LEAD_DAYS && p.amount >= MIN_AMOUNT_EUR);

  return compact({
    currency: CURRENCY,
    available: true,
    as_of: today.toISOString().slice(0, 10),
    horizon_days: horizon,

    totals: {
      per_month_eur: round(totals.perMonthEur, 2),
      per_year_eur: round(totals.perYearEur, 2),
      monthly_charges_eur: round(totals.monthlyEur, 2),
      quarterly_charges_eur: round(totals.quarterlyEur, 2),
      yearly_charges_eur: round(totals.yearlyEur, 2),
      active_count: active.length,
      inactive_count: subs.length - active.length,
    },

    by_category: totals.byCategory.map((c) => compact({
      category: c.category,
      per_year_eur: round(c.perYearEur, 2),
      per_month_eur: round(c.perYearEur / 12, 2),
      share_pct: ratioPct(c.perYearEur, totals.perYearEur),
      count: c.count,
    })),

    upcoming: withinHorizon.map((p) => compact({
      service: p.service,
      amount_eur: round(p.amount, 2),
      due_date: p.dueDate,
      days_until: p.daysUntil,
      interval: p.interval,
      category: p.category,
      status: p.status,
      yearly_eur: round(p.yearlyEur, 2),
    })),

    due_soon: dueSoon.map((p) => ({ service: p.service, amount_eur: round(p.amount, 2), due_date: p.dueDate, days_until: p.daysUntil })),

    without_schedule: undated.map((s) => compact({
      service: s.service,
      amount_eur: round(s.amount, 2),
      interval: s.interval,
      category: s.category,
    })),

    inactive: subs.filter((s) => s.status === 'Inaktiv').map((s) => ({ service: s.service, amount_eur: round(s.amount, 2), interval: s.interval })),

    reminder_rule: {
      lead_days: LEAD_DAYS,
      min_amount_eur: MIN_AMOUNT_EUR,
      description: `Telegram-Erinnerung, wenn eine Abbuchung in ${LEAD_DAYS} Tagen oder weniger ansteht und mindestens ${MIN_AMOUNT_EUR} € beträgt.`,
    },

    summary: sentences(
      `${plural(active.length, 'aktives Abo kostet', 'aktive Abos kosten')} ${formatEur(totals.perMonthEur)} pro Monat bzw. ${formatEur(totals.perYearEur)} pro Jahr.`,
      nextCharge
        ? `Nächste Abbuchung: ${nextCharge.service} mit ${formatEur(nextCharge.amount)} am ${nextCharge.dueDate}${nextCharge.daysUntil === 0 ? ' (heute)' : ` (in ${plural(nextCharge.daysUntil, 'Tag', 'Tagen')})`}.`
        : `In den nächsten ${horizon} Tagen steht keine Abbuchung an.`,
      dueSoon.length > 1 ? `${dueSoon.length} Abbuchungen erreichen die Erinnerungsschwelle.` : '',
      totals.byCategory[0] ? `Größter Kostenblock: ${totals.byCategory[0].category} mit ${formatEur(totals.byCategory[0].perYearEur)} pro Jahr.` : '',
    ),
  });
}

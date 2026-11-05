// Abonnements / Fixkosten — shared types.
//
// Source of truth is the private Notion database "Abonnements" (same model as
// the business dashboard's "Laufende Kosten"). The dashboard only reads it.

export type Interval = 'Monatlich' | 'Quartalsweise' | 'Jährlich';
export type SubStatus = 'Aktiv' | 'Inaktiv' | 'Probeabo';

export const INTERVALS: Interval[] = ['Monatlich', 'Quartalsweise', 'Jährlich'];

/** How many times per year an interval is charged — the multiplier behind
 *  Notion's "Gesamt Kosten" formula, mirrored here so the dashboard never
 *  depends on the formula being present or correct. */
export const CHARGES_PER_YEAR: Record<Interval, number> = {
  Monatlich: 12,
  Quartalsweise: 4,
  Jährlich: 1,
};

/** Months between two charges. */
export const INTERVAL_MONTHS: Record<Interval, number> = {
  Monatlich: 1,
  Quartalsweise: 3,
  Jährlich: 12,
};

export type Subscription = {
  id: string;             // Notion page id
  service: string;
  amount: number;         // the amount charged per interval (EUR)
  interval: Interval;
  status: SubStatus;
  category: string;       // "Auto", "Software", … | "Sonstiges"
  /** "Verlängerung" from Notion — the anchor the schedule rolls forward from.
   *  May be in the past; may be null when the row has no date. */
  anchor: string | null;  // YYYY-MM-DD
  yearlyEur: number;      // amount * CHARGES_PER_YEAR[interval]
};

export type UpcomingPayment = Subscription & {
  /** Next charge on or after today, rolled forward from `anchor`. */
  dueDate: string;        // YYYY-MM-DD
  daysUntil: number;      // 0 = today
};

export type FixedCostTotals = {
  perMonthEur: number;    // monthly-equivalent of everything active
  perYearEur: number;
  monthlyEur: number;     // sum of the Monatlich rows
  quarterlyEur: number;   // sum of the Quartalsweise rows
  yearlyEur: number;      // sum of the Jährlich rows
  byCategory: { category: string; perYearEur: number; count: number }[];
};

export type SubscriptionsSummary = {
  totals: FixedCostTotals;
  upcoming: UpcomingPayment[];
  /** Active rows whose "Verlängerung" is empty — no schedule can be derived,
   *  so they are excluded from `upcoming` and surfaced for a manual fix. */
  undated: Subscription[];
  inactive: Subscription[];
};

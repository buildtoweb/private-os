'use client';
import { FINANCE_PERIODS, type FinancePeriod } from '@/lib/finance/period';

export function PeriodSelector({ value, onChange, label = 'Zeitraum für das Finanz-Dashboard' }: { value: FinancePeriod; onChange: (period: FinancePeriod) => void; label?: string }) {
  return (
    <div className="finance-period-selector" role="group" aria-label={label}>
      {FINANCE_PERIODS.map(({ key, label }) => (
        <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}

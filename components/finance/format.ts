// Shared formatting + design tokens for the Finance tab.
import type { AssetClass } from '@/lib/finance/types';

export function eur(n: number, opts: { decimals?: boolean } = {}): string {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(Number.isFinite(n) ? n : 0);
}

// Compact for axis ticks: 17.6k €
export function eurCompact(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}

export function pct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function signedPct(fraction: number, digits = 1): string {
  const v = fraction * 100;
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

export function signedEur(n: number): string {
  return `${n >= 0 ? '+' : ''}${eur(n, { decimals: true })}`;
}

// Status colors only (STYLE.md): green gains / red losses; neutral otherwise.
export function gainColor(v: number | null | undefined): string {
  if (v == null || v === 0) return 'var(--fg)';
  return v > 0 ? 'var(--success)' : 'var(--error)';
}

// Asset-class differentiation in charts/legends. Drawn from the four Tactile
// accents plus one desaturated step, so a five-slice donut still reads as one
// palette rather than a rainbow. Ordered by how much of the portfolio each
// class typically holds, so the two largest slices are the furthest apart in hue.
export const CLASS_COLOR: Record<AssetClass, string> = {
  stocks: '#7d93b0', // slate
  etf:    '#7ba888', // sage
  crypto: '#e8a33d', // amber
  metals: '#c97b5a', // clay
  cash:   '#6f6a70', // neutral — cash is the absence of a position
};

export const CLASS_LABEL: Record<AssetClass, string> = {
  stocks: 'Aktien', etf: 'ETFs', crypto: 'Krypto', metals: 'Edelmetalle', cash: 'Cash',
};

// Prices in the currency they are quoted in. Sub-unit coins (FET at 0.20)
// need more than two decimals to be readable.
export function money(n: number, currency = 'EUR', opts: { decimals?: number } = {}): string {
  const digits = opts.decimals ?? (Math.abs(n) < 1 ? 4 : 2);
  return new Intl.NumberFormat('de-AT', {
    style: 'currency', currency, minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits,
  }).format(Number.isFinite(n) ? n : 0);
}

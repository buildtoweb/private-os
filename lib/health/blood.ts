// Blood-panel insights: given all imported panels (newest → oldest), derive
// the "2026 im Fokus" view — current abnormalities (with change vs the previous
// same marker) and cross-time trends for markers measured more than once.
// Pure functions, no I/O.

export type Flag = 'ok' | 'low' | 'high' | 'watch';
export type Marker = {
  group: string; name: string; value: number | string; unit?: string;
  refLow?: number; refHigh?: number; refText?: string; flag?: Flag; key?: string;
};
export type BloodPanel = {
  date: string; dateApprox?: boolean; lab: string; label?: string; shortLabel?: string; source?: string;
  kind?: 'blood' | 'allergy'; note?: string; markers: Marker[];
};

// Markers we track across time. `goal` says which direction is healthier so we
// can label a change as improved/worsened; `target` is the threshold to reach.
type TrendGoal = 'high' | 'low' | 'range';
const TREND_META: Record<string, { label: string; unit: string; goal: TrendGoal; target?: number; refLow?: number; refHigh?: number }> = {
  vitamin_d:    { label: 'Vitamin D',        unit: 'ng/ml',  goal: 'high', target: 30 },
  triglyceride: { label: 'Triglyceride',     unit: 'mg/dl',  goal: 'low',  target: 150 },
  hdl:          { label: 'HDL-Cholesterin',  unit: 'mg/dl',  goal: 'high', target: 55 },
  got:          { label: 'GOT (Leber)',      unit: 'U/l',    goal: 'low',  target: 35 },
  gpt:          { label: 'GPT (Leber)',      unit: 'U/l',    goal: 'low',  target: 45 },
  tsh:          { label: 'TSH',              unit: 'µIU/ml', goal: 'range', refLow: 0.51, refHigh: 4.30 },
};

// Panels drawn within this window of the newest one count as "current" — a lab
// round often spans two draws a day apart (two labs on consecutive days).
const CURRENT_WINDOW_MS = 45 * 864e5;

export type TrendPoint = { date: string; value: number; inRange: boolean };
export type Trend = {
  key: string; label: string; unit: string; goal: TrendGoal; target?: number;
  points: TrendPoint[];
  direction: 'improved' | 'worsened' | 'stable';
  first: number; last: number; changePct: number;
};

export type FlaggedMarker = Marker & {
  panelDate: string;
  source?: string;          // which current panel it came from (shortLabel)
  prev?: { date: string; value: number };
  delta?: number;           // last − prev (raw)
  movingToTarget?: boolean; // is the change heading the healthy way?
};

export type BloodInsights = {
  latestDate: string | null;
  latestLabel: string | null;
  flagged: FlaggedMarker[];
  improved: FlaggedMarker[];   // markers still not perfect but better than before
  trends: Trend[];
  allergyNote: string | null;
  counts: { total: number; abnormal: number };
};

const numOf = (v: number | string): number | null => {
  if (typeof v === 'number') return v;
  const m = /-?\d+(?:[.,]\d+)?/.exec(v);
  return m ? parseFloat(m[0].replace(',', '.')) : null;
};

const inRangeFor = (goal: TrendGoal, value: number, meta: { target?: number; refLow?: number; refHigh?: number }): boolean => {
  if (goal === 'high') return meta.target == null || value >= meta.target;
  if (goal === 'low') return meta.target == null || value <= meta.target;
  return meta.refLow == null || meta.refHigh == null || (value >= meta.refLow && value <= meta.refHigh);
};

export function computeBloodInsights(panels: BloodPanel[]): BloodInsights {
  const blood = panels.filter((p) => p.kind !== 'allergy').sort((a, b) => (a.date < b.date ? 1 : -1));
  const allergy = panels.find((p) => p.kind === 'allergy' && p.note) ?? null;
  const latest = blood[0] ?? null;

  // ── cross-time trends ────────────────────────────────────────────
  const byKey = new Map<string, { date: string; value: number }[]>();
  for (const p of panels) {
    for (const m of p.markers) {
      if (!m.key || !TREND_META[m.key]) continue;
      const v = numOf(m.value);
      if (v == null) continue;
      if (!byKey.has(m.key)) byKey.set(m.key, []);
      byKey.get(m.key)!.push({ date: p.date, value: v });
    }
  }
  const trends: Trend[] = [];
  for (const [key, meta] of Object.entries(TREND_META)) {
    const raw = (byKey.get(key) ?? []).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (raw.length < 2) continue;
    const points: TrendPoint[] = raw.map((p) => ({ ...p, inRange: inRangeFor(meta.goal, p.value, meta) }));
    const first = points[0].value, last = points[points.length - 1].value;
    const changePct = first ? Math.round(((last - first) / Math.abs(first)) * 100) : 0;
    let direction: Trend['direction'] = 'stable';
    const moved = last - first;
    if (Math.abs(moved) >= (meta.goal === 'range' ? Math.max(0.2, Math.abs(first) * 0.1) : Math.abs(first) * 0.05)) {
      if (meta.goal === 'high') direction = moved > 0 ? 'improved' : 'worsened';
      else if (meta.goal === 'low') direction = moved < 0 ? 'improved' : 'worsened';
    }
    trends.push({ key, label: meta.label, unit: meta.unit, goal: meta.goal, target: meta.target, points, direction, first, last, changePct });
  }
  // Most interesting trends first: biggest movers (improved or worsened) before stable.
  trends.sort((a, b) => (a.direction === 'stable' ? 1 : 0) - (b.direction === 'stable' ? 1 : 0) || Math.abs(b.changePct) - Math.abs(a.changePct));

  // ── current abnormalities, enriched with the previous same-key value ──
  const priorValue = (key: string | undefined, beforeDate: string): { date: string; value: number } | undefined => {
    if (!key) return undefined;
    const hist = (byKey.get(key) ?? []).filter((p) => p.date < beforeDate).sort((a, b) => (a.date < b.date ? 1 : -1));
    return hist[0];
  };
  const enrich = (m: Marker, panel: BloodPanel): FlaggedMarker => {
    const prev = priorValue(m.key, panel.date);
    const cur = numOf(m.value);
    const meta = m.key ? TREND_META[m.key] : undefined;
    let delta: number | undefined, movingToTarget: boolean | undefined;
    if (prev && cur != null) {
      delta = Math.round((cur - prev.value) * 100) / 100;
      if (meta) movingToTarget = meta.goal === 'high' ? delta > 0 : meta.goal === 'low' ? delta < 0 : Math.abs(cur - ((meta.refLow! + meta.refHigh!) / 2)) < Math.abs(prev.value - ((meta.refLow! + meta.refHigh!) / 2));
    }
    return { ...m, panelDate: panel.date, source: panel.shortLabel ?? panel.label, prev, delta, movingToTarget };
  };

  // "Current" = every blood panel drawn within the window of the newest one —
  // one lab round can span several draws (two labs on consecutive days).
  const latestTime = latest ? new Date(latest.date).getTime() : 0;
  const current = blood.filter((p) => latestTime - new Date(p.date).getTime() < CURRENT_WINDOW_MS);
  const SEVERITY: Record<string, number> = { high: 0, low: 1, watch: 2 };
  const flagged = current
    .flatMap((p) => p.markers.filter((m) => m.flag && m.flag !== 'ok').map((m) => enrich(m, p)))
    .sort((a, b) => (SEVERITY[a.flag!] ?? 9) - (SEVERITY[b.flag!] ?? 9));
  // "Improved" = abnormal now but measurably better than a prior measurement.
  const improved = flagged.filter((m) => m.movingToTarget && m.delta != null);

  return {
    latestDate: latest?.date ?? null,
    latestLabel: current.length > 1 ? current.map((p) => p.shortLabel ?? p.label ?? p.date).join(' + ') : latest?.label ?? null,
    flagged,
    improved,
    trends,
    allergyNote: allergy?.note ?? null,
    counts: { total: current.reduce((n, p) => n + p.markers.length, 0), abnormal: flagged.length },
  };
}

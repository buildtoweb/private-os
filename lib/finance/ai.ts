// AI insights for the Finance tab. Sends ONLY aggregated numbers (allocation %,
// net worth, savings rate, concentration) to Gemini — never individual holdings
// or transactions. Behind AI_ENABLED; returns [] when not configured.
//
// Direct fetch to the Google Gemini API (free tier, gemini-3.1-flash-lite) to
// avoid an SDK dependency for one call. Server-side only — the key never
// reaches the client.
import { AI_ENABLED, GEMINI_KEY, AI_MODEL } from './config';
import type { FinanceSummary } from './types';

export type Insight = { title: string; body: string; tone: 'info' | 'warning' | 'positive' };

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Aggregate-only projection of the summary — this is the entire dataset sent out.
function aggregates(s: FinanceSummary) {
  return {
    netWorthEur: Math.round(s.netWorthEur),
    allocation: s.allocation.map((a) => ({ class: a.label, pct: Math.round(a.pct * 100) })),
    topConcentrationPct: s.allocation[0] ? Math.round(s.allocation[0].pct * 100) : 0,
    savingsRatePct: s.cashflow.savingsRate != null ? Math.round(s.cashflow.savingsRate * 100) : null,
    monthlyIncomeEur: Math.round(s.cashflow.income),
    monthlyInvestedEur: Math.round(s.cashflow.invested),
    savingsPlanMonthlyEur: s.savingsPlan?.plan.monthlyEur ?? null,
    goalCount: s.goals.length,
  };
}

// Strips ```json fences if the model wraps its output despite the JSON mime type.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

export async function getInsights(summary: FinanceSummary): Promise<{ insights: Insight[]; enabled: boolean }> {
  if (!AI_ENABLED) return { insights: [], enabled: false };

  const data = aggregates(summary);
  const system =
    'Du bist ein nüchterner, präziser Finanz-Coach für ein privates Vermögens-Dashboard. ' +
    'Du bekommst NUR aggregierte Kennzahlen (keine Einzeltransaktionen). ' +
    'Gib 2–4 kurze, umsetzbare Hinweise auf Deutsch: Klumpenrisiko, Sparquote, Allokation. ' +
    'Keine Anlageberatung, keine konkreten Produkte. ' +
    'Antworte ausschließlich als JSON-Objekt der Form ' +
    '{"insights":[{"title":string,"body":string,"tone":"info"|"warning"|"positive"}]}.';

  try {
    const r = await fetch(`${GEMINI_BASE}/${AI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': GEMINI_KEY,
        'content-type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: `Kennzahlen:\n${JSON.stringify(data, null, 2)}` }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
      }),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}`);
    const json = await r.json();
    const text = (json?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p?.text || '')
      .join('');
    const parsed = JSON.parse(extractJson(text));
    const insights: Insight[] = Array.isArray(parsed?.insights) ? parsed.insights.slice(0, 4) : [];
    return { insights, enabled: true };
  } catch {
    return { insights: [], enabled: true };
  }
}

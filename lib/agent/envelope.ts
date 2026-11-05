// Response envelope for the Agent Context API.
//
// Every endpoint answers with the same shape so an external agent can parse one
// format and never has to special-case a domain:
//
//   { ok: true,  generated_at, source, data: {...}, warnings: [...] }
//   { ok: false, generated_at, source, error: { code, message } }
//
// A failing *sub*-source (WHOOP down, Notion rate-limited, price source down)
// must never take the whole response with it — it lands in `warnings` and the
// rest of the payload is delivered. See `Warnings.guard`.
import { NextResponse } from 'next/server';
import { APP_TIMEZONE } from '@/lib/date';

export const AGENT_SOURCE = 'private-dashboard';
export const AGENT_API_VERSION = 'v1';

/** ISO 8601 with the Europe/Vienna offset, e.g. "2026-08-27T14:03:11+02:00". */
export function viennaTimestamp(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZoneName: 'longOffset',
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  // "GMT+02:00" → "+02:00"; plain "GMT" (UTC) → "+00:00".
  const offset = (p.timeZoneName || '').replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${offset}`;
}

export type AgentWarning = { source: string; message: string };

/** An error whose code/status is safe to show the caller. */
export class AgentError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
  }
}

export class Warnings {
  private readonly list: AgentWarning[] = [];

  add(source: string, message: string) {
    // Truncated so a verbose upstream stack can't bloat the response.
    this.list.push({ source, message: message.slice(0, 300) });
  }

  /**
   * Run one sub-source. On failure the domain keeps going with `fallback` and
   * the reason is recorded — partial data beats a 500 for a briefing agent.
   */
  async guard<T>(source: string, run: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await run();
    } catch (e: any) {
      this.add(source, e?.body?.message || e?.message || String(e));
      return fallback;
    }
  }

  get all(): AgentWarning[] {
    return this.list;
  }
}

const NO_STORE = {
  'cache-control': 'no-store, private',
  // Personal data — never let a proxy or a crawler hold on to it.
  'x-robots-tag': 'noindex, nofollow',
} as const;

export function agentOk(data: unknown, warnings: Warnings | AgentWarning[] = []) {
  return NextResponse.json(
    {
      ok: true,
      generated_at: viennaTimestamp(),
      source: AGENT_SOURCE,
      data,
      warnings: warnings instanceof Warnings ? warnings.all : warnings,
    },
    { headers: NO_STORE },
  );
}

export function agentFail(code: string, message: string, status = 500, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    {
      ok: false,
      generated_at: viennaTimestamp(),
      source: AGENT_SOURCE,
      error: { code, message },
    },
    { status, headers: { ...NO_STORE, ...extraHeaders } },
  );
}

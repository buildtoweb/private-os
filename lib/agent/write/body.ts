// Request-body parsing and validation for write endpoints.
//
// Deliberately strict: an agent that sends a typo'd field gets told, rather than
// having the value silently dropped and believing the write succeeded.
import type { NextRequest } from 'next/server';
import { AgentError } from '../envelope';
import { parseDate } from '../range';
import { appToday } from '@/lib/date';

export type Body = Record<string, unknown>;

export async function readBody(req: NextRequest): Promise<Body> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AgentError('invalid_body', 'Request-Body muss gültiges JSON sein.', 400);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentError('invalid_body', 'Request-Body muss ein JSON-Objekt sein.', 400);
  }
  return raw as Body;
}

/** Reject unknown keys so a misspelled field is an error, not a silent no-op. */
export function rejectUnknown(body: Body, allowed: string[]): void {
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new AgentError(
      'unknown_field',
      `Unbekannte Felder: ${unknown.join(', ')}. Erlaubt: ${allowed.join(', ')}.`,
      400,
    );
  }
}

/**
 * The date a write applies to. Defaults to today.
 *
 * Future days are refused: the dashboard's stats treat a future date as "not yet
 * happened", and letting an agent tick tomorrow's habits would corrupt every
 * completion rate that depends on that.
 */
export function writeDate(body: Body, field = 'date'): string {
  const raw = body[field];
  if (raw == null) return appToday();
  if (typeof raw !== 'string') throw new AgentError('invalid_date', `"${field}" muss ein String sein.`, 400);
  const date = parseDate(raw, field);
  if (date > appToday()) {
    throw new AgentError('future_date', 'Für zukünftige Tage kann nichts eingetragen werden.', 400);
  }
  return date;
}

export function requireString(body: Body, field: string, opts: { max?: number } = {}): string {
  const raw = body[field];
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new AgentError('invalid_param', `"${field}" ist erforderlich und muss ein nicht-leerer String sein.`, 400);
  }
  const value = raw.trim();
  if (opts.max && value.length > opts.max) {
    throw new AgentError('invalid_param', `"${field}" darf höchstens ${opts.max} Zeichen lang sein.`, 400);
  }
  return value;
}

export function optionalString(body: Body, field: string, opts: { max?: number } = {}): string | undefined {
  if (body[field] == null) return undefined;
  const raw = body[field];
  if (typeof raw !== 'string') throw new AgentError('invalid_param', `"${field}" muss ein String sein.`, 400);
  const value = raw.trim();
  if (opts.max && value.length > opts.max) {
    throw new AgentError('invalid_param', `"${field}" darf höchstens ${opts.max} Zeichen lang sein.`, 400);
  }
  return value;
}

export function requireBoolean(body: Body, field: string): boolean {
  const raw = body[field];
  if (typeof raw !== 'boolean') {
    throw new AgentError('invalid_param', `"${field}" ist erforderlich und muss true oder false sein.`, 400);
  }
  return raw;
}

export function optionalBoolean(body: Body, field: string): boolean | undefined {
  if (body[field] == null) return undefined;
  const raw = body[field];
  if (typeof raw !== 'boolean') throw new AgentError('invalid_param', `"${field}" muss true oder false sein.`, 400);
  return raw;
}

export function optionalNumber(
  body: Body,
  field: string,
  opts: { min?: number; max?: number; integer?: boolean } = {},
): number | undefined {
  if (body[field] == null) return undefined;
  const raw = body[field];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new AgentError('invalid_param', `"${field}" muss eine Zahl sein.`, 400);
  }
  if (opts.integer && !Number.isInteger(raw)) {
    throw new AgentError('invalid_param', `"${field}" muss eine ganze Zahl sein.`, 400);
  }
  if (opts.min != null && raw < opts.min) {
    throw new AgentError('invalid_param', `"${field}" darf nicht kleiner als ${opts.min} sein.`, 400);
  }
  if (opts.max != null && raw > opts.max) {
    throw new AgentError('invalid_param', `"${field}" darf nicht größer als ${opts.max} sein.`, 400);
  }
  return raw;
}

export function oneOf<T extends string>(body: Body, field: string, values: readonly T[], required = true): T | undefined {
  const raw = body[field];
  if (raw == null) {
    if (!required) return undefined;
    throw new AgentError('invalid_param', `"${field}" ist erforderlich. Erlaubt: ${values.join(', ')}.`, 400);
  }
  if (typeof raw !== 'string' || !values.includes(raw as T)) {
    throw new AgentError('invalid_param', `"${field}" muss einer dieser Werte sein: ${values.join(', ')}.`, 400);
  }
  return raw as T;
}

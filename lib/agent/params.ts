// Query-parameter coercion. Anything malformed is a 400 with a precise message,
// so an agent gets told what to fix instead of silently receiving default data.
import type { ReflectType } from '@/lib/notion';
import { AgentError } from './envelope';

const TRUE = new Set(['1', 'true', 'yes', 'ja']);
const FALSE = new Set(['0', 'false', 'no', 'nein']);

export function boolParam(params: URLSearchParams, name: string, fallback: boolean): boolean {
  const raw = params.get(name);
  if (raw == null || raw === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (TRUE.has(v)) return true;
  if (FALSE.has(v)) return false;
  throw new AgentError('invalid_param', `"${name}" muss 1/0 bzw. true/false sein.`, 400);
}

export function intParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = params.get(name);
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new AgentError('invalid_param', `"${name}" muss eine ganze Zahl zwischen ${min} und ${max} sein.`, 400);
  }
  return n;
}

export function monthParam(params: URLSearchParams, name: string): string | undefined {
  const raw = params.get(name);
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    throw new AgentError('invalid_param', `"${name}" muss das Format YYYY-MM haben.`, 400);
  }
  const month = Number(raw.slice(5));
  if (month < 1 || month > 12) {
    throw new AgentError('invalid_param', `"${name}" enthält keinen gültigen Monat: ${raw}`, 400);
  }
  return raw;
}

export function reflectTypeParam(params: URLSearchParams, name: string): ReflectType | undefined {
  const raw = params.get(name);
  if (!raw) return undefined;
  if (raw !== 'Tag' && raw !== 'Woche' && raw !== 'Monat') {
    throw new AgentError('invalid_param', `"${name}" muss Tag, Woche oder Monat sein.`, 400);
  }
  return raw;
}

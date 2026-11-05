import { createHmac, timingSafeEqual } from 'crypto';

// No fallback on purpose: this code is public, so a default secret would let
// anyone forge a session. Without SESSION_SECRET nobody can log in at all.
const SECRET = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET fehlt');
  return secret;
};
export const COOKIE = 'dashboard_session';
export const MAX_AGE = 60 * 60 * 24 * 30; // 30d

export function sign(payload: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const body = `${payload}.${exp}`;
  const sig = createHmac('sha256', SECRET()).update(body).digest('hex');
  return `${body}.${sig}`;
}

export function verify(token: string | undefined): boolean {
  if (!token || !process.env.SESSION_SECRET) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [payload, exp, sig] = parts;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac('sha256', SECRET()).update(`${payload}.${exp}`).digest('hex');
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

// Edge-safe HMAC verify using Web Crypto. Used by middleware.
const enc = new TextEncoder();

async function importKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function bytesToHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyEdge(token: string | undefined): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [payload, exp, sig] = parts;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const key = await importKey(secret);
  const expected = bytesToHex(await crypto.subtle.sign('HMAC', key, enc.encode(`${payload}.${exp}`)));
  if (sig.length !== expected.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

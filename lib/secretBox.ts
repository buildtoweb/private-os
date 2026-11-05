// Symmetric encryption for third-party credentials we have to keep (an iCloud
// app-specific password). The key is derived from CREDENTIALS_KEY, falling back
// to SESSION_SECRET, so a database dump alone does not reveal the password.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function key() {
  const secret = process.env.CREDENTIALS_KEY || process.env.SESSION_SECRET;
  if (!secret) throw new Error('CREDENTIALS_KEY / SESSION_SECRET fehlt');
  return createHash('sha256').update(`private-dashboard:credentials:${secret}`).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function open(sealed: string): string {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('unbekanntes Format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

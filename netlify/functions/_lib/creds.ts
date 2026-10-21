import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { CODE_ALPHABET, normalizeCode } from '../../../shared/names';
import { env } from './supabase';

const h = (v: string) => createHmac('sha256', env('CREDENTIAL_PEPPER')).update(v).digest('hex');
export const hashToken = (t: string) => h('t:' + t);
export const hashCode = (c: string) => h('c:' + normalizeCode(c));

export const newToken = () => randomBytes(24).toString('base64url'); // 192 bits
export const newCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/** Accept a bare token, a full QR URL (…#k=TOKEN) or a code. */
export function extractToken(input: string): string {
  const m = input.match(/[#?&]k=([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  return input.trim();
}

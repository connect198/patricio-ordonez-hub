import { createHmac } from 'node:crypto';
import { admin } from './supabase';
import { HttpError } from './http';

const salt = () => process.env.RATE_LIMIT_SALT || process.env.CREDENTIAL_PEPPER || 'kingdom';
export const hashKey = (s: string) => createHmac('sha256', salt()).update(s).digest('hex').slice(0, 24);

/** Throws 429 when the bucket is exhausted. Fails closed only for the hit itself; DB outages do not lock out guests. */
export async function limit(key: string, max: number, windowSeconds: number) {
  const { data, error } = await admin().rpc('rate_limit_hit', { p_key: key, p_limit: max, p_window_seconds: windowSeconds });
  if (error) {
    console.error('rate limit rpc failed', error.message);
    return;
  }
  if (data === false) {
    throw new HttpError(429, 'RATE_LIMITED', 'We are receiving a lot of requests. Please wait a moment and try again, or ask a concierge for help.');
  }
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http';

export const env = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new HttpError(500, 'NOT_CONFIGURED', `Server setting ${name} is not configured.`);
  return v;
};

let client: SupabaseClient | null = null;
/** Service-role client. Bypasses RLS — only ever used server-side after explicit authorization checks. */
export function admin(): SupabaseClient {
  client ??= createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

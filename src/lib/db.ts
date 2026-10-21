import type { PostgrestError } from '@supabase/supabase-js';

const FRIENDLY: [RegExp, string][] = [
  [/TABLE_FULL/, 'That table is already at capacity.'],
  [/CAPACITY_BELOW_ASSIGNED/, 'Capacity cannot be lower than the number of guests already seated there.'],
  [/GUEST_NOT_CONFIRMED/, 'Only guests with a confirmed ticket can be seated.'],
  [/NOT_CONFIRMED/, 'This guest has no confirmed ticket. A manager override is required to check them in.'],
  [/DEMO_PROTECTED/, 'Demonstration and real data can never be mixed.'],
  [/EVENT_MISMATCH|EVENT_IMMUTABLE/, 'That record belongs to a different event.'],
  [/row-level security|permission denied/i, 'Your role does not allow this action.'],
  [/duplicate key.*(event_id, number)|events?_number|unique constraint.*number/i, 'A table with that number already exists.'],
  [/duplicate key/i, 'That record already exists.'],
  [/Failed to fetch|NetworkError|network/i, 'Connection problem — please check your internet and try again.'],
];

export function friendly(e: unknown): string {
  const msg = (e as PostgrestError)?.message ?? (e instanceof Error ? e.message : String(e));
  for (const [re, text] of FRIENDLY) if (re.test(msg)) return text;
  return msg || 'Something went wrong. Please try again.';
}

/** Unwrap a Supabase response or throw a friendly Error. */
export async function must<T>(p: PromiseLike<{ data: T; error: PostgrestError | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(friendly(error));
  return data;
}

/** Page through large tables (Supabase caps responses at 1000 rows). */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = await must(build(from, from + 999));
    out.push(...(rows ?? []));
    if (!rows || rows.length < 1000) break;
  }
  return out;
}

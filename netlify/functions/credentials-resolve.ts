import type { Config } from '@netlify/functions';
import { admin } from './_lib/supabase';
import { HttpError, isUuid, json, readJson, route, str } from './_lib/http';
import { requireStaff } from './_lib/auth';
import { extractToken, hashCode, hashToken } from './_lib/creds';
import { limit } from './_lib/rate';
import { normalizeCode } from '../../shared/names';

export const config: Config = { path: '/api/credentials/resolve' };

/** Staff scanner: turns a scanned QR value (or typed code) into a guest id. */
export default route(['POST'], async (req) => {
  const b = await readJson(req, 5_000);
  if (!isUuid(b.eventId)) throw new HttpError(400, 'BAD_REQUEST');
  const actor = await requireStaff(req, b.eventId, 'staff');
  await limit(`resolve:${actor.userId}`, 240, 60);
  const raw = str(b.value, 400);
  const sb = admin();
  const token = extractToken(raw);
  const code = normalizeCode(raw);
  let q = sb.from('guest_credentials').select('id,guest_id,revoked_at').eq('event_id', b.eventId);
  q = token.length >= 20 ? q.eq('token_hash', hashToken(token)) : q.eq('code_hash', hashCode(code));
  const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'No guest matches this code.');
  if (data.revoked_at) throw new HttpError(410, 'REVOKED', 'This credential has been revoked. Please look the guest up by name.');
  await sb.from('guest_credentials').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  return json({ guestId: data.guest_id });
});

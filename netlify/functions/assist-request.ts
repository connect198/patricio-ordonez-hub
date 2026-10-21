import type { Config } from '@netlify/functions';
import { admin } from './_lib/supabase';
import { HttpError, clientIp, json, readJson, route, str } from './_lib/http';
import { hashKey, limit } from './_lib/rate';
import { hashToken, extractToken } from './_lib/creds';

export const config: Config = { path: '/api/assist' };

export default route(['POST'], async (req, ctx) => {
  const b = await readJson(req, 10_000);
  if (str(b.website)) return json({ ok: true });
  const slug = str(b.slug, 80).toLowerCase();
  const sb = admin();
  const { data: ev } = await sb.from('events').select('id,status').eq('slug', slug).maybeSingle();
  if (!ev || ev.status === 'draft') throw new HttpError(404, 'EVENT_NOT_FOUND');
  const ip = hashKey(clientIp(req, ctx));
  await limit(`assist:${ip}`, 12, 600);
  await limit(`assist-ev:${ev.id}`, 600, 600);

  let guestId: string | null = null;
  const token = str(b.token, 300);
  if (token) {
    const { data } = await sb.from('guest_credentials').select('guest_id').eq('event_id', ev.id).eq('token_hash', hashToken(extractToken(token))).is('revoked_at', null).maybeSingle();
    guestId = data?.guest_id ?? null;
  }
  const { error } = await sb.from('assistance_requests').insert({
    event_id: ev.id,
    guest_id: guestId,
    name_given: str(b.name, 120) || null,
    message: str(b.message, 600) || null,
  });
  if (error) throw new HttpError(500, 'SERVER_ERROR');
  return json({ ok: true });
});

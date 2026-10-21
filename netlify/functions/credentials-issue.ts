import type { Config } from '@netlify/functions';
import { admin } from './_lib/supabase';
import { HttpError, isUuid, json, readJson, route } from './_lib/http';
import { requireStaff } from './_lib/auth';
import { hashCode, hashToken, newCode, newToken } from './_lib/creds';
import { limit } from './_lib/rate';
import { fetchAllRows } from './_lib/page';
import { formatCode } from '../../shared/names';

export const config: Config = { path: '/api/credentials/issue' };

/**
 * Issues private QR tokens + 8-character codes. Plaintext is returned ONCE here (to print/export);
 * only HMAC hashes are stored, so a database leak never exposes usable credentials.
 */
export default route(['POST'], async (req) => {
  const b = await readJson(req, 200_000);
  if (!isUuid(b.eventId)) throw new HttpError(400, 'BAD_REQUEST');
  const actor = await requireStaff(req, b.eventId, 'manager');
  await limit(`issue:${actor.userId}`, 30, 600);
  const sb = admin();

  const { data: ev } = await sb.from('events').select('id,slug').eq('id', b.eventId).single();
  if (!ev) throw new HttpError(404, 'EVENT_NOT_FOUND');
  const site = (process.env.PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '');

  const ids: string[] = Array.isArray(b.guestIds) ? b.guestIds.filter(isUuid).slice(0, 500) : [];
  const guests = await fetchAllRows((from, to) => {
    let q = sb.from('guests').select('id,full_name,display_name').eq('event_id', ev.id).order('id');
    q = b.scope === 'ids' && ids.length ? q.in('id', ids) : q.eq('is_confirmed', true);
    return q.range(from, to);
  });
  const active = await fetchAllRows((from, to) => sb.from('guest_credentials').select('id,guest_id').eq('event_id', ev.id).is('revoked_at', null).order('id').range(from, to));
  const has = new Map(active.map((c) => [c.guest_id, c.id]));
  const regenerate = b.regenerate === true;

  const issued: { guestId: string; name: string; code: string; url: string }[] = [];
  let skipped = 0;
  for (const g of guests) {
    if (has.has(g.id) && !regenerate) { skipped++; continue; }
    if (has.has(g.id)) await sb.from('guest_credentials').update({ revoked_at: new Date().toISOString() }).eq('id', has.get(g.id)!);
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = newToken();
      const code = newCode();
      const { error: e } = await sb.from('guest_credentials').insert({
        event_id: ev.id, guest_id: g.id, token_hash: hashToken(token), code_hash: hashCode(code), created_by: actor.userId,
      });
      if (!e) {
        issued.push({ guestId: g.id, name: g.display_name || g.full_name, code: formatCode(code), url: `${site}/e/${ev.slug}#k=${token}` });
        break;
      }
      if (e.code !== '23505') throw new HttpError(500, 'SERVER_ERROR');
    }
  }
  await sb.from('audit_logs').insert({
    event_id: ev.id, actor: actor.userId, actor_email: actor.email, action: 'issue', entity: 'guest_credentials',
    details: { issued: issued.length, skipped, regenerate },
  });
  return json({ issued, skipped });
});

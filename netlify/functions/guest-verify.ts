import type { Config } from '@netlify/functions';
import { admin } from './_lib/supabase';
import { HttpError, clientIp, json, readJson, route, str } from './_lib/http';
import { hashKey, limit } from './_lib/rate';
import { extractToken, hashCode, hashToken } from './_lib/creds';
import { safeImageUrl } from './_lib/images';
import { looksLikeEmail, nameMatchesAll, nameTokens, normalizeCode, normalizeName } from '../../shared/names';
import { mergeSettings, type VerifiedGuestView } from '../../shared/types';

export const config: Config = { path: '/api/verify' };

const FAIL = new HttpError(401, 'NOT_VERIFIED', 'We could not verify those details. Please check them and try again, or ask a member of our concierge team for assistance.');

export default route(['POST'], async (req, ctx) => {
  const body = await readJson(req, 10_000);
  if (str(body.website)) return json({ error: 'NOT_VERIFIED' }, 401); // honeypot
  const slug = str(body.slug, 80).toLowerCase();
  const name = str(body.name, 120);
  const secret = str(body.secret, 200);
  const token = str(body.token, 300);
  if (!slug || (!token && (name.length < 2 || !secret))) throw FAIL;

  const sb = admin();
  const { data: ev } = await sb.from('events').select('id,name,is_demo,status').eq('slug', slug).maybeSingle();
  if (!ev || ev.status === 'draft') throw new HttpError(404, 'EVENT_NOT_FOUND', 'We could not find this event.');

  // Abuse protection. Venue Wi-Fi shares one IP, so per-IP limits are generous; the per-target and per-event limits do the real work.
  await limit(`vip:${hashKey(clientIp(req, ctx))}`, 400, 600);
  await limit(`vev:${ev.id}`, 4000, 600);
  if (name) await limit(`vname:${ev.id}:${hashKey(normalizeName(name))}`, 12, 600);

  const { data: st } = await sb.from('event_settings').select('settings').eq('event_id', ev.id).maybeSingle();
  const settings = mergeSettings(st?.settings);

  let guestId: string | null = null;
  let credId: string | null = null;

  if (token) {
    const { data: cred } = await sb.from('guest_credentials').select('id,guest_id').eq('event_id', ev.id).eq('token_hash', hashToken(extractToken(token))).is('revoked_at', null).maybeSingle();
    if (!cred) throw FAIL;
    guestId = cred.guest_id;
    credId = cred.id;
  } else if (looksLikeEmail(secret)) {
    if (!settings.verification.allowEmail) throw FAIL;
    const { data: rows } = await sb.from('guests').select('id,full_name,display_name').eq('event_id', ev.id).eq('email', secret.toLowerCase());
    const hit = (rows ?? []).find((g) => nameMatchesAll(name, [g.full_name, g.display_name]));
    if (!hit) throw FAIL;
    guestId = hit.id;
  } else {
    if (!settings.verification.allowCode) throw FAIL;
    const code = normalizeCode(secret);
    if (code.length !== 8) throw FAIL;
    const { data: cred } = await sb.from('guest_credentials').select('id,guest_id').eq('event_id', ev.id).eq('code_hash', hashCode(code)).is('revoked_at', null).maybeSingle();
    if (!cred) throw FAIL;
    const { data: g } = await sb.from('guests').select('full_name,display_name').eq('id', cred.guest_id).single();
    if (!g || !nameMatchesAll(name, [g.full_name, g.display_name])) throw FAIL;
    guestId = cred.guest_id;
    credId = cred.id;
  }

  const { data: g } = await sb.from('guests')
    .select('id,full_name,display_name,first_name,category,is_confirmed,book_title,book_cover_url,marketing_permission,is_demo')
    .eq('id', guestId!).single();
  if (!g) throw FAIL;

  let table: VerifiedGuestView['table'] = null;
  if (g.is_confirmed) {
    const { data: a } = await sb.from('seating_assignments').select('event_tables(number,label,designation)').eq('guest_id', g.id).maybeSingle();
    const t = (a as any)?.event_tables;
    if (t) table = { number: t.number, label: t.label, designation: t.designation };
  }

  const cover = safeImageUrl(g.book_cover_url);
  const showBook = settings.bookRecognition.enabled && g.category === 'finalist' && !!g.book_title && !!cover && g.marketing_permission;
  const toks = nameTokens(g.full_name);
  const view: VerifiedGuestView = {
    firstName: g.first_name || toks[0] || '',
    lastName: toks.length > 1 ? toks[toks.length - 1] : '',
    displayName: g.display_name || g.full_name,
    category: g.category,
    confirmed: g.is_confirmed,
    table,
    book: showBook ? { title: g.book_title!, coverUrl: cover } : null,
    isDemo: g.is_demo,
  };

  if (credId) {
    await sb.from('guest_credentials').update({ last_used_at: new Date().toISOString() }).eq('id', credId);
  }
  return json({ ok: true, guest: view });
});

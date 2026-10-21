import type { Config } from '@netlify/functions';
import { admin } from './_lib/supabase';
import { HttpError, json, route, str } from './_lib/http';
import { limit, hashKey } from './_lib/rate';
import { clientIp } from './_lib/http';
import { mergeSettings, type PublicEvent } from '../../shared/types';
import { safeImageUrl } from './_lib/images';

export const config: Config = { path: '/api/event' };

export default route(['GET'], async (req, ctx) => {
  const slug = str(new URL(req.url).searchParams.get('slug'), 80).toLowerCase();
  if (!slug) throw new HttpError(400, 'BAD_REQUEST');
  await limit(`ev:${hashKey(clientIp(req, ctx))}`, 600, 600);

  const sb = admin();
  const { data: ev } = await sb.from('events').select('id,slug,name,tagline,event_date,venue,city,is_demo,status').eq('slug', slug).maybeSingle();
  if (!ev || ev.status === 'draft') throw new HttpError(404, 'EVENT_NOT_FOUND', 'We could not find this event.');

  const [{ data: st }, { data: prog }, { data: ann }, { data: tbl }] = await Promise.all([
    sb.from('event_settings').select('settings').eq('event_id', ev.id).maybeSingle(),
    sb.from('program_items').select('id,time_label,title,description').eq('event_id', ev.id).eq('published', true).order('sort_order'),
    sb.from('announcements').select('id,title,body,pinned').eq('event_id', ev.id).eq('published', true).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(10),
    sb.from('event_tables').select('number,label,designation,pos_x,pos_y').eq('event_id', ev.id).order('number'),
  ]);
  const settings = mergeSettings(st?.settings);
  // Public settings never carry private contact details beyond what the director chose to publish.
  settings.logoUrl = safeImageUrl(settings.logoUrl) ?? '';
  settings.artworkUrl = safeImageUrl(settings.artworkUrl) ?? '';

  const body: PublicEvent = {
    slug: ev.slug,
    name: ev.name,
    tagline: ev.tagline,
    eventDate: ev.event_date,
    venue: ev.venue,
    city: ev.city,
    isDemo: ev.is_demo,
    settings,
    program: (prog ?? []).map((p) => ({ id: p.id, time: p.time_label, title: p.title, description: p.description })),
    announcements: ann ?? [],
    tables: (tbl ?? []).map((t) => ({ number: t.number, label: t.label, designation: t.designation, x: t.pos_x, y: t.pos_y })),
  };
  return json(body, 200, { 'cache-control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=120' });
});

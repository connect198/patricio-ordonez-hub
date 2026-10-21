-- KINGDOM CONCIERGE™ — the first real event (no guests, no tables: those come from Jotform + your team).
-- Run once in the Supabase SQL editor AFTER the migrations. Safe to re-run.
insert into public.events (slug, name, tagline, kind, event_date, venue, city, timezone, status, jotform_form_id)
values ('kingdom-book-awards-2026', 'Kingdom Book Awards Gala 2026', 'Every Guest. Honored. Every Moment. Extraordinary.',
        'gala', '2026-11-17', 'Marriott Orlando Downtown', 'Orlando, Florida', 'America/New_York', 'draft', '261778660839070')
on conflict (slug) do nothing;

insert into public.event_settings (event_id, settings)
select id, '{}'::jsonb from public.events where slug = 'kingdom-book-awards-2026'
on conflict (event_id) do nothing;

-- KINGDOM CONCIERGE™ — DEMONSTRATION DATA (optional; run manually in the Supabase SQL editor)
-- Creates a clearly separate demonstration event. Database triggers guarantee that Jotform/CSV imports can
-- never write into it and that demo guests can never be moved into a real event.
-- Demo guests verify with their email (…@demo.invalid): "George Vasquez" + george.vasquez@demo.invalid

do $$
declare ev uuid; t5 uuid; t8 uuid; t13 uuid; g1 uuid; g2 uuid; g3 uuid;
begin
  insert into public.events (slug, name, tagline, kind, event_date, venue, city, is_demo, status)
  values ('demo-kingdom-gala', 'DEMO — Kingdom Book Awards Gala', 'Every Guest. Honored. Every Moment. Extraordinary.',
          'gala', '2026-11-17', 'Marriott Orlando Downtown (demonstration)', 'Orlando, Florida', true, 'live')
  on conflict (slug) do update set name = excluded.name
  returning id into ev;

  insert into public.event_settings (event_id, settings) values (ev, '{}'::jsonb) on conflict do nothing;

  insert into public.event_tables (event_id, number, capacity) values (ev, 5, 10), (ev, 8, 10), (ev, 13, 10)
  on conflict (event_id, number) do nothing;
  select id into t5  from public.event_tables where event_id = ev and number = 5;
  select id into t8  from public.event_tables where event_id = ev and number = 8;
  select id into t13 from public.event_tables where event_id = ev and number = 13;

  select id into g1 from public.guests where event_id = ev and email = 'george.vasquez@demo.invalid';
  if g1 is null then
    insert into public.guests (event_id, full_name, display_name, first_name, email, category, source, notes)
    values (ev, 'George Vasquez', 'George Vasquez', 'George', 'george.vasquez@demo.invalid', 'general', 'demo', 'DEMONSTRATION RECORD — not a real guest')
    returning id into g1;
  end if;
  select id into g2 from public.guests where event_id = ev and email = 'maria.rodriguez@demo.invalid';
  if g2 is null then
    insert into public.guests (event_id, full_name, display_name, first_name, email, category, source, notes)
    values (ev, 'Maria Rodriguez', 'Maria Rodriguez', 'Maria', 'maria.rodriguez@demo.invalid', 'vip', 'demo', 'DEMONSTRATION RECORD — not a real guest')
    returning id into g2;
  end if;
  select id into g3 from public.guests where event_id = ev and email = 'david.thompson@demo.invalid';
  if g3 is null then
    insert into public.guests (event_id, full_name, display_name, first_name, email, category, book_title, source, notes)
    values (ev, 'David Thompson', 'David Thompson', 'David', 'david.thompson@demo.invalid', 'finalist', 'A Demonstration Title', 'demo', 'DEMONSTRATION RECORD — not a real guest')
    returning id into g3;
  end if;

  insert into public.tickets (event_id, guest_id, status, notes)
  select ev, x, 'confirmed', 'demo' from unnest(array[g1, g2, g3]) x
  on conflict (guest_id) do update set status = 'confirmed';

  insert into public.seating_assignments (event_id, guest_id, table_id) values
    (ev, g1, t13), (ev, g2, t5), (ev, g3, t8)
  on conflict (guest_id) do nothing;
end $$;

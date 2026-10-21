-- KINGDOM CONCIERGE™ — helper functions, integrity triggers, audit trail

-- ───────────────────────── Authorization helpers ─────────────────────────
create or replace function public.staff_role_for(ev uuid)
returns staff_role language sql stable security definer set search_path = public as $$
  select role from public.admin_accounts
  where user_id = auth.uid() and active and (event_ids is null or ev = any(event_ids))
  order by case role when 'owner' then 0 when 'manager' then 1 else 2 end
  limit 1
$$;

create or replace function public.is_staff(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$ select public.staff_role_for(ev) is not null $$;

create or replace function public.is_manager(ev uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.staff_role_for(ev) in ('owner','manager'), false) $$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_accounts
    where user_id = auth.uid() and active and role = 'owner' and event_ids is null) $$;

-- ───────────────────────── Generic triggers ─────────────────────────
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
create trigger guests_touch before update on public.guests for each row execute function public.touch_updated_at();
create trigger tables_touch before update on public.event_tables for each row execute function public.touch_updated_at();
create trigger tickets_touch before update on public.tickets for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.event_settings for each row execute function public.touch_updated_at();

-- Guests: derive search text + first name, stamp demo flag, event_id is immutable
create or replace function public.guests_prepare() returns trigger language plpgsql security definer set search_path = public as $$
declare ev_demo boolean;
begin
  if tg_op = 'UPDATE' and new.event_id <> old.event_id then
    raise exception 'EVENT_IMMUTABLE: a guest cannot be moved between events';
  end if;
  select is_demo into ev_demo from public.events where id = new.event_id;
  new.is_demo := coalesce(ev_demo, false);
  if new.is_demo and new.source in ('jotform','csv') then
    raise exception 'DEMO_PROTECTED: real imports are never written into a demonstration event';
  end if;
  if not new.is_demo and new.source = 'demo' then
    raise exception 'DEMO_PROTECTED: demo records can only live in a demonstration event';
  end if;
  if new.first_name is null or btrim(new.first_name) = '' then
    new.first_name := split_part(btrim(coalesce(nullif(new.display_name,''), new.full_name)), ' ', 1);
  end if;
  new.name_search := lower(unaccent(btrim(
     coalesce(new.full_name,'') || ' ' || coalesce(new.display_name,'') || ' ' || coalesce(new.email,''))));
  return new;
end $$;
create trigger guests_prepare_biu before insert or update on public.guests for each row execute function public.guests_prepare();

-- Tickets → guests.is_confirmed (only confirmed guests count toward seated attendance)
create or replace function public.tickets_sync() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    update public.guests set is_confirmed = false where id = old.guest_id;
    return old;
  end if;
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    new.confirmed_at := now();
    new.confirmed_by := auth.uid();
  end if;
  update public.guests set is_confirmed = (new.status = 'confirmed') where id = new.guest_id;
  return new;
end $$;
create trigger tickets_sync_biud before insert or update on public.tickets for each row execute function public.tickets_sync();
create trigger tickets_sync_del after delete on public.tickets for each row execute function public.tickets_sync();

-- Check-ins → guests.checked_in_at (append-only log; corrections are new rows)
create or replace function public.checkins_apply() returns trigger language plpgsql security definer set search_path = public as $$
declare g record;
begin
  select * into g from public.guests where id = new.guest_id;
  if g.event_id <> new.event_id then raise exception 'EVENT_MISMATCH'; end if;
  if new.action = 'check_in' and not g.is_confirmed then
    if not (new.method = 'exception' and public.is_manager(new.event_id)) then
      raise exception 'NOT_CONFIRMED: this guest has no confirmed ticket; a manager override is required';
    end if;
  end if;
  return new;
end $$;
create trigger checkins_apply_bi before insert on public.checkins for each row execute function public.checkins_apply();

create or replace function public.checkins_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.guests set checked_in_at = case when new.action = 'check_in' then new.created_at else null end
  where id = new.guest_id;
  return new;
end $$;
create trigger checkins_after_ai after insert on public.checkins for each row execute function public.checkins_after();

-- Seating integrity: capacity can never be exceeded, guests must be confirmed, same event
create or replace function public.seating_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare cap int; t_event uuid; used int; g record;
begin
  select capacity, event_id into cap, t_event from public.event_tables where id = new.table_id for update;
  if t_event is null or t_event <> new.event_id then raise exception 'EVENT_MISMATCH: table belongs to another event'; end if;
  select * into g from public.guests where id = new.guest_id;
  if g.event_id <> new.event_id then raise exception 'EVENT_MISMATCH: guest belongs to another event'; end if;
  if not g.is_confirmed then raise exception 'GUEST_NOT_CONFIRMED: only confirmed guests can be seated'; end if;
  select count(*) into used from public.seating_assignments
    where table_id = new.table_id and guest_id <> new.guest_id;
  if used >= cap then raise exception 'TABLE_FULL: table is at capacity (%)', cap; end if;
  return new;
end $$;
create trigger seating_guard_biu before insert or update of table_id on public.seating_assignments
  for each row execute function public.seating_guard();

create or replace function public.tables_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare used int;
begin
  if tg_op = 'UPDATE' and new.capacity < old.capacity then
    select count(*) into used from public.seating_assignments where table_id = new.id;
    if used > new.capacity then
      raise exception 'CAPACITY_BELOW_ASSIGNED: % guests are already seated here', used;
    end if;
  end if;
  return new;
end $$;
create trigger tables_guard_bu before update on public.event_tables for each row execute function public.tables_guard();

-- Atomic group seating / unseating (SECURITY INVOKER: RLS applies to the caller)
create or replace function public.seat_guests(p_table uuid, p_guests uuid[])
returns int language plpgsql as $$
declare ev uuid; g uuid; n int := 0;
begin
  select event_id into ev from public.event_tables where id = p_table;
  if ev is null then raise exception 'TABLE_NOT_FOUND'; end if;
  foreach g in array p_guests loop
    insert into public.seating_assignments(event_id, guest_id, table_id)
    values (ev, g, p_table)
    on conflict (guest_id) do update set table_id = excluded.table_id, assigned_at = now(), assigned_by = auth.uid();
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.unseat_guests(p_guests uuid[]) returns int language plpgsql as $$
declare n int;
begin
  delete from public.seating_assignments where guest_id = any(p_guests);
  get diagnostics n = row_count;
  return n;
end $$;

-- Rate limiting (service role only)
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare h int;
begin
  insert into public.rate_limits as r(key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into h;
  return h <= p_limit;
end $$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

create or replace function public.purge_rate_limits() returns void language sql security definer set search_path = public as $$
  delete from public.rate_limits where window_start < now() - interval '1 day' $$;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.purge_rate_limits() to service_role;

-- ───────────────────────── Audit trail ─────────────────────────
create or replace function public.audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; d jsonb := '{}'::jsonb; k text; src jsonb; em text;
begin
  if tg_op = 'INSERT' then n := to_jsonb(new); src := n; d := n;
  elsif tg_op = 'UPDATE' then
    o := to_jsonb(old); n := to_jsonb(new); src := n;
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at','name_search') and (o -> k) is distinct from (n -> k) then
        d := d || jsonb_build_object(k, jsonb_build_object('from', o -> k, 'to', n -> k));
      end if;
    end loop;
    if d = '{}'::jsonb then return new; end if;
  else o := to_jsonb(old); src := o; d := o;
  end if;
  d := d - 'name_search' - 'token_hash' - 'code_hash';
  select email into em from public.admin_accounts where user_id = auth.uid();
  insert into public.audit_logs(event_id, actor, actor_email, action, entity, entity_id, details)
  values (
    coalesce(nullif(src ->> 'event_id','')::uuid, case when tg_table_name = 'events' then (src ->> 'id')::uuid end),
    auth.uid(), em, lower(tg_op), tg_table_name,
    coalesce(nullif(src ->> 'id','')::uuid, nullif(src ->> 'event_id','')::uuid, nullif(src ->> 'user_id','')::uuid),
    d);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['events','event_settings','program_items','announcements','guests','tickets',
    'companion_relationships','event_tables','seating_assignments','checkins','staff_flags',
    'assistance_requests','guest_credentials','import_runs','admin_accounts']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

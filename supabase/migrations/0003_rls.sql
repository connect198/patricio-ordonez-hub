-- KINGDOM CONCIERGE™ — Row Level Security
-- Principle: the public (anon) role can read NOTHING directly. The guest experience is served by
-- Netlify Functions using the service role, which return only the minimum fields a verified guest may see.

alter table public.events                 enable row level security;
alter table public.event_settings         enable row level security;
alter table public.program_items          enable row level security;
alter table public.announcements          enable row level security;
alter table public.admin_accounts         enable row level security;
alter table public.guests                 enable row level security;
alter table public.tickets                enable row level security;
alter table public.companion_relationships enable row level security;
alter table public.event_tables           enable row level security;
alter table public.seating_assignments    enable row level security;
alter table public.checkins               enable row level security;
alter table public.staff_flags            enable row level security;
alter table public.assistance_requests    enable row level security;
alter table public.guest_credentials      enable row level security;
alter table public.import_runs            enable row level security;
alter table public.import_rows            enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.rate_limits            enable row level security;   -- no policies: service role only

-- Events: staff see their events; only the platform owner creates/deletes; managers edit.
create policy events_select on public.events for select to authenticated using (public.is_staff(id));
create policy events_insert on public.events for insert to authenticated with check (public.is_owner());
create policy events_update on public.events for update to authenticated using (public.is_manager(id)) with check (public.is_manager(id));
create policy events_delete on public.events for delete to authenticated using (public.is_owner());

-- Per-event configuration: staff read, managers write
do $$
declare t text;
begin
  foreach t in array array['event_settings','program_items','announcements'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff(event_id))', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_manager(event_id))', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_manager(event_id)) with check (public.is_manager(event_id))', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_manager(event_id))', t||'_del', t);
  end loop;
end $$;

-- Admin accounts: you can read your own row; owners read/manage all (writes go through a server function).
create policy admin_self_select on public.admin_accounts for select to authenticated using (user_id = auth.uid() or public.is_owner());
create policy admin_owner_update on public.admin_accounts for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- Guest data: staff read; managers create/edit/delete. Staff may flag guests but not edit identity data.
create policy guests_select on public.guests for select to authenticated using (public.is_staff(event_id));
create policy guests_insert on public.guests for insert to authenticated with check (public.is_manager(event_id));
create policy guests_update on public.guests for update to authenticated using (public.is_manager(event_id)) with check (public.is_manager(event_id));
create policy guests_delete on public.guests for delete to authenticated using (public.is_manager(event_id));

create policy tickets_select on public.tickets for select to authenticated using (public.is_staff(event_id));
create policy tickets_write on public.tickets for all to authenticated using (public.is_manager(event_id)) with check (public.is_manager(event_id));

create policy companions_select on public.companion_relationships for select to authenticated using (public.is_staff(event_id));
create policy companions_write on public.companion_relationships for all to authenticated using (public.is_manager(event_id)) with check (public.is_manager(event_id));

create policy tables_select on public.event_tables for select to authenticated using (public.is_staff(event_id));
create policy tables_write on public.event_tables for all to authenticated using (public.is_manager(event_id)) with check (public.is_manager(event_id));

create policy seating_select on public.seating_assignments for select to authenticated using (public.is_staff(event_id));
create policy seating_write on public.seating_assignments for all to authenticated using (public.is_manager(event_id)) with check (public.is_manager(event_id));

-- Check-ins: any staff may record; the log is append-only (no update/delete policies)
create policy checkins_select on public.checkins for select to authenticated using (public.is_staff(event_id));
create policy checkins_insert on public.checkins for insert to authenticated
  with check (public.is_staff(event_id) and created_by = auth.uid());

create policy flags_select on public.staff_flags for select to authenticated using (public.is_staff(event_id));
create policy flags_insert on public.staff_flags for insert to authenticated with check (public.is_staff(event_id) and created_by = auth.uid());
create policy flags_update on public.staff_flags for update to authenticated using (public.is_staff(event_id)) with check (public.is_staff(event_id));

create policy assist_select on public.assistance_requests for select to authenticated using (public.is_staff(event_id));
create policy assist_update on public.assistance_requests for update to authenticated using (public.is_staff(event_id)) with check (public.is_staff(event_id));

-- Credentials: managers can see status and revoke. Issuing happens server-side.
create policy creds_select on public.guest_credentials for select to authenticated using (public.is_manager(event_id));
create policy creds_revoke on public.guest_credentials for update to authenticated using (public.is_manager(event_id)) with check (public.is_manager(event_id));

create policy import_runs_select on public.import_runs for select to authenticated using (public.is_manager(event_id));
create policy import_runs_update on public.import_runs for update to authenticated using (public.is_manager(event_id)) with check (public.is_manager(event_id));
create policy import_rows_select on public.import_rows for select to authenticated using (public.is_manager(event_id));
create policy import_rows_update on public.import_rows for update to authenticated using (public.is_manager(event_id)) with check (public.is_manager(event_id));

create policy audit_select on public.audit_logs for select to authenticated using (event_id is null and public.is_owner() or public.is_manager(event_id));

-- Defence in depth: anon gets nothing on any table
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
grant execute on function public.staff_role_for(uuid), public.is_staff(uuid), public.is_manager(uuid), public.is_owner() to authenticated;
grant execute on function public.seat_guests(uuid, uuid[]), public.unseat_guests(uuid[]) to authenticated;

-- ───────────────────────── Storage: event artwork / logos ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-assets', 'event-assets', true, 8388608,
        array['image/png','image/jpeg','image/webp','image/svg+xml','audio/mpeg','audio/mp4','audio/ogg'])
on conflict (id) do nothing;

create policy event_assets_read on storage.objects for select using (bucket_id = 'event-assets');
create policy event_assets_write on storage.objects for insert to authenticated
  with check (bucket_id = 'event-assets' and public.is_manager(((storage.foldername(name))[1])::uuid));
create policy event_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'event-assets' and public.is_manager(((storage.foldername(name))[1])::uuid));
create policy event_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'event-assets' and public.is_manager(((storage.foldername(name))[1])::uuid));

-- ───────────────────────── Realtime ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['guests','tickets','seating_assignments','event_tables','checkins','staff_flags',
                           'assistance_requests','companion_relationships','audit_logs'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

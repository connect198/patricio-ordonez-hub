-- KINGDOM CONCIERGE™ — core schema
-- Multi-event platform. Every private record is scoped by event_id.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ───────────────────────── Enums ─────────────────────────
create type guest_category as enum ('finalist','vip','distinguished','speaker','sponsor','companion','general');
create type ticket_status  as enum ('none','interested','pending','confirmed','declined','cancelled');
create type table_designation as enum ('general','reserved','vip','sponsor','speaker','finalist','staff');
create type staff_role as enum ('owner','manager','staff');

-- ───────────────────────── Events ─────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name text not null,
  tagline text,
  kind text not null default 'gala',
  event_date date,
  starts_at timestamptz,
  venue text,
  city text,
  timezone text not null default 'America/New_York',
  is_demo boolean not null default false,
  status text not null default 'draft' check (status in ('draft','live','closed')),
  jotform_form_id text,
  brand jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table public.program_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  time_label text not null,
  title text not null,
  description text,
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.program_items(event_id, sort_order);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  body text,
  pinned boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index on public.announcements(event_id, created_at desc);

-- ───────────────────────── Staff accounts ─────────────────────────
create table public.admin_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role staff_role not null default 'staff',
  event_ids uuid[],               -- NULL = all events
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Guests ─────────────────────────
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  jotform_submission_id text,
  full_name text not null,
  display_name text,
  first_name text,
  credentials text,
  name_search text not null default '',
  email text,
  phone text,
  state text,
  country text,
  category guest_category not null default 'finalist',
  book_title text,
  additional_titles text[] not null default '{}',
  book_cover_url text,
  headshot_url text,
  marketing_permission boolean not null default false,
  attendance_intent text,
  ticket_interest text,
  companion_intent text,
  additional_guest_details text,
  dietary text,
  accessibility text,
  notes text,
  flagged boolean not null default false,
  is_confirmed boolean not null default false,   -- maintained from tickets
  checked_in_at timestamptz,                      -- maintained from checkins
  is_demo boolean not null default false,
  source text not null default 'manual' check (source in ('jotform','csv','manual','demo')),
  import_run_id uuid,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index guests_event_submission_uq on public.guests(event_id, jotform_submission_id) where jotform_submission_id is not null;
create index guests_event_idx on public.guests(event_id);
create index guests_name_trgm on public.guests using gin (name_search gin_trgm_ops);
create index guests_email_idx on public.guests(event_id, lower(email));

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null unique references public.guests(id) on delete cascade,
  status ticket_status not null default 'none',
  kind text,
  notes text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  updated_at timestamptz not null default now()
);
create index on public.tickets(event_id, status);

create table public.companion_relationships (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  host_guest_id uuid not null references public.guests(id) on delete cascade,
  companion_guest_id uuid not null unique references public.guests(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (host_guest_id <> companion_guest_id)
);
create index on public.companion_relationships(host_guest_id);

-- ───────────────────────── Seating ─────────────────────────
create table public.event_tables (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  number int not null check (number > 0),
  label text,
  capacity int not null default 10 check (capacity between 1 and 60),
  designation table_designation not null default 'general',
  reserved_for text,
  notes text,
  pos_x numeric,
  pos_y numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, number)
);

create table public.seating_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null unique references public.guests(id) on delete cascade,
  table_id uuid not null references public.event_tables(id) on delete restrict,
  assigned_by uuid default auth.uid(),
  assigned_at timestamptz not null default now()
);
create index on public.seating_assignments(table_id);

-- ───────────────────────── Check-in & operations ─────────────────────────
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  action text not null check (action in ('check_in','check_out')),
  method text not null default 'staff' check (method in ('staff','qr','correction','exception')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.checkins(event_id, created_at desc);
create index on public.checkins(guest_id, created_at desc);

create table public.staff_flags (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete cascade,
  kind text not null default 'other' check (kind in ('seating','identity','dietary','accessibility','ticket','other')),
  note text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz
);
create index on public.staff_flags(event_id, status);

create table public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid references public.guests(id) on delete set null,
  name_given text,
  message text,
  status text not null default 'open' check (status in ('open','handling','resolved')),
  created_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz
);
create index on public.assistance_requests(event_id, status);

-- ───────────────────────── Credentials (private QR + codes) ─────────────────────────
create table public.guest_credentials (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  token_hash text not null unique,   -- HMAC-SHA256(pepper, token)
  code_hash text not null,           -- HMAC-SHA256(pepper, code)
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count int not null default 0
);
create unique index guest_credentials_code_uq on public.guest_credentials(event_id, code_hash) where revoked_at is null;
create index on public.guest_credentials(guest_id);

-- ───────────────────────── Imports ─────────────────────────
create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  source text not null check (source in ('jotform_api','csv')),
  file_name text,
  status text not null default 'staged' check (status in ('staged','applying','applied','discarded','failed')),
  counts jsonb not null default '{}'::jsonb,
  result jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index on public.import_runs(event_id, created_at desc);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.import_runs(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  row_index int not null,
  submission_id text,
  classification text not null check (classification in ('new','updated','unchanged','duplicate','incomplete','error')),
  decision text not null default 'import' check (decision in ('import','skip','merge')),
  payload jsonb not null default '{}'::jsonb,
  diff jsonb,
  matched_guest_id uuid references public.guests(id) on delete set null,
  messages text[] not null default '{}'
);
create index on public.import_rows(run_id, classification);

-- ───────────────────────── Platform plumbing ─────────────────────────
create table public.audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid,
  actor uuid,
  actor_email text,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs(event_id, created_at desc);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);

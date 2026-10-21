-- Behavioural test for migrations (run against a Supabase-like Postgres). Each \echo prints PASS/FAIL via DO blocks.
\set ON_ERROR_STOP off
create or replace function pg_temp.expect_err(sql text, pattern text, label text) returns void language plpgsql as $$
begin
  begin execute sql; raise notice 'FAIL  % (no error)', label; exception when others then
    if sqlerrm ~* pattern then raise notice 'PASS  %', label; else raise notice 'FAIL  % (got: %)', label, sqlerrm; end if; end;
end $$;
create or replace function pg_temp.expect_eq(actual anyelement, expected anyelement, label text) returns void language plpgsql as $$
begin if actual is not distinct from expected then raise notice 'PASS  %', label; else raise notice 'FAIL  % (got %, want %)', label, actual, expected; end if; end $$;

insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000a1','owner@x.io'),('00000000-0000-0000-0000-0000000000a2','mgr@x.io'),('00000000-0000-0000-0000-0000000000a3','staff@x.io'),('00000000-0000-0000-0000-0000000000a4','other@x.io');
insert into events(id,slug,name,status) values ('11111111-1111-1111-1111-111111111111','real-gala','Real Gala','live'),('22222222-2222-2222-2222-222222222222','demo-gala','Demo','live'),('33333333-3333-3333-3333-333333333333','other-ev','Other','live');
update events set is_demo = true where slug='demo-gala';
insert into admin_accounts(user_id,email,role,event_ids) values
 ('00000000-0000-0000-0000-0000000000a1','owner@x.io','owner',null),
 ('00000000-0000-0000-0000-0000000000a2','mgr@x.io','manager','{11111111-1111-1111-1111-111111111111}'),
 ('00000000-0000-0000-0000-0000000000a3','staff@x.io','staff','{11111111-1111-1111-1111-111111111111}'),
 ('00000000-0000-0000-0000-0000000000a4','other@x.io','manager','{33333333-3333-3333-3333-333333333333}');

-- Demo isolation
select pg_temp.expect_err($$insert into guests(event_id,full_name,source) values ('22222222-2222-2222-2222-222222222222','Bad','csv')$$,'DEMO_PROTECTED','imports cannot write into demo event');
select pg_temp.expect_err($$insert into guests(event_id,full_name,source) values ('11111111-1111-1111-1111-111111111111','Bad','demo')$$,'DEMO_PROTECTED','demo records cannot enter a real event');

insert into guests(id,event_id,full_name,display_name,email,source) values
 ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','José Núñez','Dr. José Núñez','jose@x.io','jotform'),
 ('a0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Ann Lee',null,'ann@x.io','jotform'),
 ('a0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','Bo Ray',null,'bo@x.io','csv');
select pg_temp.expect_eq((select name_search like '%jose nunez%' from guests where id='a0000000-0000-0000-0000-000000000001'), true, 'name_search is accent-folded');
select pg_temp.expect_eq((select first_name from guests where id='a0000000-0000-0000-0000-000000000002'), 'Ann', 'first_name derived');
select pg_temp.expect_eq((select is_confirmed from guests where id='a0000000-0000-0000-0000-000000000001'), false, 'imports are NOT auto-confirmed');
select pg_temp.expect_err($$update guests set event_id='33333333-3333-3333-3333-333333333333' where id='a0000000-0000-0000-0000-000000000001'$$,'EVENT_IMMUTABLE','guest cannot change event');

insert into event_tables(id,event_id,number,capacity) values ('b0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',13,1),('b0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',5,2);
select pg_temp.expect_err($$insert into seating_assignments(event_id,guest_id,table_id) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001')$$,'GUEST_NOT_CONFIRMED','unconfirmed guest cannot be seated');
insert into tickets(event_id,guest_id,status) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000001','confirmed'),('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000002','confirmed');
select pg_temp.expect_eq((select is_confirmed from guests where id='a0000000-0000-0000-0000-000000000001'), true, 'ticket confirm syncs guest');
select seat_guests('b0000000-0000-0000-0000-000000000001', array['a0000000-0000-0000-0000-000000000001']::uuid[]);
select pg_temp.expect_err($$select seat_guests('b0000000-0000-0000-0000-000000000001', array['a0000000-0000-0000-0000-000000000002']::uuid[])$$,'TABLE_FULL','over-capacity blocked');
select seat_guests('b0000000-0000-0000-0000-000000000002', array['a0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002']::uuid[]);
select pg_temp.expect_eq((select count(*)::int from seating_assignments), 2, 'moving a guest keeps one assignment each');
select pg_temp.expect_err($$update event_tables set capacity=1 where id='b0000000-0000-0000-0000-000000000002'$$,'CAPACITY_BELOW_ASSIGNED','capacity cannot drop below seated count');
select pg_temp.expect_err($$insert into seating_assignments(event_id,guest_id,table_id) values ('33333333-3333-3333-3333-333333333333','a0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000002')$$,'EVENT_MISMATCH','cross-event seating blocked');

-- Check-ins
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';  -- staff
select pg_temp.expect_eq((select count(*)::int from guests), 3, 'staff can read guests of their event');
select pg_temp.expect_eq((select count(*)::int from events), 1, 'staff only see their event');
select pg_temp.expect_err($$insert into checkins(event_id,guest_id,action) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000003','check_in')$$,'NOT_CONFIRMED','staff cannot check in unconfirmed guest');
select pg_temp.expect_err($$insert into checkins(event_id,guest_id,action,method) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000003','check_in','exception')$$,'NOT_CONFIRMED','staff cannot use manager override');
insert into checkins(event_id,guest_id,action) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000001','check_in');
select pg_temp.expect_eq((select checked_in_at is not null from guests where id='a0000000-0000-0000-0000-000000000001'), true, 'check-in stamps guest');
update guests set full_name='Hacked' where id='a0000000-0000-0000-0000-000000000001';
select pg_temp.expect_eq((select full_name from guests where id='a0000000-0000-0000-0000-000000000001'), 'José Núñez', 'staff cannot edit guests (RLS)');
select pg_temp.expect_err($$insert into tickets(event_id,guest_id,status) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000003','confirmed')$$,'row-level security','staff cannot confirm tickets');
select pg_temp.expect_err($$delete from checkins$$,'permission denied|row-level','check-in log is append-only')  where false;
delete from checkins;
select pg_temp.expect_eq((select count(*)::int from checkins), 1, 'staff cannot delete check-ins');
select pg_temp.expect_err($$select * from import_rows$$,'x','x') where false;
select pg_temp.expect_eq((select count(*)::int from audit_logs), 0, 'staff cannot read audit logs');
reset role;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';  -- manager
insert into checkins(event_id,guest_id,action,method) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000003','check_in','exception');
select pg_temp.expect_eq((select checked_in_at is not null from guests where id='a0000000-0000-0000-0000-000000000003'), true, 'manager override check-in works');
insert into checkins(event_id,guest_id,action,method) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000003','check_out','correction');
select pg_temp.expect_eq((select checked_in_at is null from guests where id='a0000000-0000-0000-0000-000000000003'), true, 'check-out correction clears arrival');
update guests set notes='vip table please' where id='a0000000-0000-0000-0000-000000000002';
select pg_temp.expect_eq((select notes from guests where id='a0000000-0000-0000-0000-000000000002'), 'vip table please', 'manager can edit guests');
select pg_temp.expect_eq((select count(*)::int > 3 from audit_logs), true, 'manager sees audit logs');
select pg_temp.expect_err($$insert into events(slug,name) values ('nope','Nope')$$,'row-level security','manager cannot create events');
reset role;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';  -- manager of another event
select pg_temp.expect_eq((select count(*)::int from guests), 0, 'other event manager sees no foreign guests');
select pg_temp.expect_eq((select count(*)::int from seating_assignments), 0, 'other event manager sees no foreign seating');
reset role;

set role anon;
select pg_temp.expect_err($$select * from guests$$,'permission denied','anon cannot read guests');
select pg_temp.expect_err($$select * from guest_credentials$$,'permission denied','anon cannot read credentials');
select pg_temp.expect_err($$select rate_limit_hit('x',1,60)$$,'permission denied','anon cannot call rate limiter');
reset role;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';  -- owner
select pg_temp.expect_eq((select count(*)::int from events), 3, 'owner sees all events');
insert into events(slug,name) values ('new-ev','New');
reset role;

-- Rate limiter
select pg_temp.expect_eq(rate_limit_hit('k',2,60), true, 'rate limit hit 1');
select pg_temp.expect_eq(rate_limit_hit('k',2,60), true, 'rate limit hit 2');
select pg_temp.expect_eq(rate_limit_hit('k',2,60), false, 'rate limit blocks hit 3');
-- Audit has no credential hashes
insert into guest_credentials(event_id,guest_id,token_hash,code_hash) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000001','th','ch');
select pg_temp.expect_eq((select (details ? 'token_hash') from audit_logs where entity='guest_credentials' limit 1), false, 'audit omits credential hashes');
-- Credential code uniqueness (active only)
select pg_temp.expect_err($$insert into guest_credentials(event_id,guest_id,token_hash,code_hash) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000002','th2','ch')$$,'duplicate key','active codes are unique per event');

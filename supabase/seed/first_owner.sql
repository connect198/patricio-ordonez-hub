-- KINGDOM CONCIERGE™ — bootstrap the first owner.
-- 1) In Supabase → Authentication → Users, click "Add user" and create the account (email + password).
-- 2) Replace the email below and run this once in the SQL editor.
insert into public.admin_accounts (user_id, email, display_name, role, event_ids)
select id, email, 'Event Owner', 'owner', null
from auth.users
where lower(email) = lower('REPLACE_WITH_YOUR_EMAIL@example.com')
on conflict (user_id) do update set role = 'owner', active = true;

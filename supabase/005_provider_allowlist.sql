-- Run this in your Supabase SQL editor after 003_profiles_and_roles.sql
-- Restricts who can become a "provider" to a list of approved emails you
-- manage directly (Table Editor -> provider_allowlist -> add/remove rows,
-- works like a simple spreadsheet). No app code can read or write this
-- table — it's intentionally admin-only, edited only from this dashboard.

create table if not exists public.provider_allowlist (
  email      text primary key,
  added_at   timestamptz default now()
);

alter table public.provider_allowlist enable row level security;
-- No policies added on purpose: authenticated/anon clients get zero access
-- (no select, insert, update, or delete) to this table via the app's API.
-- Only you, editing directly in the Supabase dashboard, can touch it.

-- ---------- add your own doctor/nurse emails here ----------
-- insert into public.provider_allowlist (email) values ('doctor@example.com');

-- ---------- update signup to check the allowlist ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assigned_role text := 'patient';
begin
  if exists (
    select 1 from public.provider_allowlist
    where lower(email) = lower(new.email)
  ) then
    assigned_role := 'provider';
  end if;

  insert into public.profiles (id, patient_id, role)
  values (new.id, public.gen_unique_patient_id(), assigned_role);
  return new;
end;
$$;

-- ---------- manual re-sync for accounts that existed before being allowlisted ----------
-- Run `select public.sync_all_provider_roles();` in the SQL editor any time
-- after editing provider_allowlist, to apply changes to accounts that
-- already signed up (adding someone promotes them, removing someone demotes
-- them back to patient). Deliberately NOT callable from the app itself.
create or replace function public.sync_all_provider_roles()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles p
  set role = 'provider'
  from auth.users u
  where p.id = u.id
    and p.role <> 'provider'
    and exists (select 1 from public.provider_allowlist a where lower(a.email) = lower(u.email));

  update public.profiles p
  set role = 'patient'
  from auth.users u
  where p.id = u.id
    and p.role = 'provider'
    and not exists (select 1 from public.provider_allowlist a where lower(a.email) = lower(u.email));
end;
$$;

revoke execute on function public.sync_all_provider_roles() from public, anon, authenticated;

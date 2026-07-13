-- Run this in your Supabase SQL editor after schema.sql, dose_logs.sql, and 002_extend.sql
-- Adds patient identity (name + a server-generated 9-digit patient ID) and a
-- patient/provider role, with RLS letting providers *read* every patient's
-- data (read-only — providers get no write access to clinical records here).

-- ---------- profiles table ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text,
  last_name   text,
  patient_id  text unique,
  role        text not null default 'patient' check (role in ('patient','provider')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.profiles enable row level security;

-- ---------- server-side patient_id generator ----------
create or replace function public.gen_unique_patient_id()
returns text
language plpgsql
as $$
declare
  candidate text;
  i int;
begin
  for i in 1..10 loop
    candidate := lpad((floor(random() * 1000000000))::text, 9, '0');
    if not exists (select 1 from public.profiles where patient_id = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'Could not generate a unique patient_id after 10 attempts';
end;
$$;

-- ---------- auto-create a profile row on signup ----------
-- Patients never INSERT into profiles themselves — this trigger is the only
-- way a row is created, so there is no INSERT policy needed (and no
-- self-service "sign up as a provider" path).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, patient_id, role)
  values (new.id, public.gen_unique_patient_id(), 'patient');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- one-time backfill for users that already exist
insert into public.profiles (id, patient_id, role)
select u.id, public.gen_unique_patient_id(), 'patient'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------- role-escalation guard ----------
-- Belt-and-suspenders: even if this trigger fires on a row the client
-- inserted/updated directly, role is forced back to a safe value whenever
-- the request came in as an authenticated client (not the SQL editor).
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.role := 'patient';
    elsif tg_op = 'UPDATE' then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_role on public.profiles;
create trigger trg_protect_profile_role
  before insert or update on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------- is_provider() helper (used inside RLS policies below) ----------
create or replace function public.is_provider()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'provider'
  );
$$;

grant execute on function public.is_provider() to authenticated;

-- ---------- profiles policies ----------
drop policy if exists "select own or provider" on public.profiles;
create policy "select own or provider" on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.is_provider());

drop policy if exists "update own" on public.profiles;
create policy "update own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
-- no insert policy (rows only created by the trigger above)
-- no delete policy (profiles aren't deletable through the app)

-- Third layer: a patient's client can only ever write their own name,
-- regardless of policy/trigger state.
revoke update on public.profiles from authenticated;
grant update (first_name, last_name) on public.profiles to authenticated;

-- ---------- user_medications: replace the single "for all" policy ----------
drop policy if exists "Users can manage their own medications" on public.user_medications;

create policy "select own or provider" on public.user_medications
  for select to authenticated
  using (auth.uid() = user_id or public.is_provider());
create policy "insert own" on public.user_medications
  for insert to authenticated
  with check (auth.uid() = user_id);
create policy "update own" on public.user_medications
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.user_medications
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------- dose_logs: same shape ----------
drop policy if exists "Users can manage their own dose logs" on public.dose_logs;

create policy "select own or provider" on public.dose_logs
  for select to authenticated
  using (auth.uid() = user_id or public.is_provider());
create policy "insert own" on public.dose_logs
  for insert to authenticated
  with check (auth.uid() = user_id);
create policy "update own" on public.dose_logs
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own" on public.dose_logs
  for delete to authenticated
  using (auth.uid() = user_id);

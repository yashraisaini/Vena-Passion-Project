-- Run this in your Supabase SQL editor after 003_profiles_and_roles.sql
-- Lets a provider hide a patient from their list without touching the
-- patient's account or any of their data — fully reversible.

alter table public.profiles add column if not exists archived boolean not null default false;

drop policy if exists "providers can archive patients" on public.profiles;
create policy "providers can archive patients" on public.profiles
  for update to authenticated
  using (public.is_provider())
  with check (public.is_provider());

grant update (archived) on public.profiles to authenticated;

-- Even though `archived` is now a grantable column for any authenticated
-- client, only an actual provider's request is allowed to change it —
-- anyone else's attempt is silently reverted.
create or replace function public.protect_profile_archived()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_provider() then
    new.archived := old.archived;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_archived on public.profiles;
create trigger trg_protect_profile_archived
  before update on public.profiles
  for each row execute function public.protect_profile_archived();

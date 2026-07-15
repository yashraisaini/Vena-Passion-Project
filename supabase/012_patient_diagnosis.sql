-- Run this in your Supabase SQL editor after 011_messaging.sql
-- Adds a patient "diagnosis" (condition + severity/type detail) to profiles,
-- settable by the patient themselves AND editable by a provider -- same
-- "trigger, not grant/revoke" shape as 009's protect_medication_stock_only,
-- because both the row's own patient and any provider need to write
-- DIFFERENT subsets of the same broadly-granted columns. This is
-- deliberately NOT modeled on 006's protect_profile_archived (a
-- provider-EXCLUSIVE column nobody else may ever write) -- diagnosis is the
-- opposite shape: BOTH actors may write it, so a role-wide grant/revoke
-- can't scope this alone.

alter table public.profiles
  add column if not exists condition text
    check (condition in ('hemophilia_a', 'hemophilia_b', 'von_willebrand', 'other')),
  add column if not exists severity_detail text;

drop policy if exists "providers can edit diagnosis" on public.profiles;
create policy "providers can edit diagnosis" on public.profiles
  for update to authenticated
  using (public.is_provider())
  with check (public.is_provider());

grant update (condition, severity_detail) on public.profiles to authenticated;

-- A provider's write (auth.uid() <> old.id) may only ever change
-- condition/severity_detail on someone else's row; first_name/last_name pass
-- through untouched regardless of what the request body contained.
--
-- profiles.id IS the row owner's auth uid directly (unlike
-- user_medications.user_id, a foreign key to it) -- that's a structural
-- difference, not a semantic one: `auth.uid() <> old.id` still means exactly
-- "is this write coming from someone other than the row's owner," so the
-- same trigger shape from protect_medication_stock_only applies unchanged.
--
-- Does not need to re-protect `archived` (protect_profile_archived already
-- owns that column exclusively) -- three permissive UPDATE policies now
-- coexist on profiles (update own / providers can archive / providers can
-- edit diagnosis), and Postgres fires same-event BEFORE ROW triggers in
-- trigger-name order (archived, then identity_fields, then role), but each
-- only inspects/rewrites its own column(s) against OLD (stable across the
-- whole chain), so order is irrelevant. role/patient_id/id/created_at are
-- never column-granted to authenticated at all (003), so no authenticated
-- UPDATE can touch them regardless of this trigger.
--
-- A service-role write (the create-patient-account Edge Function) has
-- auth.uid() is null, so this trigger doesn't interfere with it -- same
-- reasoning already established for every prior protect_* trigger.
create or replace function public.protect_profile_identity_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and auth.uid() <> old.id then
    new.first_name := old.first_name;
    new.last_name  := old.last_name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_identity_fields on public.profiles;
create trigger trg_protect_profile_identity_fields
  before update on public.profiles
  for each row execute function public.protect_profile_identity_fields();

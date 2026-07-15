-- Run this in your Supabase SQL editor after 012_patient_diagnosis.sql
-- Lets a patient request a factor refill, which notifies every provider
-- (bell) and lets the client also post a message into the shared care-team
-- thread. Mirrors the exact same insert-own-row + security-definer
-- fan-out-trigger shape already shipped for bleed_events/dose_logs in
-- 008/009 -- no new privilege boundary, just a new event source feeding the
-- same trusted trigger.
--
-- IMPORTANT: paste this file into the Supabase SQL editor in the TWO chunks
-- marked below -- same reason as 009/011 (the editor corrupts scripts that
-- mix CREATE TABLE with a dollar-quoted function body in one paste).

-- ============================================================
-- CHUNK 1 -- table DDL, RLS enable, policies, and the notifications type
-- constraint update. No dollar-quoted bodies here.
-- ============================================================

create table if not exists public.restock_requests (
  id                     uuid primary key default gen_random_uuid(),
  patient_id             uuid not null references auth.users(id) on delete cascade,
  med_id                 text not null,
  med_name               text not null,
  stock_count_at_request integer,
  created_at             timestamptz not null default now()
);

alter table public.restock_requests enable row level security;

drop policy if exists "select own or provider" on public.restock_requests;
create policy "select own or provider" on public.restock_requests
  for select to authenticated
  using (auth.uid() = patient_id or public.is_provider());

drop policy if exists "insert own" on public.restock_requests;
create policy "insert own" on public.restock_requests
  for insert to authenticated
  with check (auth.uid() = patient_id);
-- No update/delete policy -- these are immutable request records, same as
-- bleed_events/dose_logs.

alter table public.notifications
  drop constraint if exists notifications_type_check,
  add constraint notifications_type_check
    check (type in ('bleed','dose','reminder','restock'));
-- Named 'restock', not 'restock_request' -- every existing type is a single
-- word that maps 1:1 to a NotificationBell.module.css class name
-- (styles[n.type]) and a TYPE_RANK key.

-- ============================================================
-- CHUNK 2 -- extend the existing fan-out function + register the new
-- trigger. Reuses notify_providers_of_event() (from 009), just adds a
-- restock_requests branch -- no new function needed.
-- ============================================================

create or replace function public.notify_providers_of_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  patient_name text;
begin
  if tg_table_name = 'bleed_events' then
    select coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'A patient')
      into patient_name from public.profiles where id = new.user_id;
    insert into public.notifications (recipient_id, type, subject_patient_id, message, related_id)
    select p.id, 'bleed', new.user_id, patient_name || ' reported a bleed', new.id
    from public.profiles p where p.role = 'provider' and p.id <> new.user_id;

  elsif tg_table_name = 'dose_logs' then
    if new.reason not in ('bleed', 'bleed_followup') then
      select coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'A patient')
        into patient_name from public.profiles where id = new.user_id;
      insert into public.notifications (recipient_id, type, subject_patient_id, message, related_id)
      select p.id, 'dose', new.user_id, patient_name || ' logged a dose (' || new.med_name || ')', new.id
      from public.profiles p where p.role = 'provider' and p.id <> new.user_id;
    end if;

  elsif tg_table_name = 'restock_requests' then
    -- restock_requests.patient_id plays the same role bleed_events/dose_logs'
    -- user_id column does.
    select coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'A patient')
      into patient_name from public.profiles where id = new.patient_id;
    insert into public.notifications (recipient_id, type, subject_patient_id, message, related_id)
    select p.id, 'restock', new.patient_id,
      patient_name || ' is low on ' || new.med_name ||
      ' (' || coalesce(new.stock_count_at_request::text, '?') || ' left) and requested a refill',
      new.id
    from public.profiles p where p.role = 'provider' and p.id <> new.patient_id;
  end if;

  return new;
end;
$$;

-- The existing trg_notify_providers_bleed/trg_notify_providers_dose
-- triggers (from 009) already point at this function by name -- CREATE OR
-- REPLACE FUNCTION updates their body automatically, no need to re-register
-- them. Only the new restock_requests trigger needs creating.
drop trigger if exists trg_notify_providers_restock on public.restock_requests;
create trigger trg_notify_providers_restock after insert on public.restock_requests
  for each row execute function public.notify_providers_of_event();

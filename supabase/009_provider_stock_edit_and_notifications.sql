-- Run this in your Supabase SQL editor after 008_bleed_events.sql
-- Lets providers edit a patient's stock info (units/product, products in
-- stock) directly, and adds a shared notifications system: providers get
-- alerted when any patient reports a bleed or logs a dose, patients get a
-- general reminder a provider can send them.

-- ==================== 1. Provider stock-edit ====================
-- Column restriction is enforced by a trigger, not a grant/revoke: patients
-- already need full-column update access to this table for their own
-- existing debounced stock editor (schedulePersist in Dashboard.jsx sends
-- every field on every write), so a role-wide grant/revoke can't scope this
-- the way profiles.archived did -- that distinction only exists per-row,
-- which is what the trigger below checks.

create policy "providers can edit stock" on public.user_medications
  for update to authenticated
  using (public.is_provider())
  with check (public.is_provider());

create or replace function public.protect_medication_stock_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and auth.uid() <> old.user_id then
    new.user_id       := old.user_id;
    new.med_id        := old.med_id;
    new.med_name      := old.med_name;
    new.start_date    := old.start_date;
    new.interval_days := old.interval_days;
    new.freq_label    := old.freq_label;
    -- unit_size, stock_count, updated_at pass through untouched
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_medication_stock_only on public.user_medications;
create trigger trg_protect_medication_stock_only
  before update on public.user_medications
  for each row execute function public.protect_medication_stock_only();

-- ==================== 2. Notifications table ====================

create table if not exists public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  recipient_id       uuid not null references auth.users(id) on delete cascade,
  type               text not null check (type in ('bleed','dose','reminder')),
  subject_patient_id uuid references auth.users(id) on delete cascade,
  message            text not null,
  read               boolean not null default false,
  created_at         timestamptz default now(),
  constraint reminder_has_no_subject check (type <> 'reminder' or subject_patient_id is null)
);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_id, read, created_at desc);

alter table public.notifications enable row level security;

-- A demoted provider must immediately lose visibility into old bleed/dose
-- rows naming other patients, even though recipient_id still matches their
-- own uid. Reminder rows (the only type a real patient ever gets) stay
-- visible regardless of role.
drop policy if exists "select own" on public.notifications;
create policy "select own" on public.notifications
  for select to authenticated
  using (auth.uid() = recipient_id and (type = 'reminder' or public.is_provider()));

drop policy if exists "update own read state" on public.notifications;
create policy "update own read state" on public.notifications
  for update to authenticated
  using (auth.uid() = recipient_id and (type = 'reminder' or public.is_provider()))
  with check (auth.uid() = recipient_id);

grant update (read) on public.notifications to authenticated;

drop policy if exists "providers send reminders" on public.notifications;
create policy "providers send reminders" on public.notifications
  for insert to authenticated
  with check (
    public.is_provider() and type = 'reminder'
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.role = 'patient')
  );

-- No insert/select policy exists for type in ('bleed','dose') -- those rows
-- are only ever created by the security definer trigger below, exactly like
-- handle_new_user() already bypasses RLS to create profiles rows.

-- ==================== 3. System-triggered notifications ====================

create or replace function public.notify_providers_of_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  patient_name text;
begin
  select coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'A patient')
    into patient_name from public.profiles where id = new.user_id;

  if tg_table_name = 'bleed_events' then
    insert into public.notifications (recipient_id, type, subject_patient_id, message)
    select p.id, 'bleed', new.user_id, patient_name || ' reported a bleed'
    from public.profiles p where p.role = 'provider' and p.id <> new.user_id;

  elsif tg_table_name = 'dose_logs' then
    -- Skip doses treating a bleed that already fired its own 'bleed'
    -- notification -- notifying again here would be a duplicate signal for
    -- the same clinical event, not new information.
    if new.reason not in ('bleed', 'bleed_followup') then
      insert into public.notifications (recipient_id, type, subject_patient_id, message)
      select p.id, 'dose', new.user_id, patient_name || ' logged a dose (' || new.med_name || ')'
      from public.profiles p where p.role = 'provider' and p.id <> new.user_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_providers_bleed on public.bleed_events;
create trigger trg_notify_providers_bleed after insert on public.bleed_events
  for each row execute function public.notify_providers_of_event();

drop trigger if exists trg_notify_providers_dose on public.dose_logs;
create trigger trg_notify_providers_dose after insert on public.dose_logs
  for each row execute function public.notify_providers_of_event();

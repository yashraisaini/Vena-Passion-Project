-- Run this in your Supabase SQL editor after 009_provider_stock_edit_and_notifications.sql
-- Adds a related_id column so clicking a notification can jump straight to
-- the specific bleed_events/dose_logs row it's about, instead of just the
-- patient in general.

alter table public.notifications add column if not exists related_id uuid;

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
    insert into public.notifications (recipient_id, type, subject_patient_id, message, related_id)
    select p.id, 'bleed', new.user_id, patient_name || ' reported a bleed', new.id
    from public.profiles p where p.role = 'provider' and p.id <> new.user_id;

  elsif tg_table_name = 'dose_logs' then
    if new.reason not in ('bleed', 'bleed_followup') then
      insert into public.notifications (recipient_id, type, subject_patient_id, message, related_id)
      select p.id, 'dose', new.user_id, patient_name || ' logged a dose (' || new.med_name || ')', new.id
      from public.profiles p where p.role = 'provider' and p.id <> new.user_id;
    end if;
  end if;

  return new;
end;
$$;

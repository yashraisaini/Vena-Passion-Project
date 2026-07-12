-- Run this in your Supabase SQL editor after schema.sql and dose_logs.sql
-- Expands dose reasons, records how many products a dose consumed, and adds
-- optional stock tracking (units per product + products remaining) per medication.

alter table public.dose_logs drop constraint if exists dose_logs_reason_check;
alter table public.dose_logs add constraint dose_logs_reason_check
  check (reason in (
    'prophylaxis','prophylaxis_situational','bleed','first_infusion',
    'bleed_followup','no_treatment','surgery','iti','travel','other'
  ));
alter table public.dose_logs add column if not exists products_used integer;

alter table public.user_medications add column if not exists unit_size integer;
alter table public.user_medications add column if not exists stock_count integer;

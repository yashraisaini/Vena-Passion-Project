-- Run this in your Supabase SQL editor after dose_logs.sql
-- Richer clinical detail for bleed-related dose logs (used when reason is
-- 'bleed' or 'bleed_followup'). No RLS changes needed — existing dose_logs
-- policies already cover new columns on this table.

alter table public.dose_logs add column if not exists severity text check (severity in ('mild','moderate','severe'));
alter table public.dose_logs add column if not exists pain_level integer check (pain_level between 0 and 10);
alter table public.dose_logs add column if not exists injury_time timestamptz;
alter table public.dose_logs add column if not exists symptom_swelling boolean not null default false;
alter table public.dose_logs add column if not exists symptom_bruising boolean not null default false;
alter table public.dose_logs add column if not exists symptom_discoloration boolean not null default false;

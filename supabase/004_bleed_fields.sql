-- Run this in your Supabase SQL editor after 003_profiles_and_roles.sql
-- Adds optional bleed-specific detail to dose_logs, used when reason is
-- 'bleed' or 'bleed_followup'. No RLS changes needed — existing policies
-- already cover new columns on this table.

alter table public.dose_logs add column if not exists bleed_location text;
alter table public.dose_logs add column if not exists bleed_side text;

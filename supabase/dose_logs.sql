-- Run this in your Supabase SQL editor
-- Creates the table for logging individual doses actually taken (separate from
-- the schedule in user_medications, which just describes the recurring plan)

create table if not exists public.dose_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  med_id        text not null,
  med_name      text not null,
  taken_at      timestamptz not null default now(),
  dosage        text,
  reason        text not null default 'prophylaxis' check (reason in ('prophylaxis','bleed','travel','other')),
  note          text,
  created_at    timestamptz default now()
);

alter table public.dose_logs enable row level security;

create policy "Users can manage their own dose logs"
  on public.dose_logs
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Run this in your Supabase SQL editor
-- Creates the table for storing user medication schedules

create table if not exists public.user_medications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  med_id        text not null,
  med_name      text not null,
  start_date    date,
  interval_days integer not null default 3,
  freq_label    text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (user_id, med_id)
);

-- Row level security
alter table public.user_medications enable row level security;

create policy "Users can manage their own medications"
  on public.user_medications
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

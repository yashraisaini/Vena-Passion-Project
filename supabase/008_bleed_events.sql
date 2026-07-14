-- Run this in your Supabase SQL editor after 007_bleed_details.sql
-- Splits bleed reporting into its own record, independent of dosing. A bleed
-- event can exist with zero doses ("untreated"), or link to one or more
-- dose_logs rows that treated it. "Treated" status is derived client-side
-- from whether any dose_logs row links back here -- intentionally not a
-- stored column, so it can never go stale if a linked dose is later
-- edited or deleted.

create table if not exists public.bleed_events (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  occurred_at            timestamptz not null default now(),
  location               text,
  side                   text,
  severity               text check (severity in ('mild','moderate','severe')),
  pain_level             integer check (pain_level between 0 and 10),
  symptom_swelling       boolean not null default false,
  symptom_bruising       boolean not null default false,
  symptom_discoloration  boolean not null default false,
  note                   text,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create index if not exists bleed_events_user_id_occurred_at_idx
  on public.bleed_events (user_id, occurred_at desc);

alter table public.bleed_events enable row level security;

drop policy if exists "select own or provider" on public.bleed_events;
create policy "select own or provider" on public.bleed_events
  for select to authenticated
  using (auth.uid() = user_id or public.is_provider());
drop policy if exists "insert own" on public.bleed_events;
create policy "insert own" on public.bleed_events
  for insert to authenticated
  with check (auth.uid() = user_id);
drop policy if exists "update own" on public.bleed_events;
create policy "update own" on public.bleed_events
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "delete own" on public.bleed_events;
create policy "delete own" on public.bleed_events
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------- link doses back to the bleed they treated ----------
-- Nullable, one-directional (dose_logs -> bleed_events): a bleed has zero,
-- one, or many linked doses, so the FK lives on the "many" side. ON DELETE
-- SET NULL, not CASCADE -- removing a bleed_event must never silently
-- delete real dosing history.
alter table public.dose_logs
  add column if not exists bleed_event_id uuid references public.bleed_events(id) on delete set null;

create index if not exists dose_logs_bleed_event_id_idx on public.dose_logs (bleed_event_id);
-- No RLS changes needed on dose_logs -- existing select/insert/update/delete
-- "own" policies already cover this new column.

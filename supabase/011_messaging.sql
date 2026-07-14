-- Run this in your Supabase SQL editor after 010_notification_related_id.sql
-- Adds 1:1 messaging: patient <-> care team ("patient_team", implicit
-- multi-provider access via is_provider(), same broad-access model already
-- used for profiles/user_medications/dose_logs/bleed_events) and provider
-- <-> provider direct messages ("provider_dm"). Read/"seen" receipts and
-- image/document attachments via a new private Storage bucket.
--
-- IMPORTANT: paste this file into the Supabase SQL editor in the TWO chunks
-- marked below, not as one paste and not split any other way -- the editor
-- has a known auto-injection bug that corrupts scripts mixing CREATE TABLE
-- with dollar-quoted function bodies in one paste (already hit in 009).

-- ============================================================
-- CHUNK 1 -- table DDL, indexes, RLS enable, storage bucket row.
-- No dollar-quoted function bodies and no CREATE POLICY statements yet:
-- policies reference helper functions that don't exist until chunk 2.
-- ============================================================

create table if not exists public.conversations (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('patient_team','provider_dm')),
  patient_id     uuid references auth.users(id) on delete cascade,
  participant_a  uuid references auth.users(id) on delete cascade,
  participant_b  uuid references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  constraint conversations_shape check (
    (kind = 'patient_team' and patient_id is not null
       and participant_a is null and participant_b is null)
    or
    (kind = 'provider_dm' and patient_id is null
       and participant_a is not null and participant_b is not null
       and participant_a < participant_b)
  ),
  unique (patient_id),
  unique (participant_a, participant_b)
);

alter table public.conversations enable row level security;

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references auth.users(id) on delete cascade,
  body            text not null default '',
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

alter table public.messages enable row level security;

create table if not exists public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages(id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);

alter table public.message_attachments enable row level security;

create table if not exists public.message_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

alter table public.message_reads enable row level security;

-- private bucket -- first use of Supabase Storage in this app
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments', 'message-attachments', false, 26214400,
  array[
    'image/jpeg','image/png','image/gif','image/webp',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
on conflict (id) do update set
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- CHUNK 2 -- every dollar-quoted function/trigger, plus all CREATE POLICY
-- statements (policies reference functions defined earlier in this same
-- chunk, which is fine since one paste executes top-to-bottom).
-- ============================================================

create or replace function public.can_access_conversation(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv_id
      and (
        (c.kind = 'patient_team' and (c.patient_id = auth.uid() or public.is_provider()))
        or
        -- provider_dm: membership AND a live is_provider() check, so a
        -- demoted provider immediately loses DM access too.
        (c.kind = 'provider_dm' and auth.uid() in (c.participant_a, c.participant_b)
           and public.is_provider())
      )
  );
$$;

grant execute on function public.can_access_conversation(uuid) to authenticated;

-- ---------- provider DM creation -- trusted RPC, not a client insert policy ----------
create or replace function public.get_or_create_provider_dm(other_provider_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me      uuid := auth.uid();
  a       uuid;
  b       uuid;
  conv_id uuid;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if other_provider_id = me then
    raise exception 'cannot start a DM with yourself';
  end if;
  if not public.is_provider() then
    raise exception 'only providers can start provider-to-provider conversations';
  end if;
  if not exists (
    select 1 from public.profiles where id = other_provider_id and role = 'provider'
  ) then
    raise exception 'target user is not a provider';
  end if;

  a := least(me, other_provider_id);
  b := greatest(me, other_provider_id);

  insert into public.conversations (kind, participant_a, participant_b)
  values ('provider_dm', a, b)
  on conflict (participant_a, participant_b) do nothing;

  select id into conv_id from public.conversations
  where kind = 'provider_dm' and participant_a = a and participant_b = b;

  return conv_id;
end;
$$;

grant execute on function public.get_or_create_provider_dm(uuid) to authenticated;

-- ---------- unread count -- security INVOKER on purpose ----------
-- Unlike is_provider()/can_access_conversation(), this only ever needs to
-- see what the caller's own select policies already grant them -- making it
-- security definer would only widen its blast radius for no benefit.
create or replace function public.count_unread_messages()
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select count(*)::int
  from public.messages m
  where public.can_access_conversation(m.conversation_id)
    and m.sender_id <> auth.uid()
    and m.created_at > coalesce(
      (select mr.last_read_at from public.message_reads mr
       where mr.conversation_id = m.conversation_id and mr.user_id = auth.uid()),
      '-infinity'::timestamptz
    );
$$;

grant execute on function public.count_unread_messages() to authenticated;

-- ---------- storage path parsing -- regex guard + cast in one sequential body ----------
-- Doing this inside plpgsql (not as "regex-check AND cast" in a policy's
-- USING clause) guarantees the guard runs before the cast: Postgres does not
-- promise left-to-right evaluation order for ANDed boolean expressions.
create or replace function public.conversation_id_from_storage_path(object_name text)
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  seg text := split_part(object_name, '/', 1);
begin
  if seg ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return seg::uuid;
  end if;
  return null;
end;
$$;

grant execute on function public.conversation_id_from_storage_path(text) to authenticated;

-- ---------- message_reads: don't trust client-supplied timestamps ----------
create or replace function public.protect_message_read_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.last_read_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_message_read_timestamp on public.message_reads;
create trigger trg_protect_message_read_timestamp
  before insert or update on public.message_reads
  for each row execute function public.protect_message_read_timestamp();

-- ---------- handle_new_user(): extend to auto-create a patient_team thread ----------
-- Full body re-supplied (matches the live version from 005_provider_allowlist.sql
-- exactly, plus the new conversation insert) since CREATE OR REPLACE requires
-- the whole definition.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assigned_role text := 'patient';
begin
  if exists (
    select 1 from public.provider_allowlist
    where lower(email) = lower(new.email)
  ) then
    assigned_role := 'provider';
  end if;

  insert into public.profiles (id, patient_id, role)
  values (new.id, public.gen_unique_patient_id(), assigned_role);

  if assigned_role = 'patient' then
    insert into public.conversations (kind, patient_id) values ('patient_team', new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- one-time backfill: give every existing patient their patient_team thread
insert into public.conversations (kind, patient_id)
select 'patient_team', p.id
from public.profiles p
where p.role = 'patient'
  and not exists (
    select 1 from public.conversations c
    where c.kind = 'patient_team' and c.patient_id = p.id
  );

-- ---------- conversations policies ----------
drop policy if exists "select accessible conversations" on public.conversations;
create policy "select accessible conversations" on public.conversations
  for select to authenticated
  using (public.can_access_conversation(id));
-- No insert/update/delete policy: patient_team rows only ever come from
-- handle_new_user(); provider_dm rows only ever come from
-- get_or_create_provider_dm(). Same "no client-facing write path" pattern
-- as notifications' bleed/dose rows in 009.

-- ---------- messages policies ----------
drop policy if exists "select accessible" on public.messages;
create policy "select accessible" on public.messages
  for select to authenticated
  using (public.can_access_conversation(conversation_id));

drop policy if exists "insert as self" on public.messages;
create policy "insert as self" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.can_access_conversation(conversation_id));
-- No update/delete policy -- messages are immutable (no edit/unsend; see
-- "Explicitly out of scope").

-- ---------- message_attachments policies ----------
drop policy if exists "select accessible" on public.message_attachments;
create policy "select accessible" on public.message_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and public.can_access_conversation(m.conversation_id)
    )
  );

drop policy if exists "insert as sender and uploader" on public.message_attachments;
create policy "insert as sender and uploader" on public.message_attachments
  for insert to authenticated
  with check (
    exists (select 1 from public.messages m where m.id = message_id and m.sender_id = auth.uid())
    and exists (
      -- Must ALSO be the actual uploader of this storage object, not just
      -- the sender of the message -- otherwise another participant in the
      -- same conversation could link someone else's uploaded file to a
      -- message they themselves sent.
      select 1 from storage.objects o
      where o.bucket_id = 'message-attachments'
        and o.name = storage_path
        and o.owner = auth.uid()
    )
  );
-- No update/delete policy -- attachments are immutable once posted.

-- ---------- message_reads policies ----------
drop policy if exists "select accessible" on public.message_reads;
create policy "select accessible" on public.message_reads
  for select to authenticated
  using (public.can_access_conversation(conversation_id));
-- Broad on purpose: a patient_team thread can have N provider readers, so
-- "Seen" derivation needs to see every participant's read marker, not just
-- your own row.

drop policy if exists "upsert own read marker" on public.message_reads;
create policy "upsert own read marker" on public.message_reads
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_conversation(conversation_id));

drop policy if exists "update own read marker" on public.message_reads;
create policy "update own read marker" on public.message_reads
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- No delete policy.

-- ---------- storage.objects policies (message-attachments bucket only) ----------
drop policy if exists "insert into own accessible conversation folder" on storage.objects;
create policy "insert into own accessible conversation folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.can_access_conversation(public.conversation_id_from_storage_path(name))
  );

drop policy if exists "select from own accessible conversation folder" on storage.objects;
create policy "select from own accessible conversation folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.can_access_conversation(public.conversation_id_from_storage_path(name))
  );
-- No update/delete policy on storage.objects for this bucket either.

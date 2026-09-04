-- APMTRACEBACK schema for Supabase.
-- Paste into: Dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null,
  email       text not null,
  role        text not null check (role in ('developer', 'tester')),
  created_at  timestamptz not null default now()
);

create table if not exists public.changes (
  id              uuid primary key default gen_random_uuid(),
  change_id       text not null,
  type            text not null,
  priority        text not null,
  status          text not null default 'Draft',
  module          text,
  previous_text   text,
  updated_text    text,
  reason          text,
  developer       text,
  developer_email text not null,
  tester          text,
  tester_email    text not null,
  tester_comment  text,
  created_at      timestamptz not null default now(),
  notified_at     timestamptz,
  reviewed_at     timestamptz,
  updated_at      timestamptz
);

alter table public.profiles enable row level security;
alter table public.changes  enable row level security;

-- Profiles: every signed-in user can read (needed to list testers); only the owner writes.
drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update to authenticated using (auth.uid() = id);

-- Changes: readable by every signed-in user.
drop policy if exists "changes readable by authenticated" on public.changes;
create policy "changes readable by authenticated"
  on public.changes for select to authenticated using (true);

-- Only the raising developer may create a change, and only under their own email.
drop policy if exists "changes insert by owner" on public.changes;
create policy "changes insert by owner"
  on public.changes for insert to authenticated
  with check (developer_email = auth.jwt() ->> 'email');

-- Only the raising developer or the assigned tester may update it.
drop policy if exists "changes update by participants" on public.changes;
create policy "changes update by participants"
  on public.changes for update to authenticated
  using (
    developer_email = auth.jwt() ->> 'email'
    or tester_email = auth.jwt() ->> 'email'
  );

-- Push row changes to connected clients for live cross-device sync.
alter publication supabase_realtime add table public.changes;

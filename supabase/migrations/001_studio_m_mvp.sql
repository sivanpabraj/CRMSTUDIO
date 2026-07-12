-- Studio M — Supabase MVP schema
-- Run in Supabase SQL Editor or: supabase db push

create extension if not exists "pgcrypto";

-- ── Studios (tenant) ──
create table if not exists public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  join_code text unique,
  slug text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Members (links auth.users → studio + roles) ──
create table if not exists public.studio_members (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text,
  display_name text,
  roles text[] not null default '{studio_manager}',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (studio_id, user_id)
);

create index if not exists idx_studio_members_user on public.studio_members(user_id);
create index if not exists idx_studio_members_studio on public.studio_members(studio_id);

-- ── Full-app snapshot (offline-first sync) ──
create table if not exists public.studio_snapshots (
  studio_id uuid primary key references public.studios(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  db_version int not null default 20,
  app_version text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- ── Contracts (structured + payload) ──
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  local_id text,
  contract_num text,
  groom text,
  bride text,
  groom_phone text,
  bride_phone text,
  event_date text,
  status text not null default 'active',
  total numeric default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id, local_id)
);

create index if not exists idx_contracts_studio on public.contracts(studio_id);
create index if not exists idx_contracts_event on public.contracts(studio_id, event_date);

-- ── Helper: user's studio ids ──
create or replace function public.user_studio_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select studio_id from public.studio_members
  where user_id = auth.uid() and status = 'active';
$$;

-- ── RPC: register studio after signup ──
create or replace function public.register_studio(
  p_studio_name text,
  p_phone text,
  p_display_name text default '',
  p_join_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio_id uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  v_code := coalesce(nullif(trim(p_join_code), ''), upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)));

  insert into public.studios (name, join_code, slug)
  values (
    coalesce(nullif(trim(p_studio_name), ''), 'Studio M'),
    v_code,
    lower(regexp_replace(coalesce(nullif(trim(p_studio_name), ''), 'studio'), '\s+', '-', 'g'))
  )
  returning id into v_studio_id;

  insert into public.studio_members (studio_id, user_id, phone, display_name, roles)
  values (v_studio_id, auth.uid(), p_phone, coalesce(nullif(trim(p_display_name), ''), 'مدیر'), array['studio_manager']);

  insert into public.studio_snapshots (studio_id, data, updated_by)
  values (v_studio_id, '{}'::jsonb, auth.uid());

  return v_studio_id;
end;
$$;

-- ── RPC: upsert snapshot ──
create or replace function public.upsert_studio_snapshot(
  p_studio_id uuid,
  p_data jsonb,
  p_db_version int default 20,
  p_app_version text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_at timestamptz := now();
begin
  if not exists (
    select 1 from public.studio_members
    where studio_id = p_studio_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.studio_snapshots (studio_id, data, db_version, app_version, updated_at, updated_by)
  values (p_studio_id, p_data, p_db_version, p_app_version, v_at, auth.uid())
  on conflict (studio_id) do update set
    data = excluded.data,
    db_version = excluded.db_version,
    app_version = excluded.app_version,
    updated_at = v_at,
    updated_by = auth.uid();

  update public.studios set updated_at = v_at where id = p_studio_id;
  return v_at;
end;
$$;

-- ── RLS ──
alter table public.studios enable row level security;
alter table public.studio_members enable row level security;
alter table public.studio_snapshots enable row level security;
alter table public.contracts enable row level security;

create policy "studios_select_member" on public.studios for select
  using (id in (select public.user_studio_ids()));

create policy "studios_update_manager" on public.studios for update
  using (id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles)
  ));

create policy "members_select_same_studio" on public.studio_members for select
  using (studio_id in (select public.user_studio_ids()));

create policy "members_insert_manager" on public.studio_members for insert
  with check (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles)
  ));

create policy "members_update_manager" on public.studio_members for update
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles)
  ));

create policy "snapshots_select_member" on public.studio_snapshots for select
  using (studio_id in (select public.user_studio_ids()));

create policy "snapshots_upsert_member" on public.studio_snapshots for all
  using (studio_id in (select public.user_studio_ids()))
  with check (studio_id in (select public.user_studio_ids()));

create policy "contracts_select_member" on public.contracts for select
  using (studio_id in (select public.user_studio_ids()));

create policy "contracts_write_member" on public.contracts for all
  using (studio_id in (select public.user_studio_ids()))
  with check (studio_id in (select public.user_studio_ids()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.register_studio to authenticated;
grant execute on function public.upsert_studio_snapshot to authenticated;
grant execute on function public.user_studio_ids to authenticated;

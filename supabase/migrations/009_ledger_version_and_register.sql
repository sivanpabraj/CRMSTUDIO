-- SaaS P1: sequential ledger heads + hardened register/join studio

-- ── Ledger head (monotonic version per tenant) ──
create table if not exists public.studio_ledger_heads (
  studio_id uuid primary key references public.studios(id) on delete cascade,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.studio_ledger_heads enable row level security;

create policy studio_ledger_heads_member_read on public.studio_ledger_heads
  for select using (
    studio_id in (select public.user_studio_ids())
  );

-- Members cannot forge version bumps from the client; Edge uses user JWT insert via RPC below.

create or replace function public.claim_ledger_version(
  p_studio_id uuid,
  p_expected_version bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version bigint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.studio_members
    where studio_id = p_studio_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.studio_ledger_heads (studio_id, version, updated_at)
  values (p_studio_id, 0, now())
  on conflict (studio_id) do nothing;

  select version into v_version
  from public.studio_ledger_heads
  where studio_id = p_studio_id
  for update;

  if p_expected_version is not null and p_expected_version <> v_version then
    raise exception 'ledger_conflict:%:%', v_version, p_expected_version
      using errcode = 'P0001';
  end if;

  update public.studio_ledger_heads
  set version = v_version + 1, updated_at = now()
  where studio_id = p_studio_id
  returning version into v_version;

  return v_version;
end;
$$;

grant execute on function public.claim_ledger_version(uuid, bigint) to authenticated;

-- Add ledger_version column on entries if missing
alter table public.studio_ledger_entries
  add column if not exists ledger_version bigint;

-- ── Harden register_studio: join by code OR reuse existing membership ──
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
  v_existing uuid;
  v_join text := nullif(upper(trim(coalesce(p_join_code, ''))), '');
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Join existing tenant by join_code
  if v_join is not null then
    select id into v_studio_id from public.studios where upper(join_code) = v_join limit 1;
    if v_studio_id is null then
      raise exception 'invalid join code';
    end if;
    if exists (
      select 1 from public.studio_members
      where studio_id = v_studio_id and user_id = auth.uid()
    ) then
      update public.studio_members
      set status = 'active',
          phone = coalesce(nullif(trim(p_phone), ''), phone),
          display_name = coalesce(nullif(trim(p_display_name), ''), display_name)
      where studio_id = v_studio_id and user_id = auth.uid();
      return v_studio_id;
    end if;
    insert into public.studio_members (studio_id, user_id, phone, display_name, roles, status)
    values (
      v_studio_id,
      auth.uid(),
      p_phone,
      coalesce(nullif(trim(p_display_name), ''), 'عضو'),
      array['office_secretary'],
      'active'
    );
    return v_studio_id;
  end if;

  -- Already a member of a studio → reuse (no duplicate tenant on re-signup)
  select studio_id into v_existing
  from public.studio_members
  where user_id = auth.uid() and status = 'active'
  order by created_at asc
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.studios (name, join_code, slug)
  values (
    coalesce(nullif(trim(p_studio_name), ''), 'Studio M'),
    v_code,
    lower(regexp_replace(coalesce(nullif(trim(p_studio_name), ''), 'studio'), '\s+', '-', 'g'))
  )
  returning id into v_studio_id;

  insert into public.studio_members (studio_id, user_id, phone, display_name, roles)
  values (
    v_studio_id,
    auth.uid(),
    p_phone,
    coalesce(nullif(trim(p_display_name), ''), 'مدیر'),
    array['studio_manager']
  );

  insert into public.studio_snapshots (studio_id, data, updated_by)
  values (v_studio_id, '{}'::jsonb, auth.uid())
  on conflict (studio_id) do nothing;

  insert into public.studio_ledger_heads (studio_id, version)
  values (v_studio_id, 0)
  on conflict (studio_id) do nothing;

  return v_studio_id;
end;
$$;

-- Isolation helper for tests / docs (returns true if actor can see foreign studio)
create or replace function public.rls_can_select_studio(p_studio_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select p_studio_id in (select public.user_studio_ids());
$$;

grant execute on function public.rls_can_select_studio(uuid) to authenticated;

comment on function public.claim_ledger_version is
  'Atomic ledger version bump; raises ledger_conflict when expected_version mismatches';

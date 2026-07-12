-- Studio M Phase 2 — Structured entity sync (row-level)
-- Run after 002_snapshot_manager_rls.sql

-- ── Per-entity sync cursors ──
create table if not exists public.studio_sync_cursors (
  studio_id uuid not null references public.studios(id) on delete cascade,
  entity_type text not null,
  last_pushed_at timestamptz,
  last_pulled_at timestamptz,
  primary key (studio_id, entity_type)
);

-- ── Generic entity rows (JSON payload + revision) ──
create table if not exists public.studio_entities (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  entity_type text not null,
  local_id text not null,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (studio_id, entity_type, local_id)
);

create index if not exists idx_studio_entities_studio_type
  on public.studio_entities (studio_id, entity_type);

create index if not exists idx_studio_entities_updated
  on public.studio_entities (studio_id, entity_type, updated_at desc);

-- ── RLS ──
alter table public.studio_sync_cursors enable row level security;
alter table public.studio_entities enable row level security;

create policy "sync_cursors_select_member" on public.studio_sync_cursors for select
  using (studio_id in (select public.user_studio_ids()));

create policy "sync_cursors_write_manager" on public.studio_sync_cursors for all
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ))
  with check (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ));

create policy "entities_select_member" on public.studio_entities for select
  using (studio_id in (select public.user_studio_ids()));

create policy "entities_write_manager" on public.studio_entities for all
  using (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ))
  with check (studio_id in (
    select studio_id from public.studio_members
    where user_id = auth.uid() and 'studio_manager' = any(roles) and status = 'active'
  ));

grant select, insert, update, delete on public.studio_sync_cursors to authenticated;
grant select, insert, update, delete on public.studio_entities to authenticated;

-- ── RPC: batch upsert entities (manager only) ──
create or replace function public.upsert_studio_entities(
  p_studio_id uuid,
  p_entity_type text,
  p_rows jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_count int := 0;
  v_at timestamptz := now();
begin
  if not exists (
    select 1 from public.studio_members
    where studio_id = p_studio_id and user_id = auth.uid() and status = 'active'
      and 'studio_manager' = any(roles)
  ) then
    raise exception 'forbidden';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.studio_entities (
      studio_id, entity_type, local_id, payload, revision, updated_at, updated_by
    )
    values (
      p_studio_id,
      p_entity_type,
      v_row->>'local_id',
      coalesce(v_row->'payload', '{}'::jsonb),
      coalesce((v_row->>'revision')::bigint, 1),
      coalesce((v_row->>'updated_at')::timestamptz, v_at),
      auth.uid()
    )
    on conflict (studio_id, entity_type, local_id) do update set
      payload = excluded.payload,
      revision = excluded.revision,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
    where excluded.updated_at >= public.studio_entities.updated_at;
    v_count := v_count + 1;
  end loop;

  insert into public.studio_sync_cursors (studio_id, entity_type, last_pushed_at)
  values (p_studio_id, p_entity_type, v_at)
  on conflict (studio_id, entity_type) do update set last_pushed_at = v_at;

  return v_count;
end;
$$;

grant execute on function public.upsert_studio_entities to authenticated;

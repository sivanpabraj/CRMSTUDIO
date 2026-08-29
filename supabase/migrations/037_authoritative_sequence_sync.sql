-- Authoritative delta sync v2.
-- Client timestamps are never used for ordering. Every accepted mutation gets
-- a tenant-scoped server sequence and deletes are durable tombstones.

create table if not exists public.studio_sync_heads (
  studio_id uuid primary key references public.studios(id) on delete cascade,
  last_seq bigint not null default 0 check (last_seq >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_sync_inbox (
  studio_id uuid not null references public.studios(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  entity_type text not null,
  local_id text not null,
  accepted_seq bigint not null check (accepted_seq > 0),
  result jsonb not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (studio_id, idempotency_key)
);

alter table public.studio_entities
  add column if not exists updated_seq bigint,
  add column if not exists deleted_at timestamptz;

-- Existing rows receive a deterministic sequence before NOT NULL is enforced.
with ranked as (
  select id, row_number() over (
    partition by studio_id order by updated_at, id
  ) as seq
  from public.studio_entities
  where updated_seq is null
)
update public.studio_entities as e
set updated_seq = ranked.seq
from ranked where ranked.id = e.id;

insert into public.studio_sync_heads (studio_id, last_seq)
select studio_id, coalesce(max(updated_seq), 0)
from public.studio_entities
group by studio_id
on conflict (studio_id) do update
set last_seq = greatest(public.studio_sync_heads.last_seq, excluded.last_seq),
    updated_at = now();

alter table public.studio_entities
  alter column updated_seq set not null;

create unique index if not exists studio_entities_studio_seq_unique
  on public.studio_entities (studio_id, updated_seq);
create index if not exists studio_entities_delta_cursor_idx
  on public.studio_entities (studio_id, entity_type, updated_seq, id);
create index if not exists studio_sync_inbox_created_idx
  on public.studio_sync_inbox (studio_id, created_at desc);

alter table public.studio_sync_heads enable row level security;
alter table public.studio_sync_inbox enable row level security;

revoke all on public.studio_sync_heads, public.studio_sync_inbox
  from public, anon, authenticated;

create policy studio_sync_heads_read
on public.studio_sync_heads for select to authenticated
using (public.has_studio_permission(studio_id, 'studio.read'));

create policy studio_sync_inbox_read_own
on public.studio_sync_inbox for select to authenticated
using (
  actor_id = (select auth.uid())
  and public.has_studio_permission(studio_id, 'studio.read')
);

grant select on public.studio_sync_heads, public.studio_sync_inbox to authenticated;

create or replace function public.apply_studio_entity_commands(
  p_studio_id uuid,
  p_entity_type text,
  p_commands jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_command jsonb;
  v_existing public.studio_entities;
  v_prior public.studio_sync_inbox;
  v_local_id text;
  v_key text;
  v_op text;
  v_expected bigint;
  v_seq bigint;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_permission text;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_entity_type not in (
    'contracts', 'transactions', 'invoices', 'bookings', 'personnel',
    'equipment', 'workflows', 'packages', 'expenses', 'leads', 'banks',
    'cheques', 'appointments', 'customerRequests', 'fileAssets',
    'salaryPayments', 'attendance', 'notifications', 'persProjects',
    'persContracts', 'calendarReminders', 'galleries', 'customerCustody'
  ) then
    raise exception 'sync_entity_type_not_allowed' using errcode = '22023';
  end if;
  if p_commands is null or jsonb_typeof(p_commands) <> 'array'
    or jsonb_array_length(p_commands) not between 1 and 200 then
    raise exception 'invalid_sync_batch' using errcode = '22023';
  end if;

  v_permission := case
    when p_entity_type in ('transactions','invoices','expenses','banks','cheques','salaryPayments')
      then 'finance.write'
    when p_entity_type in ('contracts','leads','bookings','appointments','customerRequests','packages')
      then 'crm.write'
    when p_entity_type = 'personnel' then 'members.manage'
    else 'operations.write'
  end;
  if not public.has_studio_permission(p_studio_id, v_permission) then
    raise exception 'sync_permission_denied' using errcode = '42501';
  end if;

  -- One tenant/entity writer at a time makes sequence allocation and optimistic
  -- revision checks deterministic across devices and retry storms.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sync:' || p_studio_id::text || ':' || p_entity_type, 0)
  );

  insert into public.studio_sync_heads (studio_id, last_seq)
  values (p_studio_id, 0)
  on conflict (studio_id) do nothing;

  for v_command in select value from jsonb_array_elements(p_commands)
  loop
    v_local_id := nullif(btrim(v_command->>'local_id'), '');
    v_key := nullif(btrim(v_command->>'idempotency_key'), '');
    v_op := coalesce(nullif(lower(v_command->>'op'), ''), 'upsert');
    if v_local_id is null or length(v_local_id) > 160
      or v_key is null or length(v_key) not between 8 and 128
      or v_op not in ('upsert', 'delete') then
      raise exception 'invalid_sync_command' using errcode = '22023';
    end if;

    select * into v_prior from public.studio_sync_inbox
    where studio_id = p_studio_id and idempotency_key = v_key;
    if found then
      if v_prior.entity_type <> p_entity_type or v_prior.local_id <> v_local_id then
        raise exception 'sync_idempotency_key_reused' using errcode = '23505';
      end if;
      v_results := v_results || jsonb_build_array(v_prior.result || jsonb_build_object('deduped', true));
      continue;
    end if;

    select * into v_existing from public.studio_entities
    where studio_id = p_studio_id
      and entity_type = p_entity_type
      and local_id = v_local_id
    for update;

    if v_command ? 'expected_revision' then
      begin
        v_expected := (v_command->>'expected_revision')::bigint;
      exception when others then
        raise exception 'invalid_expected_revision' using errcode = '22023';
      end;
    else
      raise exception 'expected_revision_required' using errcode = '22023';
    end if;
    if v_expected < 0 or (found and v_existing.revision <> v_expected)
      or (not found and v_expected <> 0) then
      raise exception 'sync_revision_conflict' using errcode = '40001';
    end if;

    update public.studio_sync_heads
    set last_seq = last_seq + 1, updated_at = now()
    where studio_id = p_studio_id
    returning last_seq into v_seq;

    insert into public.studio_entities (
      studio_id, entity_type, local_id, payload, revision,
      updated_seq, updated_at, updated_by, deleted_at
    ) values (
      p_studio_id, p_entity_type, v_local_id,
      case when v_op = 'delete' then jsonb_build_object('_deleted', true, 'id', v_local_id)
           else coalesce(v_command->'payload', '{}'::jsonb) end,
      v_expected + 1, v_seq, now(), v_actor,
      case when v_op = 'delete' then now() else null end
    )
    on conflict (studio_id, entity_type, local_id) do update set
      payload = excluded.payload,
      revision = excluded.revision,
      updated_seq = excluded.updated_seq,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by,
      deleted_at = excluded.deleted_at;

    v_result := jsonb_build_object(
      'local_id', v_local_id,
      'revision', v_expected + 1,
      'updated_seq', v_seq,
      'deleted', v_op = 'delete',
      'deduped', false
    );
    insert into public.studio_sync_inbox (
      studio_id, idempotency_key, entity_type, local_id,
      accepted_seq, result, actor_id
    ) values (
      p_studio_id, v_key, p_entity_type, v_local_id,
      v_seq, v_result, v_actor
    );
    v_results := v_results || jsonb_build_array(v_result);
  end loop;
  return jsonb_build_object('ok', true, 'results', v_results);
end;
$$;

create or replace function public.pull_studio_entity_deltas(
  p_studio_id uuid,
  p_entity_type text,
  p_after_seq bigint default 0,
  p_after_id uuid default '00000000-0000-0000-0000-000000000000',
  p_limit integer default 200
)
returns table (
  id uuid,
  local_id text,
  payload jsonb,
  revision bigint,
  updated_seq bigint,
  updated_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_permission text;
begin
  if p_entity_type not in (
    'contracts', 'transactions', 'invoices', 'bookings', 'personnel',
    'equipment', 'workflows', 'packages', 'expenses', 'leads', 'banks',
    'cheques', 'appointments', 'customerRequests', 'fileAssets',
    'salaryPayments', 'attendance', 'notifications', 'persProjects',
    'persContracts', 'calendarReminders', 'galleries', 'customerCustody'
  ) then
    raise exception 'sync_entity_type_not_allowed' using errcode = '22023';
  end if;
  v_permission := case
    when p_entity_type in ('transactions','invoices','expenses','banks','cheques','salaryPayments')
      then 'finance.read'
    when p_entity_type in ('contracts','leads','bookings','appointments','customerRequests','packages','notifications')
      then 'crm.read'
    when p_entity_type = 'personnel' then 'members.manage'
    else 'operations.read'
  end;
  if not public.has_studio_permission(p_studio_id, v_permission) then
    raise exception 'sync_permission_denied' using errcode = '42501';
  end if;

  return query
  select e.id, e.local_id, e.payload, e.revision, e.updated_seq,
         e.updated_at, e.deleted_at
  from public.studio_entities as e
  where e.studio_id = p_studio_id
    and e.entity_type = p_entity_type
    and (e.updated_seq, e.id) > (
      greatest(coalesce(p_after_seq, 0), 0),
      coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
  order by e.updated_seq, e.id
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

-- The old timestamp-based writer is retired. Direct Data API writes are also
-- removed; new clients must use the sequence/idempotency RPC.
revoke insert, update, delete on public.studio_entities from authenticated;
revoke execute on function public.upsert_studio_entities(uuid, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.apply_studio_entity_commands(uuid, text, jsonb)
  from public, anon;
revoke execute on function public.pull_studio_entity_deltas(uuid, text, bigint, uuid, integer)
  from public, anon;
grant execute on function public.apply_studio_entity_commands(uuid, text, jsonb)
  to authenticated;
grant execute on function public.pull_studio_entity_deltas(uuid, text, bigint, uuid, integer)
  to authenticated;

comment on function public.apply_studio_entity_commands(uuid, text, jsonb) is
  'Authoritative idempotent sync writer using server sequence, tombstones, and optimistic revision';
comment on function public.pull_studio_entity_deltas(uuid, text, bigint, uuid, integer) is
  'Keyset delta reader ordered by the immutable (updated_seq,id) server cursor';

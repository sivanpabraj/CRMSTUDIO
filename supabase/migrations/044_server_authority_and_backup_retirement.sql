-- Retire plaintext disaster-recovery data and close the remaining generic
-- sync paths around server-authoritative aggregates.

-- Production precondition: plaintext archives cannot be silently discarded.
-- Operators must explicitly export/encrypt/remove them before retrying this
-- migration. On the known production project this count is expected to be 0.
do $$
declare
  v_plaintext_count bigint;
begin
  select count(*) into v_plaintext_count
  from public.studio_backup_archives
  where payload is not null;

  if v_plaintext_count <> 0 then
    raise exception 'plaintext_backup_archives_present count=%', v_plaintext_count
      using errcode = '55000';
  end if;
end
$$;

-- The browser cannot enumerate backup rows, even when RLS would otherwise
-- restrict them to one tenant. Backup metadata and ciphertext now cross only
-- the Edge Function -> service-only RPC boundary.
drop policy if exists backup_archives_select_manager
  on public.studio_backup_archives;
revoke all privileges on table public.studio_backup_archives
  from public, anon, authenticated, service_role;

alter table public.studio_backup_archives
  drop constraint if exists studio_backup_archive_payload_mode;
alter table public.studio_backup_archives
  alter column payload drop not null,
  alter column payload set default null,
  alter column encrypted_payload set not null,
  alter column encryption_nonce set not null,
  alter column manifest set not null;
alter table public.studio_backup_archives
  add constraint studio_backup_archive_payload_retired
  check (payload is null),
  add constraint studio_backup_archive_encrypted_envelope_required
  check (
    length(encrypted_payload) >= 24
    and length(encryption_nonce) >= 16
    and manifest->>'format' = 'crmstudio-aes-gcm-v1'
    and manifest->>'algorithm' = 'AES-256-GCM'
  );

-- The plaintext writer is removed, not merely hidden by a browser grant.
drop function if exists public.create_studio_backup(
  uuid, jsonb, text, text, integer, text
);

revoke all privileges on function public.store_encrypted_studio_backup(
  uuid, uuid, text, text, text, bigint, jsonb
) from public, anon, authenticated, service_role;
revoke all privileges on function public.read_encrypted_studio_backup(
  uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.store_encrypted_studio_backup(
  uuid, uuid, text, text, text, bigint, jsonb
) to service_role;
grant execute on function public.read_encrypted_studio_backup(
  uuid, uuid
) to service_role;

create or replace function public.list_encrypted_studio_backups(
  p_studio_id uuid,
  p_actor_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.studio_members as m
    where m.studio_id = p_studio_id
      and m.user_id = p_actor_id
      and m.status = 'active'
      and m.revoked_at is null
      and m.valid_from <= now()
      and (m.valid_until is null or m.valid_until > now())
      and m.roles && array['owner','system_admin','studio_manager']::text[]
  ) then
    raise exception 'backup_permission_denied' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', archive.id,
        'source', archive.source,
        'checksum', archive.checksum,
        'size_bytes', archive.size_bytes,
        'db_version', archive.db_version,
        'app_version', archive.app_version,
        'manifest', archive.manifest,
        'created_at', archive.created_at,
        'created_by', archive.created_by
      ) order by archive.created_at desc, archive.id desc
    ),
    '[]'::jsonb
  ) into v_result
  from (
    select a.id, a.source, a.checksum, a.size_bytes, a.db_version,
      a.app_version, a.manifest, a.created_at, a.created_by
    from public.studio_backup_archives as a
    where a.studio_id = p_studio_id
      and a.payload is null
      and a.encrypted_payload is not null
    order by a.created_at desc, a.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
  ) as archive;

  return v_result;
end;
$$;
revoke all privileges on function public.list_encrypted_studio_backups(
  uuid, uuid, integer
) from public, anon, authenticated, service_role;
grant execute on function public.list_encrypted_studio_backups(
  uuid, uuid, integer
) to service_role;

comment on column public.studio_backup_archives.payload is
  'Retired plaintext field; constraint requires NULL for every historical and future row';

-- Tenant ownership of a contract is immutable even for a manager who belongs
-- to both tenants. Financial projections embedded in the legacy contract row
-- additionally require finance.write when updated directly.
create or replace function public.guard_contract_authoritative_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text;
  v_finance_changed boolean := old.total is distinct from new.total;
begin
  if old.studio_id is distinct from new.studio_id then
    raise exception 'contract_studio_immutable' using errcode = '23514';
  end if;

  foreach v_key in array array[
    'total', 'deposit', 'paid', 'balance', 'discount', 'tax',
    'lineItems', 'financial', 'depositBankId', 'depositTransactionId',
    'depositInvoiceId', 'cancelRecord'
  ]::text[]
  loop
    if (old.payload -> v_key) is distinct from (new.payload -> v_key) then
      v_finance_changed := true;
      exit;
    end if;
  end loop;

  if v_finance_changed
    and not public.has_studio_permission(old.studio_id, 'finance.write') then
    raise exception 'contract_finance_write_denied' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_authoritative_fields_guard
  on public.contracts;
create trigger contracts_authoritative_fields_guard
before update on public.contracts
for each row execute function public.guard_contract_authoritative_fields();
revoke execute on function public.guard_contract_authoritative_fields()
  from public, anon, authenticated, service_role;

-- Preserve the tested sequence/tombstone implementation as an internal
-- function, then expose a deny-by-default wrapper that rejects aggregates with
-- their own authoritative server model.
alter function public.apply_studio_entity_commands(uuid, text, jsonb)
  rename to apply_studio_entity_commands_non_authoritative_internal;
revoke all privileges on function public.apply_studio_entity_commands_non_authoritative_internal(
  uuid, text, jsonb
) from public, anon, authenticated, service_role;

create function public.apply_studio_entity_commands(
  p_studio_id uuid,
  p_entity_type text,
  p_commands jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_entity_type = any(array[
    'contracts', 'transactions', 'invoices', 'expenses', 'banks', 'cheques',
    'salaryPayments', 'persProjects', 'persContracts'
  ]::text[]) then
    raise exception 'sync_server_authoritative_entity' using errcode = '42501';
  end if;
  return public.apply_studio_entity_commands_non_authoritative_internal(
    p_studio_id, p_entity_type, p_commands
  );
end;
$$;
revoke all privileges on function public.apply_studio_entity_commands(
  uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.apply_studio_entity_commands(
  uuid, text, jsonb
) to authenticated;

alter function public.pull_studio_entity_deltas(uuid, text, bigint, uuid, integer)
  rename to pull_studio_entity_deltas_non_authoritative_internal;
revoke all privileges on function public.pull_studio_entity_deltas_non_authoritative_internal(
  uuid, text, bigint, uuid, integer
) from public, anon, authenticated, service_role;

create function public.pull_studio_entity_deltas(
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
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_entity_type = any(array[
    'contracts', 'transactions', 'invoices', 'expenses', 'banks', 'cheques',
    'salaryPayments', 'persProjects', 'persContracts'
  ]::text[]) then
    raise exception 'sync_server_authoritative_entity' using errcode = '42501';
  end if;
  return query
  select source.id, source.local_id, source.payload, source.revision,
    source.updated_seq, source.updated_at, source.deleted_at
  from public.pull_studio_entity_deltas_non_authoritative_internal(
    p_studio_id, p_entity_type, p_after_seq, p_after_id, p_limit
  ) as source;
end;
$$;
revoke all privileges on function public.pull_studio_entity_deltas(
  uuid, text, bigint, uuid, integer
) from public, anon, authenticated, service_role;
grant execute on function public.pull_studio_entity_deltas(
  uuid, text, bigint, uuid, integer
) to authenticated;

-- Even if an authenticated client bypasses the RPC and queries the Data API,
-- server-authoritative legacy rows are not exposed. Existing rows remain for a
-- separately reconciled cleanup instead of being destructively deleted here.
drop policy if exists studio_entities_server_authority_read_guard
  on public.studio_entities;
create policy studio_entities_server_authority_read_guard
on public.studio_entities
as restrictive
for select
to authenticated
using (
  entity_type <> all(array[
    'contracts', 'transactions', 'invoices', 'expenses', 'banks', 'cheques',
    'salaryPayments', 'persProjects', 'persContracts'
  ]::text[])
);

comment on function public.apply_studio_entity_commands(uuid, text, jsonb) is
  'Generic sync boundary for non-authoritative aggregates only; finance and contract commands are rejected';
comment on function public.pull_studio_entity_deltas(uuid, text, bigint, uuid, integer) is
  'Generic delta reader for non-authoritative aggregates only';

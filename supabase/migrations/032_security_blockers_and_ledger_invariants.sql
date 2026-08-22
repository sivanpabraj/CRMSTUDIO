-- STE-100 security blocker closure: legacy finance, expiry bypasses,
-- customer attachment confused-deputy, and ledger invariants.

drop policy if exists studio_mutation_audit_member_read on public.studio_mutation_audit;
create policy studio_mutation_audit_finance_read
on public.studio_mutation_audit for select to authenticated
using (public.has_studio_permission(studio_id, 'finance.read'));

drop policy if exists studio_ledger_entries_member_read on public.studio_ledger_entries;
create policy studio_ledger_entries_finance_read
on public.studio_ledger_entries for select to authenticated
using (public.has_studio_permission(studio_id, 'finance.read'));

drop policy if exists snapshots_select_manager on public.studio_snapshots;
drop policy if exists snapshots_insert_manager on public.studio_snapshots;
drop policy if exists snapshots_update_manager on public.studio_snapshots;
drop policy if exists snapshots_delete_manager on public.studio_snapshots;
create policy snapshots_select_manager on public.studio_snapshots for select to authenticated
using (public.has_studio_permission(studio_id, 'members.manage'));
create policy snapshots_insert_manager on public.studio_snapshots for insert to authenticated
with check (public.has_studio_permission(studio_id, 'members.manage'));
create policy snapshots_update_manager on public.studio_snapshots for update to authenticated
using (public.has_studio_permission(studio_id, 'members.manage'))
with check (public.has_studio_permission(studio_id, 'members.manage'));
create policy snapshots_delete_manager on public.studio_snapshots for delete to authenticated
using (public.has_studio_permission(studio_id, 'members.manage'));

drop policy if exists backup_archives_select_manager on public.studio_backup_archives;
create policy backup_archives_select_manager
on public.studio_backup_archives for select to authenticated
using (public.has_studio_permission(studio_id, 'members.manage'));

create or replace function public.create_studio_backup(
  p_studio_id uuid,
  p_payload jsonb,
  p_checksum text,
  p_source text default 'manual',
  p_db_version int default 1,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_size bigint;
begin
  if (select auth.uid()) is null
    or not public.has_studio_permission(p_studio_id, 'members.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid backup payload';
  end if;
  if p_checksum is null or p_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid backup checksum';
  end if;
  v_size := octet_length(p_payload::text);
  if v_size < 1 or v_size > 20971520 then
    raise exception 'backup payload exceeds 20 MiB limit';
  end if;
  insert into public.studio_backup_archives (
    studio_id, payload, checksum, source, size_bytes,
    db_version, app_version, created_by
  ) values (
    p_studio_id, p_payload, p_checksum,
    left(coalesce(nullif(btrim(p_source), ''), 'manual'), 32), v_size,
    greatest(coalesce(p_db_version, 1), 1), left(p_app_version, 64), (select auth.uid())
  ) returning id into v_id;
  return v_id;
end;
$$;

drop policy if exists erp_production_events_read on public.erp_production_events;
create policy erp_production_events_read
on public.erp_production_events for select to authenticated
using (
  public.has_studio_permission(studio_id, 'operations.read')
  and (
    public.has_studio_permission(studio_id, 'operations.write')
    or exists (
      select 1 from public.erp_work_order_assignments as a
      where a.work_order_id = erp_production_events.work_order_id
        and a.user_id = (select auth.uid())
        and a.valid_from <= now()
        and (a.valid_until is null or a.valid_until > now())
    )
  )
);
drop policy if exists erp_production_events_insert on public.erp_production_events;
create policy erp_production_events_insert
on public.erp_production_events for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and public.has_studio_permission(studio_id, 'operations.read')
  and (
    public.has_studio_permission(studio_id, 'operations.write')
    or exists (
      select 1 from public.erp_work_order_assignments as a
      where a.work_order_id = erp_production_events.work_order_id
        and a.user_id = (select auth.uid())
        and a.valid_from <= now()
        and (a.valid_until is null or a.valid_until > now())
    )
  )
);

create or replace function public.enforce_erp_assignment_membership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.studio_members as m
    where m.studio_id = new.studio_id
      and m.user_id = new.user_id
      and m.status = 'active'
      and m.revoked_at is null
      and m.valid_from <= now()
      and (m.valid_until is null or m.valid_until > now())
  ) then
    raise exception 'erp_assignment_requires_active_membership' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists erp_assignment_membership on public.erp_work_order_assignments;
create trigger erp_assignment_membership before insert or update
on public.erp_work_order_assignments for each row
execute function public.enforce_erp_assignment_membership();

create or replace function public.enforce_customer_message_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner text;
begin
  if not exists (
    select 1 from public.contracts as c
    where c.id = new.contract_id and c.studio_id = new.studio_id
  ) then
    raise exception 'customer_message_contract_studio_mismatch' using errcode = '23514';
  end if;
  if new.sender_id <> (select auth.uid()) then
    raise exception 'customer_message_sender_mismatch' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.customer_portal_access as a
    where a.contract_id = new.contract_id
      and a.studio_id = new.studio_id
      and a.user_id = (select auth.uid())
  ) then
    new.sender_kind := 'customer';
  elsif public.has_studio_permission(new.studio_id, 'crm.write') then
    new.sender_kind := case
      when public.has_studio_permission(new.studio_id, 'members.manage') then 'manager'
      else 'staff'
    end;
  else
    raise exception 'customer_message_permission_denied' using errcode = '42501';
  end if;
  if new.attachment_path is not null then
    if new.attachment_path not like
      new.studio_id::text || '/customer/' || new.contract_id::text || '/%' then
      raise exception 'customer_attachment_path_mismatch' using errcode = '23514';
    end if;
    select o.owner_id into v_owner
    from storage.objects as o
    where o.bucket_id = 'studio-files' and o.name = new.attachment_path;
    if v_owner is null or v_owner <> (select auth.uid())::text then
      raise exception 'customer_attachment_owner_mismatch' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_customer_message_links() from public, anon, authenticated;
drop trigger if exists customer_message_links on public.customer_portal_messages;
create trigger customer_message_links before insert or update
on public.customer_portal_messages for each row
execute function public.enforce_customer_message_links();

drop policy if exists studio_files_select_member on storage.objects;
create policy studio_files_select_manager on storage.objects for select to authenticated
using (
  bucket_id = 'studio-files'
  and public.has_studio_permission(((storage.foldername(name))[1])::uuid, 'operations.write')
);
drop policy if exists studio_files_insert_manager on storage.objects;
create policy studio_files_insert_manager on storage.objects for insert to authenticated
with check (
  bucket_id = 'studio-files'
  and public.has_studio_permission(((storage.foldername(name))[1])::uuid, 'operations.write')
);
drop policy if exists studio_files_update_manager on storage.objects;
create policy studio_files_update_manager on storage.objects for update to authenticated
using (
  bucket_id = 'studio-files'
  and public.has_studio_permission(((storage.foldername(name))[1])::uuid, 'operations.write')
)
with check (
  bucket_id = 'studio-files'
  and public.has_studio_permission(((storage.foldername(name))[1])::uuid, 'operations.write')
);
drop policy if exists studio_files_delete_manager on storage.objects;
create policy studio_files_delete_manager on storage.objects for delete to authenticated
using (
  bucket_id = 'studio-files'
  and public.has_studio_permission(((storage.foldername(name))[1])::uuid, 'operations.write')
);

drop policy if exists customer_files_select on storage.objects;
create policy customer_files_select on storage.objects for select to authenticated
using (
  bucket_id = 'studio-files'
  and (storage.foldername(name))[2] = 'customer'
  and exists (
    select 1
    from public.customer_portal_messages as m
    join public.customer_portal_access as a
      on a.contract_id = m.contract_id and a.studio_id = m.studio_id
    where m.attachment_path = storage.objects.name
      and a.user_id = (select auth.uid())
      and a.studio_id::text = (storage.foldername(storage.objects.name))[1]
      and a.contract_id::text = (storage.foldername(storage.objects.name))[3]
  )
);

create or replace function public.claim_customer_contracts()
returns table (
  contract_id uuid,
  studio_id uuid,
  local_id text,
  contract_num text,
  groom text,
  bride text,
  event_date text,
  status text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_phone text;
begin
  if v_user_id is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select case
    when regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') ~ '^989[0-9]{9}$'
      then '0' || substr(regexp_replace(u.phone, '[^0-9]', '', 'g'), 3)
    when regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') ~ '^9[0-9]{9}$'
      then '0' || regexp_replace(u.phone, '[^0-9]', '', 'g')
    else regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g')
  end into v_phone from auth.users as u where u.id = v_user_id;
  if v_phone !~ '^09[0-9]{9}$' then
    raise exception 'verified_phone_required' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer:' || v_user_id::text, 0)
  );
  insert into public.customer_portal_access (studio_id, contract_id, user_id, last_seen_at)
  select c.studio_id, c.id, v_user_id, now()
  from public.contracts as c
  where c.status <> 'cancelled'
    and right(v_phone, 10) in (
      right(regexp_replace(coalesce(c.groom_phone, ''), '[^0-9]', '', 'g'), 10),
      right(regexp_replace(coalesce(c.bride_phone, ''), '[^0-9]', '', 'g'), 10)
    )
  on conflict (contract_id, user_id)
  do update set last_seen_at = excluded.last_seen_at;
  return query
  select c.id, c.studio_id, c.local_id, c.contract_num, c.groom, c.bride,
    c.event_date, c.status,
    jsonb_build_object(
      'couple', c.payload->'couple',
      'type', c.payload->'type',
      'types', c.payload->'types',
      'date', c.payload->'date',
      'progress', c.payload->'progress',
      'packageName', c.payload->'packageName'
    )
  from public.contracts as c
  join public.customer_portal_access as a on a.contract_id = c.id
  where a.user_id = v_user_id and c.status <> 'cancelled'
  order by c.event_date desc nulls last;
end;
$$;

create or replace function public.enforce_finance_journal_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_id uuid := coalesce(new.transaction_id, old.transaction_id);
  v_tx_studio uuid;
  v_delta bigint;
begin
  select t.studio_id into v_tx_studio
  from public.finance_transactions as t where t.id = v_transaction_id;
  if v_tx_studio is null then
    raise exception 'finance_transaction_missing' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.finance_journal_lines as l
    where l.transaction_id = v_transaction_id and l.studio_id <> v_tx_studio
  ) then
    raise exception 'finance_journal_studio_mismatch' using errcode = '23514';
  end if;
  select coalesce(sum(l.debit_irr - l.credit_irr), 0)::bigint into v_delta
  from public.finance_journal_lines as l where l.transaction_id = v_transaction_id;
  if v_delta <> 0 then
    raise exception 'finance_journal_unbalanced' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function public.enforce_finance_journal_integrity() from public, anon, authenticated;
drop trigger if exists finance_journal_integrity on public.finance_journal_lines;
create constraint trigger finance_journal_integrity
after insert or update or delete on public.finance_journal_lines
deferrable initially deferred for each row
execute function public.enforce_finance_journal_integrity();

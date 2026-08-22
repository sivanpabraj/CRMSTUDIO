-- A trigger record has the row type of its attached table. Keep the common
-- contract/studio invariant separate from revision-request-only fields so a
-- trigger never resolves a column that its row type does not expose.

create or replace function public.enforce_contract_child_tenant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_schema <> 'public' or tg_table_name not in (
    'erp_contract_revision_policies',
    'erp_contract_lifecycle_events',
    'erp_photo_selection_sessions'
  ) then
    raise exception 'unsupported_contract_child_trigger_table: %.%',
      tg_table_schema, tg_table_name using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.contracts as c
    where c.id = new.contract_id and c.studio_id = new.studio_id
  ) then
    raise exception 'contract_studio_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_contract_revision_request_tenant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_schema <> 'public'
    or tg_table_name <> 'erp_contract_revision_requests' then
    raise exception 'unsupported_contract_revision_trigger_table: %.%',
      tg_table_schema, tg_table_name using errcode = '55000';
  end if;

  if not exists (
    select 1 from public.contracts as c
    where c.id = new.contract_id and c.studio_id = new.studio_id
  ) then
    raise exception 'contract_studio_mismatch' using errcode = '23514';
  end if;

  if new.work_order_id is not null and not exists (
    select 1 from public.erp_work_orders as w
    where w.id = new.work_order_id
      and w.contract_id = new.contract_id
      and w.studio_id = new.studio_id
  ) then
    raise exception 'revision_work_order_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists erp_revision_request_tenant
  on public.erp_contract_revision_requests;
create trigger erp_revision_request_tenant
before insert or update on public.erp_contract_revision_requests
for each row execute function public.enforce_contract_revision_request_tenant();

-- Trigger functions are internal schema mechanisms, not callable API methods.
revoke execute on function public.enforce_contract_child_tenant()
  from public, anon, authenticated, service_role;
revoke execute on function public.enforce_contract_revision_request_tenant()
  from public, anon, authenticated, service_role;

comment on function public.enforce_contract_revision_request_tenant() is
  'Table-specific tenant and work-order invariant for contract revision requests';

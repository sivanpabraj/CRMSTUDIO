-- Avoid resolving revision-only fields on the other contract child tables.

create or replace function public.enforce_contract_child_tenant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.contracts as c
    where c.id = new.contract_id and c.studio_id = new.studio_id
  ) then
    raise exception 'contract_studio_mismatch' using errcode = '23514';
  end if;

  if tg_table_name = 'erp_contract_revision_requests' then
    if new.work_order_id is not null and not exists (
      select 1 from public.erp_work_orders as w
      where w.id = new.work_order_id
        and w.contract_id = new.contract_id
        and w.studio_id = new.studio_id
    ) then
      raise exception 'revision_work_order_mismatch' using errcode = '23514';
    end if;
  elsif tg_table_name not in (
    'erp_contract_revision_policies',
    'erp_contract_lifecycle_events',
    'erp_photo_selection_sessions'
  ) then
    raise exception 'unsupported_contract_child_trigger_table: %', tg_table_name
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_contract_child_tenant() from public, anon, authenticated;


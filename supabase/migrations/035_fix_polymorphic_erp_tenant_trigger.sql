-- A trigger record only exposes columns from its current table. Branch on the
-- table name before referencing table-specific fields so PostgreSQL never
-- resolves a missing field on a different ERP relation.

create or replace function public.enforce_erp_tenant_links()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'erp_work_orders' then
    if new.contract_id is not null and not exists (
      select 1 from public.contracts as c
      where c.id = new.contract_id and c.studio_id = new.studio_id
    ) then
      raise exception 'erp_contract_studio_mismatch' using errcode = '23514';
    end if;
  elsif tg_table_name = 'erp_payment_schedules' then
    if new.contract_id is not null and not exists (
      select 1 from public.contracts as c
      where c.id = new.contract_id and c.studio_id = new.studio_id
    ) then
      raise exception 'erp_contract_studio_mismatch' using errcode = '23514';
    end if;
  elsif tg_table_name = 'erp_work_order_assignments' then
    if not exists (
      select 1 from public.erp_work_orders as w
      where w.id = new.work_order_id and w.studio_id = new.studio_id
    ) then
      raise exception 'erp_work_order_studio_mismatch' using errcode = '23514';
    end if;
  elsif tg_table_name = 'erp_production_events' then
    if not exists (
      select 1 from public.erp_work_orders as w
      where w.id = new.work_order_id and w.studio_id = new.studio_id
    ) then
      raise exception 'erp_work_order_studio_mismatch' using errcode = '23514';
    end if;
  else
    raise exception 'unsupported_erp_tenant_trigger_table: %', tg_table_name
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_erp_tenant_links() from public, anon, authenticated;


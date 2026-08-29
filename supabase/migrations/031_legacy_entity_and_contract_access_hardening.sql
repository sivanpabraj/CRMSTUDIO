-- Close legacy broad-read paths. Operational staff use assigned ERP work orders;
-- they never receive contract PII/financial columns or generic finance payloads.

drop policy if exists contracts_read_authorized on public.contracts;
create policy contracts_read_authorized
on public.contracts for select to authenticated
using (
  public.has_studio_permission(studio_id, 'crm.read')
  or public.has_studio_permission(studio_id, 'finance.read')
  or exists (
    select 1
    from public.customer_portal_access as a
    where a.contract_id = contracts.id
      and a.user_id = (select auth.uid())
  )
);

drop policy if exists contracts_insert_manager on public.contracts;
drop policy if exists contracts_update_manager on public.contracts;
drop policy if exists contracts_delete_manager on public.contracts;
create policy contracts_insert_crm on public.contracts for insert to authenticated
with check (public.has_studio_permission(studio_id, 'crm.write'));
create policy contracts_update_crm on public.contracts for update to authenticated
using (public.has_studio_permission(studio_id, 'crm.write'))
with check (public.has_studio_permission(studio_id, 'crm.write'));
create policy contracts_delete_manager on public.contracts for delete to authenticated
using (public.has_studio_permission(studio_id, 'members.manage'));

drop policy if exists entities_select_member on public.studio_entities;
create policy entities_select_by_capability
on public.studio_entities for select to authenticated
using (
  case
    when entity_type in (
      'transactions', 'invoices', 'expenses', 'banks', 'cheques',
      'salaryPayments'
    ) then public.has_studio_permission(studio_id, 'finance.read')
    when entity_type in (
      'leads', 'bookings', 'appointments', 'customerRequests',
      'notifications', 'packages'
    ) then public.has_studio_permission(studio_id, 'crm.read')
    when entity_type = 'personnel'
      then public.has_studio_permission(studio_id, 'members.manage')
    else public.has_studio_permission(studio_id, 'operations.write')
  end
);

drop policy if exists entities_insert_manager on public.studio_entities;
drop policy if exists entities_update_manager on public.studio_entities;
drop policy if exists entities_delete_manager on public.studio_entities;
create policy entities_insert_by_capability
on public.studio_entities for insert to authenticated
with check (
  case
    when entity_type in (
      'transactions', 'invoices', 'expenses', 'banks', 'cheques',
      'salaryPayments'
    ) then public.has_studio_permission(studio_id, 'finance.write')
    when entity_type in (
      'leads', 'bookings', 'appointments', 'customerRequests',
      'notifications', 'packages'
    ) then public.has_studio_permission(studio_id, 'crm.write')
    when entity_type = 'personnel'
      then public.has_studio_permission(studio_id, 'members.manage')
    else public.has_studio_permission(studio_id, 'operations.write')
  end
);
create policy entities_update_by_capability
on public.studio_entities for update to authenticated
using (
  case
    when entity_type in (
      'transactions', 'invoices', 'expenses', 'banks', 'cheques',
      'salaryPayments'
    ) then public.has_studio_permission(studio_id, 'finance.write')
    when entity_type in (
      'leads', 'bookings', 'appointments', 'customerRequests',
      'notifications', 'packages'
    ) then public.has_studio_permission(studio_id, 'crm.write')
    when entity_type = 'personnel'
      then public.has_studio_permission(studio_id, 'members.manage')
    else public.has_studio_permission(studio_id, 'operations.write')
  end
)
with check (
  case
    when entity_type in (
      'transactions', 'invoices', 'expenses', 'banks', 'cheques',
      'salaryPayments'
    ) then public.has_studio_permission(studio_id, 'finance.write')
    when entity_type in (
      'leads', 'bookings', 'appointments', 'customerRequests',
      'notifications', 'packages'
    ) then public.has_studio_permission(studio_id, 'crm.write')
    when entity_type = 'personnel'
      then public.has_studio_permission(studio_id, 'members.manage')
    else public.has_studio_permission(studio_id, 'operations.write')
  end
);
create policy entities_delete_by_capability
on public.studio_entities for delete to authenticated
using (
  case
    when entity_type in (
      'transactions', 'invoices', 'expenses', 'banks', 'cheques',
      'salaryPayments'
    ) then public.has_studio_permission(studio_id, 'finance.write')
    when entity_type in (
      'leads', 'bookings', 'appointments', 'customerRequests',
      'notifications', 'packages'
    ) then public.has_studio_permission(studio_id, 'crm.write')
    when entity_type = 'personnel'
      then public.has_studio_permission(studio_id, 'members.manage')
    else public.has_studio_permission(studio_id, 'operations.write')
  end
);

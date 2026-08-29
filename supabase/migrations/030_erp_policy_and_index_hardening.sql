-- Advisor follow-up: cover ERP foreign keys and avoid overlapping SELECT policies.

create index if not exists erp_work_orders_contract_idx
  on public.erp_work_orders (contract_id);
create index if not exists erp_work_orders_created_by_idx
  on public.erp_work_orders (created_by);
create index if not exists erp_assignments_user_idx
  on public.erp_work_order_assignments (user_id);
create index if not exists erp_events_studio_idx
  on public.erp_production_events (studio_id);
create index if not exists erp_events_actor_idx
  on public.erp_production_events (actor_id);
create index if not exists erp_schedules_contract_idx
  on public.erp_payment_schedules (contract_id);
create index if not exists erp_schedules_created_by_idx
  on public.erp_payment_schedules (created_by);

drop policy if exists erp_work_orders_write on public.erp_work_orders;
create policy erp_work_orders_insert on public.erp_work_orders for insert
with check (
  public.has_studio_permission(studio_id, 'operations.write')
  and created_by = (select auth.uid())
);
create policy erp_work_orders_update on public.erp_work_orders for update
using (public.has_studio_permission(studio_id, 'operations.write'))
with check (public.has_studio_permission(studio_id, 'operations.write'));

drop policy if exists erp_assignments_write on public.erp_work_order_assignments;
create policy erp_assignments_insert on public.erp_work_order_assignments for insert
with check (public.has_studio_permission(studio_id, 'operations.write'));
create policy erp_assignments_update on public.erp_work_order_assignments for update
using (public.has_studio_permission(studio_id, 'operations.write'))
with check (public.has_studio_permission(studio_id, 'operations.write'));
create policy erp_assignments_delete on public.erp_work_order_assignments for delete
using (public.has_studio_permission(studio_id, 'operations.write'));

drop policy if exists erp_payment_schedules_write on public.erp_payment_schedules;
create policy erp_payment_schedules_insert on public.erp_payment_schedules for insert
with check (
  public.has_studio_permission(studio_id, 'finance.write')
  and created_by = (select auth.uid())
);
create policy erp_payment_schedules_update on public.erp_payment_schedules for update
using (public.has_studio_permission(studio_id, 'finance.write'))
with check (public.has_studio_permission(studio_id, 'finance.write'));

-- ERP operational core: time-bound access, typed work orders, assignments,
-- production history, and contract payment forecasts.

alter table public.studio_members
  add column if not exists valid_from timestamptz not null default now(),
  add column if not exists valid_until timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists session_version bigint not null default 1;

alter table public.studio_members
  drop constraint if exists studio_members_valid_window;
alter table public.studio_members
  add constraint studio_members_valid_window
  check (valid_until is null or valid_until > valid_from);

create index if not exists studio_members_active_window
  on public.studio_members (studio_id, user_id, valid_until)
  where status = 'active' and revoked_at is null;

create or replace function public.user_studio_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.studio_id
  from public.studio_members as m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.revoked_at is null
    and m.valid_from <= now()
    and (m.valid_until is null or m.valid_until > now());
$$;

create or replace function public.has_studio_permission(
  p_studio_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.studio_members as m
    where m.studio_id = p_studio_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.revoked_at is null
      and m.valid_from <= now()
      and (m.valid_until is null or m.valid_until > now())
      and case p_permission
        when 'studio.read' then true
        when 'crm.read' then m.roles && array[
          'owner', 'system_admin', 'studio_manager', 'office_secretary',
          'sales_manager', 'inspector'
        ]::text[]
        when 'crm.write' then m.roles && array[
          'owner', 'system_admin', 'studio_manager', 'office_secretary',
          'sales_manager'
        ]::text[]
        when 'operations.read' then m.roles && array[
          'owner', 'system_admin', 'studio_manager', 'office_secretary',
          'inspector', 'photographer', 'photographer_clip', 'videographer',
          'vid_venue', 'vid_clip', 'editor', 'editor_venue', 'editor_clip',
          'album_designer', 'colorist', 'helishot', 'crane', 'freelancer'
        ]::text[]
        when 'operations.write' then m.roles && array[
          'owner', 'system_admin', 'studio_manager', 'office_secretary'
        ]::text[]
        when 'finance.read' then m.roles && array[
          'owner', 'system_admin', 'studio_manager', 'accountant'
        ]::text[]
        when 'finance.write' then m.roles && array[
          'owner', 'system_admin', 'studio_manager', 'accountant'
        ]::text[]
        when 'members.manage' then m.roles && array[
          'owner', 'system_admin', 'studio_manager'
        ]::text[]
        when 'sms.send' then m.roles && array[
          'owner', 'system_admin', 'studio_manager', 'office_secretary'
        ]::text[]
        else false
      end
  );
$$;

revoke all on function public.user_studio_ids() from public, anon;
grant execute on function public.user_studio_ids() to authenticated;
revoke all on function public.has_studio_permission(uuid, text) from public, anon;
grant execute on function public.has_studio_permission(uuid, text) to authenticated;

create table if not exists public.erp_work_orders (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  contract_id uuid references public.contracts(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 200),
  status text not null default 'planned' check (status in (
    'planned', 'scheduled', 'shooting', 'selecting', 'editing', 'review',
    'album_design', 'printing', 'ready', 'delivered', 'cancelled'
  )),
  due_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_work_order_assignments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  work_order_id uuid not null references public.erp_work_orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  assignment_role text not null check (length(assignment_role) between 2 and 80),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  unique (work_order_id, user_id, assignment_role),
  check (valid_until is null or valid_until > valid_from)
);

create table if not exists public.erp_production_events (
  id bigint generated always as identity primary key,
  studio_id uuid not null references public.studios(id) on delete cascade,
  work_order_id uuid not null references public.erp_work_orders(id) on delete cascade,
  stage text not null check (stage in (
    'consultation', 'contract', 'shooting', 'customer_selection', 'editing',
    'revision', 'album_design', 'printing', 'delivery', 'exception'
  )),
  state text not null check (state in ('started', 'completed', 'blocked', 'cancelled')),
  note text,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.erp_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete restrict,
  due_date date not null,
  amount_irr bigint not null check (amount_irr > 0),
  probability_percent smallint not null default 100
    check (probability_percent between 0 and 100),
  status text not null default 'forecast' check (status in (
    'forecast', 'due', 'partially_paid', 'paid', 'cancelled', 'overdue'
  )),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists erp_work_orders_studio_status
  on public.erp_work_orders (studio_id, status, due_at);
create index if not exists erp_assignments_user_active
  on public.erp_work_order_assignments (studio_id, user_id, work_order_id, valid_until);
create index if not exists erp_production_events_order_created
  on public.erp_production_events (work_order_id, created_at desc);
create index if not exists erp_payment_schedules_studio_due
  on public.erp_payment_schedules (studio_id, status, due_date);

create or replace function public.enforce_erp_tenant_links()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name in ('erp_work_orders', 'erp_payment_schedules')
    and new.contract_id is not null
    and not exists (
      select 1 from public.contracts as c
      where c.id = new.contract_id and c.studio_id = new.studio_id
    ) then
    raise exception 'erp_contract_studio_mismatch' using errcode = '23514';
  end if;

  if tg_table_name in ('erp_work_order_assignments', 'erp_production_events')
    and not exists (
      select 1 from public.erp_work_orders as w
      where w.id = new.work_order_id and w.studio_id = new.studio_id
    ) then
    raise exception 'erp_work_order_studio_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists erp_work_orders_tenant_link on public.erp_work_orders;
create trigger erp_work_orders_tenant_link before insert or update
on public.erp_work_orders for each row execute function public.enforce_erp_tenant_links();
drop trigger if exists erp_assignments_tenant_link on public.erp_work_order_assignments;
create trigger erp_assignments_tenant_link before insert or update
on public.erp_work_order_assignments for each row execute function public.enforce_erp_tenant_links();
drop trigger if exists erp_events_tenant_link on public.erp_production_events;
create trigger erp_events_tenant_link before insert or update
on public.erp_production_events for each row execute function public.enforce_erp_tenant_links();
drop trigger if exists erp_schedules_tenant_link on public.erp_payment_schedules;
create trigger erp_schedules_tenant_link before insert or update
on public.erp_payment_schedules for each row execute function public.enforce_erp_tenant_links();

alter table public.erp_work_orders enable row level security;
alter table public.erp_work_order_assignments enable row level security;
alter table public.erp_production_events enable row level security;
alter table public.erp_payment_schedules enable row level security;

create policy erp_work_orders_read on public.erp_work_orders for select
using (
  public.has_studio_permission(studio_id, 'operations.read')
  and (
    public.has_studio_permission(studio_id, 'operations.write')
    or exists (
      select 1 from public.erp_work_order_assignments as a
      where a.work_order_id = erp_work_orders.id
        and a.user_id = (select auth.uid())
        and a.valid_from <= now()
        and (a.valid_until is null or a.valid_until > now())
    )
  )
);
create policy erp_work_orders_write on public.erp_work_orders for all
using (public.has_studio_permission(studio_id, 'operations.write'))
with check (public.has_studio_permission(studio_id, 'operations.write'));

create policy erp_assignments_read on public.erp_work_order_assignments for select
using (
  public.has_studio_permission(studio_id, 'operations.write')
  or (user_id = (select auth.uid()) and public.has_studio_permission(studio_id, 'operations.read'))
);
create policy erp_assignments_write on public.erp_work_order_assignments for all
using (public.has_studio_permission(studio_id, 'operations.write'))
with check (public.has_studio_permission(studio_id, 'operations.write'));

create policy erp_production_events_read on public.erp_production_events for select
using (
  public.has_studio_permission(studio_id, 'operations.write')
  or exists (
    select 1 from public.erp_work_order_assignments as a
    where a.work_order_id = erp_production_events.work_order_id
      and a.user_id = (select auth.uid())
      and a.valid_from <= now()
      and (a.valid_until is null or a.valid_until > now())
  )
);
create policy erp_production_events_insert on public.erp_production_events for insert
with check (
  actor_id = (select auth.uid())
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

create policy erp_payment_schedules_read on public.erp_payment_schedules for select
using (public.has_studio_permission(studio_id, 'finance.read'));
create policy erp_payment_schedules_write on public.erp_payment_schedules for all
using (public.has_studio_permission(studio_id, 'finance.write'))
with check (public.has_studio_permission(studio_id, 'finance.write'));

revoke all on public.erp_work_orders from anon, authenticated;
revoke all on public.erp_work_order_assignments from anon, authenticated;
revoke all on public.erp_production_events from anon, authenticated;
revoke all on public.erp_payment_schedules from anon, authenticated;
grant select, insert, update on public.erp_work_orders to authenticated;
grant select, insert, update, delete on public.erp_work_order_assignments to authenticated;
grant select, insert on public.erp_production_events to authenticated;
grant select, insert, update on public.erp_payment_schedules to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.erp_work_orders;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.erp_work_order_assignments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.erp_production_events;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.erp_payment_schedules;
exception when duplicate_object then null;
end $$;

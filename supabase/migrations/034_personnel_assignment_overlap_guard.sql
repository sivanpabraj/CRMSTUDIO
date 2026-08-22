-- Prevent concurrent or sequential double-booking of one person.
-- Half-open ranges allow back-to-back assignments (end = next start).

create extension if not exists btree_gist with schema extensions;

alter table public.erp_work_order_assignments
  add column if not exists scheduled_start_at timestamptz,
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists assignment_status text not null default 'active';

alter table public.erp_work_order_assignments
  drop constraint if exists erp_assignment_schedule_pair,
  add constraint erp_assignment_schedule_pair check (
    (scheduled_start_at is null and scheduled_end_at is null)
    or (
      scheduled_start_at is not null
      and scheduled_end_at is not null
      and scheduled_end_at > scheduled_start_at
    )
  ),
  drop constraint if exists erp_assignment_status_allowed,
  add constraint erp_assignment_status_allowed check (
    assignment_status in ('active', 'completed', 'cancelled')
  );

create or replace function public.require_erp_assignment_schedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Historical rows remain readable after migration. Every new active booking,
  -- and every row reactivated after cancellation, must carry an exact interval.
  if new.assignment_status = 'active'
    and (new.scheduled_start_at is null or new.scheduled_end_at is null) then
    raise exception 'erp_assignment_schedule_required' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.require_erp_assignment_schedule()
  from public, anon, authenticated;

drop trigger if exists erp_assignment_schedule_required
  on public.erp_work_order_assignments;
create trigger erp_assignment_schedule_required
before insert or update of scheduled_start_at, scheduled_end_at, assignment_status
on public.erp_work_order_assignments
for each row execute function public.require_erp_assignment_schedule();

alter table public.erp_work_order_assignments
  drop constraint if exists erp_assignment_no_personnel_overlap;
alter table public.erp_work_order_assignments
  add constraint erp_assignment_no_personnel_overlap
  exclude using gist (
    studio_id with =,
    user_id with =,
    tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&
  )
  where (
    assignment_status = 'active'
    and scheduled_start_at is not null
    and scheduled_end_at is not null
  );

create index if not exists erp_assignments_personnel_schedule
  on public.erp_work_order_assignments
    (studio_id, user_id, scheduled_start_at, scheduled_end_at)
  where assignment_status = 'active';

comment on constraint erp_assignment_no_personnel_overlap
  on public.erp_work_order_assignments is
  'Database-enforced personnel schedule; concurrent overlaps fail with SQLSTATE 23P01';

-- Authoritative contract exceptions, revision limits, and customer photo selection.
-- Money is stored in IRR bigint. Sensitive state changes are RPC-only and audited.

alter table public.contracts
  add column if not exists event_starts_at timestamptz,
  add column if not exists event_ends_at timestamptz,
  add column if not exists lifecycle_version bigint not null default 1;

alter table public.contracts
  drop constraint if exists contracts_event_window;
alter table public.contracts
  add constraint contracts_event_window
  check (
    event_starts_at is null
    or event_ends_at is null
    or event_ends_at > event_starts_at
  );

alter table public.erp_work_orders
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end timestamptz;

alter table public.erp_work_orders
  drop constraint if exists erp_work_orders_schedule_window;
alter table public.erp_work_orders
  add constraint erp_work_orders_schedule_window
  check (
    scheduled_start is null
    or scheduled_end is null
    or scheduled_end > scheduled_start
  );

create table if not exists public.erp_contract_revision_policies (
  contract_id uuid primary key references public.contracts(id) on delete restrict,
  studio_id uuid not null references public.studios(id) on delete cascade,
  included_revisions integer not null default 0 check (included_revisions between 0 and 100),
  extra_revision_price_irr bigint check (extra_revision_price_irr is null or extra_revision_price_irr >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_contract_revision_requests (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete restrict,
  work_order_id uuid references public.erp_work_orders(id) on delete restrict,
  sequence_no integer not null check (sequence_no > 0),
  status text not null default 'requested' check (status in (
    'requested', 'approved', 'in_progress', 'completed', 'rejected', 'cancelled'
  )),
  included boolean not null,
  charge_irr bigint not null default 0 check (charge_irr >= 0),
  note text not null check (length(trim(note)) between 2 and 2000),
  requested_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, sequence_no)
);

create table if not exists public.erp_contract_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete restrict,
  event_type text not null check (event_type in ('rescheduled', 'cancelled')),
  old_event_starts_at timestamptz,
  old_event_ends_at timestamptz,
  new_event_starts_at timestamptz,
  new_event_ends_at timestamptz,
  old_event_date text,
  new_event_date text,
  refund_irr bigint not null default 0 check (refund_irr >= 0),
  penalty_irr bigint not null default 0 check (penalty_irr >= 0),
  finance_transaction_id uuid references public.finance_transactions(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 2000),
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (studio_id, idempotency_key)
);

alter table public.erp_payment_schedules
  add column if not exists revision_request_id uuid
  references public.erp_contract_revision_requests(id) on delete restrict;
create unique index if not exists erp_schedule_revision_request_unique
  on public.erp_payment_schedules (revision_request_id)
  where revision_request_id is not null;

create table if not exists public.erp_photo_selection_sessions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete restrict,
  gallery_version bigint not null default 1 check (gallery_version > 0),
  max_photos integer not null check (max_photos between 1 and 5000),
  status text not null default 'open' check (status in (
    'open', 'submitted', 'approved', 'locked', 'delivered', 'cancelled'
  )),
  submitted_at timestamptz,
  approved_at timestamptz,
  locked_at timestamptz,
  delivered_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, gallery_version)
);

create table if not exists public.erp_photo_selection_items (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  session_id uuid not null references public.erp_photo_selection_sessions(id) on delete cascade,
  asset_ref text not null check (length(asset_ref) between 1 and 500),
  selected_by uuid not null references auth.users(id) on delete restrict,
  selected_at timestamptz not null default now(),
  unique (session_id, asset_ref)
);

create index if not exists erp_revision_policy_studio_idx
  on public.erp_contract_revision_policies (studio_id);
create index if not exists erp_revision_request_contract_status_idx
  on public.erp_contract_revision_requests (contract_id, status);
create index if not exists erp_revision_request_work_order_idx
  on public.erp_contract_revision_requests (work_order_id);
create index if not exists erp_lifecycle_contract_created_idx
  on public.erp_contract_lifecycle_events (contract_id, created_at desc);
create index if not exists erp_lifecycle_finance_tx_idx
  on public.erp_contract_lifecycle_events (finance_transaction_id);
create index if not exists erp_photo_sessions_contract_status_idx
  on public.erp_photo_selection_sessions (contract_id, status);
create unique index if not exists erp_photo_sessions_one_active_contract
  on public.erp_photo_selection_sessions (contract_id)
  where status in ('open', 'submitted', 'approved', 'locked');
create index if not exists erp_photo_items_session_idx
  on public.erp_photo_selection_items (session_id);
create index if not exists erp_work_orders_schedule_idx
  on public.erp_work_orders (studio_id, scheduled_start, scheduled_end);

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

  if tg_table_name = 'erp_contract_revision_requests'
    and new.work_order_id is not null
    and not exists (
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

drop trigger if exists erp_revision_policy_tenant on public.erp_contract_revision_policies;
create trigger erp_revision_policy_tenant before insert or update
on public.erp_contract_revision_policies for each row execute function public.enforce_contract_child_tenant();
drop trigger if exists erp_revision_request_tenant on public.erp_contract_revision_requests;
create trigger erp_revision_request_tenant before insert or update
on public.erp_contract_revision_requests for each row execute function public.enforce_contract_child_tenant();
drop trigger if exists erp_lifecycle_tenant on public.erp_contract_lifecycle_events;
create trigger erp_lifecycle_tenant before insert or update
on public.erp_contract_lifecycle_events for each row execute function public.enforce_contract_child_tenant();
drop trigger if exists erp_photo_session_tenant on public.erp_photo_selection_sessions;
create trigger erp_photo_session_tenant before insert or update
on public.erp_photo_selection_sessions for each row execute function public.enforce_contract_child_tenant();

create or replace function public.guard_contract_lifecycle_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    old.event_date is distinct from new.event_date
    or old.event_starts_at is distinct from new.event_starts_at
    or old.event_ends_at is distinct from new.event_ends_at
    or (old.status is distinct from new.status and new.status = 'cancelled')
  ) and coalesce(current_setting('app.erp_contract_lifecycle', true), '') <> 'on' then
    raise exception 'contract_lifecycle_rpc_required' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists contracts_lifecycle_guard on public.contracts;
create trigger contracts_lifecycle_guard before update on public.contracts
for each row execute function public.guard_contract_lifecycle_mutation();

alter table public.erp_contract_revision_policies enable row level security;
alter table public.erp_contract_revision_requests enable row level security;
alter table public.erp_contract_lifecycle_events enable row level security;
alter table public.erp_photo_selection_sessions enable row level security;
alter table public.erp_photo_selection_items enable row level security;

create policy erp_revision_policies_read on public.erp_contract_revision_policies
for select to authenticated
using (
  public.has_studio_permission(studio_id, 'operations.read')
  or exists (
    select 1 from public.customer_portal_access as a
    where a.contract_id = erp_contract_revision_policies.contract_id
      and a.user_id = (select auth.uid())
  )
);
create policy erp_revision_policies_insert on public.erp_contract_revision_policies
for insert to authenticated
with check (
  public.has_studio_permission(studio_id, 'operations.write')
  and created_by = (select auth.uid())
);
create policy erp_revision_policies_update on public.erp_contract_revision_policies
for update to authenticated
using (public.has_studio_permission(studio_id, 'operations.write'))
with check (public.has_studio_permission(studio_id, 'operations.write'));

create policy erp_revision_requests_read on public.erp_contract_revision_requests
for select to authenticated
using (
  public.has_studio_permission(studio_id, 'operations.read')
  or exists (
    select 1 from public.customer_portal_access as a
    where a.contract_id = erp_contract_revision_requests.contract_id
      and a.user_id = (select auth.uid())
  )
);

create policy erp_lifecycle_events_read on public.erp_contract_lifecycle_events
for select to authenticated
using (public.has_studio_permission(studio_id, 'crm.read'));

create policy erp_photo_sessions_read on public.erp_photo_selection_sessions
for select to authenticated
using (
  public.has_studio_permission(studio_id, 'operations.read')
  or exists (
    select 1 from public.customer_portal_access as a
    where a.contract_id = erp_photo_selection_sessions.contract_id
      and a.user_id = (select auth.uid())
  )
);
create policy erp_photo_items_read on public.erp_photo_selection_items
for select to authenticated
using (
  exists (
    select 1
    from public.erp_photo_selection_sessions as s
    where s.id = erp_photo_selection_items.session_id
      and (
        public.has_studio_permission(s.studio_id, 'operations.read')
        or exists (
          select 1 from public.customer_portal_access as a
          where a.contract_id = s.contract_id
            and a.user_id = (select auth.uid())
        )
      )
  )
);

revoke all on public.erp_contract_revision_policies from anon, authenticated;
revoke all on public.erp_contract_revision_requests from anon, authenticated;
revoke all on public.erp_contract_lifecycle_events from anon, authenticated;
revoke all on public.erp_photo_selection_sessions from anon, authenticated;
revoke all on public.erp_photo_selection_items from anon, authenticated;
grant select, insert, update on public.erp_contract_revision_policies to authenticated;
grant select on public.erp_contract_revision_requests to authenticated;
grant select on public.erp_contract_lifecycle_events to authenticated;
grant select on public.erp_photo_selection_sessions to authenticated;
grant select on public.erp_photo_selection_items to authenticated;

create or replace function public.request_contract_revision(
  p_contract_id uuid,
  p_work_order_id uuid,
  p_note text
)
returns public.erp_contract_revision_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_contract public.contracts;
  v_policy public.erp_contract_revision_policies;
  v_used integer;
  v_sequence integer;
  v_row public.erp_contract_revision_requests;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if length(trim(coalesce(p_note, ''))) not between 2 and 2000 then
    raise exception 'revision_note_required' using errcode = '22023';
  end if;

  select * into v_contract from public.contracts where id = p_contract_id for update;
  if not found or v_contract.status = 'cancelled' then
    raise exception 'active_contract_required' using errcode = '22023';
  end if;
  if not (
    public.has_studio_permission(v_contract.studio_id, 'operations.write')
    or exists (
      select 1 from public.customer_portal_access as a
      where a.contract_id = p_contract_id and a.user_id = v_user
    )
  ) then raise exception 'revision_access_denied' using errcode = '42501'; end if;

  select * into v_policy
  from public.erp_contract_revision_policies
  where contract_id = p_contract_id
  for update;
  if not found then raise exception 'revision_policy_required' using errcode = '22023'; end if;

  select count(*) into v_used
  from public.erp_contract_revision_requests
  where contract_id = p_contract_id
    and status not in ('rejected', 'cancelled');
  select coalesce(max(sequence_no), 0) + 1 into v_sequence
  from public.erp_contract_revision_requests
  where contract_id = p_contract_id;

  if v_used >= v_policy.included_revisions
    and v_policy.extra_revision_price_irr is null then
    raise exception 'revision_limit_exceeded' using errcode = 'P0001';
  end if;

  insert into public.erp_contract_revision_requests (
    studio_id, contract_id, work_order_id, sequence_no, included,
    charge_irr, note, requested_by
  ) values (
    v_contract.studio_id, p_contract_id, p_work_order_id, v_sequence,
    v_used < v_policy.included_revisions,
    case when v_used < v_policy.included_revisions then 0
      else coalesce(v_policy.extra_revision_price_irr, 0) end,
    trim(p_note), v_user
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.reschedule_contract_event(
  p_contract_id uuid,
  p_new_event_date text,
  p_new_start timestamptz,
  p_new_end timestamptz,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_contract public.contracts;
  v_event public.erp_contract_lifecycle_events;
  v_conflicts integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 128 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  if p_new_event_date !~ '^[0-9]{4}/(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])$'
    or p_new_start is null or p_new_end is null or p_new_end <= p_new_start then
    raise exception 'invalid_event_window' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 2000 then
    raise exception 'reschedule_reason_required' using errcode = '22023';
  end if;

  select * into v_event from public.erp_contract_lifecycle_events
  where contract_id = p_contract_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('ok', true, 'deduped', true, 'eventId', v_event.id); end if;

  select * into v_contract from public.contracts where id = p_contract_id for update;
  if not found or v_contract.status = 'cancelled' then raise exception 'active_contract_required'; end if;
  if not public.has_studio_permission(v_contract.studio_id, 'operations.write') then
    raise exception 'operations_write_denied' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_contract.studio_id::text || ':schedule', 0)
  );
  select count(*) into v_conflicts
  from public.erp_work_order_assignments as moving
  join public.erp_work_order_assignments as other
    on other.user_id = moving.user_id and other.work_order_id <> moving.work_order_id
  join public.erp_work_orders as other_work on other_work.id = other.work_order_id
  where moving.work_order_id in (
      select id from public.erp_work_orders where contract_id = p_contract_id
    )
    and other_work.studio_id = v_contract.studio_id
    and other_work.status not in ('delivered', 'cancelled')
    and other_work.scheduled_start < p_new_end
    and other_work.scheduled_end > p_new_start;
  if v_conflicts > 0 then raise exception 'personnel_schedule_conflict' using errcode = '23P01'; end if;

  perform set_config('app.erp_contract_lifecycle', 'on', true);
  update public.contracts set
    event_date = p_new_event_date,
    event_starts_at = p_new_start,
    event_ends_at = p_new_end,
    lifecycle_version = lifecycle_version + 1,
    updated_at = now()
  where id = p_contract_id;
  update public.erp_work_orders set
    scheduled_start = p_new_start,
    scheduled_end = p_new_end,
    updated_at = now(),
    version = version + 1
  where contract_id = p_contract_id and status not in ('delivered', 'cancelled');
  if v_contract.event_starts_at is not null then
    update public.erp_payment_schedules set
      due_date = due_date + (p_new_start::date - v_contract.event_starts_at::date),
      updated_at = now()
    where contract_id = p_contract_id
      and status in ('forecast', 'due', 'partially_paid', 'overdue');
  end if;

  insert into public.erp_contract_lifecycle_events (
    studio_id, contract_id, event_type, old_event_starts_at, old_event_ends_at,
    new_event_starts_at, new_event_ends_at, old_event_date, new_event_date,
    reason, idempotency_key, actor_id
  ) values (
    v_contract.studio_id, p_contract_id, 'rescheduled',
    v_contract.event_starts_at, v_contract.event_ends_at,
    p_new_start, p_new_end, v_contract.event_date, p_new_event_date,
    trim(p_reason), p_idempotency_key, v_user
  ) returning * into v_event;
  return jsonb_build_object('ok', true, 'eventId', v_event.id, 'conflicts', 0);
end;
$$;

create or replace function public.cancel_contract_with_refund(
  p_contract_id uuid,
  p_refund_irr bigint,
  p_penalty_irr bigint,
  p_bank_id text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_contract public.contracts;
  v_event public.erp_contract_lifecycle_events;
  v_finance jsonb;
  v_finance_tx uuid;
  v_collected_irr bigint;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 128 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;
  if coalesce(p_refund_irr, 0) < 0 or coalesce(p_penalty_irr, 0) < 0 then
    raise exception 'invalid_cancellation_amount' using errcode = '22023';
  end if;
  if p_refund_irr > 0 and nullif(p_bank_id, '') is null then
    raise exception 'refund_bank_required' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) not between 3 and 2000 then
    raise exception 'cancellation_reason_required' using errcode = '22023';
  end if;

  select * into v_event from public.erp_contract_lifecycle_events
  where contract_id = p_contract_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'deduped', true, 'eventId', v_event.id,
      'financeTransactionId', v_event.finance_transaction_id);
  end if;

  select * into v_contract from public.contracts where id = p_contract_id for update;
  if not found then raise exception 'contract_not_found'; end if;
  if v_contract.status = 'cancelled' then raise exception 'contract_already_cancelled'; end if;
  if not public.has_studio_permission(v_contract.studio_id, 'finance.write')
    or not public.has_studio_permission(v_contract.studio_id, 'operations.write') then
    raise exception 'cancellation_permission_denied' using errcode = '42501';
  end if;

  select coalesce(sum(t.amount_irr), 0)::bigint into v_collected_irr
  from public.finance_transaction_heads as h
  join public.finance_transactions as t on t.id = h.current_transaction_id
  where h.studio_id = v_contract.studio_id
    and h.active
    and t.state = 'posted'
    and (
      t.operation = 'record_deposit'
      or (t.operation = 'update_transaction' and t.payload->>'type' = 'deposit')
    )
    and t.payload->>'contractId' = p_contract_id::text
    and t.payload->>'purposeCategory' in ('contract_deposit', 'contract_payment');
  if coalesce(p_refund_irr, 0) + coalesce(p_penalty_irr, 0) > v_collected_irr then
    raise exception 'cancellation_settlement_exceeds_collected' using errcode = '22023';
  end if;

  if p_refund_irr > 0 then
    v_finance := public.post_finance_command(
      v_contract.studio_id,
      'record_withdrawal',
      'refund:' || md5(v_contract.studio_id::text || ':' || p_idempotency_key),
      jsonb_build_object(
        'transactionId', 'refund:' || p_contract_id::text || ':' || md5(p_idempotency_key),
        'amount', p_refund_irr::numeric / 10,
        'bankId', p_bank_id,
        'type', 'withdrawal',
        'purposeCategory', 'cancellation_refund',
        'contractId', p_contract_id,
        'reason', trim(p_reason)
      )
    );
    v_finance_tx := nullif(v_finance->>'transactionId', '')::uuid;
  end if;

  perform set_config('app.erp_contract_lifecycle', 'on', true);
  update public.contracts set
    status = 'cancelled',
    lifecycle_version = lifecycle_version + 1,
    updated_at = now()
  where id = p_contract_id;
  update public.erp_work_orders set
    status = 'cancelled', updated_at = now(), version = version + 1
  where contract_id = p_contract_id and status <> 'delivered';
  update public.erp_work_order_assignments set valid_until = now()
  where work_order_id in (select id from public.erp_work_orders where contract_id = p_contract_id)
    and (valid_until is null or valid_until > now());
  update public.erp_payment_schedules set status = 'cancelled', updated_at = now()
  where contract_id = p_contract_id and status not in ('paid', 'cancelled');
  update public.erp_photo_selection_sessions set status = 'cancelled', updated_at = now()
  where contract_id = p_contract_id and status not in ('delivered', 'cancelled');

  insert into public.erp_contract_lifecycle_events (
    studio_id, contract_id, event_type, old_event_starts_at, old_event_ends_at,
    old_event_date, refund_irr, penalty_irr, finance_transaction_id,
    reason, idempotency_key, actor_id
  ) values (
    v_contract.studio_id, p_contract_id, 'cancelled',
    v_contract.event_starts_at, v_contract.event_ends_at, v_contract.event_date,
    coalesce(p_refund_irr, 0), coalesce(p_penalty_irr, 0), v_finance_tx,
    trim(p_reason), p_idempotency_key, v_user
  ) returning * into v_event;
  return jsonb_build_object('ok', true, 'eventId', v_event.id,
    'financeTransactionId', v_finance_tx);
end;
$$;

create or replace function public.transition_contract_revision(
  p_request_id uuid,
  p_action text
)
returns public.erp_contract_revision_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_request public.erp_contract_revision_requests;
  v_next text;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_request from public.erp_contract_revision_requests
  where id = p_request_id for update;
  if not found then raise exception 'revision_request_not_found'; end if;
  if not public.has_studio_permission(v_request.studio_id, 'operations.write') then
    raise exception 'operations_write_denied' using errcode = '42501';
  end if;

  v_next := case
    when p_action = 'approve' and v_request.status = 'requested' then 'approved'
    when p_action = 'start' and v_request.status = 'approved' then 'in_progress'
    when p_action = 'complete' and v_request.status = 'in_progress' then 'completed'
    when p_action = 'reject' and v_request.status = 'requested' then 'rejected'
    when p_action = 'cancel' and v_request.status in ('requested', 'approved') then 'cancelled'
    else null
  end;
  if v_next is null then raise exception 'invalid_revision_transition' using errcode = '22023'; end if;

  if p_action = 'approve' and v_request.charge_irr > 0 then
    insert into public.erp_payment_schedules (
      studio_id, contract_id, due_date, amount_irr, probability_percent,
      status, created_by, revision_request_id
    ) values (
      v_request.studio_id, v_request.contract_id, current_date,
      v_request.charge_irr, 100, 'due', v_user, v_request.id
    ) on conflict (revision_request_id) where revision_request_id is not null do nothing;
  end if;
  if p_action = 'start' and v_request.charge_irr > 0 and not exists (
    select 1 from public.erp_payment_schedules as s
    where s.revision_request_id = v_request.id and s.status = 'paid'
  ) then raise exception 'extra_revision_payment_required' using errcode = 'P0001'; end if;

  update public.erp_contract_revision_requests
  set status = v_next, updated_at = now()
  where id = p_request_id returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.create_photo_selection_session(
  p_contract_id uuid,
  p_gallery_version bigint,
  p_max_photos integer
)
returns public.erp_photo_selection_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_contract public.contracts;
  v_session public.erp_photo_selection_sessions;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_gallery_version <= 0 or p_max_photos not between 1 and 5000 then
    raise exception 'invalid_selection_session' using errcode = '22023';
  end if;
  select * into v_contract from public.contracts where id = p_contract_id;
  if not found or v_contract.status = 'cancelled' then raise exception 'active_contract_required'; end if;
  if not public.has_studio_permission(v_contract.studio_id, 'operations.write') then
    raise exception 'operations_write_denied' using errcode = '42501';
  end if;
  insert into public.erp_photo_selection_sessions (
    studio_id, contract_id, gallery_version, max_photos, created_by
  ) values (
    v_contract.studio_id, p_contract_id, p_gallery_version, p_max_photos, v_user
  ) returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.set_photo_selection_item(
  p_session_id uuid,
  p_asset_ref text,
  p_selected boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.erp_photo_selection_sessions;
  v_count integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if length(trim(coalesce(p_asset_ref, ''))) not between 1 and 500 then
    raise exception 'invalid_asset_ref' using errcode = '22023';
  end if;
  select * into v_session from public.erp_photo_selection_sessions
  where id = p_session_id for update;
  if not found then raise exception 'selection_session_not_found'; end if;
  if v_session.status <> 'open' then raise exception 'selection_session_locked' using errcode = '55000'; end if;
  if not exists (
    select 1 from public.customer_portal_access as a
    where a.contract_id = v_session.contract_id and a.user_id = v_user
  ) and not public.has_studio_permission(v_session.studio_id, 'operations.write') then
    raise exception 'selection_access_denied' using errcode = '42501';
  end if;

  if p_selected then
    if not exists (
      select 1 from public.erp_photo_selection_items
      where session_id = p_session_id and asset_ref = trim(p_asset_ref)
    ) then
      select count(*) into v_count from public.erp_photo_selection_items
      where session_id = p_session_id;
      if v_count >= v_session.max_photos then
        raise exception 'photo_selection_limit_exceeded' using errcode = 'P0001';
      end if;
      insert into public.erp_photo_selection_items (
        studio_id, session_id, asset_ref, selected_by
      ) values (
        v_session.studio_id, p_session_id, trim(p_asset_ref), v_user
      );
    end if;
  else
    delete from public.erp_photo_selection_items
    where session_id = p_session_id and asset_ref = trim(p_asset_ref);
  end if;
  select count(*) into v_count from public.erp_photo_selection_items
  where session_id = p_session_id;
  return jsonb_build_object('ok', true, 'selectedCount', v_count, 'maxPhotos', v_session.max_photos);
end;
$$;

create or replace function public.transition_photo_selection(
  p_session_id uuid,
  p_action text
)
returns public.erp_photo_selection_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.erp_photo_selection_sessions;
  v_customer boolean;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_session from public.erp_photo_selection_sessions
  where id = p_session_id for update;
  if not found then raise exception 'selection_session_not_found'; end if;
  select exists (
    select 1 from public.customer_portal_access as a
    where a.contract_id = v_session.contract_id and a.user_id = v_user
  ) into v_customer;

  if p_action = 'submit' then
    if not v_customer or v_session.status <> 'open' then
      raise exception 'invalid_selection_transition' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.erp_photo_selection_items where session_id = p_session_id
    ) then raise exception 'empty_photo_selection' using errcode = '22023'; end if;
    update public.erp_photo_selection_sessions
    set status = 'submitted', submitted_at = now(), updated_at = now()
    where id = p_session_id returning * into v_session;
  elsif p_action = 'approve' then
    if not public.has_studio_permission(v_session.studio_id, 'operations.write')
      or v_session.status <> 'submitted' then raise exception 'invalid_selection_transition' using errcode = '42501'; end if;
    update public.erp_photo_selection_sessions
    set status = 'approved', approved_at = now(), updated_at = now()
    where id = p_session_id returning * into v_session;
  elsif p_action = 'lock' then
    if not public.has_studio_permission(v_session.studio_id, 'operations.write')
      or v_session.status <> 'approved' then raise exception 'invalid_selection_transition' using errcode = '42501'; end if;
    update public.erp_photo_selection_sessions
    set status = 'locked', locked_at = now(), updated_at = now()
    where id = p_session_id returning * into v_session;
  elsif p_action = 'deliver' then
    if not public.has_studio_permission(v_session.studio_id, 'operations.write')
      or v_session.status <> 'locked' then raise exception 'invalid_selection_transition' using errcode = '42501'; end if;
    update public.erp_photo_selection_sessions
    set status = 'delivered', delivered_at = now(), updated_at = now()
    where id = p_session_id returning * into v_session;
  else
    raise exception 'unsupported_selection_action' using errcode = '22023';
  end if;
  return v_session;
end;
$$;

revoke execute on function public.request_contract_revision(uuid, uuid, text) from public, anon;
revoke execute on function public.transition_contract_revision(uuid, text) from public, anon;
revoke execute on function public.create_photo_selection_session(uuid, bigint, integer) from public, anon;
revoke execute on function public.reschedule_contract_event(uuid, text, timestamptz, timestamptz, text, text) from public, anon;
revoke execute on function public.cancel_contract_with_refund(uuid, bigint, bigint, text, text, text) from public, anon;
revoke execute on function public.set_photo_selection_item(uuid, text, boolean) from public, anon;
revoke execute on function public.transition_photo_selection(uuid, text) from public, anon;
grant execute on function public.request_contract_revision(uuid, uuid, text) to authenticated;
grant execute on function public.transition_contract_revision(uuid, text) to authenticated;
grant execute on function public.create_photo_selection_session(uuid, bigint, integer) to authenticated;
grant execute on function public.reschedule_contract_event(uuid, text, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.cancel_contract_with_refund(uuid, bigint, bigint, text, text, text) to authenticated;
grant execute on function public.set_photo_selection_item(uuid, text, boolean) to authenticated;
grant execute on function public.transition_photo_selection(uuid, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.erp_contract_revision_requests;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.erp_contract_lifecycle_events;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.erp_photo_selection_sessions;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.erp_photo_selection_items;
exception when duplicate_object then null;
end $$;

comment on function public.request_contract_revision(uuid, uuid, text) is
  'Atomic revision request boundary enforcing the contract revision policy';
comment on function public.transition_contract_revision(uuid, text) is
  'Strict revision lifecycle; billable extra revisions cannot start before payment';
comment on function public.create_photo_selection_session(uuid, bigint, integer) is
  'Manager-only creation boundary for a versioned customer photo selection session';
comment on function public.reschedule_contract_event(uuid, text, timestamptz, timestamptz, text, text) is
  'Atomic schedule change with personnel conflict detection and immutable lifecycle event';
comment on function public.cancel_contract_with_refund(uuid, bigint, bigint, text, text, text) is
  'Atomic cancellation boundary: refund journal command, schedules, work, access and audit event';
comment on function public.set_photo_selection_item(uuid, text, boolean) is
  'Customer-scoped selection mutation with row lock and max-photo enforcement';
comment on function public.transition_photo_selection(uuid, text) is
  'Strict open -> submitted -> approved -> locked -> delivered state machine';

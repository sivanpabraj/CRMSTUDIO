-- Server authority for personnel contract signatures, assignment responses and
-- attendance. Browser code receives no OTP secret and has no direct write grant.

alter table public.erp_work_order_assignments
  drop constraint if exists erp_assignment_status_allowed,
  add constraint erp_assignment_status_allowed check (
    assignment_status in ('offered','active','rejected','completed','cancelled')
  );

alter table public.erp_work_order_assignments
  drop constraint if exists erp_assignment_no_personnel_overlap;
alter table public.erp_work_order_assignments
  add constraint erp_assignment_no_personnel_overlap
  exclude using gist (
    studio_id with =,
    user_id with =,
    tstzrange(scheduled_start_at, scheduled_end_at, '[)') with &&
  ) where (
    assignment_status in ('offered','active')
    and scheduled_start_at is not null
    and scheduled_end_at is not null
  );

drop index if exists public.erp_assignments_personnel_schedule;
create index erp_assignments_personnel_schedule
  on public.erp_work_order_assignments
    (studio_id,user_id,scheduled_start_at,scheduled_end_at)
  where assignment_status in ('offered','active');

create or replace function public.respond_work_order_assignment(
  p_assignment_id uuid,p_expected_version bigint,p_accept boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.erp_work_order_assignments; v_status text;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  select * into v from public.erp_work_order_assignments where id=p_assignment_id for update;
  if not found or v.user_id<>(select auth.uid()) then
    raise exception 'assignment_not_found' using errcode='P0002'; end if;
  if v.version<>p_expected_version then raise exception 'assignment_version_conflict' using errcode='40001'; end if;
  if v.assignment_status<>'offered' then raise exception 'invalid_assignment_transition' using errcode='22023'; end if;
  v_status:=case when p_accept then 'active' else 'rejected' end;
  update public.erp_work_order_assignments set assignment_status=v_status,version=version+1
    where id=v.id;
  return jsonb_build_object('ok',true,'assignmentId',v.id,'status',v_status,'version',v.version+1);
end $$;

create or replace function public.complete_own_work_order_assignment(
  p_assignment_id uuid,p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.erp_work_order_assignments;
begin
  select * into v from public.erp_work_order_assignments where id=p_assignment_id for update;
  if not found or v.user_id<>(select auth.uid()) then
    raise exception 'assignment_not_found' using errcode='P0002'; end if;
  if v.version<>p_expected_version then raise exception 'assignment_version_conflict' using errcode='40001'; end if;
  if v.assignment_status<>'active' then raise exception 'invalid_assignment_transition' using errcode='22023'; end if;
  update public.erp_work_order_assignments set assignment_status='completed',version=version+1 where id=v.id;
  return jsonb_build_object('ok',true,'assignmentId',v.id,'status','completed','version',v.version+1);
end $$;

revoke all on function public.respond_work_order_assignment(uuid,bigint,boolean) from public,anon,authenticated;
revoke all on function public.complete_own_work_order_assignment(uuid,bigint) from public,anon,authenticated;
grant execute on function public.respond_work_order_assignment(uuid,bigint,boolean) to authenticated;
grant execute on function public.complete_own_work_order_assignment(uuid,bigint) to authenticated;

create table public.erp_personnel_contract_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.erp_personnel_contracts(id) on delete cascade,
  studio_id uuid not null references public.studios(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  code_hash text not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at>created_at)
);
create index erp_personnel_contract_otp_recent
  on public.erp_personnel_contract_otp_challenges(requested_by,contract_id,created_at desc);
alter table public.erp_personnel_contract_otp_challenges enable row level security;
revoke all on public.erp_personnel_contract_otp_challenges from public,anon,authenticated,service_role;

create or replace function public.issue_personnel_contract_otp_service(
  p_contract_id uuid,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_contract public.erp_personnel_contracts; v_code text; v_phone text; v_id uuid; v_bytes bytea; v_raw bigint;
begin
  select * into v_contract from public.erp_personnel_contracts where id=p_contract_id;
  if not found or v_contract.personnel_user_id<>p_actor_id or v_contract.status<>'offered' then
    raise exception 'personnel_contract_not_found' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('personnel-contract-otp:'||p_contract_id::text,0));
  if exists(select 1 from public.erp_personnel_contract_otp_challenges c
    where c.contract_id=p_contract_id and c.requested_by=p_actor_id and c.created_at>=now()-interval '60 seconds') then
    raise exception 'personnel_contract_otp_cooldown' using errcode='P0001'; end if;
  if (select count(*) from public.erp_personnel_contract_otp_challenges c
    where c.requested_by=p_actor_id and c.created_at>=now()-interval '1 hour')>=10 then
    raise exception 'personnel_contract_otp_rate_limit' using errcode='P0001'; end if;
  select regexp_replace(coalesce(u.phone,''),'\D','','g') into v_phone from auth.users u where u.id=p_actor_id;
  if v_phone like '98%' then v_phone:='0'||substr(v_phone,3); end if;
  if v_phone !~ '^09[0-9]{9}$' then raise exception 'personnel_phone_missing' using errcode='22023'; end if;
  v_bytes:=extensions.gen_random_bytes(4);
  v_raw:=(get_byte(v_bytes,0)::bigint<<24)+(get_byte(v_bytes,1)::bigint<<16)
    +(get_byte(v_bytes,2)::bigint<<8)+get_byte(v_bytes,3)::bigint;
  v_code:=lpad((v_raw%1000000)::text,6,'0');
  insert into public.erp_personnel_contract_otp_challenges(contract_id,studio_id,requested_by,code_hash,expires_at)
    values(p_contract_id,v_contract.studio_id,p_actor_id,extensions.crypt(v_code,extensions.gen_salt('bf',8)),now()+interval '10 minutes')
    returning id into v_id;
  return jsonb_build_object('challengeId',v_id,'code',v_code,'phone',v_phone,'expiresAt',now()+interval '10 minutes');
end $$;

create or replace function public.accept_personnel_contract_with_otp(
  p_contract_id uuid,p_expected_version bigint,p_challenge_id uuid,p_code text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_contract public.erp_personnel_contracts; v_challenge public.erp_personnel_contract_otp_challenges;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  select * into v_contract from public.erp_personnel_contracts where id=p_contract_id for update;
  if not found or v_contract.personnel_user_id<>(select auth.uid()) then
    raise exception 'personnel_contract_not_found' using errcode='P0002'; end if;
  if v_contract.version<>p_expected_version then raise exception 'personnel_contract_version_conflict' using errcode='40001'; end if;
  if v_contract.status<>'offered' then raise exception 'invalid_personnel_contract_transition' using errcode='22023'; end if;
  select * into v_challenge from public.erp_personnel_contract_otp_challenges
    where id=p_challenge_id and contract_id=p_contract_id and requested_by=(select auth.uid()) for update;
  if not found then raise exception 'personnel_contract_otp_not_found' using errcode='P0002'; end if;
  if v_challenge.consumed_at is not null then raise exception 'personnel_contract_otp_consumed' using errcode='22023'; end if;
  if v_challenge.expires_at<=now() then raise exception 'personnel_contract_otp_expired' using errcode='22023'; end if;
  if v_challenge.attempts>=5 then raise exception 'personnel_contract_otp_locked' using errcode='42501'; end if;
  if coalesce(p_code,'')!~'^[0-9]{6}$' or extensions.crypt(p_code,v_challenge.code_hash)<>v_challenge.code_hash then
    update public.erp_personnel_contract_otp_challenges set attempts=least(attempts+1,5) where id=v_challenge.id;
    return jsonb_build_object('ok',false,'error','personnel_contract_otp_invalid',
      'attemptsRemaining',greatest(0,4-v_challenge.attempts));
  end if;
  update public.erp_personnel_contract_otp_challenges set consumed_at=now() where id=v_challenge.id;
  update public.erp_personnel_contracts set status='accepted',accepted_at=now(),version=version+1,updated_at=now()
    where id=v_contract.id;
  return jsonb_build_object('ok',true,'contractId',v_contract.id,'status','accepted','version',v_contract.version+1);
end $$;

create or replace function public.respond_personnel_contract(
  p_contract_id uuid,p_expected_version bigint,p_accept boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.erp_personnel_contracts;
begin
  if p_accept then raise exception 'personnel_contract_otp_required' using errcode='42501'; end if;
  select * into v from public.erp_personnel_contracts where id=p_contract_id for update;
  if not found or v.personnel_user_id<>(select auth.uid()) then raise exception 'personnel_contract_not_found' using errcode='P0002'; end if;
  if v.version<>p_expected_version then raise exception 'personnel_contract_version_conflict' using errcode='40001'; end if;
  if v.status<>'offered' then raise exception 'invalid_personnel_contract_transition' using errcode='22023'; end if;
  update public.erp_personnel_contracts set status='rejected',accepted_at=null,version=version+1,updated_at=now() where id=v.id;
  return jsonb_build_object('ok',true,'contractId',v.id,'status','rejected','version',v.version+1);
end $$;

revoke all on function public.issue_personnel_contract_otp_service(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.accept_personnel_contract_with_otp(uuid,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.issue_personnel_contract_otp_service(uuid,uuid) to service_role;
grant execute on function public.accept_personnel_contract_with_otp(uuid,bigint,uuid,text) to authenticated;

create table public.erp_attendance_entries (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  personnel_user_id uuid not null references auth.users(id) on delete restrict,
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  source text not null default 'portal' check (source in ('portal','manager','import')),
  note text not null default '' check (length(note)<=500),
  version bigint not null default 1 check (version>0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out_at is null or check_out_at>check_in_at)
);
create unique index erp_attendance_one_open_shift on public.erp_attendance_entries(studio_id,personnel_user_id)
  where check_out_at is null;
create index erp_attendance_studio_time on public.erp_attendance_entries(studio_id,check_in_at desc);
alter table public.erp_attendance_entries enable row level security;
revoke all on public.erp_attendance_entries from public,anon,authenticated;
grant select on public.erp_attendance_entries to authenticated;
create policy erp_attendance_read on public.erp_attendance_entries for select to authenticated using (
  personnel_user_id=(select auth.uid()) or public.has_studio_permission(studio_id,'members.manage')
);

create or replace function public.record_attendance_action(
  p_studio_id uuid,p_action text,p_expected_version bigint default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v public.erp_attendance_entries; v_id uuid;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not exists(select 1 from public.studio_members m where m.studio_id=p_studio_id and m.user_id=v_user
    and m.status='active' and m.revoked_at is null and m.valid_from<=now() and (m.valid_until is null or m.valid_until>now())) then
    raise exception 'attendance_membership_required' using errcode='42501'; end if;
  if p_action='check_in' then
    insert into public.erp_attendance_entries(studio_id,personnel_user_id,check_in_at,created_by)
      values(p_studio_id,v_user,now(),v_user) returning id into v_id;
    return jsonb_build_object('ok',true,'attendanceId',v_id,'status','open');
  elsif p_action='check_out' then
    select * into v from public.erp_attendance_entries where studio_id=p_studio_id and personnel_user_id=v_user
      and check_out_at is null for update;
    if not found then raise exception 'open_attendance_not_found' using errcode='P0002'; end if;
    if p_expected_version is null or v.version<>p_expected_version then raise exception 'attendance_version_conflict' using errcode='40001'; end if;
    update public.erp_attendance_entries set check_out_at=now(),version=version+1,updated_at=now() where id=v.id;
    return jsonb_build_object('ok',true,'attendanceId',v.id,'status','completed','version',v.version+1);
  end if;
  raise exception 'invalid_attendance_action' using errcode='22023';
exception when unique_violation then raise exception 'attendance_already_open' using errcode='23505';
end $$;

revoke all on function public.record_attendance_action(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.record_attendance_action(uuid,text,bigint) to authenticated;

create or replace function public.save_attendance_override(
  p_studio_id uuid,p_attendance_id uuid,p_personnel_user_id uuid,
  p_check_in_at timestamptz,p_check_out_at timestamptz,p_note text,p_expected_version bigint default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_version bigint;
begin
  if not public.has_studio_permission(p_studio_id,'members.manage') then
    raise exception 'attendance_manage_permission_denied' using errcode='42501'; end if;
  if p_check_in_at is null or (p_check_out_at is not null and p_check_out_at<=p_check_in_at)
    or length(coalesce(p_note,''))>500 then raise exception 'invalid_attendance_payload' using errcode='22023'; end if;
  if not exists(select 1 from public.studio_members m where m.studio_id=p_studio_id and m.user_id=p_personnel_user_id
    and m.status='active' and m.revoked_at is null) then raise exception 'personnel_not_active' using errcode='23503'; end if;
  if p_attendance_id is null then
    insert into public.erp_attendance_entries(studio_id,personnel_user_id,check_in_at,check_out_at,source,note,created_by)
      values(p_studio_id,p_personnel_user_id,p_check_in_at,p_check_out_at,'manager',coalesce(p_note,''),(select auth.uid()))
      returning id,version into v_id,v_version;
  else
    update public.erp_attendance_entries set personnel_user_id=p_personnel_user_id,check_in_at=p_check_in_at,
      check_out_at=p_check_out_at,note=coalesce(p_note,''),source='manager',version=version+1,updated_at=now()
      where id=p_attendance_id and studio_id=p_studio_id and version=p_expected_version
      returning id,version into v_id,v_version;
    if not found then raise exception 'attendance_version_conflict' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('ok',true,'attendanceId',v_id,'version',v_version);
exception when unique_violation then raise exception 'attendance_already_open' using errcode='23505';
end $$;

revoke all on function public.save_attendance_override(uuid,uuid,uuid,timestamptz,timestamptz,text,bigint)
  from public,anon,authenticated;
grant execute on function public.save_attendance_override(uuid,uuid,uuid,timestamptz,timestamptz,text,bigint)
  to authenticated;

-- Only the active immutable ledger revision is a browser projection. Historical
-- revisions and reversals remain audit-only and cannot be double-counted by UI.
create or replace view public.erp_finance_active_transactions
with (security_invoker=true) as
select t.id,t.studio_id,t.logical_id,t.revision,t.operation,t.amount_irr,
  t.bank_id,t.to_bank_id,t.state,t.payload,t.created_at
from public.finance_transaction_heads h
join public.finance_transactions t on t.id=h.current_transaction_id
where h.active and t.state='posted';
revoke all on public.erp_finance_active_transactions from public,anon,authenticated;
grant select on public.erp_finance_active_transactions to authenticated;

create or replace function public.cancel_contract_with_refund_v2(
  p_contract_id uuid,p_expected_version bigint,p_refund_irr bigint,p_penalty_irr bigint,
  p_bank_id text,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_contract public.contracts; v_event public.erp_contract_lifecycle_events;
  v_finance jsonb; v_finance_tx uuid; v_collected bigint; v_ledger_version bigint;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if length(coalesce(p_idempotency_key,'')) not between 8 and 128
    or coalesce(p_refund_irr,0)<0 or coalesce(p_penalty_irr,0)<0
    or length(trim(coalesce(p_reason,''))) not between 3 and 2000 then
    raise exception 'invalid_cancellation_command' using errcode='22023'; end if;
  select * into v_event from public.erp_contract_lifecycle_events
    where contract_id=p_contract_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('ok',true,'deduped',true,'eventId',v_event.id,
    'financeTransactionId',v_event.finance_transaction_id); end if;
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'contract_not_found' using errcode='P0002'; end if;
  if v_contract.lifecycle_version<>p_expected_version then raise exception 'contract_version_conflict' using errcode='40001'; end if;
  if v_contract.status='cancelled' then raise exception 'contract_already_cancelled' using errcode='22023'; end if;
  if not public.has_studio_permission(v_contract.studio_id,'finance.write')
    or not public.has_studio_permission(v_contract.studio_id,'operations.write') then
    raise exception 'cancellation_permission_denied' using errcode='42501'; end if;
  if p_refund_irr>0 and nullif(p_bank_id,'') is null then raise exception 'refund_bank_required' using errcode='22023'; end if;
  select coalesce(sum(t.amount_irr),0)::bigint into v_collected
  from public.finance_transaction_heads h join public.finance_transactions t on t.id=h.current_transaction_id
  where h.studio_id=v_contract.studio_id and h.active and t.state='posted'
    and t.payload->>'contractId'=p_contract_id::text
    and t.payload->>'purposeCategory' in ('contract_deposit','contract_payment')
    and (t.operation='record_deposit' or (t.operation='update_transaction' and t.payload->>'type'='deposit'));
  if p_refund_irr+p_penalty_irr>v_collected then
    raise exception 'cancellation_settlement_exceeds_collected' using errcode='22023'; end if;
  if p_refund_irr>0 then
    select coalesce(h.version,0) into v_ledger_version from (select 1) seed
      left join public.studio_ledger_heads h on h.studio_id=v_contract.studio_id;
    v_finance:=public.post_finance_command(v_contract.studio_id,'record_withdrawal',
      'refund:'||md5(v_contract.studio_id::text||':'||p_idempotency_key),
      jsonb_build_object('transactionId','refund:'||p_contract_id::text||':'||md5(p_idempotency_key),
        'amount',p_refund_irr::numeric/10,'bankId',p_bank_id,'type','withdrawal',
        'purposeCategory','cancellation_refund','contractId',p_contract_id,'reason',trim(p_reason),
        '_expectedLedgerVersion',v_ledger_version));
    v_finance_tx:=nullif(v_finance->>'transactionId','')::uuid;
  end if;
  perform set_config('app.erp_contract_lifecycle','on',true);
  update public.contracts set status='cancelled',lifecycle_version=lifecycle_version+1,updated_at=now() where id=p_contract_id;
  update public.erp_work_orders set status='cancelled',version=version+1,updated_at=now()
    where contract_id=p_contract_id and status<>'delivered';
  update public.erp_work_order_assignments set assignment_status='cancelled',version=version+1
    where work_order_id in(select id from public.erp_work_orders where contract_id=p_contract_id)
      and assignment_status in('offered','active');
  update public.erp_payment_schedules set status='cancelled',updated_at=now()
    where contract_id=p_contract_id and status not in('paid','cancelled');
  update public.erp_photo_selection_sessions set status='cancelled',updated_at=now()
    where contract_id=p_contract_id and status not in('delivered','cancelled');
  insert into public.erp_contract_lifecycle_events(studio_id,contract_id,event_type,old_event_starts_at,
    old_event_ends_at,old_event_date,refund_irr,penalty_irr,finance_transaction_id,reason,idempotency_key,actor_id)
  values(v_contract.studio_id,p_contract_id,'cancelled',v_contract.event_starts_at,v_contract.event_ends_at,
    v_contract.event_date,p_refund_irr,p_penalty_irr,v_finance_tx,trim(p_reason),p_idempotency_key,v_user)
  returning * into v_event;
  return jsonb_build_object('ok',true,'eventId',v_event.id,'financeTransactionId',v_finance_tx,
    'version',v_contract.lifecycle_version+1);
end $$;

create or replace function public.reschedule_contract_event_v2(
  p_contract_id uuid,p_expected_version bigint,p_new_event_date text,p_new_start timestamptz,
  p_new_end timestamptz,p_reason text,p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=(select auth.uid()); v_contract public.contracts; v_event public.erp_contract_lifecycle_events;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if p_new_event_date!~'^[0-9]{4}/(0[1-9]|1[0-2])/(0[1-9]|[12][0-9]|3[01])$'
    or p_new_start is null or p_new_end is null or p_new_end<=p_new_start
    or length(trim(coalesce(p_reason,''))) not between 3 and 2000
    or length(coalesce(p_idempotency_key,'')) not between 8 and 128 then
    raise exception 'invalid_reschedule_command' using errcode='22023'; end if;
  select * into v_event from public.erp_contract_lifecycle_events
    where contract_id=p_contract_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('ok',true,'deduped',true,'eventId',v_event.id); end if;
  select * into v_contract from public.contracts where id=p_contract_id for update;
  if not found or v_contract.status='cancelled' then raise exception 'active_contract_required' using errcode='P0002'; end if;
  if v_contract.lifecycle_version<>p_expected_version then raise exception 'contract_version_conflict' using errcode='40001'; end if;
  if not public.has_studio_permission(v_contract.studio_id,'operations.write') then
    raise exception 'operations_write_denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_contract.studio_id::text||':schedule',0));
  perform set_config('app.erp_contract_lifecycle','on',true);
  update public.contracts set event_date=p_new_event_date,event_starts_at=p_new_start,event_ends_at=p_new_end,
    lifecycle_version=lifecycle_version+1,updated_at=now() where id=p_contract_id;
  update public.erp_work_orders set scheduled_start=p_new_start,scheduled_end=p_new_end,due_at=p_new_end,
    version=version+1,updated_at=now() where contract_id=p_contract_id and status not in('delivered','cancelled');
  update public.erp_work_order_assignments set valid_from=p_new_start,valid_until=p_new_end,
    scheduled_start_at=p_new_start,scheduled_end_at=p_new_end,version=version+1
    where work_order_id in(select id from public.erp_work_orders where contract_id=p_contract_id)
      and assignment_status in('offered','active');
  if v_contract.event_starts_at is not null then
    update public.erp_payment_schedules set due_date=due_date+(p_new_start::date-v_contract.event_starts_at::date),updated_at=now()
      where contract_id=p_contract_id and status in('forecast','due','partially_paid','overdue');
  end if;
  insert into public.erp_contract_lifecycle_events(studio_id,contract_id,event_type,old_event_starts_at,
    old_event_ends_at,new_event_starts_at,new_event_ends_at,old_event_date,new_event_date,reason,idempotency_key,actor_id)
  values(v_contract.studio_id,p_contract_id,'rescheduled',v_contract.event_starts_at,v_contract.event_ends_at,
    p_new_start,p_new_end,v_contract.event_date,p_new_event_date,trim(p_reason),p_idempotency_key,v_user)
  returning * into v_event;
  return jsonb_build_object('ok',true,'eventId',v_event.id,'version',v_contract.lifecycle_version+1);
end $$;

create or replace function public.transition_contract_status(
  p_contract_id uuid,p_expected_version bigint,p_target_status text,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.contracts;
begin
  select * into v from public.contracts where id=p_contract_id for update;
  if not found then raise exception 'contract_not_found' using errcode='P0002'; end if;
  if not public.has_studio_permission(v.studio_id,'operations.write') then raise exception 'operations_write_denied' using errcode='42501'; end if;
  if v.lifecycle_version<>p_expected_version then raise exception 'contract_version_conflict' using errcode='40001'; end if;
  if not(v.status='active' and p_target_status='done') then raise exception 'invalid_contract_transition' using errcode='22023'; end if;
  if exists(select 1 from public.erp_work_orders w where w.contract_id=v.id and w.status<>'delivered') then
    raise exception 'contract_work_orders_incomplete' using errcode='22023'; end if;
  perform set_config('app.erp_contract_lifecycle','on',true);
  update public.contracts set status='done',lifecycle_version=lifecycle_version+1,updated_at=now() where id=v.id;
  return jsonb_build_object('ok',true,'contractId',v.id,'status','done','version',v.lifecycle_version+1);
end $$;

revoke execute on function public.cancel_contract_with_refund(uuid,bigint,bigint,text,text,text) from authenticated;
revoke execute on function public.reschedule_contract_event(uuid,text,timestamptz,timestamptz,text,text) from authenticated;
revoke all on function public.cancel_contract_with_refund_v2(uuid,bigint,bigint,bigint,text,text,text) from public,anon,authenticated;
revoke all on function public.reschedule_contract_event_v2(uuid,bigint,text,timestamptz,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.transition_contract_status(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.cancel_contract_with_refund_v2(uuid,bigint,bigint,bigint,text,text,text) to authenticated;
grant execute on function public.reschedule_contract_event_v2(uuid,bigint,text,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.transition_contract_status(uuid,bigint,text,text) to authenticated;

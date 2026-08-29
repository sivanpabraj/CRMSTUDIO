-- Typed financial/personnel aggregates. Each lifecycle has a dedicated command
-- boundary rather than a generic JSON mutation endpoint.

create table if not exists public.erp_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  bank_name text not null default '',
  holder_name text not null default '',
  card_last4 text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  account_number_masked text not null default '',
  iban_masked text not null default '',
  status text not null default 'active' check (status in ('active','archived')),
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists erp_bank_accounts_studio_status on public.erp_bank_accounts(studio_id,status);
alter table public.erp_bank_accounts enable row level security;
revoke all on public.erp_bank_accounts from public,anon,authenticated;
grant select on public.erp_bank_accounts to authenticated;
create policy erp_bank_accounts_read on public.erp_bank_accounts for select to authenticated
  using (public.has_studio_permission(studio_id,'finance.read'));

create or replace view public.erp_bank_account_balances
with (security_invoker=true) as
select b.id,b.studio_id,b.title,b.bank_name,b.holder_name,b.card_last4,
  b.account_number_masked,b.iban_masked,b.status,b.version,b.updated_at,
  coalesce(sum(j.debit_irr-j.credit_irr),0)::bigint as balance_irr
from public.erp_bank_accounts b
left join public.finance_journal_lines j
  on j.studio_id=b.studio_id and j.account_ref='asset:bank:'||b.id::text
group by b.id;
revoke all on public.erp_bank_account_balances from public,anon,authenticated;
grant select on public.erp_bank_account_balances to authenticated;

create or replace function public.save_bank_account(
  p_studio_id uuid,p_account_id uuid,p_expected_version bigint,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_version bigint;
begin
  if not public.has_studio_permission(p_studio_id,'finance.write') then
    raise exception 'finance_permission_denied' using errcode='42501'; end if;
  if p_account_id is null then
    insert into public.erp_bank_accounts(studio_id,title,bank_name,holder_name,card_last4,
      account_number_masked,iban_masked,created_by)
    values(p_studio_id,trim(p_payload->>'title'),coalesce(p_payload->>'bankName',''),
      coalesce(p_payload->>'holderName',''),nullif(right(regexp_replace(coalesce(p_payload->>'card',''),'\D','','g'),4),''),
      right(coalesce(p_payload->>'accountNumber',''),8),right(upper(coalesce(p_payload->>'iban','')),8),(select auth.uid()))
    returning id,version into v_id,v_version;
  else
    update public.erp_bank_accounts set title=trim(p_payload->>'title'),
      bank_name=coalesce(p_payload->>'bankName',''),holder_name=coalesce(p_payload->>'holderName',''),
      card_last4=nullif(right(regexp_replace(coalesce(p_payload->>'card',''),'\D','','g'),4),''),
      account_number_masked=right(coalesce(p_payload->>'accountNumber',''),8),
      iban_masked=right(upper(coalesce(p_payload->>'iban','')),8),version=version+1,updated_at=now()
    where id=p_account_id and studio_id=p_studio_id and version=p_expected_version
    returning id,version into v_id,v_version;
    if not found then raise exception 'bank_account_version_conflict' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('ok',true,'accountId',v_id,'version',v_version);
exception when not_null_violation or check_violation then
  raise exception 'invalid_bank_account_payload' using errcode='22023';
end $$;

revoke all on function public.save_bank_account(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_bank_account(uuid,uuid,bigint,jsonb) to authenticated;

create table if not exists public.erp_payroll_payments (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  personnel_user_id uuid not null references auth.users(id) on delete restrict,
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  gross_irr bigint not null check (gross_irr >= 0),
  deductions_irr bigint not null default 0 check (deductions_irr >= 0),
  net_irr bigint generated always as (gross_irr - deductions_irr) stored,
  bank_id text not null check (length(bank_id) between 1 and 160),
  finance_transaction_id uuid not null references public.finance_transactions(id) on delete restrict,
  status text not null default 'paid' check (status in ('paid','reversed')),
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id, personnel_user_id, period_month),
  check (gross_irr >= deductions_irr)
);

create table if not exists public.erp_cheques (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  cheque_number text not null check (length(trim(cheque_number)) between 1 and 80),
  direction text not null check (direction in ('incoming','outgoing')),
  party text not null check (length(trim(party)) between 1 and 200),
  amount_irr bigint not null check (amount_irr > 0),
  bank_id text not null check (length(bank_id) between 1 and 160),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','cleared','bounced','cancelled')),
  finance_transaction_id uuid references public.finance_transactions(id) on delete restrict,
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (studio_id, cheque_number, direction),
  check ((status = 'cleared') = (finance_transaction_id is not null))
);

create table if not exists public.erp_personnel_contracts (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  personnel_user_id uuid not null references auth.users(id) on delete restrict,
  starts_on date not null,
  ends_on date,
  compensation jsonb not null default '{}'::jsonb,
  terms jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','offered','accepted','rejected','terminated','expired')),
  version bigint not null default 1,
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  check ((status = 'accepted') = (accepted_at is not null))
);

create index if not exists erp_payroll_studio_period on public.erp_payroll_payments(studio_id, period_month desc);
create index if not exists erp_cheques_studio_due on public.erp_cheques(studio_id, status, due_date);
create index if not exists erp_personnel_contracts_user on public.erp_personnel_contracts(studio_id, personnel_user_id, status);

alter table public.erp_payroll_payments enable row level security;
alter table public.erp_cheques enable row level security;
alter table public.erp_personnel_contracts enable row level security;
revoke all on public.erp_payroll_payments, public.erp_cheques, public.erp_personnel_contracts
  from public, anon, authenticated;
grant select on public.erp_payroll_payments, public.erp_cheques to authenticated;
grant select on public.erp_personnel_contracts to authenticated;

create policy erp_payroll_read on public.erp_payroll_payments for select to authenticated
  using (public.has_studio_permission(studio_id, 'finance.read') or personnel_user_id = (select auth.uid()));
create policy erp_cheques_read on public.erp_cheques for select to authenticated
  using (public.has_studio_permission(studio_id, 'finance.read'));
create policy erp_personnel_contracts_read on public.erp_personnel_contracts for select to authenticated
  using (public.has_studio_permission(studio_id, 'members.manage') or personnel_user_id = (select auth.uid()));

create or replace function public.record_payroll_payment(
  p_studio_id uuid, p_idempotency_key text, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_period date;
  v_gross bigint;
  v_deductions bigint;
  v_net_toman numeric;
  v_bank text;
  v_expected bigint;
  v_finance jsonb;
  v_id uuid;
begin
  if not public.has_studio_permission(p_studio_id, 'finance.write') then
    raise exception 'finance_permission_denied' using errcode = '42501'; end if;
  begin
    v_user := (p_payload->>'personnelUserId')::uuid;
    v_period := date_trunc('month', (p_payload->>'periodMonth')::date)::date;
    v_gross := (p_payload->>'grossIrr')::bigint;
    v_deductions := coalesce((p_payload->>'deductionsIrr')::bigint, 0);
    v_expected := (p_payload->>'expectedLedgerVersion')::bigint;
  exception when others then raise exception 'invalid_payroll_payload' using errcode = '22023'; end;
  v_bank := nullif(p_payload->>'bankId', '');
  if v_bank is null or v_gross <= v_deductions or v_deductions < 0 then
    raise exception 'invalid_payroll_payload' using errcode = '22023'; end if;
  if not exists (select 1 from public.studio_members m where m.studio_id=p_studio_id and m.user_id=v_user and m.status='active') then
    raise exception 'personnel_not_active' using errcode = '23503'; end if;

  v_net_toman := (v_gross - v_deductions)::numeric / 10;
  v_finance := public.post_finance_command(p_studio_id, 'record_withdrawal', p_idempotency_key,
    jsonb_build_object('transactionId', p_idempotency_key, 'amount', v_net_toman,
      'bankId', v_bank, 'purposeCategory', 'payroll', 'personnelUserId', v_user,
      '_expectedLedgerVersion', v_expected));
  insert into public.erp_payroll_payments(studio_id, personnel_user_id, period_month,
    gross_irr, deductions_irr, bank_id, finance_transaction_id, created_by)
  values (p_studio_id, v_user, v_period, v_gross, v_deductions, v_bank,
    (v_finance->>'transactionId')::uuid, (select auth.uid())) returning id into v_id;
  return jsonb_build_object('ok',true,'paymentId',v_id,'receipt',v_finance);
end $$;

create or replace function public.register_cheque(
  p_studio_id uuid, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_studio_permission(p_studio_id, 'finance.write') then
    raise exception 'finance_permission_denied' using errcode='42501'; end if;
  insert into public.erp_cheques(studio_id, cheque_number, direction, party, amount_irr,
    bank_id, due_date, created_by)
  values (p_studio_id, trim(p_payload->>'chequeNumber'), p_payload->>'direction',
    trim(p_payload->>'party'), (p_payload->>'amountIrr')::bigint,
    p_payload->>'bankId', (p_payload->>'dueDate')::date, (select auth.uid()))
  returning id into v_id;
  return jsonb_build_object('ok',true,'chequeId',v_id,'status','pending');
exception when invalid_text_representation or not_null_violation or check_violation then
  raise exception 'invalid_cheque_payload' using errcode='22023';
end $$;

create or replace function public.transition_cheque(
  p_studio_id uuid, p_cheque_id uuid, p_expected_version bigint,
  p_target_status text, p_idempotency_key text, p_expected_ledger_version bigint default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.erp_cheques; v_finance jsonb; v_operation text;
begin
  if not public.has_studio_permission(p_studio_id, 'finance.write') then
    raise exception 'finance_permission_denied' using errcode='42501'; end if;
  select * into v from public.erp_cheques where id=p_cheque_id and studio_id=p_studio_id for update;
  if not found then raise exception 'cheque_not_found' using errcode='P0002'; end if;
  if v.version <> p_expected_version then raise exception 'cheque_version_conflict' using errcode='40001'; end if;
  if not (
    (v.status = 'pending' and p_target_status in ('cleared','bounced','cancelled'))
    or (v.status = 'cleared' and p_target_status = 'pending')
  ) then
    raise exception 'invalid_cheque_transition' using errcode='22023'; end if;
  if p_target_status='cleared' then
    if p_expected_ledger_version is null then raise exception 'expected_ledger_version_required' using errcode='22023'; end if;
    v_operation := case when v.direction='incoming' then 'record_deposit' else 'record_withdrawal' end;
    v_finance := public.post_finance_command(p_studio_id, v_operation, p_idempotency_key,
      jsonb_build_object('transactionId','cheque:'||v.id::text,'amount',v.amount_irr::numeric/10,
        'bankId',v.bank_id,'purposeCategory','cheque','chequeId',v.id,
        '_expectedLedgerVersion',p_expected_ledger_version));
  elsif v.status='cleared' and p_target_status='pending' then
    if p_expected_ledger_version is null then raise exception 'expected_ledger_version_required' using errcode='22023'; end if;
    v_finance := public.post_finance_command(p_studio_id, 'delete_transaction', p_idempotency_key,
      jsonb_build_object('transactionId','cheque:'||v.id::text,
        '_expectedLedgerVersion',p_expected_ledger_version));
  end if;
  update public.erp_cheques set status=p_target_status,
    finance_transaction_id=case when p_target_status='cleared' then (v_finance->>'transactionId')::uuid else null end,
    version=version+1, updated_at=now() where id=v.id;
  return jsonb_build_object('ok',true,'chequeId',v.id,'status',p_target_status,
    'version',v.version+1,'receipt',coalesce(v_finance,'{}'::jsonb));
end $$;

create or replace function public.create_personnel_contract(
  p_studio_id uuid, p_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.has_studio_permission(p_studio_id, 'members.manage') then
    raise exception 'members_permission_denied' using errcode='42501'; end if;
  insert into public.erp_personnel_contracts(studio_id,personnel_user_id,starts_on,ends_on,
    compensation,terms,status,created_by)
  values(p_studio_id,(p_payload->>'personnelUserId')::uuid,(p_payload->>'startsOn')::date,
    nullif(p_payload->>'endsOn','')::date,coalesce(p_payload->'compensation','{}'::jsonb),
    coalesce(p_payload->'terms','{}'::jsonb),'offered',(select auth.uid())) returning id into v_id;
  return jsonb_build_object('ok',true,'contractId',v_id,'status','offered');
exception when invalid_text_representation or not_null_violation or check_violation then
  raise exception 'invalid_personnel_contract_payload' using errcode='22023';
end $$;

create or replace function public.respond_personnel_contract(
  p_contract_id uuid, p_expected_version bigint, p_accept boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.erp_personnel_contracts; v_status text;
begin
  select * into v from public.erp_personnel_contracts where id=p_contract_id for update;
  if not found or v.personnel_user_id <> (select auth.uid()) then
    raise exception 'personnel_contract_not_found' using errcode='P0002'; end if;
  if v.version <> p_expected_version then raise exception 'personnel_contract_version_conflict' using errcode='40001'; end if;
  if v.status <> 'offered' then raise exception 'invalid_personnel_contract_transition' using errcode='22023'; end if;
  v_status := case when p_accept then 'accepted' else 'rejected' end;
  update public.erp_personnel_contracts set status=v_status,
    accepted_at=case when p_accept then now() else null end,
    version=version+1,updated_at=now() where id=v.id;
  return jsonb_build_object('ok',true,'contractId',v.id,'status',v_status,'version',v.version+1);
end $$;

revoke all on function public.record_payroll_payment(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.register_cheque(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.transition_cheque(uuid,uuid,bigint,text,text,bigint) from public,anon,authenticated;
revoke all on function public.create_personnel_contract(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.respond_personnel_contract(uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.record_payroll_payment(uuid,text,jsonb) to authenticated;
grant execute on function public.register_cheque(uuid,jsonb) to authenticated;
grant execute on function public.transition_cheque(uuid,uuid,bigint,text,text,bigint) to authenticated;
grant execute on function public.create_personnel_contract(uuid,jsonb) to authenticated;
grant execute on function public.respond_personnel_contract(uuid,bigint,boolean) to authenticated;

alter table public.erp_work_order_assignments
  add column if not exists version bigint not null default 1 check (version > 0);

create or replace function public.assign_personnel_to_work_order(
  p_studio_id uuid,p_work_order_id uuid,p_user_id uuid,p_role text,
  p_starts_at timestamptz,p_ends_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not public.has_studio_permission(p_studio_id,'operations.write') then
    raise exception 'operations_permission_denied' using errcode='42501'; end if;
  if p_ends_at <= p_starts_at or length(trim(coalesce(p_role,''))) not between 2 and 80 then
    raise exception 'invalid_assignment_payload' using errcode='22023'; end if;
  if not exists(select 1 from public.erp_work_orders w where w.id=p_work_order_id and w.studio_id=p_studio_id) then
    raise exception 'work_order_not_found' using errcode='P0002'; end if;
  if not exists(select 1 from public.studio_members m where m.studio_id=p_studio_id and m.user_id=p_user_id
    and m.status='active' and m.revoked_at is null and m.valid_from<=now()
    and (m.valid_until is null or m.valid_until>now())) then
    raise exception 'assignment_user_not_active' using errcode='23503'; end if;
  insert into public.erp_work_order_assignments(studio_id,work_order_id,user_id,assignment_role,
    valid_from,valid_until,scheduled_start_at,scheduled_end_at,assignment_status)
  values(p_studio_id,p_work_order_id,p_user_id,trim(p_role),p_starts_at,p_ends_at,p_starts_at,p_ends_at,'offered')
  returning id into v_id;
  return jsonb_build_object('ok',true,'assignmentId',v_id,'version',1);
end $$;

create or replace function public.transition_work_order_status(
  p_studio_id uuid,p_work_order_id uuid,p_expected_version bigint,p_target_status text,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.erp_work_orders;
begin
  if not public.has_studio_permission(p_studio_id,'operations.write') then
    raise exception 'operations_permission_denied' using errcode='42501'; end if;
  select * into v from public.erp_work_orders where id=p_work_order_id and studio_id=p_studio_id for update;
  if not found then raise exception 'work_order_not_found' using errcode='P0002'; end if;
  if v.version<>p_expected_version then raise exception 'work_order_version_conflict' using errcode='40001'; end if;
  if p_target_status not in ('planned','scheduled','shooting','selecting','editing','review','album_design','printing','ready','delivered','cancelled') then
    raise exception 'invalid_work_order_status' using errcode='22023'; end if;
  update public.erp_work_orders set status=p_target_status,version=version+1,updated_at=now() where id=v.id;
  insert into public.erp_production_events(studio_id,work_order_id,stage,state,note,actor_id)
  values(p_studio_id,v.id,
    case when p_target_status='shooting' then 'shooting'
      when p_target_status='selecting' then 'customer_selection'
      when p_target_status in ('editing','review') then 'editing'
      when p_target_status in ('album_design','printing') then 'album_design'
      when p_target_status in ('ready','delivered') then 'delivery' else 'exception' end,
    case when p_target_status='delivered' then 'completed'
      when p_target_status='cancelled' then 'cancelled' else 'started' end,
    nullif(trim(coalesce(p_note,'')),''),(select auth.uid()));
  return jsonb_build_object('ok',true,'workOrderId',v.id,'status',p_target_status,'version',v.version+1);
end $$;

revoke insert,update,delete on public.erp_work_orders,public.erp_work_order_assignments,public.erp_production_events
  from authenticated;
grant select on public.erp_work_orders,public.erp_work_order_assignments,public.erp_production_events to authenticated;
revoke all on function public.assign_personnel_to_work_order(uuid,uuid,uuid,text,timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.transition_work_order_status(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.assign_personnel_to_work_order(uuid,uuid,uuid,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.transition_work_order_status(uuid,uuid,bigint,text,text) to authenticated;

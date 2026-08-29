-- Atomic contract creation, server-issued contract OTP and authoritative
-- contract/deposit projection. All privileged functions opt in explicitly.

create table if not exists public.erp_contract_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  party_role text not null check (party_role in ('groom', 'bride')),
  phone text not null check (phone ~ '^09[0-9]{9}$'),
  code_hash text not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (consumed_at is null or verified_at is not null)
);

create index if not exists erp_contract_otp_actor_recent
  on public.erp_contract_otp_challenges (studio_id, requested_by, phone, created_at desc);
create index if not exists erp_contract_otp_expiry
  on public.erp_contract_otp_challenges (expires_at)
  where consumed_at is null;

alter table public.erp_contract_otp_challenges enable row level security;
revoke all on public.erp_contract_otp_challenges from public, anon, authenticated, service_role;

create or replace function public.issue_contract_otp_service(
  p_studio_id uuid,
  p_actor_id uuid,
  p_party_role text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_id uuid;
  v_recent integer;
  v_raw bigint;
  v_bytes bytea;
begin
  if p_party_role not in ('groom', 'bride')
    or coalesce(p_phone, '') !~ '^09[0-9]{9}$' then
    raise exception 'invalid_contract_otp_request' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.studio_members m
    where m.studio_id = p_studio_id
      and m.user_id = p_actor_id
      and m.status = 'active'
      and m.revoked_at is null
      and m.valid_from <= now()
      and (m.valid_until is null or m.valid_until > now())
      and m.roles && array['owner','system_admin','studio_manager','office_secretary']::text[]
  ) then
    raise exception 'contract_otp_permission_denied' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('contract-otp:' || p_studio_id::text || ':' || p_phone, 0)
  );
  select count(*)::integer into v_recent
  from public.erp_contract_otp_challenges c
  where c.studio_id = p_studio_id
    and c.requested_by = p_actor_id
    and c.created_at >= now() - interval '1 hour';
  if v_recent >= 10 then
    raise exception 'contract_otp_rate_limit' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.erp_contract_otp_challenges c
    where c.studio_id = p_studio_id
      and c.requested_by = p_actor_id
      and c.phone = p_phone
      and c.created_at >= now() - interval '60 seconds'
  ) then
    raise exception 'contract_otp_cooldown' using errcode = 'P0001';
  end if;

  v_bytes := extensions.gen_random_bytes(4);
  v_raw := (get_byte(v_bytes, 0)::bigint << 24)
    + (get_byte(v_bytes, 1)::bigint << 16)
    + (get_byte(v_bytes, 2)::bigint << 8)
    + get_byte(v_bytes, 3)::bigint;
  v_code := lpad((v_raw % 1000000)::text, 6, '0');

  insert into public.erp_contract_otp_challenges (
    studio_id, requested_by, party_role, phone, code_hash, expires_at
  ) values (
    p_studio_id, p_actor_id, p_party_role, p_phone,
    extensions.crypt(v_code, extensions.gen_salt('bf', 8)),
    now() + interval '10 minutes'
  ) returning id into v_id;

  return jsonb_build_object(
    'challengeId', v_id,
    'code', v_code,
    'expiresAt', now() + interval '10 minutes'
  );
end;
$$;
revoke all on function public.issue_contract_otp_service(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.issue_contract_otp_service(uuid, uuid, text, text)
  to service_role;

create or replace function public.verify_contract_otp(
  p_challenge_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.erp_contract_otp_challenges;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select * into v from public.erp_contract_otp_challenges
  where id = p_challenge_id for update;
  if not found or v.requested_by <> (select auth.uid()) then
    raise exception 'contract_otp_not_found' using errcode = 'P0002';
  end if;
  if v.consumed_at is not null or v.verified_at is not null then
    return jsonb_build_object('ok', v.verified_at is not null, 'verified', v.verified_at is not null);
  end if;
  if v.expires_at <= now() then
    raise exception 'contract_otp_expired' using errcode = '22023';
  end if;
  if v.attempts >= 5 then
    raise exception 'contract_otp_locked' using errcode = '42501';
  end if;
  if coalesce(p_code, '') !~ '^[0-9]{6}$'
    or extensions.crypt(p_code, v.code_hash) <> v.code_hash then
    update public.erp_contract_otp_challenges
      set attempts = least(attempts + 1, 5)
      where id = p_challenge_id;
    return jsonb_build_object('ok', false, 'verified', false, 'error', 'contract_otp_invalid',
      'attemptsRemaining', greatest(0, 4 - v.attempts));
  end if;
  update public.erp_contract_otp_challenges
    set verified_at = now()
    where id = p_challenge_id;
  return jsonb_build_object('ok', true, 'verified', true, 'challengeId', p_challenge_id);
end;
$$;
revoke all on function public.verify_contract_otp(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_contract_otp(uuid, text) to authenticated;

create table if not exists public.erp_contract_commands (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  contract_id uuid references public.contracts(id) on delete restrict,
  result jsonb,
  request_hash text not null,
  created_at timestamptz not null default now(),
  unique (studio_id, idempotency_key)
);
alter table public.erp_contract_commands enable row level security;
revoke all on public.erp_contract_commands from public, anon, authenticated;
create policy erp_contract_commands_read on public.erp_contract_commands
  for select to authenticated
  using (actor_id = (select auth.uid())
    or public.has_studio_permission(studio_id, 'operations.write')
    or public.has_studio_permission(studio_id, 'finance.read'));

create table if not exists public.erp_contract_number_counters (
  studio_id uuid not null references public.studios(id) on delete cascade,
  event_date text not null,
  last_value integer not null check (last_value > 0),
  primary key (studio_id, event_date)
);
revoke all on public.erp_contract_number_counters from public, anon, authenticated;

create or replace function public.create_contract_with_deposit(
  p_studio_id uuid,
  p_idempotency_key text,
  p_contract jsonb,
  p_deposit jsonb default '{}'::jsonb,
  p_groom_challenge_id uuid default null,
  p_bride_challenge_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_contract_id uuid;
  v_contract_num text;
  v_event_date text := nullif(trim(p_contract->>'eventDate'), '');
  v_groom_phone text := nullif(regexp_replace(coalesce(p_contract->>'groomPhone', ''), '\D', '', 'g'), '');
  v_bride_phone text := nullif(regexp_replace(coalesce(p_contract->>'bridePhone', ''), '\D', '', 'g'), '');
  v_total numeric;
  v_deposit numeric := 0;
  v_finance jsonb;
  v_ledger_version bigint;
  v_seq integer;
  v_work_order_id uuid;
  v_assignment jsonb;
  v_assignment_user uuid;
  v_event_start timestamptz;
  v_event_end timestamptz;
  v_request_hash text := encode(extensions.digest(
    convert_to(coalesce(p_contract,'{}'::jsonb)::text || '|' || coalesce(p_deposit,'{}'::jsonb)::text
      || '|' || coalesce(p_groom_challenge_id::text,'') || '|' || coalesce(p_bride_challenge_id::text,''), 'UTF8'),
    'sha256'), 'hex');
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not public.has_studio_permission(p_studio_id, 'operations.write') then
    raise exception 'contract_permission_denied' using errcode = '42501';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 128
    or v_event_date is null then
    raise exception 'invalid_contract_command' using errcode = '22023';
  end if;
  begin
    v_total := (p_contract->>'total')::numeric;
    v_deposit := coalesce(nullif(p_deposit->>'amount', '')::numeric, 0);
    v_event_start := nullif(p_contract->>'eventStartsAt', '')::timestamptz;
    v_event_end := nullif(p_contract->>'eventEndsAt', '')::timestamptz;
  exception when others then
    raise exception 'invalid_contract_amount' using errcode = '22023';
  end;
  if v_total < 0 or v_deposit < 0 or v_deposit > v_total then
    raise exception 'invalid_contract_amount' using errcode = '22023';
  end if;
  if v_event_start is null or v_event_end is null or v_event_end <= v_event_start then
    raise exception 'invalid_contract_event_window' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('contract:' || p_studio_id::text, 0)
  );
  select result into v_existing from public.erp_contract_commands
    where studio_id = p_studio_id and idempotency_key = p_idempotency_key;
  if found then
    if not exists(select 1 from public.erp_contract_commands c where c.studio_id=p_studio_id
      and c.idempotency_key=p_idempotency_key and c.request_hash=v_request_hash) then
      raise exception 'idempotency_payload_mismatch' using errcode='22023';
    end if;
    return v_existing || jsonb_build_object('deduped', true);
  end if;

  if v_groom_phone is not null and not exists (
    select 1 from public.erp_contract_otp_challenges c
    where c.id = p_groom_challenge_id and c.studio_id = p_studio_id
      and c.requested_by = (select auth.uid()) and c.party_role = 'groom'
      and c.phone = v_groom_phone and c.verified_at is not null
      and c.consumed_at is null and c.expires_at > now()
  ) then raise exception 'groom_otp_required' using errcode = '42501'; end if;
  if v_bride_phone is not null and not exists (
    select 1 from public.erp_contract_otp_challenges c
    where c.id = p_bride_challenge_id and c.studio_id = p_studio_id
      and c.requested_by = (select auth.uid()) and c.party_role = 'bride'
      and c.phone = v_bride_phone and c.verified_at is not null
      and c.consumed_at is null and c.expires_at > now()
  ) then raise exception 'bride_otp_required' using errcode = '42501'; end if;

  insert into public.erp_contract_number_counters(studio_id,event_date,last_value)
    values(p_studio_id,v_event_date,1)
    on conflict(studio_id,event_date) do update
      set last_value=public.erp_contract_number_counters.last_value+1
    returning last_value into v_seq;
  v_contract_num := regexp_replace(v_event_date, '\D', '', 'g') || '-' || lpad(v_seq::text, 2, '0');

  insert into public.contracts (
    studio_id, local_id, contract_num, groom, bride, groom_phone, bride_phone,
    event_date, event_starts_at, event_ends_at, status, total, payload
  ) values (
    p_studio_id, nullif(p_contract->>'localId', ''), v_contract_num,
    coalesce(p_contract->>'groom', ''), coalesce(p_contract->>'bride', ''),
    v_groom_phone, v_bride_phone, v_event_date,
    v_event_start, v_event_end,
    'active', v_total, p_contract - array['total','eventStartsAt','eventEndsAt']
  ) returning id into v_contract_id;

  insert into public.erp_work_orders(studio_id,contract_id,title,status,due_at,
    scheduled_start,scheduled_end,created_by)
  values(p_studio_id,v_contract_id,
    'مراسم '||trim(concat_ws(' و ',nullif(p_contract->>'bride',''),nullif(p_contract->>'groom',''))),
    'scheduled',v_event_end,v_event_start,v_event_end,(select auth.uid()))
  returning id into v_work_order_id;

  for v_assignment in select value from jsonb_array_elements(coalesce(p_contract->'assignments','[]'::jsonb)) loop
    begin v_assignment_user := (v_assignment->>'userId')::uuid;
    exception when others then raise exception 'invalid_assignment_user' using errcode='22023'; end;
    if not exists(select 1 from public.studio_members m where m.studio_id=p_studio_id
      and m.user_id=v_assignment_user and m.status='active' and m.revoked_at is null
      and m.valid_from<=now() and (m.valid_until is null or m.valid_until>now())) then
      raise exception 'assignment_user_not_active' using errcode='23503'; end if;
    insert into public.erp_work_order_assignments(studio_id,work_order_id,user_id,assignment_role,
      valid_from,valid_until,scheduled_start_at,scheduled_end_at,assignment_status)
    values(p_studio_id,v_work_order_id,v_assignment_user,left(coalesce(nullif(v_assignment->>'roleKey',''),'crew'),80),
      v_event_start,v_event_end,v_event_start,v_event_end,'offered');
  end loop;

  if v_deposit > 0 then
    if not (p_deposit ? 'bankId') or nullif(p_deposit->>'bankId', '') is null then
      raise exception 'deposit_bank_required' using errcode = '22023';
    end if;
    select coalesce(h.version, 0) into v_ledger_version
      from (select 1) seed left join public.studio_ledger_heads h on h.studio_id = p_studio_id;
    v_finance := public.post_finance_command(
      p_studio_id, 'record_deposit', 'contract-deposit:' || v_contract_id::text,
      jsonb_build_object(
        'transactionId', 'contract-deposit:' || v_contract_id::text,
        'amount', v_deposit,
        'bankId', p_deposit->>'bankId',
        'contractId', v_contract_id,
        'purposeCategory', 'contract_deposit',
        '_expectedLedgerVersion', v_ledger_version
      ) || (p_deposit - array['amount','bankId'])
    );
  end if;

  update public.erp_contract_otp_challenges set consumed_at = now()
    where studio_id=p_studio_id and requested_by=(select auth.uid())
      and id in (p_groom_challenge_id, p_bride_challenge_id) and id is not null
      and verified_at is not null and consumed_at is null;
  v_existing := jsonb_build_object(
    'ok', true, 'contractId', v_contract_id, 'contractNum', v_contract_num,
    'workOrderId', v_work_order_id, 'deposit', coalesce(v_finance, '{}'::jsonb), 'deduped', false
  );
  insert into public.erp_contract_commands(studio_id, actor_id, idempotency_key, contract_id, result, request_hash)
    values (p_studio_id, (select auth.uid()), p_idempotency_key, v_contract_id, v_existing, v_request_hash);
  return v_existing;
end;
$$;
revoke all on function public.create_contract_with_deposit(uuid, text, jsonb, jsonb, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_contract_with_deposit(uuid, text, jsonb, jsonb, uuid, uuid)
  to authenticated;

-- Direct browser writes would split the aggregate from its ledger receipt.
revoke insert, update, delete on public.contracts from authenticated;
grant select on public.contracts to authenticated;

comment on function public.create_contract_with_deposit(uuid, text, jsonb, jsonb, uuid, uuid) is
  'Atomic contract + verified OTP consumption + optional double-entry deposit command';

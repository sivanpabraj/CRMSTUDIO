-- Authoritative, atomic finance core and server-side capability checks.

create or replace function public.has_studio_permission(
  p_studio_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.studio_members m
    where m.studio_id = p_studio_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and case p_permission
        when 'studio.read' then true
        when 'finance.read' then m.roles && array['owner', 'system_admin', 'studio_manager', 'accountant']::text[]
        when 'finance.write' then m.roles && array['owner', 'system_admin', 'studio_manager', 'accountant']::text[]
        when 'members.manage' then m.roles && array['owner', 'system_admin', 'studio_manager']::text[]
        else false
      end
  );
$$;

grant execute on function public.has_studio_permission(uuid, text) to authenticated;

-- Browsers may read permitted audit data, but cannot forge authoritative rows.
drop policy if exists studio_mutation_audit_member_insert on public.studio_mutation_audit;
drop policy if exists studio_ledger_entries_member_insert on public.studio_ledger_entries;
revoke insert, update, delete on public.studio_mutation_audit from authenticated;
revoke insert, update, delete on public.studio_ledger_entries from authenticated;

create table if not exists public.finance_commands (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  operation text not null check (operation in (
    'record_deposit', 'record_withdrawal', 'transfer_banks',
    'update_transaction', 'delete_transaction'
  )),
  payload jsonb not null,
  status text not null default 'processing'
    check (status in ('processing', 'accepted', 'rejected')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (studio_id, idempotency_key)
);

create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  command_id uuid not null references public.finance_commands(id) on delete restrict,
  logical_id text not null,
  revision integer not null check (revision > 0),
  operation text not null,
  amount_irr bigint not null check (amount_irr > 0),
  bank_id text,
  to_bank_id text,
  state text not null check (state in ('posted', 'reversal')),
  reverses_id uuid references public.finance_transactions(id) on delete restrict,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (studio_id, logical_id, revision)
);

create table if not exists public.finance_transaction_heads (
  studio_id uuid not null references public.studios(id) on delete cascade,
  logical_id text not null,
  current_transaction_id uuid not null references public.finance_transactions(id) on delete restrict,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (studio_id, logical_id)
);

create table if not exists public.finance_journal_lines (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  transaction_id uuid not null references public.finance_transactions(id) on delete restrict,
  account_ref text not null check (length(account_ref) between 3 and 160),
  debit_irr bigint not null default 0 check (debit_irr >= 0),
  credit_irr bigint not null default 0 check (credit_irr >= 0),
  created_at timestamptz not null default now(),
  check (
    (debit_irr > 0 and credit_irr = 0)
    or (credit_irr > 0 and debit_irr = 0)
  )
);

create index if not exists finance_commands_studio_created
  on public.finance_commands (studio_id, created_at desc);
create index if not exists finance_transactions_studio_logical
  on public.finance_transactions (studio_id, logical_id, revision desc);
create index if not exists finance_journal_studio_account
  on public.finance_journal_lines (studio_id, account_ref);
create index if not exists finance_journal_transaction
  on public.finance_journal_lines (transaction_id);

alter table public.finance_commands enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_transaction_heads enable row level security;
alter table public.finance_journal_lines enable row level security;

create policy finance_commands_read on public.finance_commands for select
  using (public.has_studio_permission(studio_id, 'finance.read'));
create policy finance_transactions_read on public.finance_transactions for select
  using (public.has_studio_permission(studio_id, 'finance.read'));
create policy finance_heads_read on public.finance_transaction_heads for select
  using (public.has_studio_permission(studio_id, 'finance.read'));
create policy finance_journal_read on public.finance_journal_lines for select
  using (public.has_studio_permission(studio_id, 'finance.read'));

revoke all on public.finance_commands from authenticated;
revoke all on public.finance_transactions from authenticated;
revoke all on public.finance_transaction_heads from authenticated;
revoke all on public.finance_journal_lines from authenticated;
grant select on public.finance_commands to authenticated;
grant select on public.finance_transactions to authenticated;
grant select on public.finance_transaction_heads to authenticated;
grant select on public.finance_journal_lines to authenticated;

create or replace function public.post_finance_command(
  p_studio_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_command public.finance_commands;
  v_existing jsonb;
  v_logical_id text;
  v_amount_toman numeric;
  v_amount_irr bigint;
  v_bank_id text;
  v_to_bank_id text;
  v_tx public.finance_transactions;
  v_old public.finance_transactions;
  v_reversal public.finance_transactions;
  v_revision integer := 1;
  v_ledger_version bigint;
  v_result jsonb;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.has_studio_permission(p_studio_id, 'finance.write') then
    raise exception 'finance_permission_denied' using errcode = '42501';
  end if;
  if p_operation not in (
    'record_deposit', 'record_withdrawal', 'transfer_banks',
    'update_transaction', 'delete_transaction'
  ) then raise exception 'unsupported_finance_operation'; end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 128 then
    raise exception 'invalid_idempotency_key';
  end if;

  select result into v_existing
  from public.finance_commands
  where studio_id = p_studio_id and idempotency_key = p_idempotency_key;
  if found then return v_existing || jsonb_build_object('deduped', true); end if;

  insert into public.finance_commands (
    studio_id, user_id, idempotency_key, operation, payload
  ) values (
    p_studio_id, auth.uid(), p_idempotency_key, p_operation, v_payload
  ) returning * into v_command;

  v_logical_id := coalesce(
    nullif(v_payload->>'transactionId', ''),
    nullif(v_payload->>'pairId', '')
  );
  if v_logical_id is null or length(v_logical_id) > 160 then
    raise exception 'invalid_transaction_identifier';
  end if;

  if p_operation in ('update_transaction', 'delete_transaction') then
    select t.* into v_old
    from public.finance_transaction_heads h
    join public.finance_transactions t on t.id = h.current_transaction_id
    where h.studio_id = p_studio_id
      and h.logical_id = v_logical_id
      and h.active
    for update of h;
    if not found then raise exception 'finance_transaction_not_found'; end if;
    if v_old.operation = 'transfer_banks' then
      raise exception 'transfer_update_forbidden';
    end if;

    select coalesce(max(revision), 0) + 1 into v_revision
    from public.finance_transactions
    where studio_id = p_studio_id and logical_id = v_logical_id;

    insert into public.finance_transactions (
      studio_id, command_id, logical_id, revision, operation, amount_irr,
      bank_id, to_bank_id, state, reverses_id, payload
    ) values (
      p_studio_id, v_command.id, v_logical_id, v_revision, 'reversal',
      v_old.amount_irr, v_old.bank_id, v_old.to_bank_id, 'reversal', v_old.id,
      jsonb_build_object('reason', p_operation)
    ) returning * into v_reversal;

    insert into public.finance_journal_lines (
      studio_id, transaction_id, account_ref, debit_irr, credit_irr
    )
    select studio_id, v_reversal.id, account_ref, credit_irr, debit_irr
    from public.finance_journal_lines where transaction_id = v_old.id;

    if p_operation = 'delete_transaction' then
      update public.finance_transaction_heads
      set current_transaction_id = v_reversal.id, active = false, updated_at = now()
      where studio_id = p_studio_id and logical_id = v_logical_id;
      v_tx := v_reversal;
    else
      v_payload := v_old.payload || v_payload;
      v_revision := v_revision + 1;
    end if;
  end if;

  if p_operation <> 'delete_transaction' then
    begin
      v_amount_toman := (v_payload->>'amount')::numeric;
    exception when others then
      raise exception 'invalid_amount';
    end;
    if v_amount_toman <= 0 or v_amount_toman > 900000000000000 then
      raise exception 'invalid_amount';
    end if;
    v_amount_irr := round(v_amount_toman * 10)::bigint;
    v_bank_id := nullif(v_payload->>'bankId', '');
    v_to_bank_id := nullif(v_payload->>'toBankId', '');

    if p_operation = 'transfer_banks' then
      v_bank_id := nullif(v_payload->>'fromBankId', '');
      if v_bank_id is null or v_to_bank_id is null or v_bank_id = v_to_bank_id then
        raise exception 'invalid_transfer_accounts';
      end if;
    elsif v_bank_id is null then
      raise exception 'bank_required';
    end if;

    insert into public.finance_transactions (
      studio_id, command_id, logical_id, revision, operation, amount_irr,
      bank_id, to_bank_id, state, payload
    ) values (
      p_studio_id, v_command.id, v_logical_id, v_revision, p_operation,
      v_amount_irr, v_bank_id, v_to_bank_id, 'posted', v_payload
    ) returning * into v_tx;

    if p_operation = 'record_deposit'
      or (p_operation = 'update_transaction' and coalesce(v_payload->>'type', 'deposit') = 'deposit') then
      insert into public.finance_journal_lines
        (studio_id, transaction_id, account_ref, debit_irr, credit_irr)
      values
        (p_studio_id, v_tx.id, 'asset:bank:' || v_bank_id, v_amount_irr, 0),
        (p_studio_id, v_tx.id, 'income:' || coalesce(nullif(v_payload->>'purposeCategory', ''), 'other'), 0, v_amount_irr);
    elsif p_operation = 'record_withdrawal'
      or (p_operation = 'update_transaction' and v_payload->>'type' = 'withdrawal') then
      insert into public.finance_journal_lines
        (studio_id, transaction_id, account_ref, debit_irr, credit_irr)
      values
        (p_studio_id, v_tx.id, 'expense:' || coalesce(nullif(v_payload->>'purposeCategory', ''), 'other'), v_amount_irr, 0),
        (p_studio_id, v_tx.id, 'asset:bank:' || v_bank_id, 0, v_amount_irr);
    elsif p_operation = 'transfer_banks' then
      insert into public.finance_journal_lines
        (studio_id, transaction_id, account_ref, debit_irr, credit_irr)
      values
        (p_studio_id, v_tx.id, 'asset:bank:' || v_to_bank_id, v_amount_irr, 0),
        (p_studio_id, v_tx.id, 'asset:bank:' || v_bank_id, 0, v_amount_irr);
    else
      raise exception 'invalid_finance_operation_payload';
    end if;

    insert into public.finance_transaction_heads (
      studio_id, logical_id, current_transaction_id, active
    ) values (
      p_studio_id, v_logical_id, v_tx.id, true
    )
    on conflict (studio_id, logical_id) do update
      set current_transaction_id = excluded.current_transaction_id,
          active = true,
          updated_at = now();
  end if;

  insert into public.studio_ledger_heads (studio_id, version, updated_at)
  values (p_studio_id, 1, now())
  on conflict (studio_id) do update
    set version = public.studio_ledger_heads.version + 1,
        updated_at = now()
  returning version into v_ledger_version;

  v_result := jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'transactionId', v_tx.id,
    'logicalId', v_logical_id,
    'ledgerVersion', v_ledger_version,
    'amountIrr', v_tx.amount_irr
  );
  update public.finance_commands
  set status = 'accepted', result = v_result, completed_at = now()
  where id = v_command.id;
  return v_result;
end;
$$;

revoke all on function public.post_finance_command(uuid, text, text, jsonb) from public;
grant execute on function public.post_finance_command(uuid, text, text, jsonb) to authenticated;

create or replace view public.finance_account_balances
with (security_invoker = true)
as
select studio_id, account_ref, sum(debit_irr - credit_irr)::bigint as balance_irr
from public.finance_journal_lines
group by studio_id, account_ref;

grant select on public.finance_account_balances to authenticated;

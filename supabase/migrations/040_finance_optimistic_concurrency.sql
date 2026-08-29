-- Finance commands are serialized per studio so expected ledger versions are
-- checked atomically. Duplicate idempotency keys are returned before the
-- version check, allowing safe retry after a lost response.

create or replace function public.post_finance_command(
  p_studio_id uuid,
  p_operation text,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing jsonb;
  v_expected bigint;
  v_current bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_studio_id is null
    or length(coalesce(p_idempotency_key, '')) not between 8 and 128 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_studio_id::text, 0)
  );

  select c.result into v_existing
  from public.finance_commands c
  where c.studio_id = p_studio_id
    and c.idempotency_key = p_idempotency_key;
  if found then
    return v_existing || jsonb_build_object('deduped', true);
  end if;

  if not (coalesce(p_payload, '{}'::jsonb) ? '_expectedLedgerVersion') then
    raise exception 'expected_ledger_version_required' using errcode = '22023';
  end if;
  begin
    v_expected := (p_payload->>'_expectedLedgerVersion')::bigint;
  exception when others then
    raise exception 'invalid_expected_ledger_version' using errcode = '22023';
  end;
  if v_expected < 0 then
    raise exception 'invalid_expected_ledger_version' using errcode = '22023';
  end if;
  select coalesce(h.version, 0) into v_current
  from (select 1) seed
  left join public.studio_ledger_heads h on h.studio_id = p_studio_id;
  if v_expected <> v_current then
    raise exception 'ledger_version_conflict expected=% current=%', v_expected, v_current
      using errcode = '40001';
  end if;

  return public.post_finance_command_unlocked(
    p_studio_id,
    p_operation,
    p_idempotency_key,
    coalesce(p_payload, '{}'::jsonb) - '_expectedLedgerVersion'
  );
end;
$$;

revoke execute on function public.post_finance_command(uuid, text, text, jsonb)
  from public, anon;
grant execute on function public.post_finance_command(uuid, text, text, jsonb)
  to authenticated;

comment on function public.post_finance_command(uuid, text, text, jsonb) is
  'Studio-serialized, idempotent finance boundary with atomic optimistic ledger-version validation';

-- SMS trust boundary v2.
-- Supabase Auth owns login/password-reset OTP. The application SMS endpoint
-- cannot impersonate those flows and each business purpose has a capability.

alter table public.sms_dispatches
  add column if not exists reserved_until timestamptz;

update public.sms_dispatches
set reserved_until = created_at + interval '5 minutes'
where reserved_until is null;

alter table public.sms_dispatches
  alter column reserved_until set default (now() + interval '5 minutes'),
  alter column reserved_until set not null;

create index if not exists sms_dispatches_reserved_expiry_idx
  on public.sms_dispatches (reserved_until)
  where status = 'reserved';

create or replace function public.reserve_sms_dispatch(
  p_studio_id uuid,
  p_purpose text,
  p_recipient_count integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_existing public.sms_dispatches;
  v_dispatch public.sms_dispatches;
  v_user_minute integer;
  v_studio_day integer;
  v_permission text;
begin
  if v_actor is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  -- Login and password reset must use Supabase Auth phone OTP. Allowing those
  -- labels with arbitrary caller-provided text creates a phishing primitive.
  if p_purpose not in ('portal_invite', 'contract_verify', 'cheque_reminder', 'generic') then
    raise exception 'sms_purpose_not_allowed' using errcode = '22023';
  end if;
  if p_recipient_count not between 1 and 10 then
    raise exception 'invalid_recipient_count' using errcode = '22023';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 8 and 128 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  v_permission := case p_purpose
    when 'portal_invite' then 'members.manage'
    when 'contract_verify' then 'crm.write'
    when 'cheque_reminder' then 'finance.write'
    else 'sms.send'
  end;
  if not public.has_studio_permission(p_studio_id, v_permission) then
    raise exception 'sms_permission_denied' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sms:studio:' || p_studio_id::text, 0)
  );

  select * into v_existing from public.sms_dispatches
  where studio_id = p_studio_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'dispatchId', v_existing.id,
      'status', v_existing.status,
      'deduped', true,
      'reservedUntil', v_existing.reserved_until
    );
  end if;

  select coalesce(sum(recipient_count), 0)::integer into v_user_minute
  from public.sms_dispatches
  where studio_id = p_studio_id and user_id = v_actor
    and created_at >= now() - interval '1 minute';
  if v_user_minute + p_recipient_count > 20 then
    raise exception 'sms_user_rate_limit' using errcode = 'P0001';
  end if;

  select coalesce(sum(recipient_count), 0)::integer into v_studio_day
  from public.sms_dispatches
  where studio_id = p_studio_id
    and created_at >= date_trunc('day', now());
  if v_studio_day + p_recipient_count > 500 then
    raise exception 'sms_studio_daily_quota' using errcode = 'P0001';
  end if;

  insert into public.sms_dispatches (
    studio_id, user_id, idempotency_key, purpose, recipient_count,
    reserved_until
  ) values (
    p_studio_id, v_actor, p_idempotency_key, p_purpose, p_recipient_count,
    now() + interval '5 minutes'
  ) returning * into v_dispatch;

  return jsonb_build_object(
    'dispatchId', v_dispatch.id,
    'status', v_dispatch.status,
    'deduped', false,
    'reservedUntil', v_dispatch.reserved_until
  );
end;
$$;

-- A scheduled service-role job may call this to make abandoned reservations
-- explicit. Quota remains consumed, preventing crash/retry abuse.
create or replace function public.expire_sms_dispatches()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  update public.sms_dispatches
  set status = 'failed', failure_code = 'reservation_expired', completed_at = now()
  where status = 'reserved' and reserved_until <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.reserve_sms_dispatch(uuid, text, integer, text)
  from public, anon;
grant execute on function public.reserve_sms_dispatch(uuid, text, integer, text)
  to authenticated;
revoke execute on function public.complete_sms_dispatch(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_sms_dispatch(uuid, boolean, text)
  to service_role;
revoke execute on function public.expire_sms_dispatches()
  from public, anon, authenticated;
grant execute on function public.expire_sms_dispatches()
  to service_role;

comment on function public.reserve_sms_dispatch(uuid, text, integer, text) is
  'Business SMS reservation only; Auth OTP/reset purposes are deliberately rejected';
